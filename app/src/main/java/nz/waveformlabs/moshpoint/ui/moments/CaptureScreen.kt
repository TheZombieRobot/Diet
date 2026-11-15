package nz.waveformlabs.moshpoint.ui

import android.annotation.SuppressLint
import android.graphics.Bitmap
import android.graphics.Matrix
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.gestures.waitForUpOrCancellation
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.R
import java.io.File

/** Longest clip: short enough to share over the relay quickly, long enough for a chorus. */
private const val CLIP_MS = 10_000L

/**
 * Moshpoint's own camera for crew moments: tap the shutter for a photo, hold it to record
 * a clip (a neon ring fills over 10 s; let go to stop). Clips record at a modest quality
 * so they always fit through the relay.
 */
@SuppressLint("MissingPermission")
@Composable
fun CaptureScreen(
    /** Sound on clips (record-audio permission granted). */
    withAudio: Boolean,
    /** High quality clips (720p); false = data saver (480p). */
    hq: Boolean = true,
    newClipFile: () -> File,
    onPhoto: (Bitmap) -> Unit,
    onClip: (File) -> Unit,
    onGallery: () -> Unit,
    onClose: () -> Unit,
    onError: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    var front by remember { mutableStateOf(false) }
    var recording by remember { mutableStateOf<Recording?>(null) }
    var flash by remember { mutableStateOf(false) }
    val progress = remember { Animatable(0f) }
    // Read up front: the camera callbacks below run outside composition.
    val errNoCamera = stringResource(R.string.find_camera_unavailable)
    val errOpen = stringResource(R.string.find_camera_open_failed)
    val errPhoto = stringResource(R.string.find_photo_failed)
    val errClip = stringResource(R.string.find_clip_failed)

    val previewView = remember { PreviewView(context).apply { scaleType = PreviewView.ScaleType.FILL_CENTER } }
    val imageCapture = remember { ImageCapture.Builder().setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build() }
    val videoCapture = remember {
        VideoCapture.withOutput(
            Recorder.Builder()
                .setQualitySelector(
                    QualitySelector.fromOrderedList(if (hq) listOf(Quality.HD, Quality.SD, Quality.LOWEST) else listOf(Quality.SD, Quality.HD, Quality.LOWEST)),
                )
                .setTargetVideoEncodingBitRate(if (hq) 5_000_000 else 2_500_000) // ~6 MB or ~3 MB for 10 s
                .build(),
        )
    }

    DisposableEffect(front) {
        val future = ProcessCameraProvider.getInstance(context)
        var provider: ProcessCameraProvider? = null
        future.addListener({
            val p = runCatching { future.get() }.getOrNull() ?: return@addListener onError(errNoCamera)
            provider = p
            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
            val selector = if (front) CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
            p.unbindAll()
            // Some phones can't do preview + photo + video at once: fall back to photo only.
            runCatching { p.bindToLifecycle(lifecycle, selector, preview, imageCapture, videoCapture) }
                .recoverCatching { p.unbindAll(); p.bindToLifecycle(lifecycle, selector, preview, imageCapture) }
                .onFailure { onError(errOpen) }
        }, ContextCompat.getMainExecutor(context))
        onDispose {
            recording?.stop()
            provider?.unbindAll()
        }
    }

    fun takePhoto() {
        flash = true
        imageCapture.takePicture(
            ContextCompat.getMainExecutor(context),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    val rotation = image.imageInfo.rotationDegrees
                    val bmp = image.toBitmap()
                    image.close()
                    val upright = if (rotation == 0) bmp else Bitmap.createBitmap(bmp, 0, 0, bmp.width, bmp.height, Matrix().apply { postRotate(rotation.toFloat()) }, true)
                    onPhoto(upright)
                }

                override fun onError(exception: ImageCaptureException) = onError(errPhoto)
            },
        )
    }

    fun startClip() {
        val file = newClipFile()
        val pending = videoCapture.output.prepareRecording(
            context,
            FileOutputOptions.Builder(file).setDurationLimitMillis(CLIP_MS).build(),
        ).let { if (withAudio) it.withAudioEnabled() else it }
        recording = pending.start(ContextCompat.getMainExecutor(context)) { e ->
            if (e is VideoRecordEvent.Finalize) {
                recording = null
                scope.launch { progress.snapTo(0f) }
                if (e.hasError() && e.error != VideoRecordEvent.Finalize.ERROR_DURATION_LIMIT_REACHED) {
                    if (file.length() == 0L) onError(errClip) else onClip(file)
                } else {
                    onClip(file)
                }
            }
        }
        scope.launch {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(CLIP_MS.toInt(), easing = LinearEasing))
        }
    }

    fun stopClip() {
        recording?.stop()
    }

    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView({ previewView }, Modifier.fillMaxSize())

        // Shutter flash.
        LaunchedEffect(flash) {
            if (flash) {
                kotlinx.coroutines.delay(120)
                flash = false
            }
        }
        if (flash) Box(Modifier.fillMaxSize().background(Color.White.copy(alpha = 0.7f)))

        // Top: close, recording timer, flip.
        Row(
            Modifier.fillMaxWidth().statusBarsPadding().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RoundIcon("✕", onClose)
            Spacer(Modifier.weight(1f))
            if (recording != null) {
                val secs = (progress.value * CLIP_MS / 1000).toInt()
                Row(
                    Modifier.background(Color(0xCCFF2E4F), RoundedPill).padding(horizontal = 14.dp, vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Box(Modifier.size(8.dp).background(Color.White, CircleShape))
                    Spacer(Modifier.size(8.dp))
                    Text("0:%02d".format(secs), style = Mosh.Label.copy(color = Color.White, fontSize = 15.sp))
                }
            }
            Spacer(Modifier.weight(1f))
            RoundIcon("⟲", onClick = { if (recording == null) front = !front })
        }

        // Bottom: gallery, shutter, hint.
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                if (recording != null) stringResource(R.string.find_let_go_to_stop) else stringResource(R.string.find_tap_hold_hint),
                style = Mosh.Label.copy(color = Color.White, fontSize = 14.sp),
                modifier = Modifier.background(Color(0x66000000), RoundedPill).padding(horizontal = 14.dp, vertical = 6.dp),
            )
            Spacer(Modifier.height(18.dp))
            Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                Box(Modifier.align(Alignment.CenterStart).padding(start = 36.dp)) { RoundIcon("▦", onGallery, size = 52) }
                Shutter(
                    recording = recording != null,
                    progress = progress.value,
                    onTap = { takePhoto() },
                    onHoldStart = { startClip() },
                    onHoldEnd = { stopClip() },
                )
            }
        }
    }
}

