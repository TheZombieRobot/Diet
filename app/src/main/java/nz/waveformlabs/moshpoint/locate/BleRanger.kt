package nz.waveformlabs.moshpoint.locate

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.util.Log
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
    private val friends: () -> List<Friend>,
    private val onAdvert: (friend: Friend, rssiDbm: Int, distanceM: Double, advert: Advert) -> Unit,
) {
    private val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner
    private val rangers = mutableMapOf<String, RssiRanging>()
    private var running = false

    private val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) = handle(result)
        override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach(::handle)
        override fun onScanFailed(errorCode: Int) {
            Log.w("BleRanger", "scan failed: $errorCode")
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
        onAdvert(friend, result.rssi, ranger.add(result.rssi), advert)
    }

    /** Needs BLUETOOTH_SCAN (Android 12+) or location (Android 10/11). */
    @SuppressLint("MissingPermission")
    fun start(lowLatency: Boolean) {
        if (running) return
        val filter = ScanFilter.Builder().setServiceData(Ble.SERVICE_UUID, null).build()
        val settings = ScanSettings.Builder()
            .setScanMode(if (lowLatency) ScanSettings.SCAN_MODE_LOW_LATENCY else ScanSettings.SCAN_MODE_LOW_POWER)
            .build()
        try {
            scanner?.startScan(listOf(filter), settings, callback)
            running = scanner != null
        } catch (e: SecurityException) {
            Log.w("BleRanger", "no scan permission", e)
        }
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        if (!running) return
        try {
            scanner?.stopScan(callback)
        } catch (_: SecurityException) {
        }
        running = false
    }
}
