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
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.HeadingFilter
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.MethodArbiter
import nz.waveformlabs.moshpoint.core.MethodDebug
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
    private val headingFilter = HeadingFilter()

    private val _arrows = MutableStateFlow<List<ArrowState>>(emptyList())
    val arrows: StateFlow<List<ArrowState>> = _arrows.asStateFlow()

    /** Friends currently being looked for (tapped in the list, or the whole gig group). */
    private val _tracking = MutableStateFlow<Set<String>>(emptySet())
    val tracking: StateFlow<Set<String>> = _tracking.asStateFlow()

    private val _scan = MutableStateFlow<ScanUi?>(null)
    val scan: StateFlow<ScanUi?> = _scan.asStateFlow()
    private var spinScans: Map<String, SpinScan> = emptyMap()

    // "I'm looking" advert: lets friends' phones find our UWB session. Only used with UWB.
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
                arbiter.submit(
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

    private val ble = BleRanger(context, "BT scan (looking)", { trackedFriends() }) { friend, rssi, distance, advert ->
        arbiter.submit(Fix(friend.id, Method.BLE_RSSI, null, distance, confidence = 0.7, timestampMs = System.currentTimeMillis()))
        spinScans[friend.id]?.add(heading, rssi.toDouble())
        val info = advert.uwb
        if (info?.role == Advert.UwbRole.CONTROLEE) uwb?.onFriendControlee(friend.id, info.address)
    }

    private val gps = GpsFinder(context, scope, { trackedFriends() }) { arbiter.submit(it) }

    private val wifi: WifiAwareFinder? = if (wifiRttSupported(context)) {
        WifiAwareFinder(context, scope, { trackedFriends() }) { friendId, distance ->
            arbiter.submit(Fix(friendId, Method.WIFI_AWARE, null, distance, confidence = 0.85, timestampMs = System.currentTimeMillis()))
        }
    } else {
        null
    }

    private var jobs = listOf<Job>()

    private val radios = RadioWatcher(
        context,
        onBluetooth = { on ->
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
                compass.headings().collect { heading = headingFilter.add(Geo.normalize360(it + gps.declinationDeg)) }
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
        val info = uwbInfo
        if (info == null) {
            lookingAdvert?.stop()
            return
        }
        val adv = lookingAdvert
            ?: BleBroadcaster(context, AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY, "BT advert (looking, UWB)").also { lookingAdvert = it }
        adv.update(Advert.encode(mySecret, ephemeral.currentId(System.currentTimeMillis()), info))
    }

    /** The Scan button: start collecting (heading, signal) pairs while the user turns. */
    fun startSpinScan() {
        spinScans = _tracking.value.associateWith { SpinScan() }
        _scan.value = ScanUi(coverageDeg = 0.0, done = false)
    }

    fun cancelSpinScan() {
        spinScans = emptyMap()
        _scan.value = null
    }

    private fun tick() {
        val now = System.currentTimeMillis()
        if (spinScans.isNotEmpty()) updateSpinScan(now)
        val arrows = _tracking.value.map { arbiter.arrowFor(it, heading, now) }
        _arrows.value = arrows
        if (DebugStatus.enabled) updateDebug(now, arrows)
    }

    private fun updateSpinScan(now: Long) {
        var minCoverage = 360.0
        var allDone = true
        for ((id, scan) in spinScans) {
            when (val r = scan.result()) {
                is SpinScan.Result.NeedMore -> { allDone = false; minCoverage = minOf(minCoverage, r.coverageDeg) }
                is SpinScan.Result.Found -> arbiter.submit(Fix(id, Method.SPIN_SCAN, r.bearingDeg, null, r.confidence, now))
                SpinScan.Result.Inconclusive -> Unit
            }
        }
        if (allDone) {
            spinScans = emptyMap()
            _scan.value = ScanUi(coverageDeg = 360.0, done = true)
        } else {
            _scan.value = ScanUi(coverageDeg = minCoverage, done = false)
        }
    }

    data class ScanUi(val coverageDeg: Double, val done: Boolean)
}
