package nz.waveformlabs.moshpoint.crew

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.GigGroup

/** Notifications for things the crew sends: pings, meet-up pins, photos. */
object CrewNotifications {
    private const val CHANNEL = "crew"
    /**
     * The urgent channel older builds used for Need help and overdue check-ins (removed 16
     * November 2026). Deleted, so it no longer sits empty in the phone's notification settings.
     */
    private const val RETIRED_HELP_CHANNEL = "crew_help"
    /**
     * Ids for alerts that each get a notification of their own. They start from the clock (16 a
     * second), in a range of their own, so an app that Android restarted in the background never
     * reuses the id of an alert still showing. Before, every start counted from 7000 again, so the
     * first new alert replaced the first old one, even one nobody had seen yet.
     */
    private var nextId = 0x20000000 + ((System.currentTimeMillis() / 1000 * 16) % 0x10000000).toInt()

    /**
     * [sentAgo]: set when the ping only just arrived long after it was sent ("40 min ago"), so
     * the alert says so. Every kind alike, an older build's Need help included: an ordinary ping.
     */
    fun ping(c: Context, p: GigGroup.Ping, sentAgo: String? = null) {
        post(
            c,
            title = GroupSync.pingTitle(p.kind, p.from),
            text = when {
                sentAgo != null -> Txt.s(R.string.offline_notif_late, sentAgo)
                p.lat != null -> Txt.s(R.string.crew_notif_tap_where)
                else -> Txt.s(R.string.crew_notif_from_crew)
            },
        )
    }

    fun post(
        c: Context,
        title: String,
        text: String,
        openMap: Boolean = true,
        /** Open the crew chat instead. */
        openChat: Boolean = false,
        /** Which crew's chat (main crew if null). */
        crewId: String? = null,
        /** Update this notification in place instead of adding another. */
        notificationId: Int? = null,
        /** Shown expanded under the text (latest messages). */
        lines: List<String> = emptyList(),
        /** Update without buzzing again. */
        silent: Boolean = false,
        /** Remove it by itself after this long (e.g. "tonight!" once the gig's over). */
        timeoutMs: Long = 0L,
        /** A private message: open the thread with whoever signs with this tag in [crewId] (docs/PRIVATE_MESSAGES.md). */
        privateWith: Long? = null,
        /** On a locked phone that hides sensitive content, show only this (no name, no words). */
        lockScreenText: String? = null,
    ) {
        val app = c.applicationContext
        val nm = app.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(NotificationChannel(CHANNEL, Txt.s(R.string.crew_channel_messages), NotificationManager.IMPORTANCE_DEFAULT))
        runCatching { nm.deleteNotificationChannel(RETIRED_HELP_CHANNEL) }
        val thread = privateWith?.let { "$crewId:$it" }
        val open = PendingIntent.getActivity(
            app,
            when {
                // One per private thread, so each opens its own.
                thread != null -> 0x10000 + (thread.hashCode() and 0xFFFF)
                openChat -> 71 + (crewId?.hashCode()?.and(0xFFFF) ?: 0)
                else -> 70
            },
            Intent(app, MainActivity::class.java).putExtra(MainActivity.EXTRA_OPEN_MAP, openMap && !openChat && thread == null)
                .putExtra(MainActivity.EXTRA_OPEN_CHAT, openChat)
                .putExtra(MainActivity.EXTRA_CHAT_CREW, crewId)
                .putExtra(MainActivity.EXTRA_OPEN_PRIVATE, thread)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(app, CHANNEL)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setOnlyAlertOnce(silent)
            .apply {
                if (lines.isNotEmpty()) {
                    setStyle(NotificationCompat.InboxStyle().also { st -> lines.forEach { st.addLine(it) } }.setSummaryText(text))
                }
            }
            .apply { if (timeoutMs > 0) setTimeoutAfter(timeoutMs) }
            .apply {
                if (lockScreenText != null) {
                    // A private message: a locked phone that hides sensitive content shows only this.
                    setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                    setPublicVersion(
                        NotificationCompat.Builder(app, CHANNEL)
                            .setContentTitle(Txt.s(R.string.app_name))
                            .setContentText(lockScreenText)
                            .setSmallIcon(R.drawable.ic_launcher_monochrome)
                            .setColor(0xFFB6FF3B.toInt())
                            .build(),
                    )
                }
            }
            .setContentIntent(open)
            .setColor(0xFFB6FF3B.toInt())
            .build()
        runCatching { nm.notify(notificationId ?: nextId++, n) }
    }
}
