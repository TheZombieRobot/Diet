package nz.waveformlabs.moshpoint.main

import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.debug.FieldRecorder
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import nz.waveformlabs.moshpoint.safety.TorchStrobe
import nz.waveformlabs.moshpoint.sharing.Sharing

/**
 * The finder screen: the finder engine (created in onCreate), whether it's looking, "Light me
 * up", and the notification taps that open it. Owned by [MainActivity].
 */
internal class FinderState(private val a: MainActivity) {
    lateinit var engine: LocatorEngine
    val engineReady: Boolean get() = ::engine.isInitialized
    var finding by mutableStateOf(false)
    var beaconOn by mutableStateOf(false)

    fun handleFindCrew(intent: Intent?) {
        if (intent?.getBooleanExtra(MainActivity.EXTRA_FIND_CREW, false) != true || !::engine.isInitialized) return
        intent.removeExtra(MainActivity.EXTRA_FIND_CREW)
        val ids = FriendsRepository.friends.filter { it.gigGroupOnly || it.key in GroupSync.members }.map { it.id }.toSet()
        if (ids.isEmpty()) return
        a.map.closeMap()
        pendingStop?.cancel()
        engine.track(ids)
        engine.start()
        finding = true
    }

    /** Opened from "X is lighting up their screen": the finder on them, to spot the flashing screen. */
    fun handleFindMate(intent: Intent?) {
        val id = intent?.getStringExtra(MainActivity.EXTRA_FIND_MATE) ?: return
        intent.removeExtra(MainActivity.EXTRA_FIND_MATE)
        if (FriendsRepository.byId(id) == null || !::engine.isInitialized) return
        a.map.closeMap()
        pendingStop?.cancel()
        engine.track(setOf(id))
        engine.start()
        finding = true
    }

    /** Opened from "X is looking for you": find them and light up straight away. */
    fun handleLightRequest(intent: Intent?) {
        val id = intent?.getStringExtra(MainActivity.EXTRA_LIGHT_FOR) ?: return
        intent.removeExtra(MainActivity.EXTRA_LIGHT_FOR)
        if (FriendsRepository.byId(id) == null || !::engine.isInitialized) return
        pendingStop?.cancel()
        engine.track(setOf(id))
        engine.start()
        finding = true
        setBeacon(true)
    }

    /** Message asking mates to open the app and go live. */
    fun nudge(names: List<String>) = Sharing.send(a, Sharing.nudgeText(names), Txt.s(R.string.main_nudge_title))
    private val torch = TorchStrobe(a)

    /**
     * "Light me up": full brightness, a strobing screen (drawn by the finder) and the torch
     * flashing, plus a flag in our Bluetooth advert so mates' finders say to look for it.
     */
    fun setBeacon(on: Boolean) {
        if (beaconOn == on) return
        beaconOn = on
        if (::engine.isInitialized) engine.setBeacon(on)
        torch.set(on)
    }
    var pendingStop: Job? = null

    /** Debug builds: send the latest field recording (CSV) via any app. */
    fun shareRecording() {
        val file = FieldRecorder.lastFile?.takeIf { it.exists() } ?: FieldRecorder.files(a).firstOrNull()
        if (file == null) {
            DebugStatus.log("No recording to share yet")
            return
        }
        val uri = androidx.core.content.FileProvider.getUriForFile(a, "${a.packageName}.recordings", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "Moshpoint field recording ${file.name}")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        a.startActivity(Intent.createChooser(send, "Share recording"))
    }

    /**
     * Finding only runs while the finder is on screen (visibility keeps going in the
     * service). Stopping is delayed: Android silently blocks more than 5 Bluetooth scan
     * starts per app in 30 s, so flicking between screens must not restart scans.
     */
    fun stopEngineSoon() {
        pendingStop?.cancel()
        pendingStop = a.lifecycleScope.launch {
            delay(20_000)
            engine.stop()
        }
    }
}
