package nz.waveformlabs.moshpoint

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.util.Calendar

/**
 * "Remember last year?": gigs on this day in an earlier year. Shown as a card on the home
 * screen, and a notification on the morning of the anniversary ("A year ago today: Iron
 * Maiden with Bevan & Jo. Tap to relive it.").
 */
object Memories {
    /** Past gigs whose day and month are today's (an earlier year), with how many years ago. */
    fun today(gigs: List<GigArchive.Summary>, nowMs: Long = System.currentTimeMillis()): List<Pair<GigArchive.Summary, Int>> {
        val now = Calendar.getInstance().apply { timeInMillis = nowMs }
        return gigs.mapNotNull { g ->
            val then = Calendar.getInstance().apply { timeInMillis = g.whenSec * 1000 }
            val years = now.get(Calendar.YEAR) - then.get(Calendar.YEAR)
            if (years >= 1 && then.get(Calendar.MONTH) == now.get(Calendar.MONTH) && then.get(Calendar.DAY_OF_MONTH) == now.get(Calendar.DAY_OF_MONTH)) g to years else null
        }
    }

    fun headline(g: GigArchive.Summary, years: Int): String {
        val ago = if (years == 1) "A year ago today" else "$years years ago today"
        val with = g.people.filter { it != "You" }.take(2)
        return "$ago: ${g.name}" + if (with.isNotEmpty()) " with ${with.joinToString(" & ")}" else ""
    }

    /** Set an alarm for 10 am on the next anniversary of any kept gig. */
    fun schedule(c: Context, gigs: List<GigArchive.Summary>) {
        val app = c.applicationContext
        val now = System.currentTimeMillis()
        val next = gigs.mapNotNull { g ->
            val then = Calendar.getInstance().apply { timeInMillis = g.whenSec * 1000 }
            Calendar.getInstance().apply {
                set(Calendar.MONTH, then.get(Calendar.MONTH))
                set(Calendar.DAY_OF_MONTH, then.get(Calendar.DAY_OF_MONTH))
                set(Calendar.HOUR_OF_DAY, 10); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
                if (timeInMillis <= now || get(Calendar.YEAR) <= then.get(Calendar.YEAR)) add(Calendar.YEAR, 1)
            }.timeInMillis
        }.minOrNull()
        val am = app.getSystemService(AlarmManager::class.java) ?: return
        val pi = PendingIntent.getBroadcast(app, 43, Intent(app, MemoryReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        if (next == null) am.cancel(pi) else runCatching { am.set(AlarmManager.RTC_WAKEUP, next, pi) }
    }
}

class MemoryReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val done = goAsync()
        CoroutineScope(Dispatchers.Main).launch {
            try {
                GigArchive.refreshList(app)
                Memories.today(GigArchive.gigs).firstOrNull()?.let { (g, years) ->
                    CrewNotifications.post(app, title = Memories.headline(g, years), text = "${g.photos + g.clips} photos and clips. Tap to relive it.", openMap = false)
                }
                Memories.schedule(app, GigArchive.gigs) // the next one
            } finally {
                done.finish()
            }
        }
    }
}
