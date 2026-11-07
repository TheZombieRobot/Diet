package nz.waveformlabs.moshpoint.locate

import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.FieldRecorder
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.DistanceSmoother
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.FriendSimulator
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.HeadingFilter
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.MethodArbiter
import nz.waveformlabs.moshpoint.core.MethodDebug
import nz.waveformlabs.moshpoint.core.RecordLine
import nz.waveformlabs.moshpoint.core.debug
import nz.waveformlabs.moshpoint.core.SpinScan

/**
 * Runs every locating method at once and turns them into arrows.
 *
 * Each method pushes [Fix]es into the [MethodArbiter]; the UI just reads [arrows].
 * The user never picks a method.
 *
 * Wired up: UWB, Wi-Fi Aware RTT, GPS via relay server, crowd relay, Bluetooth signal
 * strength, spin-to-scan, compass.
 *                Each one only needs to call [arbiter].submit(...) with its fixes.
 *
 * [scope] must run on the main thread: BLE callbacks and the arbiter share it.
 */
class LocatorEngine(
    private val context: Context,
    private val scope: CoroutineScope,
    private val mySecret: ByteArray,
) {
    val capabilities = Capabilities.detect(context)

    private val arbiter = MethodArbiter()
    private val compass = Compass(context)
    private var heading = 0.0
    // Snappier than the defaults: the arrow should feel glued to the phone.
    private val headingFilter = HeadingFilter(slowAlpha = 0.18, fastAlpha = 0.75, fastAboveDeg = 15.0)

    /** Recent raw (unsmoothed) headings by elapsedRealtime, so spin-scan readings get the heading at the moment they were received. */
    private val headingLog = ArrayDeque<Pair<Long, Double>>()

    private fun headingAt(elapsedMs: Long): Double {
        if (elapsedMs <= 0 || headingLog.isEmpty()) return heading
        var best = headingLog.last()
        for (e in headingLog) if (kotlin.math.abs(e.first - elapsedMs) < kotlin.math.abs(best.first - elapsedMs)) best = e
        return if (kotlin.math.abs(best.first - elapsedMs) < 1_000) best.second else heading
    }

    private val _arrows = MutableStateFlow<List<ArrowState>>(emptyList())
    val arrows: StateFlow<List<ArrowState>> = _arrows.asStateFlow()

    /** Friends currently being looked for (tapped in the list, or the whole gig group). */
    private val _tracking = MutableStateFlow<Set<String>>(emptySet())
    val tracking: StateFlow<Set<String>> = _tracking.asStateFlow()

    private val _scan = MutableStateFlow<ScanUi?>(null)
    val scan: StateFlow<ScanUi?> = _scan.asStateFlow()
    private var spinScans: Map<String, SpinScan> = emptyMap()

    // "I'm looking" advert: tells visible friends to speed up their adverts (battery
    // saving the rest of the time), and on UWB phones carries our UWB session details.
    private val ephemeral = EphemeralId(mySecret)
    private var lookingAdvert: BleBroadcaster? = null
    private var uwbInfo: Advert.UwbInfo? = null

    private val uwb: UwbFinder? = if (capabilities.uwb) {
        UwbFinder(
            context, scope, mySecret,
            onAdvertInfo = { info ->
                uwbInfo = info
                updateLookingAdvert()
            },
            onResult = { friendId, distance, azimuth ->
                submit(
                    Fix(
                        friendId = friendId,
                        method = Method.UWB,
                        bearingDeg = azimuth?.let { Geo.normalize360(heading + it) },
                        distanceM = distance,
                        confidence = if (azimuth != null) 0.95 else 0.8,
                        timestampMs = System.currentTimeMillis(),
                    ),
                )
            },
        )
    } else {
        null
    }

    private var bleRef: BleRanger? = null
    private val ble = BleRanger(context, "BT scan (looking)", { trackedFriends() }) { friend, rssi, distance, advert ->
        submit(Fix(friend.id, Method.BLE_RSSI, null, distance, confidence = 0.7, timestampMs = System.currentTimeMillis()))
        // The heading when this reading was received, unsmoothed: otherwise turning while
        // scanning shifts the answer in the direction you're turning.
        spinScans[friend.id]?.add(headingAt(bleRef?.lastHeardAtElapsedMs ?: 0L), rssi.toDouble())
        if (FieldRecorder.active) {
            FieldRecorder.line(
                RecordLine.of(
                    System.currentTimeMillis(), if (spinScans.isNotEmpty()) "rssi_scan" else "rssi", friend.name, "BLE_RSSI",
                    distanceM = distance, rssiDbm = rssi, headingDeg = heading,
                ),
            )
        }
        val info = advert.uwb
        if (info?.role == Advert.UwbRole.CONTROLEE) uwb?.onFriendControlee(friend.id, info.address)
    }.also { bleRef = it }

    private val gps = GpsFinder(context, scope, { trackedFriends() }) { submit(it) }

    private val wifi: WifiAwareFinder? = if (wifiRttSupported(context)) {
        WifiAwareFinder(context, scope, { trackedFriends() }) { friendId, distance ->
            submit(Fix(friendId, Method.WIFI_AWARE, null, distance, confidence = 0.85, timestampMs = System.currentTimeMillis()))
        }
    } else {
        null
    }

    private var jobs = listOf<Job>()

    /** Every fix goes through here: into the arbiter, and into a field recording if one is running. */
    private fun submit(fix: Fix) {
        arbiter.submit(fix)
        if (FieldRecorder.active) {
            FieldRecorder.line(
                RecordLine.of(
                    fix.timestampMs, "fix", nameOf(fix.friendId), fix.method.name,
                    distanceM = fix.distanceM, bearingDeg = fix.bearingDeg, headingDeg = heading, confidence = fix.confidence,
                ),
            )
        }
    }

    // ---- Simulated friends (debug builds only) ----

    private val sims = mutableMapOf<String, FriendSimulator>()
    private val lastSimScanSample = mutableMapOf<String, Long>()

    data class SimSettings(val uwb: Boolean = true, val wifiAware: Boolean = true, val data: Boolean = true)

    private val _sim = MutableStateFlow(SimSettings())
    val simSettings: StateFlow<SimSettings> = _sim.asStateFlow()

    fun setSim(settings: SimSettings) {
        _sim.value = settings
        sims.values.forEach { it.configure(settings) }
        DebugStatus.log("Simulator: UWB ${settings.uwb}, Wi-Fi ${settings.wifiAware}, data ${settings.data}")
    }

    /** Start the simulated friends' walk again from far away. */
    fun restartSims() {
        sims.clear()
        DebugStatus.log("Simulator: walk restarted")
    }

    private fun FriendSimulator.configure(s: SimSettings) {
        hasUwb = s.uwb
        hasWifiAware = s.wifiAware
        noData = !s.data
    }

    private fun tickSims(now: Long) {
        if (!DebugStatus.enabled) return
        for (id in _tracking.value) {
            if (!FriendsRepository.isSimulated(id)) continue
            val sim = sims.getOrPut(id) {
                FriendSimulator(id, startBearingDeg = (id.hashCode() and 0xFF) * 360.0 / 256, seed = id.hashCode()).also { it.configure(_sim.value) }
            }
            sim.tick(now, heading).forEach(::submit)
            // Spin-to-scan works on simulated friends too (the sim models body shadow).
            val r = sim.lastRssi
            if (r != null && spinScans.containsKey(id) && now - (lastSimScanSample[id] ?: 0L) >= 150) {
                lastSimScanSample[id] = now
                spinScans[id]?.add(heading, sim.rssiNow(now, heading))
            }
            val (e, n) = sim.position(now)
            DebugStatus.set("Simulator", "${nameOf(id)} %.0f m away".format(kotlin.math.hypot(e, n)))
        }
    }

    private fun nameOf(friendId: String) = FriendsRepository.byId(friendId)?.name ?: friendId
    private var lastRecordAt = 0L

    private fun recordTick(now: Long, arrows: List<ArrowState>) {
        if (!FieldRecorder.active || now - lastRecordAt < 500) return
        lastRecordAt = now
        FieldRecorder.line(RecordLine.of(now, "heading", headingDeg = heading))
        for (a in arrows) {
            FieldRecorder.line(
                when (a) {
                    is ArrowState.NoSignal -> RecordLine.of(now, "arrow", nameOf(a.friendId), note = "no signal")
                    is ArrowState.DistanceOnly -> RecordLine.of(
                        now, "arrow", nameOf(a.friendId), a.method.name, distanceM = a.distanceM, note = "distance only ${a.trend}",
                    )
                    is ArrowState.Pointing -> RecordLine.of(
                        now, "arrow", nameOf(a.friendId), a.method.name, distanceM = a.distanceM,
                        bearingDeg = Geo.normalize360(heading + a.relativeDeg), headingDeg = heading,
                        note = if (a.unsure) "unsure" else null,
                    )
                },
            )
        }
    }

    private val radios = RadioWatcher(
        context,
        onBluetooth = { on ->
            nz.waveformlabs.moshpoint.GroupSync.onBluetooth(context, on)
            if (on) {
                ble.restart()
                CrowdRelayRadio.restartAfterBluetooth(context)
                updateLookingAdvert()
            } else {
                lookingAdvert?.onBluetoothOff()
            }
        },
        onWifiAware = { available ->
            if (available) {
                wifi?.stop()
                wifi?.start()
            }
        },
    )

    // ---- Debug panel (debug builds only) ----

    private val _enabledMethods = MutableStateFlow(Method.entries.toSet())
    /** Methods allowed to drive the arrow. Switch some off to test one at a time. */
    val enabledMethods: StateFlow<Set<Method>> = _enabledMethods.asStateFlow()

    private val _debugRows = MutableStateFlow<Map<String, List<MethodDebug>>>(emptyMap())
    /** Per tracked friend: what every method last said, and which is driving the arrow. */
    val debugRows: StateFlow<Map<String, List<MethodDebug>>> = _debugRows.asStateFlow()

    private val lastDriving = mutableMapOf<String, String>()
    private var lastDebugAt = 0L

    fun setMethodEnabled(method: Method, on: Boolean) {
        val next = if (on) _enabledMethods.value + method else _enabledMethods.value - method
        _enabledMethods.value = next
        arbiter.enabled = next
        DebugStatus.log("${if (on) "Enabled" else "Disabled"} $method")
    }

    fun enableOnly(method: Method?) {
        val next = if (method == null) Method.entries.toSet() else setOf(method)
        _enabledMethods.value = next
        arbiter.enabled = next
        DebugStatus.log(if (method == null) "All methods enabled" else "Only $method enabled")
    }

    private fun updateDebug(now: Long, arrows: List<ArrowState>) {
        // Log every hand-over between methods, e.g. "Sam: BT -> UWB (12 m)".
        for (a in arrows) {
            val name = FriendsRepository.byId(a.friendId)?.name ?: a.friendId
            val state = when (a) {
                is ArrowState.NoSignal -> "no signal"
                is ArrowState.DistanceOnly -> "${a.method} distance only"
                is ArrowState.Pointing -> a.method.name + if (a.unsure) " (unsure)" else ""
            }
            val before = lastDriving.put(a.friendId, state)
            if (before != null && before != state) {
                val d = when (a) {
                    is ArrowState.DistanceOnly -> a.distanceM
                    is ArrowState.Pointing -> a.distanceM
                    else -> null
                }
                DebugStatus.log("$name: $before -> $state" + (d?.let { " (%.1f m)".format(it) } ?: ""))
            }
        }
        if (now - lastDebugAt < 250) return
        lastDebugAt = now
        _debugRows.value = arrows.associate { a ->
            a.friendId to arbiter.debug(a.friendId, now, (a as? ArrowState.Pointing)?.method)
        }
        DebugStatus.set("Compass", "%.0f° true (declination %.1f°)".format(heading, gps.declinationDeg))
    }

    fun track(friendIds: Set<String>) {
        // A different mate: drop any scan (or its result) from the last one.
        if (friendIds != _tracking.value) {
            spinScans = emptyMap()
            _scan.value = null
        }
        _tracking.value = friendIds
    }

    private fun trackedFriends(): List<Friend> = _tracking.value.mapNotNull(FriendsRepository::byId)

    fun start() {
        if (jobs.isNotEmpty()) return
        ble.start(lowLatency = true)
        uwb?.start()
        gps.start()
        wifi?.start()
        radios.start()
        CrowdRelayRadio.startListening(context)
        jobs = listOf(
            // True-north heading: compass is magnetic, GPS bearings are true.
            scope.launch {
                compass.headings().collect {
                    val raw = Geo.normalize360(it + gps.declinationDeg)
                    headingLog.addLast(android.os.SystemClock.elapsedRealtime() to raw)
                    while (headingLog.size > 200) headingLog.removeFirst() // a few seconds at SENSOR_DELAY_GAME
                    heading = headingFilter.add(raw)
                }
            },
            scope.launch {
                while (true) {
                    tick()
                    delay(50)
                }
            },
            // Rotate the looking advert's id with the epoch.
            scope.launch {
                while (true) {
                    val now = System.currentTimeMillis()
                    delay((ephemeral.epochAt(now) + 1) * EphemeralId.DEFAULT_ROTATION_MS - now + 50)
                    updateLookingAdvert()
                }
            },
        )
        updateLookingAdvert()
    }

    fun stop() {
        if (jobs.isEmpty()) return // not running: don't release listeners we never took
        ble.stop()
        uwb?.stop()
        gps.stop()
        wifi?.stop()
        radios.stop()
        CrowdRelayRadio.stopListening(context)
        lookingAdvert?.stop()
        jobs.forEach { it.cancel() }
        jobs = emptyList()
    }

    private fun updateLookingAdvert() {
        if (jobs.isEmpty()) return // only while the finder is running
        val adv = lookingAdvert
            ?: BleBroadcaster(context, AdvertiseSettings.ADVERTISE_MODE_BALANCED, "BT advert (looking)").also { lookingAdvert = it }
        adv.update(Advert.encode(mySecret, ephemeral.currentId(System.currentTimeMillis()), uwbInfo, looking = true))
    }

    /** The Scan button: start collecting (heading, signal) pairs while the user turns. */
    fun startSpinScan() {
        spinScans = _tracking.value.associateWith { SpinScan() }
        scanStartedAt = System.currentTimeMillis()
        _scan.value = ScanUi(coverageDeg = 0.0, done = false, sectors = BooleanArray(36), headingDeg = heading)
        DebugStatus.log("Spin scan started")
    }

    private var scanStartedAt = 0L

    /** Clear the "done" message. */
    fun dismissScanResult() {
        if (_scan.value?.done == true) _scan.value = null
    }

    fun cancelSpinScan() {
        spinScans = emptyMap()
        _scan.value = null
    }

    private fun tick() {
        val now = System.currentTimeMillis()
        tickSims(now)
        if (spinScans.isNotEmpty()) updateSpinScan(now)
        val raw = _tracking.value.map { arbiter.arrowFor(it, heading, now) }
        val arrows = raw.map(::steady)
        _arrows.value = arrows
        if (DebugStatus.enabled) updateDebug(now, arrows)
        recordTick(now, raw) // recordings keep the raw distances
    }

    // Steady on-screen distances (raw readings wobble; the number rolls when it changes).
    private val smoothers = mutableMapOf<String, DistanceSmoother>()

    private fun steady(a: ArrowState): ArrowState {
        fun shown(id: String, d: Double) =
            DistanceSmoother.roundForDisplay(smoothers.getOrPut(id) { DistanceSmoother() }.update(d))
        return when (a) {
            is ArrowState.NoSignal -> {
                smoothers.remove(a.friendId)
                a
            }
            is ArrowState.DistanceOnly -> a.copy(distanceM = shown(a.friendId, a.distanceM))
            is ArrowState.Pointing -> a.distanceM?.let { a.copy(distanceM = shown(a.friendId, it)) } ?: a
        }
    }

    private fun updateSpinScan(now: Long) {
        var minCoverage = 360.0
        var allDone = true
        var sectors = BooleanArray(36) { true }
        val outcomes = mutableListOf<String>()
        for ((id, scan) in spinScans) {
            val name = nameOf(id)
            when (val r = scan.result()) {
                is SpinScan.Result.NeedMore -> {
                    allDone = false
                    if (r.coverageDeg <= minCoverage) {
                        minCoverage = r.coverageDeg
                        sectors = scan.sectors(36)
                    }
                }
                is SpinScan.Result.Found -> {
                    submit(Fix(id, Method.SPIN_SCAN, r.bearingDeg, null, r.confidence, now))
                    outcomes += "$name: found" + if (r.confidence < 0.5) " (rough)" else ""
                }
                SpinScan.Result.Inconclusive -> outcomes += "$name: couldn't tell. Too close, or something in the way? Try again."
            }
        }
        // Can't hear them at all (not live, not added you back, out of range): say so
        // quickly instead of leaving an empty progress ring.
        if (!allDone && now - scanStartedAt > 6_000 && spinScans.values.all { it.sampleCount == 0 }) {
            val who = spinScans.keys.joinToString(", ") { nameOf(it) }
            spinScans = emptyMap()
            _scan.value = ScanUi(
                0.0, done = true, headingDeg = heading,
                outcome = "Can't hear $who's phone at all. Scan needs them nearby (about 30 m) with Go live on, " +
                    "and they need to have added you back.",
            )
            DebugStatus.log("Spin scan: no signal from $who")
            return
        }
        // Give up after 45 s (e.g. their phone went out of range mid-scan).
        val timedOut = now - scanStartedAt > 45_000
        if (allDone || timedOut) {
            if (timedOut && !allDone) outcomes += "Not enough signal while turning. Try again a bit slower."
            spinScans = emptyMap()
            _scan.value = ScanUi(360.0, done = true, sectors = BooleanArray(36) { true }, headingDeg = heading, outcome = outcomes.joinToString("\n"))
            DebugStatus.log("Spin scan done: " + outcomes.joinToString("; "))
        } else {
            _scan.value = ScanUi(minCoverage, done = false, sectors = sectors, headingDeg = heading)
        }
    }

    class ScanUi(
        val coverageDeg: Double,
        val done: Boolean,
        /** 36 slices of the circle: true once covered (for the progress ring). */
        val sectors: BooleanArray = BooleanArray(36),
        val headingDeg: Double = 0.0,
        /** Shown when done. */
        val outcome: String = "",
    )
}
