package nz.waveformlabs.moshpoint.locate

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.util.Log

/**
 * One Bluetooth LE advert carrying Moshpoint service data. Call [update] to change the
 * payload (it restarts the advert). Visibility and the finder each own one, so a phone
 * can be visible and looking at the same time.
 */
class BleBroadcaster(context: Context, private val mode: Int = AdvertiseSettings.ADVERTISE_MODE_BALANCED) {
    private val advertiser = context.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeAdvertiser
    private var running = false

    private val callback = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
            Log.w(TAG, "advertise failed: $errorCode")
            running = false
        }
    }

    @SuppressLint("MissingPermission")
    fun update(serviceData: ByteArray) {
        val adv = advertiser ?: return
        try {
            if (running) adv.stopAdvertising(callback)
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(mode)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                .setConnectable(false)
                .build()
            val data = AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .addServiceData(Ble.SERVICE_UUID, serviceData)
                .build()
            adv.startAdvertising(settings, data, callback)
            running = true
        } catch (e: SecurityException) {
            Log.w(TAG, "no BLUETOOTH_ADVERTISE permission", e)
        }
    }

    @SuppressLint("MissingPermission")
    fun stop() {
        if (!running) return
        try {
            advertiser?.stopAdvertising(callback)
        } catch (_: SecurityException) {
        }
        running = false
    }

    private companion object {
        const val TAG = "BleBroadcaster"
    }
}
