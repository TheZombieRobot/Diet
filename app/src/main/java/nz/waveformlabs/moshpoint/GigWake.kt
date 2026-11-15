package nz.waveformlabs.moshpoint

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import nz.waveformlabs.moshpoint.core.GigGroup

/**
 * Wakes a hibernating crew on gig day: a few hours before the start, a notification says
 * "Iron Maiden tonight. Tap to go live". Opening the app then makes you findable (the
 * crew is no longer asleep). An inexact alarm: no special permission, no battery cost.
 */
object GigWake {
    private const val REQUEST = 41

    const val ACTION_END = "nz.waveformlabs.moshpoint.GIG_END"

    fun schedule(c: Context, g: GigGroup) {
        val app = c.applicationContext
        val am = app.getSystemService(AlarmManager::class.java) ?: return
        // Gig day: wake the crew. The morning after: end it (memories stay in Your gigs).
        // "Allow while idle": Doze / battery saving can't hold the gig-day wake-up back for hours.
        if (g.dormant(System.currentTimeMillis())) runCatching { am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, g.wakeAtSec * 1000, pending(app, false)) }
        else runCatching { am.cancel(pending(app, false)) }
        runCatching { am.set(AlarmManager.RTC, g.expiresAtMs + 60_000, pending(app, true)) }
    }

    fun cancel(c: Context) {
        val am = c.applicationContext.getSystemService(AlarmManager::class.java) ?: return
        runCatching { am.cancel(pending(c.applicationContext, false)) }
        runCatching { am.cancel(pending(c.applicationContext, true)) }
    }

    private fun pending(c: Context, end: Boolean) = PendingIntent.getBroadcast(
        c, if (end) REQUEST + 1 else REQUEST,
        Intent(c, GigWakeReceiver::class.java).apply { if (end) action = ACTION_END },
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}
