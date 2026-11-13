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
import nz.waveformlabs.moshpoint.locate.FinderMate
import nz.waveformlabs.moshpoint.locate.RadioWatcher
import nz.waveformlabs.moshpoint.locate.UwbResponder
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
    /** Who we are right now: our crew pass while a crew is on, else our permanent identity. */
    private val mySecret: ByteArray get() = nz.waveformlabs.moshpoint.Identity.current(this)
    private val ephemeral: EphemeralId get() = EphemeralId(mySecret)
    private var advertisedAs: String? = null
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
            VisibilityPrefs.markStopped(this) // so the app and tile don't claim we're visible
            stopSelf()
            return START_NOT_STICKY
        }
        if (rotateJob == null) begin()
        return START_STICKY
    }

    private fun begin() {
        FriendsRepository.init(this)
        // Medium advert (~4 a second) by default: enough readings for spin-to-scan even before
        // we notice a friend looking (background listening is slow). Fast while one is looking.
        broadcaster = BleBroadcaster(this, AdvertiseSettings.ADVERTISE_MODE_BALANCED, "BT advert (visible)")

        rotateJob = lifecycleScope.launch {
            while (true) {
                readvertise()
                wifi?.refresh()
                val now = System.currentTimeMillis()
                val nextRotation = (ephemeral.epochAt(now) + 1) * EphemeralId.DEFAULT_ROTATION_MS
                // Wake at the next rotation, or sooner if we become someone else (a crew
                // starting or ending) so crew mates can find us straight away.
                val until = nextRotation + 50
                while (System.currentTimeMillis() < until) {
                    delay(minOf(30_000L, until - System.currentTimeMillis()).coerceAtLeast(1L))
                    if (identityKey() != advertisedAs) break
                }
            }
        }

        uploader = LocationUploader(this, lifecycleScope) { mySecret }.also { it.start() }
        registerReceiver(batteryReceiver, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        GroupSync.load(this)
        GroupSync.acquire(this) // keep introducing ourselves to the gig group while visible
        nz.waveformlabs.moshpoint.venue.VenueMaps.sync(this) // and keep the venue map download going
        // Upstairs/downstairs: our pressure rides in the advert (phones without the sensor send none).
        nz.waveformlabs.moshpoint.venue.Floors.onAdvertChange = { readvertise() }
        nz.waveformlabs.moshpoint.venue.Floors.acquire(this, live = true)
        CrowdRelayRadio.startListening(this)
        CrowdRelayRadio.startBroadcasting(this, lifecycleScope)
        // Messages without signal ride the relay's adverts: only while live, so only from here.
        nz.waveformlabs.moshpoint.OfflineMessages.startRadio(this)
        if (wifiRttSupported(this)) {
            wifi = WifiAwarePublisher(this) { ephemeral.currentId(System.currentTimeMillis()) }.also { it.start() }
        }
        radios = RadioWatcher(
            this,
            onBluetooth = { on ->
                nz.waveformlabs.moshpoint.locate.BleHub.onBluetooth(on)
                GroupSync.onBluetooth(this, on)
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
        listener = BleRanger(this, "BT scan (visible, listening for lookers)", { FriendsRepository.friends.toList() }) { friend, _, distanceM, advert ->
            nz.waveformlabs.moshpoint.venue.Floors.onBluetooth(friend.id, distanceM, advert.pressure)
            if (advert.looking) onFriendLooking(friend.name)
            if (advert.askLight) onAskedToLight(friend)
            val info = advert.uwb
            if (info?.role == Advert.UwbRole.CONTROLLER) responder?.onFriendController(friend, info)
        }.also { it.start(lowLatency = false) }
        lifecycleScope.launch {
            while (true) {
                delay(10_000)
                if (broadcaster.mode == AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY &&
                    System.currentTimeMillis() - lastLookedAt > FAST_FOR_MS
                ) {
                    broadcaster.mode = AdvertiseSettings.ADVERTISE_MODE_BALANCED
                    DebugStatus.log("No one looking: advert back to medium")
                }
            }
        }
    }

    private var lastLookedAt = 0L

    /** Battery level, for the last-known-location-before-it-dies update. */
    private val batteryReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: android.content.Context, i: Intent) {
            val level = i.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1)
            val scale = i.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, 100)
            val status = i.getIntExtra(android.os.BatteryManager.EXTRA_STATUS, -1)
            if (level < 0 || scale <= 0) return
            val charging = status == android.os.BatteryManager.BATTERY_STATUS_CHARGING || status == android.os.BatteryManager.BATTERY_STATUS_FULL
            uploader?.onBattery(level * 100 / scale, charging)
        }
    }
    private val askedAt = mutableMapOf<String, Long>()

    /** A mate close by tapped "Ask them to light up": offer it with a tap (never automatic). */
    private fun onAskedToLight(friend: FinderMate) {
        val now = System.currentTimeMillis()
        if (now - (askedAt[friend.id] ?: 0L) < 90_000) return
        askedAt[friend.id] = now
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(REQUEST_CHANNEL, getString(R.string.crew_channel_requests), NotificationManager.IMPORTANCE_HIGH),
        )
        val tap = PendingIntent.getActivity(
            this, friend.id.hashCode(),
            Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_LIGHT_FOR, friend.id)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(this, REQUEST_CHANNEL)
            .setContentTitle(getString(R.string.crew_request_title, friend.name))
            .setContentText(getString(R.string.crew_request_text))
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(tap)
            .setColor(0xFFB6FF3B.toInt())
            .build()
        runCatching { nm.notify(REQUEST_NOTIFICATION_BASE + (friend.id.hashCode() and 0x0FFFFFFF), n) }
        DebugStatus.log("${friend.name} asked us to light up")
    }

    private fun onFriendLooking(name: String) {
        lastLookedAt = System.currentTimeMillis()
        uploader?.boost()
        if (broadcaster.mode != AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY) {
            broadcaster.mode = AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY
            DebugStatus.log("$name is looking: advert to fast")
        }
    }

    private fun identityKey() = mySecret.copyOf(4).joinToString("") { "%02x".format(it) }

    private fun readvertise() {
        val me = mySecret
        advertisedAs = identityKey()
        val id = EphemeralId(me).currentId(System.currentTimeMillis())
        broadcaster.update(Advert.encode(me, id, uwbInfo, pressure = nz.waveformlabs.moshpoint.venue.Floors.advertPressure()))
    }

    override fun onDestroy() {
        running = false
        rotateJob?.cancel()
        radios?.stop()
        uploader?.stop()
        runCatching { unregisterReceiver(batteryReceiver) }
        wifi?.stop()
        if (rotateJob != null) {
            nz.waveformlabs.moshpoint.OfflineMessages.stopRadio()
            GroupSync.release(this)
            CrowdRelayRadio.stopBroadcasting(this)
            CrowdRelayRadio.stopListening(this)
            CrowdRelayRadio.ownPacket = null
            nz.waveformlabs.moshpoint.venue.Floors.onAdvertChange = null
            nz.waveformlabs.moshpoint.venue.Floors.release(live = true)
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
        val notification: Notification = buildNotification(this, crewLine)
        // Add the location type when we can, so GPS sharing keeps working with the app
        // closed. Android refuses it in some cases (e.g. started at boot without the
        // app being opened), so fall back to Bluetooth-only visibility.
        val base = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        val withLocation = base or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        val canLocate = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, if (canLocate) withLocation else base)
            running = true
            true
        } catch (e: SecurityException) {
            runCatching { ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, base) }.isSuccess.also { running = it }
        } catch (e: IllegalStateException) {
            false // ForegroundServiceStartNotAllowedException
        }
    }

    companion object {
        private const val CHANNEL = "visibility"

        @Volatile private var running = false
        @Volatile private var crewLine: String? = null

        /**
         * The ongoing notification, like a Live Activity: "You're live" plus where the crew is
         * ("Bevan 40 m · Jo 1.2 km"). Tap opens the app; "Go hidden" stops sharing.
         */
        private fun buildNotification(c: Context, crew: String?): Notification {
            val open = PendingIntent.getActivity(c, 0, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            val stopIntent = PendingIntent.getService(
                c, 1, Intent(c, VisibilityService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
            )
            return NotificationCompat.Builder(c, CHANNEL)
                .setContentTitle(c.getString(R.string.visibility_notification))
                .apply { if (crew != null) setContentText(crew).setStyle(NotificationCompat.BigTextStyle().bigText(crew)) }
                .setSmallIcon(R.drawable.ic_launcher_monochrome)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(open)
                .apply {
                    if (crew != null) {
                        val find = PendingIntent.getActivity(
                            c, 2,
                            Intent(c, MainActivity::class.java).putExtra(MainActivity.EXTRA_FIND_CREW, true)
                                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
                            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                        )
                        addAction(0, c.getString(R.string.widget_find), find)
                    }
                }
                .addAction(0, c.getString(R.string.crew_go_hidden), stopIntent)
                .setColor(0xFFB6FF3B.toInt())
                .build()
        }

        /** Update the crew line in the live notification (no-op while hidden). */
        fun showCrew(c: Context, line: String?) {
            if (line == crewLine) return
            crewLine = line
            if (!running) return
            runCatching {
                c.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification(c.applicationContext, line))
            }
        }
        private const val REQUEST_CHANNEL = "requests"
        /** "Light up" requests, one per friend: a range of their own (5000 up used to reach into the crew alerts' ids, Need help among them). */
        private const val REQUEST_NOTIFICATION_BASE = 0x40000000
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
