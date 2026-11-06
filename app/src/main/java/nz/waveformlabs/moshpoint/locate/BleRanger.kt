package nz.waveformlabs.moshpoint.locate

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.core.RssiRanging

/**
 * Listens for friends' Moshpoint broadcasts over Bluetooth LE.
 *
 * Every advert carries a rotating 16-byte code. We check it against each friend's
 * [Friend.ephemeralId]; on a match we report the signal strength. Strangers' codes are
 * ignored (later they'll be relayed for the crowd network instead).
 */
class BleRanger(
    context: Context,
    private val friends: () -> List<Friend>,
    private val onReading: (friend: Friend, rssiDbm: Int, distanceM: Double) -> Unit,
) {
    private val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner
    private val rangers = mutableMapOf<String, RssiRanging>()

    private val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) = handle(result)
        override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::handle)
    }

    private fun handle(result: ScanResult) {
        val code = result.scanRecord?.getServiceData(Ble.SERVICE_UUID) ?: return
        val now = System.currentTimeMillis()
        val friend = friends().firstOrNull { it.ephemeralId.matches(code, now) } ?: return
        val ranger = rangers.getOrPut(friend.id) { RssiRanging() }
        onReading(friend, result.rssi, ranger.add(result.rssi))
    }

    /** Needs BLUETOOTH_SCAN (Android 12+) or location (Android 10/11). */
    @SuppressLint("MissingPermission")
    fun start(lowLatency: Boolean) {
        val filter = ScanFilter.Builder().setServiceData(Ble.SERVICE_UUID, null).build()
        val settings = ScanSettings.Builder()
            .setScanMode(if (lowLatency) ScanSettings.SCAN_MODE_LOW_LATENCY else ScanSettings.SCAN_MODE_BALANCED)
            .build()
        scanner?.startScan(listOf(filter), settings, callback)
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        scanner?.stopScan(callback)
    }
}
