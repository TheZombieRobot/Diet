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
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.MethodArbiter
import nz.waveformlabs.moshpoint.core.SpinScan

/**
 * Runs every locating method at once and turns them into arrows.
 *
 * Each method pushes [Fix]es into the [MethodArbiter]; the UI just reads [arrows].
 * The user never picks a method.
 *
 * Wired up now:  UWB, GPS via relay server, Bluetooth signal strength, spin-to-scan, compass.
 * Still to do:   crowd relay, Wi-Fi Aware RTT.
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

    private val ble = BleRanger(context, { trackedFriends() }) { friend, rssi, distance, advert ->
        arbiter.submit(Fix(friend.id, Method.BLE_RSSI, null, distance, confidence = 0.7, timestampMs = System.currentTimeMillis()))
        spinScans[friend.id]?.add(heading, rssi.toDouble())
        val info = advert.uwb
        if (info?.role == Advert.UwbRole.CONTROLEE) uwb?.onFriendControlee(friend.id, info.address)
    }

    private val gps = GpsFinder(context, scope, { trackedFriends() }) { arbiter.submit(it) }

    private var jobs = listOf<Job>()

    fun track(friendIds: Set<String>) {
        _tracking.value = friendIds
    }

    private fun trackedFriends(): List<Friend> = _tracking.value.mapNotNull(FriendsRepository::byId)

    fun start() {
        if (jobs.isNotEmpty()) return
        ble.start(lowLatency = true)
        uwb?.start()
        gps.start()
        jobs = listOf(
            // True-north heading: compass is magnetic, GPS bearings are true.
            scope.launch { compass.headings().collect { heading = Geo.normalize360(it + gps.declinationDeg) } },
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
        ble.stop()
        uwb?.stop()
        gps.stop()
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
        val adv = lookingAdvert ?: BleBroadcaster(context, AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY).also { lookingAdvert = it }
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
        _arrows.value = _tracking.value.map { arbiter.arrowFor(it, heading, now) }
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
