package nz.waveformlabs.moshpoint.wear

import android.content.Context
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.filterIsInstance
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withTimeoutOrNull
import nz.waveformlabs.moshpoint.core.watch.PingKind
import nz.waveformlabs.moshpoint.core.watch.PingOutcome
import nz.waveformlabs.moshpoint.core.watch.WatchMessage
import nz.waveformlabs.moshpoint.core.watch.WatchProtocol

/** What became of a wrist ping, in the words the screen needs. */
enum class PingFate {
    SENDING,

    /** The relay has it: the whole crew gets it. */
    SENT,

    /** No signal on the phone, but a crew phone nearby has it. The rest of the crew don't yet. */
    NEARBY,

    /** In the phone's outbox with nowhere to go yet. It has not been sent. */
    WAITING,

    /** It never reached the phone. Nothing was sent. */
    OUT_OF_REACH,

    /** The phone took it but couldn't say where it got to, or never answered. */
    UNCONFIRMED,
    NO_CREW,

    /** Not Moshpoint+ (never the answer to Need help). */
    LOCKED;

    /** It reached someone: the relay, or at least a crew phone nearby. */
    val went: Boolean get() = this == SENT || this == NEARBY

    /** The phone's answer this stands for, for telling later news from old (see [PingOutcome.improvesOn]). */
    val outcome: PingOutcome
        get() = when (this) {
            SENT -> PingOutcome.SENT
            NEARBY -> PingOutcome.SENT_NEARBY
            WAITING -> PingOutcome.WAITING
            else -> PingOutcome.UNCONFIRMED
        }
}

/**
 * Wrist pings: hand the ping to the phone, then wait for the phone to say what became of it
 * (docs/WATCH.md, problem 8). The answer is never assumed: no hand-over means "not sent", no
 * answer in time means "not confirmed", and a ping still in the phone's outbox is "not sent yet".
 */
object Pings {
    /** @param requestId reuse it for a retry of the same ping, so the phone never sends it twice. */
    suspend fun send(context: Context, kind: PingKind, requestId: Int): PingFate = coroutineScope {
        // Listen before sending, so even an instant answer is heard.
        val answer = async(start = CoroutineStart.UNDISPATCHED) {
            withTimeoutOrNull(WatchProtocol.PING_ANSWER_TIMEOUT_MS) {
                PhoneLink.incoming.filterIsInstance<WatchMessage.PingResult>().first { it.requestId == requestId }
            }
        }
        if (!PhoneLink.send(context, WatchMessage.Ping(requestId, kind))) {
            answer.cancel()
            return@coroutineScope PingFate.OUT_OF_REACH
        }
        fateOf(answer.await()?.outcome)
    }

    /** The phone's answer ([outcome]; null if it never came) as the screen words it. */
    fun fateOf(outcome: PingOutcome?): PingFate = when (outcome) {
        PingOutcome.SENT -> PingFate.SENT
        PingOutcome.SENT_NEARBY -> PingFate.NEARBY
        PingOutcome.WAITING -> PingFate.WAITING
        PingOutcome.NO_CREW -> PingFate.NO_CREW
        PingOutcome.NOT_ENTITLED -> PingFate.LOCKED
        PingOutcome.UNCONFIRMED, PingOutcome.FAILED, PingOutcome.UNKNOWN, null -> PingFate.UNCONFIRMED
    }
}
