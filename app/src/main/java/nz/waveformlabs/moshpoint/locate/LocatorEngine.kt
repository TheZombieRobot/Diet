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
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.HeadingFilter
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.MethodArbiter
import nz.waveformlabs.moshpoint.core.MethodDebug
import nz.waveformlabs.moshpoint.core.RecordLine
import nz.waveformlabs.moshpoint.core.debug
import nz.waveformlabs.moshpoint.core.SpinScan
import nz.waveformlabs.moshpoint.core.WalkDirection

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
    /** Who we are right now (crew pass at a gig, see Identity). */
    private val identity: () -> ByteArray,
) {
    val capabilities = Capabilities.detect(context)

    private val arbiter = MethodArbiter()
    private val motion = MotionDetector(context)
    private val walks = mutableMapOf<String, WalkDirection>()
    private var lastWalkEstimateAt = 0L
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

    private val _uwbSpots = MutableStateFlow<Map<String, nz.waveformlabs.moshpoint.core.VenuePlacement.UwbReading>>(emptyMap())
    /** What UWB says right now about each tracked mate (true-north bearing, distance): the map places them from it. Fresh readings only. */
    val uwbSpots: StateFlow<Map<String, nz.waveformlabs.moshpoint.core.VenuePlacement.UwbReading>> = _uwbSpots.asStateFlow()
    private var lastUwbSpotsAt = 0L
    private var spinScans: Map<String, SpinScan> = emptyMap()

    // "I'm looking" advert: tells visible friends to speed up their adverts (battery
    // saving the rest of the time), and on UWB phones carries our UWB session details.
    private val mySecret: ByteArray get() = identity()
    private val ephemeral: EphemeralId get() = EphemeralId(mySecret)
    private var lookingAdvert: BleBroadcaster? = null
    private var uwbInfo: Advert.UwbInfo? = null

    private val uwb: UwbFinder? = if (capabilities.uwb) {
        UwbFinder(
            context, scope, identity,
            onAdvertInfo = { info ->
                uwbInfo = info
                updateLookingAdvert()
            },
            onResult = { friendId, distance, azimuth ->
                nz.waveformlabs.moshpoint.venue.Floors.onUwb(friendId, distance)
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
        nz.waveformlabs.moshpoint.venue.Floors.onBluetooth(friend.id, distance, advert.pressure)
        // The heading when this reading was received, unsmoothed: otherwise turning while
        // scanning shifts the answer in the direction you're turning.
        val atHeading = headingAt(bleRef?.lastHeardAtElapsedMs ?: 0L)
        val spin = spinScans[friend.id]
        if (spin != null) {
            spin.add(atHeading, rssi.toDouble())
            lastSpinSampleAt = System.currentTimeMillis()
        } else {
            // Walk-and-watch: every reading while you move about helps work out the direction.
            walks.getOrPut(friend.id) { WalkDirection() }.add(System.currentTimeMillis(), atHeading, rssi.toDouble(), motion.moving)
        }
        if (FieldRecorder.active) {
            FieldRecorder.line(
                RecordLine.of(
                    System.currentTimeMillis(), if (spinScans.isNotEmpty()) "rssi_scan" else "rssi", friend.name, "BLE_RSSI",
                    distanceM = distance, rssiDbm = rssi, headingDeg = heading,
                ),
            )
        }
        if (advert.beacon) beaconHeardAt[friend.id] = System.currentTimeMillis()
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
    private val lastSimMapAt = mutableMapOf<String, Long>()
    private val lastSimWalkAt = mutableMapOf<String, Long>()

    data class SimSettings(val uwb: Boolean = true, val wifiAware: Boolean = true, val data: Boolean = true)

    private val _sim = MutableStateFlow(SimSettings())
    val simSettings: StateFlow<SimSettings> = _sim.asStateFlow()

    fun setSim(settings: SimSettings) {
        _sim.value = settings
        sims.values.forEach { it.configure(settings) }
        DebugStatus.log("Simulator: UWB ${settings.uwb}, Wi-Fi ${settings.wifiAware}, data ${settings.data}")
    }

    // Pinned simulated friends: a real spot, so walking towards it gets you closer.
    private val simPrefs = context.getSharedPreferences("sim", Context.MODE_PRIVATE)
    private val _simPin = MutableStateFlow(
        simPrefs.getString("pin", null)?.split(',')?.mapNotNull { it.toDoubleOrNull() }?.takeIf { it.size == 2 }?.let { LatLon(it[0], it[1]) },
    )
    val simPin: StateFlow<LatLon?> = _simPin.asStateFlow()

    /** Pin the simulated friends [metres] ahead of where the phone is pointing. False = no GPS fix yet. */
    fun pinSimsAhead(metres: Double): Boolean {
        val me = gps.myFix ?: run {
            DebugStatus.log("Simulator: no GPS fix yet, try again outside")
            return false
        }
        val b = Math.toRadians(heading)
        val lat = me.latitude + metres * kotlin.math.cos(b) / 111_320.0
        val lon = me.longitude + metres * kotlin.math.sin(b) / (111_320.0 * kotlin.math.cos(Math.toRadians(me.latitude)))
        _simPin.value = LatLon(lat, lon)
        simPrefs.edit().putString("pin", "$lat,$lon").apply()
        sims.clear()
        DebugStatus.log("Simulator: pinned %.0f m ahead (%.0f°)".format(metres, heading))
        return true
    }

    fun unpinSims() {
        _simPin.value = null
        simPrefs.edit().remove("pin").apply()
        sims.clear()
        DebugStatus.log("Simulator: unpinned, walking in again")
    }

    /** Where a pinned sim is from us now (east, north metres); each sim a few metres apart. */
    private fun pinnedOffsetFor(id: String): Pair<Double, Double>? {
        val pin = _simPin.value ?: return null
        val me = gps.myFix ?: return null
        val spread = (id.hashCode() and 0xFF) / 255.0 * 2 * Math.PI
        val n = (pin.lat - me.latitude) * 111_320.0 + 6 * kotlin.math.cos(spread)
        val e = (pin.lon - me.longitude) * 111_320.0 * kotlin.math.cos(Math.toRadians(me.latitude)) + 6 * kotlin.math.sin(spread)
        return e to n
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
                FriendSimulator(id, startBearingDeg = (id.hashCode() and 0xFF) * 360.0 / 256, seed = id.hashCode()).also {
                    it.configure(_sim.value)
                    if (_simPin.value != null) it.pinnedOffset = { pinnedOffsetFor(id) }
                }
            }
            // Pinned: show them on the map too, and let walk-to-find learn from their signal.
            val pin = _simPin.value
            val me = gps.myFix
            if (pin != null && me != null) {
                if (now - (lastSimMapAt[id] ?: 0L) > 10_000) {
                    lastSimMapAt[id] = now
                    val (pe, pn) = pinnedOffsetFor(id) ?: (0.0 to 0.0)
                    val lat = me.latitude + pn / 111_320.0
                    val lon = me.longitude + pe / (111_320.0 * kotlin.math.cos(Math.toRadians(me.latitude)))
                    nz.waveformlabs.moshpoint.LocationBook.update(id, nz.waveformlabs.moshpoint.core.SharedLocation(lat, lon, now / 1000, 5, batteryPct = 80))
                }
                if (spinScans.isEmpty() && now - (lastSimWalkAt[id] ?: 0L) >= 250) {
                    lastSimWalkAt[id] = now
                    walks.getOrPut(id) { WalkDirection() }.add(now, heading, sim.rssiNow(now, heading), motion.moving)
                }
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
            BleHub.onBluetooth(on)
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
            walks.clear()
            _scan.value = null
        }
        _tracking.value = friendIds
    }

    private fun trackedFriends(): List<Friend> = _tracking.value.mapNotNull(FriendsRepository::byId)

    fun start() {
        if (jobs.isNotEmpty()) return
        ble.start(lowLatency = true)
        motion.start()
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
        motion.stop()
        uwb?.stop()
        gps.stop()
        wifi?.stop()
        radios.stop()
        CrowdRelayRadio.stopListening(context)
        lookingAdvert?.stop()
        jobs.forEach { it.cancel() }
        jobs = emptyList()
        _uwbSpots.value = emptyMap()
    }

    private fun updateLookingAdvert() {
        if (jobs.isEmpty()) return // only while the finder is running
        val adv = lookingAdvert
            ?: BleBroadcaster(context, AdvertiseSettings.ADVERTISE_MODE_BALANCED, "BT advert (looking)").also { lookingAdvert = it }
        adv.mode = if (beaconOn) AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY else AdvertiseSettings.ADVERTISE_MODE_BALANCED
        val me = mySecret
        adv.update(Advert.encode(me, EphemeralId(me).currentId(System.currentTimeMillis()), uwbInfo, looking = true, beacon = beaconOn, askLight = System.currentTimeMillis() < askLightUntil))
    }

    // ---- "Light me up" beacon ----

    private var askLightUntil = 0L

    /** Ask the friends we're looking for to light up (for a minute): their phones offer it. */
    fun askLight() {
        askLightUntil = System.currentTimeMillis() + 60_000
        updateLookingAdvert()
        scope.launch {
            kotlinx.coroutines.delay(61_000)
            updateLookingAdvert()
        }
        DebugStatus.log("Asked mates to light up")
    }

    private var beaconOn = false
    private val beaconHeardAt = mutableMapOf<String, Long>()
    private val _beaconing = MutableStateFlow<Set<String>>(emptySet())
    /** Friends flashing their screen for us right now (heard in the last few seconds). */
    val beaconing: StateFlow<Set<String>> = _beaconing.asStateFlow()

    /** Tell friends' finders we're flashing our screen (a flag in our Bluetooth advert). */
    fun setBeacon(on: Boolean) {
        if (beaconOn == on) return
        beaconOn = on
        updateLookingAdvert()
        DebugStatus.log(if (on) "Light me up: on" else "Light me up: off")
    }

    /** The Scan button: start collecting (heading, signal) pairs while the user turns. */
    fun startSpinScan() {
        spinScans = _tracking.value.associateWith { SpinScan() }
        scanStartedAt = System.currentTimeMillis()
        lastSpinSampleAt = scanStartedAt
        turned.fill(false)
        ble.refresh()
        _scan.value = ScanUi(coverageDeg = 0.0, done = false, sectors = BooleanArray(36), headingDeg = heading)
        DebugStatus.log("Spin scan started")
    }

    private var scanStartedAt = 0L
    private var lastSpinSampleAt = 0L

    /** Which 10-degree slices the user has turned through this scan (from the compass). */
    private val turned = BooleanArray(36)

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
        // Distance gone quiet (chips that drop repeat adverts): an occasional gentle refresh.
        else if (_tracking.value.isNotEmpty() && android.os.SystemClock.elapsedRealtime() - ble.lastHeardAt > 8_000) ble.refresh(minGapMs = 12_000)
        if (now - lastWalkEstimateAt > 1_000) {
            lastWalkEstimateAt = now
            for ((id, w) in walks) w.estimate()?.let { (bearing, conf) -> submit(Fix(id, Method.WALK, bearing, null, conf, now)) }
        }
        beaconHeardAt.entries.removeAll { now - it.value > 6_000 }
        if (_beaconing.value != beaconHeardAt.keys) _beaconing.value = beaconHeardAt.keys.toSet()
        if (now - lastUwbSpotsAt >= 500) {
            lastUwbSpotsAt = now
            val spots = _tracking.value.mapNotNull { id ->
                arbiter.latestFix(id, Method.UWB)?.takeIf { now - it.timestampMs <= nz.waveformlabs.moshpoint.core.VenuePlacement.UWB_MAX_AGE_MS }
                    ?.let { id to nz.waveformlabs.moshpoint.core.VenuePlacement.UwbReading(it.bearingDeg, it.distanceM, it.timestampMs) }
            }.toMap()
            if (spots != _uwbSpots.value) _uwbSpots.value = spots
        }
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
        // Readings dried up mid-scan (repeat filtering, interference): kick the Bluetooth scan.
        if (now - lastSpinSampleAt > 2_500) ble.refresh()
        turned[((Geo.normalize360(heading) / 10).toInt()).coerceIn(0, 35)] = true
        val turnedDeg = turned.count { it } * 10.0
        // A full turn, or most of one after a while (some phones' compasses skip a patch):
        // either way, give the best answer instead of a ring that never completes.
        val fullCircle = turnedDeg >= 330.0 || (now - scanStartedAt > 25_000 && turnedDeg >= 200.0)

        // Can't hear them at all (not live, not in your crew, out of range): say so
        // quickly instead of leaving an empty progress ring.
        if (now - scanStartedAt > 6_000 && spinScans.values.all { it.sampleCount == 0 }) {
            val who = spinScans.keys.joinToString(", ") { nameOf(it) }
            finishScan("Can't hear $who's phone at all. Scan needs them nearby (about 30 m) with Go live on, in your crew.")
            DebugStatus.log("Spin scan: no signal from $who")
            return
        }

        var allDone = true
        val outcomes = mutableListOf<String>()
        for ((id, scan) in spinScans) {
            val name = nameOf(id)
            // Turned a full circle but readings were patchy: best answer we can, don't wait forever.
            var r = scan.result()
            if (r is SpinScan.Result.NeedMore && fullCircle) r = scan.bestGuess()
            when (r) {
                is SpinScan.Result.NeedMore -> allDone = false
                is SpinScan.Result.Found -> {
                    submit(Fix(id, Method.SPIN_SCAN, r.bearingDeg, null, r.confidence, now))
                    outcomes += "$name: found" + if (r.confidence < 0.5) " (rough, scan again to firm it up)" else ""
                }
                SpinScan.Result.Inconclusive ->
                    outcomes += "$name: couldn't tell (only heard them ${scan.sampleCount}×). Tap Scan again and turn a bit slower."
            }
        }
        // Give up after 45 s (e.g. their phone went out of range mid-scan).
        val timedOut = now - scanStartedAt > 45_000
        if (allDone || timedOut) {
            if (timedOut && !allDone) outcomes += "Not enough signal while turning. Try again a bit slower."
            finishScan(outcomes.joinToString("\n"))
            DebugStatus.log("Spin scan done: " + outcomes.joinToString("; "))
        } else {
            // The ring follows how far YOU have turned, so it never looks frozen.
            val heard = spinScans.values.minOfOrNull { it.sampleCount } ?: 0
            _scan.value = ScanUi(turnedDeg, done = false, sectors = turned.copyOf(), headingDeg = heading, heard = heard)
        }
    }

    private fun finishScan(outcome: String) {
        spinScans = emptyMap()
        _scan.value = ScanUi(360.0, done = true, sectors = BooleanArray(36) { true }, headingDeg = heading, outcome = outcome)
    }

    class ScanUi(
        val coverageDeg: Double,
        val done: Boolean,
        /** 36 slices of the circle: true once covered (for the progress ring). */
        val sectors: BooleanArray = BooleanArray(36),
        val headingDeg: Double = 0.0,
        /** Shown when done. */
        val outcome: String = "",
        /** Signal readings heard so far (the fewest, if scanning for several). */
        val heard: Int = 0,
    )
}
