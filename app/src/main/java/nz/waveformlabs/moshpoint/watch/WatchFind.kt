package nz.waveformlabs.moshpoint.watch

import android.Manifest
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.GroupSync
import nz.waveformlabs.moshpoint.core.watch.EndReason
import nz.waveformlabs.moshpoint.core.watch.FindLease
import nz.waveformlabs.moshpoint.core.watch.FindStatus
import nz.waveformlabs.moshpoint.core.watch.WatchMessage
import nz.waveformlabs.moshpoint.core.watch.WristArbiter
import nz.waveformlabs.moshpoint.core.watch.WristReading
import nz.waveformlabs.moshpoint.service.VisibilityPrefs

/**
 * Finding a mate for the watch, on the phone (docs/WATCH.md, problems 3 to 5).
 *
 * The watch holds a lease ([FindLease]): it asks, and keeps asking every few seconds. While
 * it does, this takes readings from whichever finder is running (the phone's own if its
 * screen is open, else the [PocketFinder]), keeps only the directions that are valid on a
 * wrist ([WristArbiter]), and sends the result about twice a second. When the watch stops
 * asking, says stop, or disappears, everything here stops within the lease.
 */
internal object WatchFind {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val main = Handler(Looper.getMainLooper())
    private val lease = FindLease()
    private var arbiter = WristArbiter()
    private var pocket: PocketFinder? = null
    private var held: PhoneHeld? = null
    private var loop: Job? = null
    private var app: Context? = null
    private var watch: String? = null
    private var mateId: String? = null
    private var seq = 0
    private var startedAtMs = 0L

    // The Data Layer calls these from its own thread; everything here lives on the main thread.

    fun start(c: Context, watchNode: String, m: WatchMessage.FindStart) {
        val context = c.applicationContext
        main.post { onStart(context, watchNode, m) }
    }

    fun renew(c: Context, watchNode: String, m: WatchMessage.FindRenew) {
        val context = c.applicationContext
        main.post {
            // Not the find we're running (we restarted, or its lease ran out): say so. The
            // watch's next full request starts it again.
            if (!lease.renew(m.sessionId, m.fast, m.watchClockMs, System.currentTimeMillis())) {
                WatchLink.send(context, watchNode, WatchMessage.FindEnded(m.sessionId, EndReason.LEASE_EXPIRED))
            }
        }
    }

    fun stop(sessionId: Int) {
        main.post { if (lease.stop(sessionId)) shutDown() }
    }

    /** Stop on the phone's notification. */
    fun stopFromPhone() {
        main.post {
            val was = lease.end()
            val c = app
            val w = watch
            if (was != null && c != null && w != null) WatchLink.send(c, w, WatchMessage.FindEnded(was.sessionId, EndReason.STOPPED_ON_PHONE))
            shutDown()
        }
    }

    private fun onStart(c: Context, watchNode: String, m: WatchMessage.FindStart) {
        app = c
        watch = watchNode
        if (!Entitlements.plus(c)) {
            WatchLink.send(c, watchNode, WatchMessage.FindUpdate(m.sessionId, 0, FindStatus.NOT_ENTITLED, WristReading.NONE))
            return
        }
        // The app may not be open: load what finding needs, as the live service does.
        FriendsRepository.init(c)
        if (GroupSync.group.value == null) GroupSync.load(c)
        val mate = FriendsRepository.byId(m.mateId)
        if (mate == null) {
            WatchLink.send(c, watchNode, WatchMessage.FindUpdate(m.sessionId, 0, FindStatus.NO_SUCH_MATE, WristReading.NONE))
            return
        }
        val now = System.currentTimeMillis()
        val before = lease.state(now)
        val same = before is FindLease.State.Active && before.sessionId == m.sessionId && before.mateId == m.mateId
        lease.start(m.sessionId, m.mateId, m.fast, m.watchClockMs, now)
        if (!same) {
            // A new find (or a different mate): nothing carries over.
            pocket?.stop()
            pocket = null
            arbiter = WristArbiter()
            mateId = m.mateId
            seq = 0
            startedAtMs = now
            DebugStatus.log("Watch: finding ${mate.name}")
        }
        WatchFinderService.start(c, mate.name)
        if (loop == null) loop = scope.launch { run(c) }
    }

