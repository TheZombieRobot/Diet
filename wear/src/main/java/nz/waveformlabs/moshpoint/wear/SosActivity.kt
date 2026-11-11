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
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.watch.Buzz
import nz.waveformlabs.moshpoint.core.watch.HoldToSend
import nz.waveformlabs.moshpoint.core.watch.PingKind
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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
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
            ui = SosUi(
                when (fate) {
                    PingFate.SENT -> if (allClear) SosPhase.OK_SENT else SosPhase.SENT
                    PingFate.OUT_OF_REACH -> SosPhase.OUT_OF_REACH
                    PingFate.NO_CREW -> SosPhase.NO_CREW
                    PingFate.UNCONFIRMED, PingFate.LOCKED, PingFate.SENDING -> SosPhase.UNCONFIRMED
                },
            )
            Buzzer.play(this@SosActivity, if (fate == PingFate.SENT) Buzz.SOS_SENT else Buzz.FAILED)
            // Once one has gone, the next of its kind is a new ping.
            if (fate == PingFate.SENT) {
                if (allClear) okRequest = Random.nextInt() else helpRequest = Random.nextInt()
            }
        }
    }
}
