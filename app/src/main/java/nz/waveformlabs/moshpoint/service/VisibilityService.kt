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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.locate.CrowdRelayRadio
import nz.waveformlabs.moshpoint.locate.Findable
import nz.waveformlabs.moshpoint.locate.FinderMate
import nz.waveformlabs.moshpoint.safety.AppErrors

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
    private val mySecret: ByteArray get() = nz.waveformlabs.moshpoint.profile.Identity.current(this)
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
            // Android refused (restarted from the background on Android 12+, or a permission
            // was taken away). Said, never silent: off in the app with a notice if it's on
            // screen, else "You're no longer live" (tap to open), and opening the app tries again.
            LiveControl.couldNotStart(this)
            stopSelf()
            return START_NOT_STICKY
        }
        if (findable == null) begin()
        return START_STICKY
    }

    /** The service's own work: cancelled with it, and a failure in one part is logged, not a crash (reliability P1-6). */
    private val scope by lazy { CoroutineScope(lifecycleScope.coroutineContext + AppErrors.handler("Live service")) }

    private fun begin() {
        FriendsRepository.init(this)
        val f = Findable(
            this, scope,
            identity = { mySecret },
            mates = { FriendsRepository.friends.toList() },
            // Upstairs/downstairs: our pressure rides in the advert (phones without the sensor send none).
            advertPressure = { nz.waveformlabs.moshpoint.venue.Floors.advertPressure() },
            onMateHeard = { friend, distanceM, advert -> nz.waveformlabs.moshpoint.venue.Floors.onBluetooth(friend.id, distanceM, advert.pressure) },
            onMateLooking = { uploader?.boost() },
            onAskedToLight = ::onAskedToLight,
            onMateLightingUp = ::onMateLightingUp,
            onBluetoothToggled = { on ->
                GroupSync.onBluetooth(this, on)
                // "You're live" is only said while Bluetooth is on (mates can't find you up close without it).
                refreshNotification(this)
            },
        )
        findable = f
        // First, as always: the advert, rotating with our code (and following a change of crew).
        f.startAdvertising()

        uploader = LocationUploader(this, scope) { mySecret }.also { it.start() }
        registerReceiver(batteryReceiver, android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        GroupSync.load(this)
        GroupSync.acquire(this) // keep introducing ourselves to the gig group while visible
        // Off by itself when the night is over, or after about 12 hours (core LiveRules).
        scope.launch {
            while (true) {
                LiveControl.check(this@VisibilityService)?.let {
                    LiveControl.switchOff(this@VisibilityService, it)
                    return@launch
                }
                delay(CHECK_EVERY_MS)
            }
        }
        nz.waveformlabs.moshpoint.venue.VenueMaps.sync(this) // and keep the venue map download going
        // Upstairs/downstairs: our pressure rides in the advert, rebuilt when it moves.
        nz.waveformlabs.moshpoint.venue.Floors.onAdvertChange = { f.readvertise() }
        nz.waveformlabs.moshpoint.venue.Floors.acquire(this, live = true)
        CrowdRelayRadio.startListening(this)
        CrowdRelayRadio.startBroadcasting(this, scope)
        // Messages without signal ride the relay's adverts: only while live, so only from here.
        nz.waveformlabs.moshpoint.chat.OfflineMessages.startRadio(this)
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
        notifyMate(
            friend,
            getString(R.string.crew_request_title, friend.name),
            getString(R.string.crew_request_text),
            Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_LIGHT_FOR, friend.id),
        )
        // Test builds only, checked here so release builds don't build the text: the name now
        // comes through the finder's FinderMate interface, which R8 can't prove harmless.
        if (DebugStatus.enabled) DebugStatus.log("${friend.name} asked us to light up")
    }

    private val lightingAt = mutableMapOf<String, Long>()

    /**
     * A mate in Bluetooth range turned on "Light me up": their screen is flashing so we can spot
     * them. A buzz in the pocket says to look up, once every few minutes per mate while they keep
     * it on. It's something they chose to do, so nobody is buzzed just because a mate opened the
     * finder. Tapping it opens the finder on them.
     */
    private fun onMateLightingUp(friend: FinderMate) {
        val now = System.currentTimeMillis()
        if (now - (lightingAt[friend.id] ?: 0L) < LIGHTING_EVERY_MS) return
        lightingAt[friend.id] = now
        notifyMate(
            friend,
            getString(R.string.crew_beacon_title, friend.name),
            getString(R.string.crew_beacon_text),
            Intent(this, MainActivity::class.java).putExtra(MainActivity.EXTRA_FIND_MATE, friend.id),
        )
        if (DebugStatus.enabled) DebugStatus.log("${friend.name} is lighting up their screen")
    }

    /** One notification per mate in "Mates looking for you": a newer one replaces theirs. */
    private fun notifyMate(friend: FinderMate, title: String, text: String, open: Intent) {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(REQUEST_CHANNEL, getString(R.string.crew_channel_requests), NotificationManager.IMPORTANCE_HIGH),
        )
        val tap = PendingIntent.getActivity(
            this, friend.id.hashCode(),
            open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(this, REQUEST_CHANNEL)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(tap)
            .setColor(0xFFB6FF3B.toInt())
            .build()
        runCatching { nm.notify(REQUEST_NOTIFICATION_BASE + (friend.id.hashCode() and 0x0FFFFFFF), n) }
    }

    override fun onDestroy() {
        running = false
        runningState.value = false
        VisibilityTile.refreshAll(this)
        uploader?.stop()
        runCatching { unregisterReceiver(batteryReceiver) }
        if (findable != null) {
            nz.waveformlabs.moshpoint.chat.OfflineMessages.stopRadio()
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
        val notification: Notification = buildNotification(this, crewLine, bluetoothOn(this))
        // Add the location type when we can, so GPS sharing keeps working with the app
        // closed. Android refuses it in some cases (e.g. started at boot without the
        // app being opened), so fall back to Bluetooth-only visibility.
        val base = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        val withLocation = base or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        val canLocate = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val started = try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, if (canLocate) withLocation else base)
            true
        } catch (e: SecurityException) {
            runCatching { ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, base) }.isSuccess
        } catch (e: IllegalStateException) {
            false // ForegroundServiceStartNotAllowedException
        }
        running = started
        runningState.value = started
        if (started) VisibilityTile.refreshAll(this)
        return started
    }

    companion object {
        private const val CHANNEL = "visibility"

        @Volatile private var running = false
        @Volatile private var crewLine: String? = null

        /** Live is really running now (in the foreground), not merely meant to be on ([VisibilityPrefs.isVisible]). */
        val isRunning: Boolean get() = running

        /** The same as Compose state (set on the main thread), so the app's Live switch follows Live going off by itself. */
        val runningState = androidx.compose.runtime.mutableStateOf(false)

        private fun bluetoothOn(c: Context): Boolean =
            runCatching { c.getSystemService(android.bluetooth.BluetoothManager::class.java)?.adapter?.isEnabled == true }.getOrDefault(false)

        /**
         * The ongoing notification, like a Live Activity: "You're live" plus where the crew is
         * ("Bevan 40 m · Jo 1.2 km"). Tap opens the app; "Go hidden" stops sharing. With
         * Bluetooth off it doesn't say "You're live": mates can't find you up close then.
         */
        private fun buildNotification(c: Context, crew: String?, bluetooth: Boolean): Notification {
            val open = PendingIntent.getActivity(c, 0, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            val stopIntent = PendingIntent.getService(
                c, 1, Intent(c, VisibilityService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
            )
            return NotificationCompat.Builder(c, CHANNEL)
                .setContentTitle(c.getString(if (bluetooth) R.string.visibility_notification else R.string.safety_live_bluetooth_off))
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
            refreshNotification(c)
        }

        private fun refreshNotification(c: Context) {
            if (!running) return
            runCatching {
                c.getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, buildNotification(c.applicationContext, crewLine, bluetoothOn(c)))
            }
        }

        /** How often a running Live checks whether it should go off by itself. */
        private const val CHECK_EVERY_MS = 60_000L
        private const val REQUEST_CHANNEL = "requests"
        /** "Light up" requests, one per friend: a range of their own (5000 up used to reach into the crew alerts' ids, Need help among them). */
        private const val REQUEST_NOTIFICATION_BASE = 0x40000000
        private const val NOTIFICATION_ID = 1
        /** A mate lighting up their screen: a buzz at most this often per mate. */
        private const val LIGHTING_EVERY_MS = 180_000L
        private const val ACTION_STOP = "nz.waveformlabs.moshpoint.STOP_VISIBLE"

        /**
         * Live on, as a new session (you, the tile, or being in a crew tonight). False if Android
         * wouldn't start it from here (Android 12+ won't from the background).
         */
        fun start(context: Context): Boolean {
            VisibilityPrefs.setVisible(context, true)
            LiveControl.started(context)
            return launch(context)
        }

        /** Start the same session again (after an update, a reboot, or Android stopping it). */
        fun restore(context: Context): Boolean = launch(context)

        private fun launch(context: Context): Boolean = try {
            ContextCompat.startForegroundService(context, Intent(context, VisibilityService::class.java))
            true
        } catch (e: IllegalStateException) {
            // ForegroundServiceStartNotAllowedException (an IllegalStateException): not from the background.
            DebugStatus.log("Live service not started: ${e.javaClass.simpleName}")
            false
        } catch (e: SecurityException) {
            DebugStatus.log("Live service not started: ${e.javaClass.simpleName}")
            false
        }

        fun stop(context: Context) {
            VisibilityPrefs.setVisible(context, false)
            context.stopService(Intent(context, VisibilityService::class.java))
        }

        /** Off, but not your choice (the night is over, or 12 hours): the next crew still goes live by itself. */
        fun stopByApp(context: Context) {
            VisibilityPrefs.markStopped(context)
            context.stopService(Intent(context, VisibilityService::class.java))
        }
    }
}
