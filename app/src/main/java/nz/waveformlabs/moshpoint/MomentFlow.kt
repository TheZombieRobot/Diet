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
        if (uri != null) activity.lifecycleScope.launch { momentPhoto = decodeScaled(uri) }
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

    /** "Share one": choose camera or gallery. */
    fun start() {
        if (GroupSync.group.value == null) {
            toast("Start or join a crew first: moments go to your crew")
            return
        }
        askMomentSource = true
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
        if (askMomentSource) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { askMomentSource = false },
                containerColor = Mosh.Deep,
                title = { androidx.compose.material3.Text("Share a moment", style = Mosh.Heading) },
                text = { androidx.compose.material3.Text("Snap where you are (the stage, the bar, a landmark) so the crew can spot it.", style = Mosh.Body) },
                confirmButton = {
                    androidx.compose.material3.TextButton(onClick = { askMomentSource = false; takeMomentPhoto() }) {
                        androidx.compose.material3.Text("Take photo", style = Mosh.Label.copy(color = Mosh.Lime))
                    }
                },
                dismissButton = {
                    androidx.compose.material3.TextButton(onClick = {
                        askMomentSource = false
                        pickMoment.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                    }) { androidx.compose.material3.Text("Choose photo", style = Mosh.Label.copy(color = Mosh.Cyan)) }
                },
            )
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
