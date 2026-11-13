package nz.waveformlabs.moshpoint.locate

import android.bluetooth.BluetoothAdapter
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.wifi.aware.WifiAwareManager
import androidx.core.content.ContextCompat

/**
 * Tells us when Bluetooth or Wi-Fi Aware comes back after being switched off (airplane
 * mode, toggled in quick settings, hotspot on, ...), so we can restart adverts and scans.
 * Without this, everything stays dead until the app is restarted.
 */
class RadioWatcher(
    private val context: Context,
    private val onBluetooth: (on: Boolean) -> Unit,
    private val onWifiAware: (available: Boolean) -> Unit = {},
) {
    private var registered = false

    private val receiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, intent: Intent) {
            when (intent.action) {
                BluetoothAdapter.ACTION_STATE_CHANGED -> when (intent.getIntExtra(BluetoothAdapter.EXTRA_STATE, -1)) {
                    BluetoothAdapter.STATE_ON -> {
                        FinderLog.log("Bluetooth on: restarting")
                        onBluetooth(true)
                    }
                    BluetoothAdapter.STATE_OFF -> {
                        FinderLog.log("Bluetooth OFF")
                        onBluetooth(false)
                    }
                }
                WifiAwareManager.ACTION_WIFI_AWARE_STATE_CHANGED -> {
                    val available = c.getSystemService(WifiAwareManager::class.java)?.isAvailable == true
                    FinderLog.log("Wi-Fi Aware ${if (available) "available" else "UNAVAILABLE"}")
                    onWifiAware(available)
                }
            }
        }
    }

    fun start() {
        if (registered) return
        val filter = IntentFilter().apply {
            addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
            addAction(WifiAwareManager.ACTION_WIFI_AWARE_STATE_CHANGED)
        }
        ContextCompat.registerReceiver(context, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        registered = true
    }

    fun stop() {
        if (!registered) return
        runCatching { context.unregisterReceiver(receiver) }
        registered = false
    }
}
