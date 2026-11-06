package nz.waveformlabs.moshpoint.locate

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
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.MethodArbiter
import nz.waveformlabs.moshpoint.core.SpinScan

/**
 * Runs every locating method at once and turns them into arrows.
 *
 * Each method pushes [Fix]es into the [MethodArbiter]; the UI just reads [arrows].
 * The user never picks a method.
 *
 * Wired up now:  Bluetooth signal strength, spin-to-scan, compass.
 * Still to do:   GPS via server, crowd relay, UWB (androidx.core.uwb), Wi-Fi Aware RTT.
 *                Each one only needs to call [arbiter].submit(...) with its fixes.
 */
/** [scope] must run on the main thread: BLE callbacks and the arbiter share it. */
class LocatorEngine(context: Context, private val scope: CoroutineScope) {
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

    private val ble = BleRanger(context, { trackedFriends() }) { friend, rssi, distance ->
        arbiter.submit(Fix(friend.id, Method.BLE_RSSI, null, distance, confidence = 0.7, timestampMs = System.currentTimeMillis()))
        spinScans[friend.id]?.add(heading, rssi.toDouble())
    }

    private var jobs = listOf<Job>()

    fun track(friendIds: Set<String>) {
        _tracking.value = friendIds
    }

    private fun trackedFriends(): List<Friend> = _tracking.value.mapNotNull(FriendsRepository::byId)

    fun start() {
        if (jobs.isNotEmpty()) return
        ble.start(lowLatency = true)
        jobs = listOf(
            scope.launch { compass.headings().collect { heading = it } },
            scope.launch {
                while (true) {
                    tick()
                    delay(50)
                }
            },
        )
    }

    fun stop() {
        ble.stop()
        jobs.forEach { it.cancel() }
        jobs = emptyList()
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
