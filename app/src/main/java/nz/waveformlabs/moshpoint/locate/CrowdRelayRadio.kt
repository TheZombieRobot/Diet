package nz.waveformlabs.moshpoint.locate

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertisingSet
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.RelayCache
import nz.waveformlabs.moshpoint.core.RelayPacket

/**
 * The phone-to-phone part of the crowd relay (see core `CrowdRelay.kt`).
 *
 * Relay packets are 47 bytes, too big for a classic advert, so this uses Bluetooth 5
 * extended advertising. Phones without it can't take part in the relay; they still get
 * everything else.
 *
 * One [cache] is shared in-process: the visibility service relays, and the finder screen
 * reads it to find friends.
 */
object CrowdRelayRadio {
    /** PLACEHOLDER 16-bit UUID for relay adverts; register with the Bluetooth SIG before release. */
    val RELAY_UUID: ParcelUuid = ParcelUuid.fromString("0000FFA8-0000-1000-8000-00805F9B34FB")

    val cache = RelayCache()

    private const val TAG = "CrowdRelay"
    private var listeners = 0
    private var scanCallback: ScanCallback? = null
    private var advertisingSet: AdvertisingSet? = null
    private var advertiseCallback: AdvertisingSetCallback? = null
    private var broadcastJob: Job? = null

    /** Our own sealed location, refreshed by the visibility service. */
    @Volatile
    var ownPacket: RelayPacket? = null

    fun supported(context: Context): Boolean {
        val a = context.getSystemService(BluetoothManager::class.java)?.adapter ?: return false
        return a.isLeExtendedAdvertisingSupported
    }

    /** Ref-counted: the finder and the visibility service can both listen. */
    @SuppressLint("MissingPermission")
    @Synchronized
    fun startListening(context: Context, scope: CoroutineScope) {
        listeners++
        if (scanCallback != null || !supported(context)) return
        val scanner = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner ?: return
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) = handle(result, scope)
            override fun onBatchScanResults(results: MutableList<ScanResult>) = results.forEach { handle(it, scope) }
        }
        try {
            scanner.startScan(
                listOf(ScanFilter.Builder().setServiceData(RELAY_UUID, null).build()),
                ScanSettings.Builder()
                    .setLegacy(false)
                    .setPhy(ScanSettings.PHY_LE_ALL_SUPPORTED)
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER)
                    .build(),
                cb,
            )
            scanCallback = cb
        } catch (e: SecurityException) {
            Log.w(TAG, "no scan permission", e)
        }
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    fun stopListening(context: Context) {
        listeners = (listeners - 1).coerceAtLeast(0)
        if (listeners > 0) return
        val cb = scanCallback ?: return
        try {
            context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner?.stopScan(cb)
        } catch (_: SecurityException) {
        }
        scanCallback = null
    }

    private fun handle(result: ScanResult, scope: CoroutineScope) {
        val bytes = result.scanRecord?.getServiceData(RELAY_UUID) ?: return
        val packet = RelayPacket.decode(bytes) ?: return
        val isNew = cache.offer(packet, System.currentTimeMillis() / 1000)
        // Someone with signal passes it up to the server, so far-away friends get it too.
        if (isNew && RelayClient.enabled) scope.launch { RelayClient.put(packet.id, packet.sealed) }
    }

    /**
     * Start relaying: cycle through our own packet and what we've heard, one per second.
     * Only the visibility service calls this (relaying is part of being visible).
     */
    @SuppressLint("MissingPermission")
    @Synchronized
    fun startBroadcasting(context: Context, scope: CoroutineScope) {
        if (broadcastJob != null || !supported(context)) return
        val advertiser = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeAdvertiser ?: return
        val params = AdvertisingSetParameters.Builder()
            .setLegacyMode(false)
            .setConnectable(false)
            .setScannable(false)
            .setInterval(AdvertisingSetParameters.INTERVAL_MEDIUM)
            .setTxPowerLevel(AdvertisingSetParameters.TX_POWER_MEDIUM)
            .setPrimaryPhy(BluetoothDevice.PHY_LE_1M)
            .setSecondaryPhy(BluetoothDevice.PHY_LE_1M)
            .build()
        val cb = object : AdvertisingSetCallback() {
            override fun onAdvertisingSetStarted(set: AdvertisingSet?, txPower: Int, status: Int) {
                if (status == AdvertisingSetCallback.ADVERTISE_SUCCESS) advertisingSet = set else Log.w(TAG, "relay advert failed: $status")
            }
        }
        advertiseCallback = cb
        broadcastJob = scope.launch {
            var started = false
            while (true) {
                val now = System.currentTimeMillis() / 1000
                val next = ownPacket?.takeIf { now - it.timeSec < 600 && (now % 3L) == 0L }
                    ?: cache.nextToBroadcast(1, now).firstOrNull()
                    ?: ownPacket
                if (next != null) {
                    val data = AdvertiseData.Builder().addServiceData(RELAY_UUID, next.encode()).build()
                    try {
                        if (!started) {
                            advertiser.startAdvertisingSet(params, data, null, null, null, cb)
                            started = true
                        } else {
                            advertisingSet?.setAdvertisingData(data)
                        }
                    } catch (e: SecurityException) {
                        Log.w(TAG, "no advertise permission", e)
                    }
                }
                delay(1_000)
            }
        }
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    fun stopBroadcasting(context: Context) {
        broadcastJob?.cancel()
        broadcastJob = null
        val cb = advertiseCallback ?: return
        try {
            context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeAdvertiser?.stopAdvertisingSet(cb)
        } catch (_: SecurityException) {
        }
        advertiseCallback = null
        advertisingSet = null
    }
}
