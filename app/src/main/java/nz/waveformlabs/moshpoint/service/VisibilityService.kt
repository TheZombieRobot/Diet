package nz.waveformlabs.moshpoint.service

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.GroupSync
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.locate.CrowdRelayRadio
import nz.waveformlabs.moshpoint.locate.Findable
import nz.waveformlabs.moshpoint.locate.FinderMate

/**
 * Keeps you visible to your mates, even with the app closed.
 *
 * Runs as a foreground service (Android requires a visible notification for this). The radio
 * work of being findable is the finder module's [Findable] (docs/FINDER_MODULE.md): a Bluetooth
 * LE advert with your current rotating code, swapped each time the code rotates; on UWB phones
 * our UWB controlee address in it, and a low-power listen for friends who are looking (their UWB
 * session is joined); Wi-Fi Aware. Only ever started when the user turns visibility on.
 *
 * Around it, the gig work: it shares our sealed GPS position via the relay server
 * (LocationUploader), the crowd relay, crew intros, the venue map download, our pressure for
 * upstairs/downstairs, and messages without signal.
 *
 * Battery: advert is BALANCED (~250 ms) at medium power; the UWB listen scan is LOW_POWER;
 * GPS every 15 s. TODO: adaptive intervals; crowd relay.
 */
class VisibilityService : LifecycleService() {
    /** Who we are right now: our crew pass while a crew is on, else our permanent identity. */
    private val mySecret: ByteArray get() = nz.waveformlabs.moshpoint.Identity.current(this)
    /** The being-findable radios; set once [begin] has run. */
    private var findable: Findable? = null
    private var uploader: LocationUploader? = null

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
        if (findable == null) begin()
        return START_STICKY
    }

    private fun begin() {
        FriendsRepository.init(this)
        val f = Findable(
            this, lifecycleScope,
            identity = { mySecret },
            mates = { FriendsRepository.friends.toList() },
            // Upstairs/downstairs: our pressure rides in the advert (phones without the sensor send none).
            advertPressure = { nz.waveformlabs.moshpoint.venue.Floors.advertPressure() },
            onMateHeard = { friend, distanceM, advert -> nz.waveformlabs.moshpoint.venue.Floors.onBluetooth(friend.id, distanceM, advert.pressure) },
            onMateLooking = { uploader?.boost() },
            onAskedToLight = ::onAskedToLight,
            onBluetoothToggled = { on -> GroupSync.onBluetooth(this, on) },
        )
        findable = f
        // First, as always: the advert, rotating with our code (and following a change of crew).
        f.startAdvertising()

        uploader = LocationUploader(this, lifecycleScope) { mySecret }.also { it.start() }
        registerReceiver(batteryReceiver, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        GroupSync.load(this)
        GroupSync.acquire(this) // keep introducing ourselves to the gig group while visible
        nz.waveformlabs.moshpoint.venue.VenueMaps.sync(this) // and keep the venue map download going
        // Upstairs/downstairs: our pressure rides in the advert, rebuilt when it moves.
        nz.waveformlabs.moshpoint.venue.Floors.onAdvertChange = { f.readvertise() }
        nz.waveformlabs.moshpoint.venue.Floors.acquire(this, live = true)
        CrowdRelayRadio.startListening(this)
        CrowdRelayRadio.startBroadcasting(this, lifecycleScope)
        // Messages without signal ride the relay's adverts: only while live, so only from here.
        nz.waveformlabs.moshpoint.OfflineMessages.startRadio(this)
        // Then, as always: Wi-Fi Aware, Bluetooth/Wi-Fi coming back, UWB, and the low-power listen
        // for friends who are looking (speeds our advert up, joins their UWB session).
        f.startListening()
    }

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
        // Test builds only, checked here so release builds don't build the text: the name now
        // comes through the finder's FinderMate interface, which R8 can't prove harmless.
        if (DebugStatus.enabled) DebugStatus.log("${friend.name} asked us to light up")
    }

    override fun onDestroy() {
        running = false
        uploader?.stop()
        runCatching { unregisterReceiver(batteryReceiver) }
        if (findable != null) {
            nz.waveformlabs.moshpoint.OfflineMessages.stopRadio()
            GroupSync.release(this)
            CrowdRelayRadio.stopBroadcasting(this)
            CrowdRelayRadio.stopListening(this)
            CrowdRelayRadio.ownPacket = null
            nz.waveformlabs.moshpoint.venue.Floors.onAdvertChange = null
            nz.waveformlabs.moshpoint.venue.Floors.release(live = true)
        }
        // Last, so the UWB responder's final re-advert (without its UWB block) is built after
        // floors are released, as before. Its rotation, radio watcher and Wi-Fi Aware stop here
        // too, a moment later than they did: nothing above can reach them in between.
        findable?.stop()
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
