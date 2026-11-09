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

    /** Recent "Jo: keen!!" lines per crew for its notification, until the chat is opened. */
    private val recent = HashMap<String, MutableList<String>>()

    /** Fetch every crew's chat, unless we did in the last [minGapMs]. */
    suspend fun pollAll(c: Context, minGapMs: Long = 0L, notify: Boolean = true) {
        val app = c.applicationContext
        val now = System.currentTimeMillis()
        if (now - lastPollMs < minGapMs) return
        lastPollMs = now
        val crews = allCrews(app)
        if (crews.isEmpty()) return
        CrewChat.retryOutbox(app, crews)
        val day = Math.floorDiv(now / 1000, 86_400L)
        val ids = crews.flatMap { listOf(it.chatIdForDay(day), it.chatIdForDay(day - 1)) }
        val found = RelayClient.lookupHeld(ids) ?: return
        crews.forEachIndexed { i, g ->
            val fresh = mutableListOf<String>()
            (found.getOrNull(2 * i).orEmpty() + found.getOrNull(2 * i + 1).orEmpty()).forEach { blob ->
                if (!seen.add(blob.contentHashCode())) return@forEach
                val p = g.openPing(blob)
                if (p != null) {
                    CrewChat.ingest(app, g, p)?.let { note -> fresh += "${p.from}: $note" }
                } else {
                    g.openHistory(blob)?.let { h -> CrewChat.ingestHistory(app, g, h).forEach { fresh += "${it.from}: ${it.text}" } }
                }
            }
            val onScreen = CrewChat.open && CrewChat.viewing.value?.key?.contentEquals(g.key) == true
            if (notify && fresh.isNotEmpty() && !onScreen) notifyCrew(app, g, fresh)
        }
        CrewChat.repostPlans(app, crews)
        CrewChat.shareHistory(app, crews)
    }

    /**
     * One notification per crew, updated in place (like Messages): "Jo: keen!!", or
     * "3 new messages" with the latest few lines underneath.
     */
    private fun notifyCrew(c: Context, g: GigGroup, fresh: List<String>) {
        val id = GigArchive.idFor(g)
        val list = recent.getOrPut(id) { mutableListOf() }
        list += fresh
        while (list.size > 6) list.removeAt(0)
        val total = CrewChat.unreadFor(c, g).coerceAtLeast(list.size)
        CrewNotifications.post(
            c,
            title = g.name,
            text = if (total <= 1) list.last() else "$total new messages",
            openMap = false, openChat = true, crewId = id,
            notificationId = notificationId(id),
            lines = if (total <= 1) emptyList() else list.takeLast(5),
            silent = fresh.isEmpty(),
        )
    }

    private fun notificationId(crewId: String) = 9000 + Math.floorMod(crewId.hashCode(), 900)

    /** The chat was opened: its notification goes. */
    fun clearNotification(c: Context, crewId: String) {
        recent.remove(crewId)
        val nm = c.applicationContext.getSystemService(android.app.NotificationManager::class.java) ?: return
        runCatching { nm.cancel(notificationId(crewId)) }
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
