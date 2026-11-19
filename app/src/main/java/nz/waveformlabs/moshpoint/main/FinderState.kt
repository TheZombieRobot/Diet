package nz.waveformlabs.moshpoint.main

import android.content.Intent
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.BeaconLimit
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.debug.FieldRecorder
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.locate.FinderPlace
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import nz.waveformlabs.moshpoint.locate.PlaceFinder
import nz.waveformlabs.moshpoint.safety.TorchStrobe
import nz.waveformlabs.moshpoint.sharing.Sharing
import nz.waveformlabs.moshpoint.ui.map.MapPlace

/**
 * The finder screen: the finder engine (created in onCreate), whether it's looking, "Light me
 * up", and the notification taps that open it. Owned by [MainActivity].
 *
 * It finds mates ([lookFor], the engine) or a place ([findPlace]: a spot a mate texted, by GPS
 * and compass alone, docs/SPOT_LINKS.md), never both: looking for mates lets the place go.
 */
internal class FinderState(private val a: MainActivity) {
    lateinit var engine: LocatorEngine
    val engineReady: Boolean get() = ::engine.isInitialized
    var finding by mutableStateOf(false)
    var beaconOn by mutableStateOf(false)

    /** The last touch or key press anywhere in the app (elapsed real time): see [FinderScreenOn]. */
    var lastTouchMs = 0L
        private set

    fun touched() {
        lastTouchMs = SystemClock.elapsedRealtime()
    }

    fun handleFindCrew(intent: Intent?) {
        if (intent?.getBooleanExtra(MainActivity.EXTRA_FIND_CREW, false) != true || !::engine.isInitialized) return
        intent.removeExtra(MainActivity.EXTRA_FIND_CREW)
        val ids = FriendsRepository.friends.filter { it.gigGroupOnly || it.key in GroupSync.members }.map { it.id }.toSet()
        if (ids.isEmpty()) return
        a.map.closeMap()
        lookFor(ids)
    }

    /** Opened from "X is lighting up their screen": the finder on them, to spot the flashing screen. */
    fun handleFindMate(intent: Intent?) {
        val id = intent?.getStringExtra(MainActivity.EXTRA_FIND_MATE) ?: return
        intent.removeExtra(MainActivity.EXTRA_FIND_MATE)
        if (FriendsRepository.byId(id) == null || !::engine.isInitialized) return
        a.map.closeMap()
        lookFor(setOf(id))
    }

    /** Opened from "X is looking for you": find them and light up straight away. */
    fun handleLightRequest(intent: Intent?) {
        val id = intent?.getStringExtra(MainActivity.EXTRA_LIGHT_FOR) ?: return
        intent.removeExtra(MainActivity.EXTRA_LIGHT_FOR)
        if (FriendsRepository.byId(id) == null || !::engine.isInitialized) return
        lookFor(setOf(id))
        setBeacon(true)
    }

    /**
     * The finder on [ids] (mates), from wherever it's opened: the engine looks for them and the
     * screen shows them. Any place being found is let go first.
     */
    fun lookFor(ids: Set<String>) {
        endPlace()
        pendingStop?.cancel()
        engine.track(ids)
        engine.start()
        finding = true
    }

    /** The place being found instead of mates (a spot a mate texted, docs/SPOT_LINKS.md), or null. */
    var place by mutableStateOf<FinderPlace?>(null)
        private set

    /** GPS and compass only (finder module): made the first time a place is found. */
    private var places: PlaceFinder? = null

    /** The place's arrow (empty with no place). */
    val placeArrows get() = placeFinder().arrows

    private fun placeFinder(): PlaceFinder = places ?: PlaceFinder(a.applicationContext, a.lifecycleScope).also { places = it }

    /**
     * The finder on [p] (from the map): its arrow and distance from this phone's GPS and compass,
     * with no data or signal. The mate engine and Light me up stop, as they do when the finder
     * closes; nothing is broadcast while a place is found.
     */
    fun findPlace(p: MapPlace) {
        a.map.closeMap()
        setBeacon(false)
        if (::engine.isInitialized) stopEngineSoon()
        val target = FinderPlace(p.id, p.name, p.lat, p.lon)
        placeFinder().find(target)
        placeFinder().start()
        place = target
        finding = true
    }

    /** No place any more (the finder closed, or mates are being found instead). */
    fun endPlace() {
        if (place == null) return
        place = null
        places?.stop()
        places?.find(null)
    }

    /** The app is on screen again: the place being found (if any) gets its GPS and compass back. */
    fun resumePlace() {
        if (place != null) places?.start()
    }

    /** The app left the screen: GPS and compass off for the place (it stays, for [resumePlace]). */
    fun pausePlace() {
        places?.stop()
    }

    /** Message asking mates to open the app and go live. */
    fun nudge(names: List<String>) = Sharing.send(a, Sharing.nudgeText(names), Txt.s(R.string.main_nudge_title))
    private val torch = TorchStrobe(a)

    private var beaconLimit: Job? = null

    /**
     * "Light me up": full brightness, a strobing screen (drawn by the finder) and the torch
     * flashing, plus a flag in our Bluetooth advert so mates' finders say to look for it. Goes off
     * by itself 10 minutes after it was switched on or the screen was last touched (core
     * BeaconLimit): a touch keeps it going.
     */
    fun setBeacon(on: Boolean) {
        if (beaconOn == on) return
        beaconOn = on
        if (::engine.isInitialized) engine.setBeacon(on)
        torch.set(on)
        beaconLimit?.cancel()
        beaconLimit = null
        if (on) {
            val since = SystemClock.elapsedRealtime()
            beaconLimit = a.lifecycleScope.launch {
                while (!BeaconLimit.expired(SystemClock.elapsedRealtime(), since, lastTouchMs)) delay(5_000)
                setBeacon(false)
            }
        }
    }
    var pendingStop: Job? = null

    /** Debug builds: send the latest field recording (CSV) via any app. */
    fun shareRecording() {
        val file = FieldRecorder.lastFile?.takeIf { it.exists() } ?: FieldRecorder.files(a).firstOrNull()
        if (file == null) {
            DebugStatus.log("No recording to share yet")
            return
        }
        val uri = FileProvider.getUriForFile(a, "${a.packageName}.recordings", file)
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
