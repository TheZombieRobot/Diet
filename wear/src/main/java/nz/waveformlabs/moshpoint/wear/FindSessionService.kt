package nz.waveformlabs.moshpoint.wear

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.watch.WristView

/**
 * Keeps a find going while the wrist is down (docs/WATCH.md, problem 6): a foreground
 * service so the buzzes carry on with the screen dark, shown as an ongoing activity
 * ("Sam · 40 m") so there's a chip on the watch face and one tap goes back to the arrow.
 * It holds nothing itself: [FindSession] is the find. When that ends, so does this.
 */
class FindSessionService : LifecycleService() {
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        super.onStartCommand(intent, flags, startId)
        val started = runCatching {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(statusText(FindSession.ui.value)), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        }.isSuccess
        if (!started || !FindSession.running) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (!watching) {
            watching = true
            lifecycleScope.launch {
                FindSession.ui.map { ui -> if (ui == null || !FindSession.running) null else statusText(ui) }.distinctUntilChanged().collect { text ->
                    if (text == null) {
                        ServiceCompat.stopForeground(this@FindSessionService, ServiceCompat.STOP_FOREGROUND_REMOVE)
                        stopSelf()
                    } else {
                        runCatching { getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(text)) }
                    }
                }
            }
        }
        return START_NOT_STICKY
    }

    private var watching = false

    /** "Sam · 40 m", or just the name while there's no distance. */
    private fun statusText(ui: FinderUi?): String {
        val name = ui?.mateName ?: FindSession.mate?.name.orEmpty()
        val metres = when (val v = ui?.view) {
            is WristView.Arrow -> v.distanceM
            is WristView.DistanceOnly -> v.distanceM
            else -> null
        }
        return if (metres != null && ui?.status == FinderStatus.LIVE) getString(R.string.glance_nearest, name, distanceText(resources, metres)) else name
    }

    private fun notification(status: String): android.app.Notification {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.find_channel), NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, FinderActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = NotificationCompat.Builder(this, CHANNEL)
            .setContentTitle(getString(R.string.find_notification, FindSession.mate?.name.orEmpty()))
            .setContentText(status)
            .setSmallIcon(R.drawable.ic_mosh)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_NAVIGATION)
            .setContentIntent(open)
        OngoingActivity.Builder(applicationContext, NOTIFICATION_ID, builder)
            .setStaticIcon(R.drawable.ic_mosh)
            .setTouchIntent(open)
            .setStatus(Status.Builder().addTemplate("#s#").addPart("s", Status.TextPart(status)).build()) // a part, so a '#' in a name is just a '#'
            .build()
            .apply(applicationContext)
        return builder.build()
    }

    companion object {
        private const val CHANNEL = "finding"
        private const val NOTIFICATION_ID = 1

        /**
         * Called from the finder screen, i.e. with the app in front. A plain start (the service
         * then promotes itself): if a watch ever refuses the promotion, the find still runs
         * while the screen is on instead of the app being killed for breaking a promise.
         */
        fun start(context: Context) {
            runCatching { context.startService(Intent(context, FindSessionService::class.java)) }
        }
    }
}
