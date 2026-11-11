package nz.waveformlabs.moshpoint.watch

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import nz.waveformlabs.moshpoint.CrewStatus
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.GroupSync
import nz.waveformlabs.moshpoint.Identity
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
 * the app open or not. Then the phone reads the crew's ping box back from the relay and looks
 * for its own signed ping: only when it's really there does the watch hear "sent".
 *
 * "Need help" (and the "I'm OK now" that follows one) is free for everyone. It never reaches
 * the Moshpoint+ check below.
 */
internal object WatchPings {
    private class Done(val kind: Int, val handedAtSec: Long, var outcome: PingOutcome)

    /** Recent requests by number, so a retry of one that already went is never sent twice. */
    private val recent = object : LinkedHashMap<Int, Done>() {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Int, Done>?) = size > 16
    }

    /** Called on the Data Layer's own callback thread; returns once the watch has been answered. */
    fun handle(c: Context, watch: String, m: WatchMessage.Ping) {
        val app = c.applicationContext
        val outcome = runBlocking {
            withTimeoutOrNull(ANSWER_WITHIN_MS) { runCatching { process(app, m) }.getOrDefault(PingOutcome.FAILED) } ?: PingOutcome.UNCONFIRMED
        }
        DebugStatus.log("Wrist ping ${m.kind}: $outcome")
        WatchLink.send(app, watch, WatchMessage.PingResult(m.requestId, outcome))
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
        val before = synchronized(recent) { recent[m.requestId] }
        if (before != null) {
            if (before.outcome == PingOutcome.SENT) return PingOutcome.SENT
            // A retry: the first try may have gone after all. Look before sending it again.
            if (onRelay(app, before.kind, before.handedAtSec, tries = 1)) return PingOutcome.SENT.also { before.outcome = it }
        }
        val handedAtSec = withContext(Dispatchers.Main) {
            // The app may not be open: load what the ping path needs, as the live service does.
            FriendsRepository.init(app)
            if (GroupSync.group.value == null) GroupSync.load(app)
            if (GroupSync.group.value == null) return@withContext null
            val here = CrewStatus.myLocation(app)
            GroupSync.sendPing(app, crewKind, here?.latitude, here?.longitude)
            System.currentTimeMillis() / 1000
        } ?: return PingOutcome.NO_CREW
        val done = Done(crewKind, handedAtSec, PingOutcome.UNCONFIRMED)
        synchronized(recent) { recent[m.requestId] = done }
        if (onRelay(app, crewKind, handedAtSec, tries = 4)) done.outcome = PingOutcome.SENT
        return done.outcome
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
}
