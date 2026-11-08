package nz.waveformlabs.moshpoint

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
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

    fun schedule(c: Context, g: GigGroup) {
        val app = c.applicationContext
        if (!g.dormant(System.currentTimeMillis())) return cancel(app)
        val am = app.getSystemService(AlarmManager::class.java) ?: return
        runCatching { am.set(AlarmManager.RTC_WAKEUP, g.wakeAtSec * 1000, pending(app)) }
    }

    fun cancel(c: Context) {
        runCatching { c.applicationContext.getSystemService(AlarmManager::class.java)?.cancel(pending(c.applicationContext)) }
    }

    private fun pending(c: Context) = PendingIntent.getBroadcast(
        c, REQUEST, Intent(c, GigWakeReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}

class GigWakeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        GroupSync.load(context)
        val g = GroupSync.group.value ?: return
        val time = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(g.startsAtSec * 1000))
        CrewNotifications.post(
            context,
            title = "${g.name} tonight!",
            text = "Starts $time${if (g.venue.isNotBlank()) " at ${g.venue}" else ""}. Tap to go live so your crew can find you.",
            urgent = false,
            openMap = false,
        )
    }
}
