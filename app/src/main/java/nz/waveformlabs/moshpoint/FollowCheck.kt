package nz.waveformlabs.moshpoint

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * For loved ones following a crew from home: about every 15 minutes, with the app closed,
 * one quiet check for help alerts, missed check-ins and new photos, so a "Bevan needs
 * help" still reaches Mum. An inexact alarm: Android batches it, so it costs next to nothing.
 */
object FollowCheck {
    fun schedule(c: Context) {
        val app = c.applicationContext
        val am = app.getSystemService(AlarmManager::class.java) ?: return
        runCatching {
            am.setInexactRepeating(
                AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + AlarmManager.INTERVAL_FIFTEEN_MINUTES,
                AlarmManager.INTERVAL_FIFTEEN_MINUTES, pending(app),
            )
        }
    }

    fun cancel(c: Context) {
        runCatching { c.applicationContext.getSystemService(AlarmManager::class.java)?.cancel(pending(c.applicationContext)) }
    }

    private fun pending(c: Context) = PendingIntent.getBroadcast(
        c, 42, Intent(c, FollowCheckReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
}

class FollowCheckReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        GroupSync.load(app)
        if (GroupSync.group.value == null || !GroupSync.following) {
            FollowCheck.cancel(app)
            return
        }
        FriendsRepository.init(app)
        val done = goAsync()
        CoroutineScope(Dispatchers.Main).launch {
            try {
                withTimeoutOrNull(25_000) { GroupSync.syncOnce(app) }
            } finally {
                done.finish()
            }
        }
    }
}
