package nz.waveformlabs.moshpoint.wear

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.watch.Buzz
import nz.waveformlabs.moshpoint.core.watch.PingKind
import nz.waveformlabs.moshpoint.core.watch.WatchFeature
import nz.waveformlabs.moshpoint.core.watch.WatchGate
import nz.waveformlabs.moshpoint.core.watch.WatchMate
import nz.waveformlabs.moshpoint.core.watch.WatchMessage
import kotlin.random.Random

/** The first screen: the crew (tap a mate to find them), quick pings, and Need help. */
class CrewActivity : ComponentActivity() {
    private var nowSec by mutableLongStateOf(System.currentTimeMillis() / 1000)
    private var flash by mutableStateOf<PingFate?>(null)
    private var clock: Job? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CrewStore.init(this)
        setContent {
            WristTheme {
                val state by CrewStore.state.collectAsState()
                CrewScreen(
                    state = state, nowSec = nowSec, faces = CrewStore.faces, flash = flash,
                    onMate = ::find, onPing = ::ping,
                    onHelp = { startActivity(Intent(this, SosActivity::class.java)) },
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        nowSec = System.currentTimeMillis() / 1000
        clock = lifecycleScope.launch {
            // What the phone has already published, then a nudge if that's missing or old.
            PhoneLink.loadPublished(this@CrewActivity)
            if (CrewStore.state.value?.fresh(System.currentTimeMillis() / 1000) != true) {
                PhoneLink.send(this@CrewActivity, WatchMessage.SyncRequest)
            }
            while (true) {
                delay(20_000)
                nowSec = System.currentTimeMillis() / 1000 // keeps "live" and "5 min ago" honest
            }
        }
    }

    override fun onPause() {
        clock?.cancel()
        super.onPause()
    }

    private fun find(mate: WatchMate) {
        if (!WatchGate.allows(WatchFeature.ARROW, CrewStore.state.value?.plus == true)) return
        startActivity(Intent(this, FinderActivity::class.java).putExtra(FinderActivity.EXTRA_MATE, mate.id))
    }

    private fun ping(kind: PingKind) {
        if (flash != null) return
        lifecycleScope.launch {
            flash = PingFate.SENDING
            val fate = Pings.send(this@CrewActivity, kind, Random.nextInt())
            flash = fate
            Buzzer.play(this@CrewActivity, if (fate == PingFate.SENT) Buzz.PING_SENT else Buzz.FAILED)
            delay(if (fate == PingFate.SENT) 1_600 else 3_500)
            flash = null
        }
    }
}
