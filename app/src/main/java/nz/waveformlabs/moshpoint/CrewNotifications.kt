package nz.waveformlabs.moshpoint

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import nz.waveformlabs.moshpoint.core.GigGroup

/** Notifications for things the crew sends: pings, help requests, meet-up pins, photos. */
object CrewNotifications {
    private const val CHANNEL = "crew"
    private const val HELP_CHANNEL = "crew_help"
    private var nextId = 7000

    fun ping(c: Context, p: GigGroup.Ping) {
        val help = p.kind == GigGroup.Ping.NEED_HELP
        val where = if (p.lat != null) " Tap to see where." else ""
        post(
            c, if (help) HELP_CHANNEL else CHANNEL,
            title = "${p.from} ${GroupSync.pingText(p.kind)}",
            text = if (help) "They hit Need help.$where Check on them." else where.trim().ifEmpty { "From your crew" },
            urgent = help,
        )
    }

    fun post(
        c: Context,
        channel: String = CHANNEL,
        title: String,
        text: String,
        urgent: Boolean = false,
        openMap: Boolean = true,
        /** Open the crew chat instead. */
        openChat: Boolean = false,
        /** Which crew's chat (main crew if null). */
        crewId: String? = null,
        /** Remove it by itself after this long (e.g. "tonight!" once the gig's over). */
        timeoutMs: Long = 0L,
    ) {
        val app = c.applicationContext
        val nm = app.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Crew messages", NotificationManager.IMPORTANCE_DEFAULT))
        nm.createNotificationChannel(NotificationChannel(HELP_CHANNEL, "Crew help requests", NotificationManager.IMPORTANCE_HIGH))
        val open = PendingIntent.getActivity(
            app, if (openChat) 71 + (crewId?.hashCode()?.and(0xFFFF) ?: 0) else 70,
            Intent(app, MainActivity::class.java).putExtra(MainActivity.EXTRA_OPEN_MAP, openMap && !openChat)
                .putExtra(MainActivity.EXTRA_OPEN_CHAT, openChat)
                .putExtra(MainActivity.EXTRA_CHAT_CREW, crewId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(app, channel)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setPriority(if (urgent) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(if (urgent) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .apply { if (timeoutMs > 0) setTimeoutAfter(timeoutMs) }
            .setContentIntent(open)
            .setColor(if (urgent) 0xFFFF3B5C.toInt() else 0xFFB6FF3B.toInt())
            .build()
        runCatching { nm.notify(nextId++, n) }
    }
}
