package nz.waveformlabs.moshpoint.watch

import android.content.Context
import android.os.SystemClock
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import nz.waveformlabs.moshpoint.CrewChat
import nz.waveformlabs.moshpoint.CrewStatus
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.GroupSync
import nz.waveformlabs.moshpoint.Identity
import nz.waveformlabs.moshpoint.OfflineMessages
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.watch.PingKind
import nz.waveformlabs.moshpoint.core.watch.PingOutcome
import nz.waveformlabs.moshpoint.core.watch.WatchGate
import nz.waveformlabs.moshpoint.core.watch.WatchMessage
import nz.waveformlabs.moshpoint.locate.RelayClient

/**
 * Pings from the wrist (docs/WATCH.md, problem 8). They go out through the phone's existing
 * ping path, [GroupSync.sendPing], exactly as if the button in the app had been tapped, with
 * the app open or not. From there the outbox ([OfflineMessages]) looks after them like any
 * crew message: the relay when there's signal, crew phones nearby over Bluetooth when there isn't.
 *
 * The watch is told what the outbox says and nothing kinder: "sent" only once the relay has
 * the ping, "sent nearby" once a crew phone has it, and otherwise that it is still waiting.
 * If it gets further after the watch has been answered, the watch hears that too.
 *
 * "Need help" (and the "I'm OK now" that follows one) is free for everyone. It never reaches
 * the Moshpoint+ check below.
 */
