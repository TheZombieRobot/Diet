package nz.waveformlabs.moshpoint.wear

import android.os.Bundle
import android.os.SystemClock
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.watch.Buzz
import nz.waveformlabs.moshpoint.core.watch.HoldToSend
import nz.waveformlabs.moshpoint.core.watch.PingKind
import nz.waveformlabs.moshpoint.core.watch.WatchMessage
import kotlin.random.Random

/**
 * "Need help" from the wrist: hold for two seconds, and the phone tells the whole crew through
 * the same path as its own Need help button. Free for everyone: nothing here looks at
 * Moshpoint+, and neither does the phone when this arrives.
 */
class SosActivity : ComponentActivity() {
    private var ui by mutableStateOf(SosUi())
    private var pressed by mutableStateOf(false)
    private val hold = HoldToSend()

    /** One number per ping, kept across retries so a slow first try and a retry are one ping. */
    private var helpRequest = Random.nextInt()
    private var okRequest = Random.nextInt()

    /** What "Try again" should try again. */
    private var lastKind = PingKind.NEED_HELP

    /** What the screen last said became of that ping. */
    private var shown = PingFate.SENDING

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        lifecycleScope.launch {
            PhoneLink.incoming.filterIsInstance<WatchMessage.PingResult>().collect { onLater(it) }
        }
        setContent {
            WristTheme {
                LaunchedEffect(pressed) {
                    while (pressed) withFrameMillis { tick() }
                }
                SosScreen(
                    ui,
                    onPress = {
                        if (ui.phase == SosPhase.HOLD) {
                            hold.press(SystemClock.uptimeMillis())
                            pressed = true
                        }
                    },
                    onRelease = {
                        hold.release()
                        pressed = false
                        if (ui.phase == SosPhase.HOLD) ui = SosUi()
                    },
                    onRetry = { send(lastKind) },
                    onImOk = { send(PingKind.SOS_ALL_CLEAR) },
                )
            }
        }
    }

    private fun tick() {
        val now = SystemClock.uptimeMillis()
        when (hold.poll(now)) {
            HoldToSend.Event.TICK -> Buzzer.play(this, Buzz.HOLD_TICK)
            HoldToSend.Event.SEND -> {
                pressed = false
                hold.release()
                send(PingKind.NEED_HELP)
                return
            }
            null -> Unit
        }
        if (ui.phase == SosPhase.HOLD) ui = SosUi(SosPhase.HOLD, hold.progress(now))
    }

    private fun send(kind: PingKind) {
        if (ui.phase == SosPhase.SENDING) return
        ui = SosUi(SosPhase.SENDING)
        lastKind = kind
        lifecycleScope.launch {
            val allClear = kind == PingKind.SOS_ALL_CLEAR
            val fate = Pings.send(this@SosActivity, kind, if (allClear) okRequest else helpRequest)
            show(fate, allClear)
            // One long buzz if it reached anyone, the stutter if it didn't: clear without looking.
            Buzzer.play(this@SosActivity, if (fate.went) Buzz.SOS_SENT else Buzz.FAILED)
            // Once the relay has one, the next of its kind is a new ping. Until then a retry is
            // the same ping (same number), which the phone never sends twice.
            if (fate == PingFate.SENT) {
                if (allClear) okRequest = Random.nextInt() else helpRequest = Random.nextInt()
            }
        }
    }

    private fun show(fate: PingFate, allClear: Boolean) {
        shown = fate
        ui = SosUi(
            when (fate) {
                PingFate.SENT -> if (allClear) SosPhase.OK_SENT else SosPhase.SENT
                PingFate.NEARBY -> SosPhase.NEARBY
                PingFate.WAITING -> SosPhase.WAITING
                PingFate.OUT_OF_REACH -> SosPhase.OUT_OF_REACH
                PingFate.NO_CREW -> SosPhase.NO_CREW
                PingFate.UNCONFIRMED, PingFate.LOCKED, PingFate.SENDING -> SosPhase.UNCONFIRMED
            },
            allClear = allClear,
        )
    }

    /**
     * The phone has later news about a ping that hadn't reached the relay when it answered:
     * a crew phone took it, or signal came back. Only better news is shown ("sent" is never
     * taken back), and only about the ping this screen is showing.
     */
    private fun onLater(result: WatchMessage.PingResult) {
        if (ui.phase == SosPhase.SENDING || ui.phase == SosPhase.HOLD) return // send() is listening for this one itself
        val allClear = lastKind == PingKind.SOS_ALL_CLEAR
        if (result.requestId != (if (allClear) okRequest else helpRequest)) return
        if (!result.outcome.improvesOn(shown.outcome)) return
        val wasThrough = shown.went
        val fate = Pings.fateOf(result.outcome)
        show(fate, allClear)
        if (!wasThrough && fate.went) Buzzer.play(this, Buzz.SOS_SENT)
        if (fate == PingFate.SENT) {
            if (allClear) okRequest = Random.nextInt() else helpRequest = Random.nextInt()
        }
    }
}
