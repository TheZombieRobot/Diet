package nz.waveformlabs.moshpoint.locate

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertisingSet
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.bluetooth.le.ScanResult
import android.content.Context
import android.os.ParcelUuid
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.DebugStatus
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

    /** Our own scope, so uploads don't die with (or leak) whichever screen started us. */
    private val ioScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private const val TAG = "CrowdRelay"
    private const val K = "Crowd relay"
    private var listeners = 0
    private var subscribed = false
    private var advertisingSet: AdvertisingSet? = null
    private var advertiseCallback: AdvertisingSetCallback? = null
    private var broadcastJob: Job? = null
    /** Set from the callback, so a failed or lost advert set gets started again. */
    @Volatile private var setLive = false
    @Volatile private var setPending = false

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
    fun startListening(context: Context) {
        listeners++
        if (!supported(context)) {
            DebugStatus.set(K, "unsupported (no Bluetooth 5 extended adverts)")
            return
        }
        if (subscribed) return
        BleHub.subscribe(context, this, BleHub.Sub(listOf(RELAY_UUID), fast = false, unfiltered = false) { handle(it) })
        subscribed = true
        DebugStatus.set(K, "listening, cache ${cache.size()}")
    }

    /** Bluetooth came back: the scan died with it, and the advert set needs restarting. */
    @Synchronized
    fun restartAfterBluetooth(context: Context) {
        setLive = false
        setPending = false
    }

    @SuppressLint("MissingPermission")
    @Synchronized
    fun stopListening(context: Context) {
        listeners = (listeners - 1).coerceAtLeast(0)
        if (listeners > 0) return
        if (!subscribed) return
        BleHub.unsubscribe(context, this)
        subscribed = false
    }

    private fun handle(result: ScanResult) {
        val bytes = result.scanRecord?.getServiceData(RELAY_UUID) ?: return
        val packet = RelayPacket.decode(bytes) ?: return
        val isNew = cache.offer(packet, System.currentTimeMillis() / 1000)
        if (isNew) DebugStatus.set(K, "heard packet (hops left ${packet.ttl}), cache ${cache.size()}")
        // Someone with signal passes it up to the server, so far-away friends get it too.
        if (isNew && RelayClient.ownServer) ioScope.launch { RelayClient.put(packet.id, packet.sealed) }
    }

    /**
     * Start relaying: cycle through our own packet and what we've heard, one per second.
     * Only the visibility service calls this (relaying is part of being visible).
     */
    @SuppressLint("MissingPermission")
    @Synchronized
    fun startBroadcasting(context: Context, scope: CoroutineScope) {
        if (broadcastJob != null || !supported(context)) return
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
                setPending = false
                if (status == AdvertisingSetCallback.ADVERTISE_SUCCESS) {
                    advertisingSet = set
                    setLive = true
                    DebugStatus.set("$K send", "broadcasting")
                } else {
                    Log.w(TAG, "relay advert failed: $status")
                    setLive = false
                    DebugStatus.set("$K send", "FAILED code $status")
                }
            }

            override fun onAdvertisingSetStopped(set: AdvertisingSet?) {
                setLive = false // e.g. Bluetooth restarted: the loop starts a new set
            }
        }
        advertiseCallback = cb
        setLive = false
        setPending = false
        broadcastJob = scope.launch {
            while (true) {
                val now = System.currentTimeMillis() / 1000
                val next = ownPacket?.takeIf { now - it.timeSec < 600 && (now % 3L) == 0L }
                    ?: cache.nextToBroadcast(1, now).firstOrNull()
                    ?: ownPacket
                if (next != null) {
                    val data = AdvertiseData.Builder().addServiceData(RELAY_UUID, next.encode()).build()
                    try {
                        val adv = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeAdvertiser
                        when {
                            setLive -> advertisingSet?.setAdvertisingData(data)
                            !setPending && adv != null -> {
                                setPending = true
                                adv.startAdvertisingSet(params, data, null, null, null, cb)
                            }
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
        setLive = false
        setPending = false
    }
}