private val RoundedPill = androidx.compose.foundation.shape.RoundedCornerShape(50)

@Composable
private fun RoundIcon(glyph: String, onClick: () -> Unit, size: Int = 44) {
    Box(
        Modifier.size(size.dp).background(Color(0x66000000), CircleShape).border(1.dp, Color(0x55FFFFFF), CircleShape)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { Text(glyph, style = Mosh.Label.copy(color = Color.White, fontSize = (size * 0.42f).sp)) }
}

/**
 * The shutter: a neon gradient ring around a white button. Tap = photo. Hold = record:
 * the button turns red and shrinks into a rounded square, and a pink ring fills around it.
 */
@Composable
private fun Shutter(recording: Boolean, progress: Float, onTap: () -> Unit, onHoldStart: () -> Unit, onHoldEnd: () -> Unit) {
    val pulse = rememberInfiniteTransition(label = "pulse").animateFloat(
        0.9f, 1.05f, infiniteRepeatable(tween(700), RepeatMode.Reverse), label = "p",
    )
    val inner by animateFloatAsState(if (recording) 0.42f else 0.78f, label = "inner")
    val corner by animateFloatAsState(if (recording) 0.25f else 0.5f, label = "corner")
    Canvas(
        Modifier.size(92.dp).pointerInput(Unit) {
            awaitEachGesture {
                awaitFirstDown()
                var held = false
                // Held past ~250 ms: it's a video; a quick tap is a photo.
                val up = withTimeoutOrNull(250) { waitForUpOrCancellation() }
                if (up != null) {
                    onTap()
                } else {
                    held = true
                    onHoldStart()
                    waitForUpOrCancellation()
                }
                if (held) onHoldEnd()
            }
        },
    ) {
        val r = size.minDimension / 2
        val ringW = r * 0.12f
        // Neon ring (gradient), breathing a little while recording.
        val scale = if (recording) pulse.value else 1f
        drawCircle(
            Brush.sweepGradient(listOf(Mosh.Pink, Mosh.Violet, Mosh.Cyan, Mosh.Pink), center),
            radius = (r - ringW / 2) * scale, style = Stroke(ringW),
        )
        // Recording progress.
        if (recording) {
            drawArc(
                Color.White, -90f, 360f * progress, false,
                topLeft = Offset(ringW / 2, ringW / 2), size = Size(size.width - ringW, size.height - ringW),
                style = Stroke(ringW, cap = StrokeCap.Round),
            )
        }
        // Button: white circle, morphing to a red rounded square while recording.
        val side = r * 2 * inner
        drawRoundRect(
            if (recording) Color(0xFFFF2E4F) else Color.White,
            topLeft = Offset(center.x - side / 2, center.y - side / 2),
            size = Size(side, side),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(side * corner),
        )
    }
}
