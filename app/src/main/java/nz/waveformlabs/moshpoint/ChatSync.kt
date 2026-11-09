package nz.waveformlabs.moshpoint

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.locate.RelayClient

/**
 * Fetches the chat for every crew you're in (main and Up next) in one request: often while
 * the chat is open, every couple of minutes while the app is, and about hourly in the
 * background, so "who's keen for the Stones?!" reaches you weeks before the gig.
 */
object ChatSync {
    private val seen = java.util.Collections.synchronizedSet(HashSet<Int>())
    private var lastPollMs = 0L
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    fun markSeen(blob: ByteArray) {
        seen += blob.contentHashCode()
    }

    fun allCrews(c: Context): List<GigGroup> {
        Crews.load(c)
        return (listOfNotNull(GroupSync.group.value) + Crews.others.map { it.group })
            .distinctBy { GigArchive.idFor(it) }.take(30)
    }

    /** Fetch every crew's chat, unless we did in the last [minGapMs]. */
    suspend fun pollAll(c: Context, minGapMs: Long = 0L, notify: Boolean = true) {
        val app = c.applicationContext
        val now = System.currentTimeMillis()
        if (now - lastPollMs < minGapMs) return
        lastPollMs = now
        val crews = allCrews(app)
        if (crews.isEmpty()) return
        val day = Math.floorDiv(now / 1000, 86_400L)
        val ids = crews.flatMap { listOf(it.chatIdForDay(day), it.chatIdForDay(day - 1)) }
        val found = RelayClient.lookupHeld(ids) ?: return
        crews.forEachIndexed { i, g ->
            (found.getOrNull(2 * i).orEmpty() + found.getOrNull(2 * i + 1).orEmpty()).reversed().forEach { blob ->
                if (!seen.add(blob.contentHashCode())) return@forEach
                val p = g.openPing(blob) ?: return@forEach
                val note = CrewChat.ingest(app, g, p) ?: return@forEach
                val onScreen = CrewChat.open && CrewChat.viewing.value?.key?.contentEquals(g.key) == true
                if (notify && !onScreen) {
                    CrewNotifications.post(app, title = "${p.from} · ${g.name}", text = note, openMap = false, openChat = true, crewId = GigArchive.idFor(g))
                }
            }
        }
        CrewChat.repostPlans(app, crews)
    }

    /** An inexact hourly check with the app closed (no wake-ups, no special permission). */
    fun schedule(c: Context) {
        val app = c.applicationContext
        val am = app.getSystemService(AlarmManager::class.java) ?: return
        runCatching {
            am.setInexactRepeating(
                AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + AlarmManager.INTERVAL_HOUR,
                AlarmManager.INTERVAL_HOUR, pending(app),
            )
        }
    }

    fun cancel(c: Context) {
        val am = c.applicationContext.getSystemService(AlarmManager::class.java) ?: return
        runCatching { am.cancel(pending(c.applicationContext)) }
    }

    private fun pending(c: Context) = PendingIntent.getBroadcast(
        c, 43, Intent(c, ChatCheckReceiver::class.java), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    internal fun runInBackground(c: Context, done: () -> Unit) {
        scope.launch {
            try {
                if (GroupSync.group.value == null) GroupSync.load(c.applicationContext)
                if (allCrews(c).isEmpty()) cancel(c) else pollAll(c)
            } finally {
                done()
            }
        }
    }
}

class ChatCheckReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        ChatSync.runInBackground(context) { pending.finish() }
    }
}
