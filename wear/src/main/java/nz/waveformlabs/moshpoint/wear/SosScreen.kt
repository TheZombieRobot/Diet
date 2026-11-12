package nz.waveformlabs.moshpoint.wear

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.sp

/** Where a wrist "Need help" stands. */
enum class SosPhase {
    /** Waiting for a full two-second hold. */
    HOLD,
    SENDING,

    /** The relay has it: the whole crew is told. */
    SENT,

    /** No signal on the phone, but a crew phone nearby has it. */
    NEARBY,

    /** In the phone's outbox with nowhere to go yet: not sent. */
    WAITING,

    /** Never reached the phone. */
    OUT_OF_REACH,

    /** Reached the phone, but the phone never said where it got to. */
    UNCONFIRMED,
    NO_CREW,

    /** "I'm OK now" went. */
    OK_SENT,
}

/** [allClear]: the ping this is about was "I'm OK now", not Need help (so it isn't offered again). */
data class SosUi(val phase: SosPhase = SosPhase.HOLD, val progress: Float = 0f, val allClear: Boolean = false)

/**
 * "Need help": hold the red button for two seconds (a ring fills, the watch ticks) and the
 * whole crew is told. Then the screen says plainly whether it went.
 */
@Composable
fun SosScreen(
    ui: SosUi,
    onPress: () -> Unit = {},
    onRelease: () -> Unit = {},
    onRetry: () -> Unit = {},
    onImOk: () -> Unit = {},
) {
    // The gesture below outlives recompositions: always call the newest callbacks.
    val press by rememberUpdatedState(onPress)
    val release by rememberUpdatedState(onRelease)
    BoxWithConstraints(Modifier.fillMaxSize().background(Wrist.Ground), contentAlignment = Alignment.Center) {
        val s = if (maxWidth < maxHeight) maxWidth else maxHeight
        when (ui.phase) {
            SosPhase.HOLD -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                Spacer(Modifier.height(s * 0.08f))
                FitText(stringResource(R.string.need_help), Wrist.Name, Modifier.width(s * 0.56f), maxLines = 1)
                Spacer(Modifier.height(s * 0.03f))
                Box(Modifier.size(s * 0.52f), contentAlignment = Alignment.Center) {
                    // The ring that fills while you hold.
                    Canvas(Modifier.fillMaxSize()) {
                        val w = size.minDimension * 0.07f
                        val inset = w / 2
                        val arc = androidx.compose.ui.geometry.Size(size.width - w, size.height - w)
                        val topLeft = androidx.compose.ui.geometry.Offset(inset, inset)
                        drawArc(Wrist.Help.copy(alpha = 0.25f), 0f, 360f, false, topLeft, arc, style = Stroke(w))
                        drawArc(Color.White, -90f, 360f * ui.progress.coerceIn(0f, 1f), false, topLeft, arc, style = Stroke(w, cap = StrokeCap.Round))
                    }
                    Box(
                        Modifier.size(s * 0.4f).clip(CircleShape).background(Wrist.Help)
                            .pointerInput(Unit) {
                                detectTapGestures(onPress = {
                                    press()
                                    tryAwaitRelease()
                                    release()
                                })
                            },
                        contentAlignment = Alignment.Center,
                    ) {
                        FitText(stringResource(R.string.sos_hold), Wrist.Name.copy(color = Color.White), Modifier.width(s * 0.34f), maxLines = 2)
                    }
                }
                Spacer(Modifier.height(s * 0.02f))
                FitText(stringResource(R.string.sos_hint), Wrist.Body, Modifier.width(s * 0.6f), maxLines = 2)
            }
            SosPhase.SENDING -> FitText(stringResource(R.string.sos_sending), Wrist.Name.copy(color = Wrist.TextDim), Modifier.width(s * 0.74f), maxLines = 2)
            SosPhase.SENT -> Result(s, stringResource(R.string.sos_sent), Wrist.Lime, null, stringResource(R.string.sos_im_ok), onImOk)
            SosPhase.OK_SENT -> Result(s, stringResource(R.string.sos_ok_sent), Wrist.Lime, null, null, {})
            // A crew phone nearby has it: someone knows. Say so, and say who doesn't yet.
            SosPhase.NEARBY -> Result(
                s, stringResource(R.string.ping_nearby), Wrist.Lime, stringResource(R.string.sos_nearby_detail),
                if (ui.allClear) null else stringResource(R.string.sos_im_ok), onImOk,
            )
            // Still in the phone's outbox. The plain fact first: it has not gone.
            SosPhase.WAITING -> Result(s, stringResource(R.string.ping_not_yet), Wrist.Amber, stringResource(R.string.ping_waiting), stringResource(R.string.sos_retry), onRetry)
            SosPhase.OUT_OF_REACH -> Result(s, stringResource(R.string.sos_not_sent), Wrist.Help, stringResource(R.string.sos_out_of_reach), stringResource(R.string.sos_retry), onRetry)
            SosPhase.UNCONFIRMED -> Result(s, stringResource(R.string.sos_unconfirmed), Wrist.Amber, stringResource(R.string.sos_no_answer), stringResource(R.string.sos_retry), onRetry)
            SosPhase.NO_CREW -> Result(s, stringResource(R.string.sos_not_sent), Wrist.Help, stringResource(R.string.sos_no_crew), null, {})
        }
    }
}

/** What happened, why, and the one thing to do next. */
@Composable
private fun Result(s: androidx.compose.ui.unit.Dp, title: String, colour: Color, detail: String?, action: String?, onAction: () -> Unit) {
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        FitText(title, Wrist.Name.copy(fontSize = 17.sp, color = colour), Modifier.width(s * 0.72f), maxLines = 2)
        if (detail != null) {
            Spacer(Modifier.height(s * 0.03f))
            FitText(detail, Wrist.Body, Modifier.width(s * 0.78f), maxLines = 3)
        }
        if (action != null) {
            Spacer(Modifier.height(s * 0.05f))
            Pill(action, Wrist.Deep, Wrist.Text, s * 0.62f, onAction)
        }
    }
}