internal object WatchPings {
    /**
     * A ping this phone took from the watch. [lineId] is its line in the crew chat, which is
     * where the outbox reports how it's doing; blank if that line can't be seen from here.
     */
    private class Taken(val kind: Int, val sinceSec: Long, val lineId: String) {
        var outcome = PingOutcome.UNCONFIRMED
        var following = false
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    /** Recent requests by number, so a retry of one the phone already has is never sent twice. */
    private val recent = object : LinkedHashMap<Int, Taken>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, Taken>?) = size > 16
    }

    private fun taken(requestId: Int): Taken? = synchronized(recent) { recent[requestId] }

    /** Called on the Data Layer's own callback thread; returns once the watch has been answered. */
    fun handle(c: Context, watch: String, m: WatchMessage.Ping) {
        val app = c.applicationContext
        val outcome = runBlocking {
            try {
                withTimeoutOrNull(ANSWER_WITHIN_MS) { process(app, m) } ?: PingOutcome.UNCONFIRMED
            } catch (e: Exception) {
                // If the ping path already has it, it's in the outbox: "failed" would be wrong.
                if (taken(m.requestId) != null) PingOutcome.UNCONFIRMED else PingOutcome.FAILED
            }
        }
        DebugStatus.log("Wrist ping ${m.kind}: $outcome")
        WatchLink.send(app, watch, WatchMessage.PingResult(m.requestId, outcome))
        taken(m.requestId)?.let { followUp(app, watch, m.requestId, it) }
    }

    private suspend fun process(app: Context, m: WatchMessage.Ping): PingOutcome {
        val feature = WatchGate.featureOf(m.kind) ?: return PingOutcome.FAILED
        // Safety is never paywalled: a free feature doesn't look at the entitlement at all.
        if (!feature.free && !Entitlements.plus(app)) return PingOutcome.NOT_ENTITLED
        val crewKind = when (m.kind) {
            PingKind.NEED_HELP -> GigGroup.Ping.NEED_HELP
            PingKind.ON_MY_WAY -> GigGroup.Ping.COMING
            PingKind.ALL_GOOD, PingKind.SOS_ALL_CLEAR -> GigGroup.Ping.ALL_GOOD
            PingKind.UNKNOWN -> return PingOutcome.FAILED
        }
        val before = taken(m.requestId)
        if (before != null && before.outcome != PingOutcome.FAILED) {
            if (before.outcome == PingOutcome.SENT) return PingOutcome.SENT
            // The watch is asking again about a ping the outbox already has. The outbox keeps
            // trying by itself, so it is never sent twice: ask it to try now and say how it's doing.
            withContext(Dispatchers.Main) { OfflineMessages.retryNow(app) }
            return note(before, settle(app, before, RETRY_PATIENCE_MS))
        }
        val now = withContext(Dispatchers.Main) { take(app, crewKind) } ?: return PingOutcome.NO_CREW
        synchronized(recent) { recent[m.requestId] = now }
        // With no network the relay is out: wait only long enough for a crew phone beside us to take it.
        return note(now, settle(app, now, if (RelayClient.offline) OFFLINE_PATIENCE_MS else FIRST_PATIENCE_MS))
    }

    /** Hand the ping to the phone's ping path. Null when there is no crew to tell. Main thread. */
    private fun take(app: Context, crewKind: Int): Taken? {
        // The app may not be open: load what the ping path needs, as the live service does.
        FriendsRepository.init(app)
        if (GroupSync.group.value == null) GroupSync.load(app)
        val g = GroupSync.group.value ?: return null
        val here = CrewStatus.myLocation(app)
        val had = ownLines(g, crewKind).mapTo(HashSet()) { it.id }
        val sinceSec = System.currentTimeMillis() / 1000
        GroupSync.sendPing(app, crewKind, here?.latitude, here?.longitude)
        return Taken(crewKind, sinceSec, ownLines(g, crewKind).lastOrNull { it.id !in had }?.id.orEmpty())
    }

    /**
     * Our own quick messages of this kind in the main crew's chat, oldest first. Empty when the
     * chat on the phone's screen is another crew's (only one chat is held in memory). Main thread.
     */
    private fun ownLines(g: GigGroup, kind: Int): List<CrewChat.Line> =
        if (CrewChat.viewing.value?.key?.contentEquals(g.key) == true) {
            CrewChat.lines.filter { it.mine && it.kind == kind && it.id.isNotEmpty() }
        } else {
            emptyList()
        }

    /** What the outbox says about our ping (CrewChat.SENT and so on), or null if its line can't be seen. Main thread. */
    private fun lineState(id: String): Int? = CrewChat.lines.firstOrNull { it.mine && it.id == id }?.state

    /** Wait, at most [patienceMs], for the outbox to say where the ping has got to. */
    private suspend fun settle(app: Context, t: Taken, patienceMs: Long): PingOutcome {
        if (t.lineId.isEmpty()) {
            // The outbox's reports can't be seen from here, so look on the relay itself for our own signed ping.
            val tries = (patienceMs / 2_000).toInt().coerceIn(1, 4)
            return if (onRelay(app, t.kind, t.sinceSec, tries)) PingOutcome.SENT else PingOutcome.UNCONFIRMED
        }
        val until = SystemClock.elapsedRealtime() + patienceMs
        var nearbyAt = 0L
        while (true) {
            val state = withContext(Dispatchers.Main) { lineState(t.lineId) }
            val now = SystemClock.elapsedRealtime()
            when (state) {
                CrewChat.SENT -> return PingOutcome.SENT
                CrewChat.FAILED -> return PingOutcome.FAILED
                CrewChat.NEARBY -> {
                    // A crew phone has it. With signal the relay usually follows in a moment: give it that.
                    if (nearbyAt == 0L) nearbyAt = now
                    if (now - nearbyAt >= NEARBY_GRACE_MS || now >= until) return PingOutcome.SENT_NEARBY
                }
                null -> if (now >= until) return PingOutcome.UNCONFIRMED
                else -> if (now >= until) return PingOutcome.WAITING
            }
            delay(300)
        }
    }

    /** Remember the furthest this ping is known to have got, and answer with that. */
    private fun note(t: Taken, seen: PingOutcome): PingOutcome = synchronized(t) {
        if (seen.improvesOn(t.outcome) || t.outcome == PingOutcome.UNCONFIRMED || seen == PingOutcome.FAILED) t.outcome = seen
        t.outcome
    }

    /**
     * After the watch has its answer: if the outbox gets the ping further while this process is
     * still running, tell the watch, which may still be showing "Not sent yet". Nothing is
     * polled: the chat line is Compose state, so this wakes only when it changes.
     */
    private fun followUp(app: Context, watch: String, requestId: Int, t: Taken) {
        synchronized(t) {
            if (t.lineId.isEmpty() || t.following || t.outcome == PingOutcome.SENT || t.outcome == PingOutcome.FAILED) return
            t.following = true
        }
        WatchSync.start(app) // makes Compose state changes visible with no screen up
        scope.launch {
            withTimeoutOrNull(FOLLOW_FOR_MS) {
                snapshotFlow { lineState(t.lineId) }.first { state ->
                    val news = when (state) {
                        CrewChat.SENT -> PingOutcome.SENT
                        CrewChat.NEARBY -> PingOutcome.SENT_NEARBY
                        else -> null
                    }
                    val better = news != null && synchronized(t) { news.improvesOn(t.outcome).also { if (it) t.outcome = news } }
                    if (news != null && better) {
                        DebugStatus.log("Wrist ping: now $news")
                        WatchLink.send(app, watch, WatchMessage.PingResult(requestId, news))
                    }
                    state == CrewChat.SENT || state == CrewChat.FAILED
                }
            }
            synchronized(t) { t.following = false }
        }
    }

    /** Is our own signed ping of this [kind], sent since [sinceSec], in the crew's ping box on the relay? */
    private suspend fun onRelay(app: Context, kind: Int, sinceSec: Long, tries: Int): Boolean {
        val g = withContext(Dispatchers.Main) { GroupSync.group.value } ?: return false
        val me = Identity.tag(app, g)
        repeat(tries) { attempt ->
            delay(if (attempt == 0) 1_200 else 1_800)
            val epoch = Math.floorDiv(System.currentTimeMillis(), EphemeralId.DEFAULT_ROTATION_MS)
            val found = RelayClient.lookup(listOf(g.pingIdForEpoch(epoch), g.pingIdForEpoch(epoch - 1))) ?: return@repeat
            val there = found.flatten().any { blob ->
                g.openPing(blob)?.let { it.sender == me && it.kind == kind && it.timeSec >= sinceSec - 2 } == true
            }
            if (there) return true
        }
        return false
    }

    /** Under the watch's own 12 s patience, so it always hears an answer rather than timing out. */
    private const val ANSWER_WITHIN_MS = 10_500L
    private const val FIRST_PATIENCE_MS = 8_500L
    private const val OFFLINE_PATIENCE_MS = 5_000L
    private const val RETRY_PATIENCE_MS = 6_000L
    private const val NEARBY_GRACE_MS = 2_500L

    /** How long to keep an ear on a ping that hadn't reached the relay when the watch was answered. */
    private const val FOLLOW_FOR_MS = 30 * 60_000L
}
