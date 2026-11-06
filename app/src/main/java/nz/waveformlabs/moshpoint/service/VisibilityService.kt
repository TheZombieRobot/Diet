package nz.waveformlabs.moshpoint.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.locate.Ble

/**
 * Keeps you visible to your mates, even with the app closed.
 *
 * Runs as a foreground service (Android requires a visible notification for this) and
 * broadcasts a Bluetooth LE advert with your current rotating code, swapping it each
 * time the code rotates. Only ever started when the user turns visibility on.
 *
 * Battery: uses ADVERTISE_MODE_BALANCED (~250 ms interval) and low TX power by default.
 * TODO: adapt the interval (faster when a friend is actively looking, slower otherwise),
 *  and also share GPS via the server / crowd relay while visible.
 */
class VisibilityService : LifecycleService() {
    private val advertiser by lazy { getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeAdvertiser }
    private var rotateJob: Job? = null

    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartFailure(errorCode: Int) {
            // TODO: surface to the user (e.g. Bluetooth turned off) and retry.
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        startInForeground()
        if (rotateJob == null) {
            val id = EphemeralId(VisibilityPrefs.mySecret(this))
            rotateJob = lifecycleScope.launch {
                while (true) {
                    advertise(id.currentId(System.currentTimeMillis()))
                    val now = System.currentTimeMillis()
                    val nextRotation = (id.epochAt(now) + 1) * EphemeralId.DEFAULT_ROTATION_MS
                    delay(nextRotation - now + 50)
                }
            }
        }
        return START_STICKY
    }

    @SuppressLint("MissingPermission")
    private fun advertise(code: ByteArray) {
        val adv = advertiser ?: return
        adv.stopAdvertising(advertiseCallback)
        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
            .setConnectable(false)
            .build()
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .setIncludeTxPowerLevel(false)
            .addServiceData(Ble.SERVICE_UUID, code)
            .build()
        adv.startAdvertising(settings, data, advertiseCallback)
    }

    @SuppressLint("MissingPermission")
    override fun onDestroy() {
        rotateJob?.cancel()
        advertiser?.stopAdvertising(advertiseCallback)
        super.onDestroy()
    }

    private fun startInForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.visibility_channel), NotificationManager.IMPORTANCE_LOW),
        )
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.visibility_notification))
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setContentIntent(open)
            .build()
        ServiceCompat.startForeground(
            this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
        )
    }

    companion object {
        private const val CHANNEL = "visibility"
        private const val NOTIFICATION_ID = 1

        fun start(context: Context) {
            VisibilityPrefs.setVisible(context, true)
            ContextCompat.startForegroundService(context, Intent(context, VisibilityService::class.java))
        }

        fun stop(context: Context) {
            VisibilityPrefs.setVisible(context, false)
            context.stopService(Intent(context, VisibilityService::class.java))
        }
    }
}
