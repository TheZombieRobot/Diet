package nz.waveformlabs.moshpoint.crew

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import nz.waveformlabs.moshpoint.FollowCheckReceiver
import nz.waveformlabs.moshpoint.core.AlarmPlan

/**
 * For loved ones following a crew from home: about every 15 minutes, with the app closed,
 * one quiet check for the crew's pings and new photos, so "Bevan is on their way" still
 * reaches Mum.
 *
 * A Doze-capable wake-up alarm (setAndAllowWhileIdle, RTC_WAKEUP; no exact-alarm permission),
 * set again each time it runs (reliability P1-5): the inexact repeating alarm it replaces could
 * run hours late in Doze. Set again at app start, after a reboot and after an update without
 * ever moving a planned check later (core AlarmPlan).
 */
object FollowCheck {
    private const val EVERY_MS = 15 * 60_000L

    /** A check that was lost (reboot, update) runs this soon. */
    private const val LOST_CHECK_DELAY_MS = 60_000L

    fun schedule(c: Context) {
        val app = c.applicationContext
        set(app, AlarmPlan.next(prefs(app).getLong("followAt", 0L), System.currentTimeMillis(), EVERY_MS, LOST_CHECK_DELAY_MS))
    }

    /** The check just ran: the next one, a full interval from now. */
    fun ranNow(c: Context) {
        set(c.applicationContext, System.currentTimeMillis() + EVERY_MS)
    }

    fun cancel(c: Context) {
        runCatching { c.applicationContext.getSystemService(AlarmManager::class.java)?.cancel(pending(c.applicationContext)) }
        prefs(c).edit().remove("followAt").apply()
    }

    private fun set(app: Context, atMs: Long) {
        val am = app.getSystemService(AlarmManager::class.java) ?: return
        runCatching {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMs, pending(app))
            prefs(app).edit().putLong("followAt", atMs).apply()
        }
    }

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("alarms", Context.MODE_PRIVATE)

    private fun pending(c: Context) = PendingIntent.getBroadcast(
        c, 42, Intent(c, FollowCheckReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}
