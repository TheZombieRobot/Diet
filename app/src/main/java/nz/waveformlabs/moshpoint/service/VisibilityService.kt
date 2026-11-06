package nz.waveformlabs.moshpoint.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.GroupSync
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.locate.BleBroadcaster
import nz.waveformlabs.moshpoint.locate.BleRanger
import nz.waveformlabs.moshpoint.locate.Capabilities
import nz.waveformlabs.moshpoint.locate.CrowdRelayRadio
import nz.waveformlabs.moshpoint.locate.RadioWatcher
import nz.waveformlabs.moshpoint.locate.WifiAwarePublisher
import nz.waveformlabs.moshpoint.locate.wifiRttSupported

/**
 * Keeps you visible to your mates, even with the app closed.
 *
 * Runs as a foreground service (Android requires a visible notification for this) and
 * broadcasts a Bluetooth LE advert with your current rotating code, swapping it each
 * time the code rotates. Only ever started when the user turns visibility on.
 *
 * On UWB phones it also:
 * - puts our UWB controlee address in the advert, and
 * - listens (low-power scan) for friends who are looking, and joins their UWB session.
 *
 * It also shares our sealed GPS position via the relay server (LocationUploader).
 *
 * Battery: advert is BALANCED (~250 ms) at medium power; the UWB listen scan is LOW_POWER;
 * GPS every 15 s. TODO: adaptive intervals; crowd relay.
 */
class VisibilityService : LifecycleService() {
    private lateinit var broadcaster: BleBroadcaster
    private lateinit var mySecret: ByteArray
    private lateinit var ephemeral: EphemeralId
    private var uwbInfo: Advert.UwbInfo? = null
    private var uwb: UwbResponder? = null
    private var listener: BleRanger? = null
    private var rotateJob: Job? = null
    private var uploader: LocationUploader? = null
    private var wifi: WifiAwarePublisher? = null
    private var radios: RadioWatcher? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        if (intent?.action == ACTION_STOP) {
            VisibilityPrefs.setVisible(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        if (!startInForeground()) {
            // Android refused (e.g. restarted from the background on Android 12+). Give up
            // quietly; visibility comes back next time the app is opened.
            stopSelf()
            return START_NOT_STICKY
        }
        if (rotateJob == null) begin()
        return START_STICKY
    }

    private fun begin() {
        FriendsRepository.init(this)
        mySecret = VisibilityPrefs.mySecret(this)
        ephemeral = EphemeralId(mySecret)
        // Slow advert (~1 s) by default to save battery; fast while a friend is looking.
        broadcaster = BleBroadcaster(this, AdvertiseSettings.ADVERTISE_MODE_LOW_POWER, "BT advert (visible)")

        rotateJob = lifecycleScope.launch {
            while (true) {
                readvertise()
                wifi?.refresh()
                val now = System.currentTimeMillis()
                val nextRotation = (ephemeral.epochAt(now) + 1) * EphemeralId.DEFAULT_ROTATION_MS
                delay(nextRotation - now + 50)
            }
        }

        uploader = LocationUploader(this, lifecycleScope, mySecret).also { it.start() }
        GroupSync.load(this)
        GroupSync.acquire(this) // keep introducing ourselves to the gig group while visible
        CrowdRelayRadio.startListening(this)
        CrowdRelayRadio.startBroadcasting(this, lifecycleScope)
        if (wifiRttSupported(this)) {
            wifi = WifiAwarePublisher(this) { ephemeral.currentId(System.currentTimeMillis()) }.also { it.start() }
        }
        radios = RadioWatcher(
            this,
            onBluetooth = { on ->
                if (on) {
                    readvertise()
                    listener?.restart()
                    CrowdRelayRadio.restartAfterBluetooth(this)
                } else {
                    broadcaster.onBluetoothOff()
                }
            },
            onWifiAware = { available -> if (available) wifi?.restart() },
        ).also { it.start() }

        val responder = if (Capabilities.detect(this).uwb) {
            UwbResponder(this, lifecycleScope) { info ->
                uwbInfo = info
                readvertise()
            }.also {
                uwb = it
                it.start()
            }
        } else {
            null
        }
        // Low-power listen for friends who are looking: speeds our advert up, and on UWB
        // phones joins their UWB session.
        listener = BleRanger(this, "BT scan (visible, listening for lookers)", { FriendsRepository.friends.toList() }) { friend, _, _, advert ->
            if (advert.looking) onFriendLooking(friend.name)
            val info = advert.uwb
            if (info?.role == Advert.UwbRole.CONTROLLER) responder?.onFriendController(friend, info)
        }.also { it.start(lowLatency = false) }
        lifecycleScope.launch {
            while (true) {
                delay(10_000)
                if (broadcaster.mode == AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY &&
                    System.currentTimeMillis() - lastLookedAt > FAST_FOR_MS
                ) {
                    broadcaster.mode = AdvertiseSettings.ADVERTISE_MODE_LOW_POWER
                    DebugStatus.log("No one looking: advert back to slow")
                }
            }
        }
    }

    private var lastLookedAt = 0L

    private fun onFriendLooking(name: String) {
        lastLookedAt = System.currentTimeMillis()
        if (broadcaster.mode != AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY) {
            broadcaster.mode = AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY
            DebugStatus.log("$name is looking: advert to fast")
        }
    }

    private fun readvertise() {
        val id = ephemeral.currentId(System.currentTimeMillis())
        broadcaster.update(Advert.encode(mySecret, id, uwbInfo))
    }

    override fun onDestroy() {
        rotateJob?.cancel()
        radios?.stop()
        uploader?.stop()
        wifi?.stop()
        if (rotateJob != null) {
            GroupSync.release(this)
            CrowdRelayRadio.stopBroadcasting(this)
            CrowdRelayRadio.stopListening(this)
            CrowdRelayRadio.ownPacket = null
        }
        listener?.stop()
        uwb?.stop()
        if (::broadcaster.isInitialized) broadcaster.stop()
        super.onDestroy()
    }

    /** Returns false if Android won't let us run in the foreground right now. */
    private fun startInForeground(): Boolean {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.visibility_channel), NotificationManager.IMPORTANCE_LOW),
        )
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val stopIntent = PendingIntent.getService(
            this, 1, Intent(this, VisibilityService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
        )
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.visibility_notification))
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(0, "Stop being visible", stopIntent)
            .build()
        // Add the location type when we can, so GPS sharing keeps working with the app
        // closed. Android refuses it in some cases (e.g. started at boot without the
        // app being opened), so fall back to Bluetooth-only visibility.
        val base = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        val withLocation = base or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        val canLocate = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, if (canLocate) withLocation else base)
            true
        } catch (e: SecurityException) {
            runCatching { ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, base) }.isSuccess
        } catch (e: IllegalStateException) {
            false // ForegroundServiceStartNotAllowedException
        }
    }

    companion object {
        private const val CHANNEL = "visibility"
        private const val NOTIFICATION_ID = 1
        private const val FAST_FOR_MS = 90_000L
        private const val ACTION_STOP = "nz.waveformlabs.moshpoint.STOP_VISIBLE"

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
