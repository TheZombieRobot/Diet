package nz.waveformlabs.moshpoint.safety

import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.compose.runtime.mutableStateOf
import androidx.core.app.NotificationCompat
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.StorageNotice

/**
 * What the app tells you about itself, rather than about the crew (docs/WAVE2_SAFETY.md):
 * Live stopped and why, and a full disk. With the app on screen a notice shows over it
 * ([showing], drawn by NoticeDialog); otherwise it's a notification on its own channel, and
 * "Still at the gig?" shows again when the app is next opened, since it asks something.
 * Main thread only.
 */
object Notices {
    const val CHANNEL = "notices"
    private const val NOTIFICATION_ID = 0x30000010

    enum class Kind(val code: Int) {
        /** Android stopped Live in the background (or wouldn't start it again): tap to go live again. */
        LIVE_STOPPED(1),

        /** Going live didn't work with the app open (a permission was taken away, say). */
        LIVE_CANT_START(2),

        /** Live switched itself off after about 12 hours (core LiveRules): "Still at the gig?" */
        LIVE_TOO_LONG(3),

        /** The phone's storage is full (core StorageNotice): said once a day at most. */
        STORAGE_FULL(4),
        ;

        /** Asks you something (Go live?), so it waits for the app to be opened. */
        val asks: Boolean get() = this == LIVE_TOO_LONG

        val isLive: Boolean get() = this != STORAGE_FULL

        companion object {
            fun of(code: Int): Kind? = entries.firstOrNull { it.code == code }
        }
    }

    /** The notice to show over the app (Compose state). */
    val showing = mutableStateOf<Kind?>(null)

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("notices", Context.MODE_PRIVATE)

    /** The app is opening: a notice that asks something, saved while it was closed, shows now. */
    fun restore(c: Context) {
        if (showing.value != null) return
        Kind.of(prefs(c).getInt("pending", 0))?.let { showing.value = it }
    }

    /** Tell you about [kind]: over the app if it's on screen, else as a notification. */
    fun show(c: Context, kind: Kind) {
        val app = c.applicationContext
        if (onScreen()) {
            showing.value = kind
        } else {
            notify(app, kind)
            if (kind.asks) {
                showing.value = kind
                prefs(app).edit().putInt("pending", kind.code).apply()
            }
        }
    }

    /** You answered the notice (or it no longer applies): it goes, here and in the notification shade. */
    fun dismiss(c: Context) {
        showing.value = null
        prefs(c).edit().remove("pending").apply()
        cancelNotification(c)
    }

    /** Live is on again: whatever said it had stopped no longer applies. */
    fun liveBack(c: Context) {
        if (showing.value?.isLive == true) {
            showing.value = null
            prefs(c).edit().remove("pending").apply()
        }
        cancelNotificationIfLive(c)
    }

    /** The disk is full: once, and again only if it's still full a day later. */
    fun storageFull(c: Context) {
        val p = prefs(c)
        val now = System.currentTimeMillis()
        if (!StorageNotice.shouldTell(p.getLong("storageTold", 0L), now)) return
        // (This write may not get through either; then it can come again with the next failure, which is fine.)
        p.edit().putLong("storageTold", now).apply()
        show(c, Kind.STORAGE_FULL)
    }

    private fun cancelNotificationIfLive(c: Context) {
        if (prefs(c).getInt("notified", 0).let { Kind.of(it)?.isLive } == true) cancelNotification(c)
    }

    private fun cancelNotification(c: Context) {
        runCatching { c.applicationContext.getSystemService(NotificationManager::class.java)?.cancel(NOTIFICATION_ID) }
        prefs(c).edit().remove("notified").apply()
    }

    private fun notify(app: Context, kind: Kind) {
        val nm = app.getSystemService(NotificationManager::class.java) ?: return
        runCatching {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, Txt.s(R.string.safety_channel_notices), NotificationManager.IMPORTANCE_DEFAULT))
        }
        val (title, text) = when (kind) {
            Kind.LIVE_STOPPED, Kind.LIVE_CANT_START -> R.string.safety_live_off_title to R.string.safety_live_off_text
            Kind.LIVE_TOO_LONG -> R.string.safety_live_long_title to R.string.safety_live_long_notif
            Kind.STORAGE_FULL -> R.string.safety_storage_full_title to R.string.safety_storage_full_text
        }
        // Opens the app, nothing more: going live is always your tap in the app, never an intent.
        val open = PendingIntent.getActivity(
            app, 80, Intent(app, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = NotificationCompat.Builder(app, CHANNEL)
            .setContentTitle(Txt.s(title))
            .setContentText(Txt.s(text))
            .setStyle(NotificationCompat.BigTextStyle().bigText(Txt.s(text)))
            .setSmallIcon(R.drawable.ic_launcher_monochrome)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setAutoCancel(true)
            .setContentIntent(open)
            .setColor(0xFFB6FF3B.toInt())
            .build()
        runCatching { nm.notify(NOTIFICATION_ID, n) }
        prefs(app).edit().putInt("notified", kind.code).apply()
    }

    /** Is one of the app's own screens in front right now (not merely a service running)? */
    fun onScreen(): Boolean = runCatching {
        val info = ActivityManager.RunningAppProcessInfo()
        ActivityManager.getMyMemoryState(info)
        info.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }.getOrDefault(false)
}
