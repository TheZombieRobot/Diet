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
                    CrewChat.ingest(app, g, p)?.let { note -> fresh += Txt.s(R.string.crew_notif_line, CrewChat.displayName(app, g, p.sender, p.from), note) }
                    return@forEach
                }
                val h = g.openHistory(blob)
                if (h != null) {
                    CrewChat.ingestHistory(app, g, h).forEach { fresh += Txt.s(R.string.crew_notif_line, it.from, it.text) }
                    return@forEach
                }
                // A private message for us (e.g. "keep as friend"); for anyone else it's unreadable.
                g.openDirect(blob, Identity.signer(app, g))?.let { d ->
                    if (d.kind == CrewRekey.REKEY) CrewRekey.onDirect(app, g, d) else Friendship.onDirect(app, g, d)
                }
            }
            val onScreen = CrewChat.open && CrewChat.viewing.value?.key?.contentEquals(g.key) == true
            if (notify && fresh.isNotEmpty() && !onScreen) notifyCrew(app, g, fresh)
        }
        CrewRekey.resend(app)
        CrewChat.repostPlans(app, crews)
        CrewChat.shareHistory(app, crews)
        // Say hello in each crew we're in (followers too: then a new crew key reaches them as well).
        crews.forEach { g -> CrewChat.announceJoin(app, g) }
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
            text = if (total <= 1) list.last() else Txt.p(R.plurals.crew_new_messages, total),
            openMap = false, openChat = true, crewId = id,
            notificationId = notificationId(id),
            lines = if (total <= 1) emptyList() else list.takeLast(5),
            silent = fresh.isEmpty(),
        )
    }

    /**
     * Test builds: pretend mates wrote in [g]'s chat, exactly as if it came off the relay
     * (unread badge, grouped notification, bubbles). [missed] = as a history copy, like
     * catching up after your phone was off.
     */
    fun debugFakeChat(c: Context, g: GigGroup, missed: Boolean) {
        val app = c.applicationContext
        val now = System.currentTimeMillis() / 1000
        // Each fake mate has their own signing key, like a real person (two of them are "Mate").
        val keys = HashMap<String, nz.waveformlabs.moshpoint.core.CrewKeys.Signer>()
        fun keyOf(who: String) = keys.getOrPut(who) { nz.waveformlabs.moshpoint.core.CrewKeys.generate() }
        val msgs = if (missed) listOf(
            "alex" to ("Alex (test)" to "Did everyone get tickets?? 🎟️"),
            "jo" to ("Jo (test)" to "Yep! Section B"),
            "alex" to ("Alex (test)" to "Pre-drinks at mine then 🍻"),
        ) else listOf(
            "alex" to ("Alex (test)" to "Who's keen?! 🤘"),
            "jo" to ("Jo (test)" to "Sooo keen. Meet at the bar?"),
            "mate1" to ("Mate" to "I'm in"),
            "mate2" to ("Mate" to "Me too (a different Mate!)"),
        )
        val signed = msgs.mapIndexed { i, (who, nt) ->
            val t = if (missed) now - 7200 + i * 600L else now - 30 + i * 5L
            g.openPing(g.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, nt.first, t, text = nt.second), keyOf(who)))!!
        }
        val fresh = mutableListOf<String>()
        if (missed) {
            val h = GigGroup.History(signed.map { GigGroup.HistoryLine(it.kind, it.from, it.sender, it.timeSec, it.text, it.minutes, 0, 0, it.pub, it.sig) }, null)
            CrewChat.ingestHistory(app, g, h).forEach { fresh += "${it.from}: ${it.text}" }
        } else {
            signed.forEach { p -> CrewChat.ingest(app, g, p)?.let { fresh += "${CrewChat.displayName(app, g, p.sender, p.from)}: $it" } }
        }
        val onScreen = CrewChat.open && CrewChat.viewing.value?.key?.contentEquals(g.key) == true
        if (fresh.isNotEmpty() && !onScreen) notifyCrew(app, g, fresh)
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
