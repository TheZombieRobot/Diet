package nz.waveformlabs.moshpoint

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import androidx.activity.ComponentActivity
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.asImageBitmap
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.ui.Mosh

/**
 * Crew moments, the phone side: take or pick a photo, add a caption, send it to the crew,
 * and show a moment big (with "On map" / "Find them"). Must be created while the activity
 * is being constructed (it registers activity results).
 */
class MomentFlow(
    private val activity: ComponentActivity,
    private val toast: (String) -> Unit,
    private val lastLocation: () -> android.location.Location?,
    private val openMap: () -> Unit,
    private val findFriend: (String) -> Unit,
) {
    private var askMomentSource by mutableStateOf(false)
    private var momentPhoto by mutableStateOf<android.graphics.Bitmap?>(null)
    private var sendingMoment by mutableStateOf(false)
    private var viewingMoment by mutableStateOf<Moments.Item?>(null)

    private val takeMoment = activity.registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        if (bmp != null) momentPhoto = bmp
    }
    private val cameraForMoment = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) runCatching { takeMoment.launch(null) }
    }
    private val pickMoment = activity.registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@registerForActivityResult
        val type = activity.contentResolver.getType(uri).orEmpty()
        activity.lifecycleScope.launch {
            if (type.startsWith("video/")) useClip(copyToClips(uri)) else momentPhoto = decodeScaled(uri)
        }
    }

    // ---- Clips ----

    private var clipFile: java.io.File? = null
    private var momentClip by mutableStateOf<java.io.File?>(null)

    private fun newClipFile() = java.io.File(java.io.File(activity.cacheDir, "clips").apply { mkdirs() }, "out-${System.currentTimeMillis()}.mp4")

    private val takeClip = activity.registerForActivityResult(object : androidx.activity.result.contract.ActivityResultContract<android.net.Uri, Boolean>() {
        override fun createIntent(context: android.content.Context, input: android.net.Uri) =
            Intent(android.provider.MediaStore.ACTION_VIDEO_CAPTURE)
                .putExtra(android.provider.MediaStore.EXTRA_OUTPUT, input)
                .putExtra(android.provider.MediaStore.EXTRA_DURATION_LIMIT, 10)
                .putExtra(android.provider.MediaStore.EXTRA_SIZE_LIMIT, 9_000_000L)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION)

        override fun parseResult(resultCode: Int, intent: Intent?) = resultCode == android.app.Activity.RESULT_OK
    }) { ok -> if (ok) useClip(clipFile) }

    private val cameraForClip = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) recordClip()
    }

    private fun recordClip() {
        if (activity.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            cameraForClip.launch(Manifest.permission.CAMERA)
            return
        }
        val f = newClipFile()
        clipFile = f
        val uri = androidx.core.content.FileProvider.getUriForFile(activity, "${activity.packageName}.media", f)
        runCatching { takeClip.launch(uri) }.onFailure { toast("No camera app can record video here") }
    }

    private suspend fun copyToClips(uri: android.net.Uri): java.io.File? = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        runCatching {
            val f = newClipFile()
            activity.contentResolver.openInputStream(uri)?.use { input -> f.outputStream().use { input.copyTo(it) } }
            f
        }.getOrNull()
    }

    private fun useClip(f: java.io.File?) {
        if (f == null || !f.exists() || f.length() == 0L) return
        if (f.length() > nz.waveformlabs.moshpoint.locate.RelayClient.MAX_FILE - 200_000) {
            toast("That clip is too long to send. Keep it to about 10 seconds.")
            f.delete()
            return
        }
        momentClip = f
    }

    private fun sendClip(caption: String) {
        val f = momentClip ?: return
        sendingMoment = true
        activity.lifecycleScope.launch {
            val loc = lastLocation()
            val ok = Moments.shareClip(activity, f, caption, loc?.latitude, loc?.longitude)
            sendingMoment = false
            if (ok) {
                momentClip = null
                f.delete()
                toast("Clip shared with your crew")
            } else {
                toast("Couldn't send it. Check your internet and try again.")
            }
        }
    }

    private fun takeMomentPhoto() {
        if (activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            runCatching { takeMoment.launch(null) }
        } else {
            cameraForMoment.launch(Manifest.permission.CAMERA)
        }
    }

    /** A photo shared from another app ("Share → Moshpoint crew"). */
    fun handleShared(intent: Intent?) {
        if (intent?.getBooleanExtra(MainActivity.EXTRA_MOMENT, false) != true) return
        val uri = intent.data ?: return
        intent.removeExtra(MainActivity.EXTRA_MOMENT)
        if (GroupSync.group.value == null) {
            toast("Start or join a crew first: moments go to your crew")
            return
        }
        activity.lifecycleScope.launch { momentPhoto = decodeScaled(uri) }
    }

    // ---- Our own camera (tap = photo, hold = clip) ----

    private var capturing by mutableStateOf(false)
    private var withAudio = false

    private val cameraPerms = activity.registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        if (r[Manifest.permission.CAMERA] == true) {
            withAudio = r[Manifest.permission.RECORD_AUDIO] == true
            capturing = true
        } else {
            toast("Moshpoint needs the camera to take a moment")
        }
    }

    private fun openCamera() {
        val cam = activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        val mic = activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        if (cam && mic) {
            withAudio = true
            capturing = true
        } else {
            cameraPerms.launch(arrayOf(Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO))
        }
    }

    /** "Moment": straight into the camera. */
    fun start() {
        if (GroupSync.group.value == null) {
            toast("Start or join a crew first: moments go to your crew")
            return
        }
        openCamera()
    }

    private fun sendMoment(caption: String) {
        val photo = momentPhoto ?: return
        sendingMoment = true
        activity.lifecycleScope.launch {
            val loc = lastLocation()
            val ok = Moments.share(activity, photo, caption, loc?.latitude, loc?.longitude)
            sendingMoment = false
            if (ok) {
                momentPhoto = null
                toast("Shared with your crew")
            } else {
                toast("Couldn't send it. Check your internet and try again.")
            }
        }
    }

    /** A picked or shared photo, decoded no bigger than ~1440 px so it never runs out of memory. */
    private suspend fun decodeScaled(uri: android.net.Uri): android.graphics.Bitmap? = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) {
        runCatching {
            val bounds = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
            activity.contentResolver.openInputStream(uri)?.use { android.graphics.BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 1440) sample *= 2
            activity.contentResolver.openInputStream(uri)?.use {
                android.graphics.BitmapFactory.decodeStream(it, null, android.graphics.BitmapFactory.Options().apply { inSampleSize = sample })
            }
        }.getOrNull()
    }

    fun view(m: Moments.Item) {
        viewingMoment = m
    }

    @androidx.compose.runtime.Composable
    fun Dialogs() {
        if (capturing) {
            androidx.compose.ui.window.Dialog(
                onDismissRequest = { capturing = false },
                properties = androidx.compose.ui.window.DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
            ) {
                nz.waveformlabs.moshpoint.ui.CaptureScreen(
                    withAudio = withAudio,
                    newClipFile = ::newClipFile,
                    onPhoto = { bmp -> capturing = false; momentPhoto = bmp },
                    onClip = { f -> capturing = false; useClip(f) },
                    onGallery = {
                        capturing = false
                        pickMoment.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
                    },
                    onClose = { capturing = false },
                    onError = { msg -> toast(msg) },
                )
            }
        }
        if (askMomentSource) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { askMomentSource = false },
                containerColor = Mosh.Deep,
                title = { androidx.compose.material3.Text("Share a moment", style = Mosh.Heading) },
                text = {
                    androidx.compose.foundation.layout.Column {
                        androidx.compose.material3.Text("Snap where you are (the stage, the bar, your mates). It lands in the story as a Polaroid.", style = Mosh.Body)
                        androidx.compose.material3.TextButton(onClick = { askMomentSource = false; takeMomentPhoto() }) {
                            androidx.compose.material3.Text("Take a photo", style = Mosh.Label.copy(color = Mosh.Lime))
                        }
                        androidx.compose.material3.TextButton(onClick = { askMomentSource = false; recordClip() }) {
                            androidx.compose.material3.Text("Record a clip (10 s)", style = Mosh.Label.copy(color = Mosh.Pink))
                        }
                        androidx.compose.material3.TextButton(onClick = {
                            askMomentSource = false
                            pickMoment.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
                        }) { androidx.compose.material3.Text("Choose from gallery", style = Mosh.Label.copy(color = Mosh.Cyan)) }
                    }
                },
                confirmButton = {
                    androidx.compose.material3.TextButton(onClick = { askMomentSource = false }) {
                        androidx.compose.material3.Text("Cancel", style = Mosh.Label)
                    }
                },
            )
        }
        momentClip?.let { f ->
            val thumb = androidx.compose.runtime.remember(f) {
                runCatching {
                    android.media.MediaMetadataRetriever().use { r -> r.setDataSource(f.absolutePath); r.getFrameAtTime(0) }
                }.getOrNull()?.asImageBitmap()
                    ?: android.graphics.Bitmap.createBitmap(320, 240, android.graphics.Bitmap.Config.ARGB_8888).asImageBitmap()
            }
            nz.waveformlabs.moshpoint.ui.MomentComposer(thumb, sendingMoment, onSend = ::sendClip, onCancel = { momentClip = null; f.delete() })
        }
        momentPhoto?.let { bmp ->
            val img = androidx.compose.runtime.remember(bmp) { bmp.asImageBitmap() }
            nz.waveformlabs.moshpoint.ui.MomentComposer(img, sendingMoment, onSend = ::sendMoment, onCancel = { momentPhoto = null })
        }
        viewingMoment?.let { m ->
            val me = lastLocation()
            val friend = FriendsRepository.friends.firstOrNull { it.name.equals(m.from, true) }
            nz.waveformlabs.moshpoint.ui.MomentViewer(
                m, System.currentTimeMillis() / 1000,
                distanceText = if (me != null && m.lat != null && m.lon != null) {
                    nz.waveformlabs.moshpoint.ui.distanceLabel(
                        nz.waveformlabs.moshpoint.core.Geo.distanceM(
                            nz.waveformlabs.moshpoint.core.LatLon(me.latitude, me.longitude),
                            nz.waveformlabs.moshpoint.core.LatLon(m.lat, m.lon),
                        ),
                    )
                } else {
                    null
                },
                onMap = if (m.lat != null) ({ viewingMoment = null; openMap() }) else null,
                onFind = if (friend != null && !m.mine) ({ viewingMoment = null; findFriend(friend.id) }) else null,
                onClose = { viewingMoment = null },
            )
        }
    }
}
