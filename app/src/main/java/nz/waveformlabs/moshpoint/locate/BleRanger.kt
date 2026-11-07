package nz.waveformlabs.moshpoint.locate

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.util.Log
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.RssiRanging

/**
 * Listens for friends' Moshpoint adverts over Bluetooth LE.
 *
 * Every advert carries a rotating 16-byte code (see [Advert]). We check it against each
 * friend's [Friend.ephemeralId]; on a match we decode the rest (UWB set-up details, if
 * any) and report it with the signal strength. Strangers' codes are ignored (later
 * they'll be relayed for the crowd network instead).
 */
class BleRanger(
    context: Context,
    /** Name shown in the debug panel, e.g. "BT scan (finder)". */
    private val debugName: String,
    private val friends: () -> List<Friend>,
    private val onAdvert: (friend: Friend, rssiDbm: Int, distanceM: Double, advert: Advert) -> Unit,
) {
    private val bt = context.getSystemService(BluetoothManager::class.java)
    private val scanner get() = bt?.adapter?.takeIf { it.isEnabled }?.bluetoothLeScanner
    private var lowLatency = true
    private val rangers = mutableMapOf<String, RssiRanging>()
    private var running = false
    private var heard = 0

    /** When the advert being handled was actually received (elapsedRealtime ms): callbacks can lag. */
    var lastHeardAtElapsedMs = 0L
        private set

    /** When we last heard any friend (elapsedRealtime ms). */
    var lastHeardAt = 0L
        private set

    private val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) = handle(result)
        override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::handle)
        override fun onScanFailed(errorCode: Int) {
            Log.w("BleRanger", "scan failed: $errorCode")
            DebugStatus.set(debugName, "FAILED code $errorCode")
            running = false
        }
    }

    private fun handle(result: ScanResult) {
        val data = result.scanRecord?.getServiceData(Ble.SERVICE_UUID) ?: return
        val id = Advert.idOf(data) ?: return
        val now = System.currentTimeMillis()
        val friend = friends().firstOrNull { it.ephemeralId.matches(id, now) } ?: return
        val advert = Advert.decode(friend.secret, data) ?: return
        val ranger = rangers.getOrPut(friend.id) { RssiRanging() }
        heard++
        DebugStatus.set(debugName, "on, heard ${friend.name} ${result.rssi} dBm (#$heard)")
        lastHeardAtElapsedMs = result.timestampNanos / 1_000_000
        lastHeardAt = android.os.SystemClock.elapsedRealtime()
        onAdvert(friend, result.rssi, ranger.add(result.rssi), advert)
    }

    /** Needs BLUETOOTH_SCAN (Android 12+) or location (Android 10/11). */
    @SuppressLint("MissingPermission")
    fun start(lowLatency: Boolean) {
        this.lowLatency = lowLatency
        if (running) return
        val filter = ScanFilter.Builder().setServiceData(Ble.SERVICE_UUID, ByteArray(0)).build()
        val settings = ScanSettings.Builder()
            .setScanMode(if (lowLatency) ScanSettings.SCAN_MODE_LOW_LATENCY else ScanSettings.SCAN_MODE_LOW_POWER)
            .build()
        val s = scanner ?: run {
            DebugStatus.set(debugName, "waiting for Bluetooth")
            return
        }
        try {
            s.startScan(listOf(filter), settings, callback)
            running = true
            DebugStatus.set(debugName, if (running) "on (${if (lowLatency) "fast" else "low power"}), nothing heard yet" else "no Bluetooth")
        } catch (e: SecurityException) {
            Log.w("BleRanger", "no scan permission", e)
            DebugStatus.set(debugName, "NO PERMISSION")
        } catch (e: IllegalStateException) {
            Log.w("BleRanger", "Bluetooth not ready", e)
        }
    }

    private var lastRefreshAt = 0L

    /**
     * Stop and start the scan, so the phone reports a friend it has already heard again.
     * Many phones' Bluetooth chips drop repeats of an advert they've seen, and ours only
     * changes every 5 minutes, so a second spin scan would hear almost nothing.
     * At most every 6 s: Android blocks more than 5 scan starts per 30 s.
     */
    fun refresh(minGapMs: Long = 6_000) {
        val now = android.os.SystemClock.elapsedRealtime()
        if (!running || now - lastRefreshAt < minGapMs) return
        lastRefreshAt = now
        stop()
        start(lowLatency)
        DebugStatus.log("BT scan refreshed (fresh readings)")
    }

    /** Call when Bluetooth comes back on: the old scan died with it. */
    fun restart() {
        running = false
        start(lowLatency)
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        if (!running) return
        try {
            scanner?.stopScan(callback)
        } catch (_: Exception) {
        }
        running = false
        DebugStatus.set(debugName, "off")
    }
}
