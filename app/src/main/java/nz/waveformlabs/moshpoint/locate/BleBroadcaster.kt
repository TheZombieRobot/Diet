package nz.waveformlabs.moshpoint.locate

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.util.Log
import nz.waveformlabs.moshpoint.DebugStatus

/**
 * One Bluetooth LE advert carrying Moshpoint service data. Call [update] to change the
 * payload (it restarts the advert). Visibility and the finder each own one, so a phone
 * can be visible and looking at the same time.
 */
class BleBroadcaster(
    context: Context,
    mode: Int = AdvertiseSettings.ADVERTISE_MODE_BALANCED,
    /** Name shown in the debug panel. */
    private val debugName: String = "BT advert",
) {
    private val bt = context.getSystemService(BluetoothManager::class.java)
    // Fetched on every call: it's null while Bluetooth is off, and changes after a restart.
    private val advertiser get() = bt?.adapter?.takeIf { it.isEnabled }?.bluetoothLeAdvertiser
    private var running = false
    private var lastData: ByteArray? = null

    /** Advertising interval (ADVERTISE_MODE_*). Changing it restarts the advert. */
    var mode: Int = mode
        set(value) {
            if (field == value) return
            field = value
            lastData?.let { if (running) update(it) }
        }

    private val callback = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
            Log.w(TAG, "advertise failed: $errorCode")
            running = false
            DebugStatus.set(debugName, "FAILED code $errorCode")
        }
    }

    @SuppressLint("MissingPermission")
    fun update(serviceData: ByteArray) {
        lastData = serviceData
        val adv = advertiser ?: run {
            running = false
            DebugStatus.set(debugName, "waiting for Bluetooth")
            return
        }
        try {
            if (running) runCatching { adv.stopAdvertising(callback) }
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(mode)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH) // crowds soak up 2.4 GHz: every dB of range helps
                .setConnectable(false)
                .build()
            val data = AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .addServiceData(Ble.SERVICE_UUID, serviceData)
                .build()
            adv.startAdvertising(settings, data, callback)
            running = true
            val speed = when (mode) {
                AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY -> "fast"
                AdvertiseSettings.ADVERTISE_MODE_LOW_POWER -> "slow, saving battery"
                else -> "medium"
            }
            DebugStatus.set(debugName, "on ($speed), ${serviceData.size} bytes" + if (serviceData.size > 17) " +UWB" else "")
        } catch (e: IllegalStateException) {
            Log.w(TAG, "Bluetooth not ready", e) // turned off mid-call
            running = false
        } catch (e: SecurityException) {
            Log.w(TAG, "no BLUETOOTH_ADVERTISE permission", e)
            DebugStatus.set(debugName, "NO PERMISSION")
        }
    }

    /** Bluetooth went off: the stack dropped our advert. */
    fun onBluetoothOff() {
        running = false
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        if (!running) return
        try {
            advertiser?.stopAdvertising(callback)
        } catch (_: Exception) {
        }
        running = false
        DebugStatus.set(debugName, "off")
    }

    private companion object {
        const val TAG = "BleBroadcaster"
    }
}
