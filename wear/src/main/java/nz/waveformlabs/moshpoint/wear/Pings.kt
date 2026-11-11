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

    /** The phone saw its own ping on the relay: it is out there. */
    SENT,

    /** It never reached the phone. Nothing was sent. */
    OUT_OF_REACH,

    /** The phone took it but couldn't confirm it went out (or never answered). */
    UNCONFIRMED,
    NO_CREW,

    /** Not Moshpoint+ (never the answer to Need help). */
    LOCKED,
}

/**
 * Wrist pings: hand the ping to the phone, then wait for the phone to say what became of it
 * (docs/WATCH.md, problem 8). The answer is never assumed: no hand-over means "not sent", and
 * no answer in time means "not confirmed".
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
        when (answer.await()?.outcome) {
            PingOutcome.SENT -> PingFate.SENT
            PingOutcome.NO_CREW -> PingFate.NO_CREW
            PingOutcome.NOT_ENTITLED -> PingFate.LOCKED
            PingOutcome.UNCONFIRMED, PingOutcome.FAILED, PingOutcome.UNKNOWN, null -> PingFate.UNCONFIRMED
        }
    }
}
