package nz.waveformlabs.moshpoint.watch

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
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R

/**
 * What keeps the phone finding for the watch with its screen off (docs/WATCH.md, problem 4):
 * a foreground service with its own notification ("Finding Sam for your watch" · Stop).
 * It holds nothing itself: [WatchFind] is the find, started when the watch asks and stopped
 * the moment it stops asking. When that ends, so does this.
 *
 * Types, as Android 14+ requires: `connectedDevice` (Bluetooth scanning, advertising, UWB),
 * plus `location` when Android will grant it. From the background it won't (a location
 * service may only start while the app is on screen), so that is tried first and dropped on
 * refusal, the same way [nz.waveformlabs.moshpoint.service.VisibilityService] does. When
 * you're live, that service already holds the location type, which is what matters.
 */
class WatchFinderService : LifecycleService() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        if (intent?.action == ACTION_STOP) {
            WatchFind.stopFromPhone()
            stopSelf()
            return START_NOT_STICKY
        }
        level = startInForeground()
        if (level == Level.NONE) stopSelf()
        return START_NOT_STICKY
    }

    private fun startInForeground(): Level {
        val notification = buildNotification(this, mateName)
        val base = ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
        val withLocation = base or ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
        val mayLocate = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        return try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, if (mayLocate) withLocation else base)
            if (mayLocate) Level.WITH_LOCATION else Level.CONNECTED_ONLY
        } catch (e: SecurityException) {
            // Started from the background: Android refuses the location type. Bluetooth only.
            if (runCatching { ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, base) }.isSuccess) Level.CONNECTED_ONLY else Level.NONE
        } catch (e: IllegalStateException) {
            Level.NONE // not allowed to run in the foreground right now
        }
    }

    override fun onDestroy() {
        level = Level.NONE
        super.onDestroy()
    }

    /** How much Android let this service be. */
    enum class Level { NONE, CONNECTED_ONLY, WITH_LOCATION }

    companion object {
        private const val CHANNEL = "watch_finder"
        private const val NOTIFICATION_ID = 6
        private const val ACTION_STOP = "nz.waveformlabs.moshpoint.STOP_WATCH_FIND"

        @Volatile
        var level = Level.NONE
            private set

        @Volatile private var mateName: String = ""

        /**
         * Start (or upgrade) the service. Android may refuse when the app is in the background
         * and not exempt from battery optimisation: then [level] stays as it was, and
         * [WatchFind] decides whether it can find anyway.
         */
        fun start(context: Context, name: String) {
            mateName = name
            if (level == Level.WITH_LOCATION) return
            try {
                ContextCompat.startForegroundService(context, Intent(context, WatchFinderService::class.java))
            } catch (e: Exception) {
                // ForegroundServiceStartNotAllowedException and friends: carry on without it.
            }
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, WatchFinderService::class.java))
        }

        private fun buildNotification(c: Context, name: String): Notification {
            val nm = c.getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(NotificationChannel(CHANNEL, c.getString(R.string.watch_channel), NotificationManager.IMPORTANCE_LOW))
            val open = PendingIntent.getActivity(c, 60, Intent(c, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
            val stop = PendingIntent.getService(
                c, 61, Intent(c, WatchFinderService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
            )
            return NotificationCompat.Builder(c, CHANNEL)
                .setContentTitle(c.getString(R.string.watch_finding_title, name))
                .setContentText(c.getString(R.string.watch_finding_text))
                .setSmallIcon(R.drawable.ic_launcher_monochrome)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(open)
                .addAction(0, c.getString(R.string.watch_stop), stop)
                .setColor(0xFFB6FF3B.toInt())
                .build()
        }
    }
}