    private suspend fun run(c: Context) {
        while (true) {
            val now = System.currentTimeMillis()
            when (val state = lease.state(now)) {
                is FindLease.State.Active -> {
                    step(c, state, now)
                    delay(state.intervalMs)
                }
                is FindLease.State.Ended -> {
                    watch?.let { WatchLink.send(c, it, WatchMessage.FindEnded(state.sessionId, state.reason)) }
                    DebugStatus.log("Watch: find ended (${state.reason})")
                    break
                }
                FindLease.State.Idle -> break
            }
        }
        loop = null
        shutDown()
    }

    private fun step(c: Context, find: FindLease.State.Active, now: Long) {
        val w = watch ?: return
        val mate = FriendsRepository.byId(find.mateId)
        val gone = when {
            mate == null -> EndReason.MATE_GONE
            !Entitlements.plus(c) -> EndReason.NOT_ENTITLED
            else -> null
        }
        if (gone != null || mate == null) {
            lease.end()
            WatchLink.send(c, w, WatchMessage.FindEnded(find.sessionId, gone ?: EndReason.MATE_GONE))
            return
        }
        val listener = held ?: PhoneHeld(c).also { held = it }
        val declination: Double
        if (PhoneFinderBridge.phoneFinderRunning) {
            // The phone's own finder is on screen: stand down and listen to it. Its UWB, scan
            // and walk directions only count while the phone is really being held as a finder.
            pocket?.stop()
            listener.listen(true)
            val phoneHeld = listener.held
            PhoneFinderBridge.fixes(find.mateId).forEach { arbiter.submit(it, phoneHeld) }
            declination = PhoneFinderBridge.declinationDeg
        } else {
            listener.listen(false)
            val finder = pocket ?: PocketFinder(c, scope, mate = { mateId?.let(FriendsRepository::byId) }) { fix ->
                arbiter.submit(fix, phoneHeld = false)
            }.also { pocket = it }
            finder.start()
            declination = finder.declinationDeg
        }
        val reading = arbiter.reading(find.mateId, now, declination)
        seq = (seq + 1) and 0xFFFF
        WatchLink.send(
            c, w,
            WatchMessage.FindUpdate(find.sessionId, seq, status(c, reading, now), reading, lease.lastWatchClockMs, lease.echoHeldMs(now)),
        )
    }

    /** Anything on the phone that is stopping the find from working, so the watch can say what. */
    private fun status(c: Context, reading: WristReading, now: Long): FindStatus {
        fun denied(p: String) = c.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED
        if (denied(Manifest.permission.ACCESS_FINE_LOCATION) ||
            (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && denied(Manifest.permission.BLUETOOTH_SCAN))
        ) {
            return FindStatus.NO_PERMISSION
        }
        if (c.getSystemService(BluetoothManager::class.java)?.adapter?.isEnabled != true) return FindStatus.BLUETOOTH_OFF
        // Android only lets a background app scan and locate from a foreground service that
        // holds the location type. We have that when our own service got it, when the phone's
        // finder is on screen, or when you're live (the live service holds it). With none of
        // those and nothing heard after a few seconds, the fix is to open the app once.
        val canLocate = WatchFinderService.level == WatchFinderService.Level.WITH_LOCATION ||
            PhoneFinderBridge.phoneFinderRunning || VisibilityPrefs.isVisible(c)
        if (!canLocate && reading.kind == WristReading.Kind.NO_SIGNAL && now - startedAtMs > NEEDS_PHONE_AFTER_MS) return FindStatus.NEEDS_PHONE
        return FindStatus.OK
    }

    private fun shutDown() {
        loop?.cancel()
        loop = null
        pocket?.stop()
        pocket = null
        held?.listen(false)
        mateId = null
        app?.let { WatchFinderService.stop(it) }
    }

    private const val NEEDS_PHONE_AFTER_MS = 8_000L
}
