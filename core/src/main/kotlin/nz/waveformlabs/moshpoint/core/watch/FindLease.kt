package nz.waveformlabs.moshpoint.core.watch

/**
 * The phone's side of "keep finding while the watch asks" (docs/WATCH.md, problem 4).
 *
 * The watch doesn't switch the phone's finder on and hope to switch it off again: it holds a
 * lease and keeps renewing it. If the watch goes out of range, crashes or runs flat, the
 * renewals stop and the phone stops by itself [leaseMs] later. A hard cap means even a watch
 * that renews forever can't keep the phone's radios busy all night.
 */
class FindLease(
    private val leaseMs: Long = WatchProtocol.LEASE_MS,
    private val maxSessionMs: Long = WatchProtocol.PHONE_SESSION_MAX_MS,
) {
    sealed interface State {
        data object Idle : State

        /** Finding [mateId]; send an update every [intervalMs]. */
        data class Active(val sessionId: Int, val mateId: String, val fast: Boolean) : State {
            val intervalMs: Long get() = if (fast) WatchProtocol.FAST_INTERVAL_MS else WatchProtocol.SLOW_INTERVAL_MS
        }

        /** It just ran out: tell the watch why, then stop. Reported once. */
        data class Ended(val sessionId: Int, val reason: EndReason) : State
    }

    private var active: State.Active? = null
    private var startedAtMs = 0L
    private var renewedAtMs = 0L

    /** The watch's clock from its latest renewal and when (our clock) it arrived, for the echo. */
    var lastWatchClockMs = 0
        private set
    var lastHeardAtMs = Long.MIN_VALUE
        private set

    /** A new find, or the same one asked for again after the link dropped. */
    fun start(sessionId: Int, mateId: String, fast: Boolean, watchClockMs: Int, nowMs: Long) {
        val same = active?.let { it.sessionId == sessionId && it.mateId == mateId } == true
        if (!same) startedAtMs = nowMs
        active = State.Active(sessionId, mateId, fast)
        heard(watchClockMs, nowMs)
    }

    /** False if that session isn't the one running (the watch should start it again). */
    fun renew(sessionId: Int, fast: Boolean, watchClockMs: Int, nowMs: Long): Boolean {
        val a = active ?: return false
        if (a.sessionId != sessionId) return false
        active = a.copy(fast = fast)
        heard(watchClockMs, nowMs)
        return true
    }

    /** True if that was the running session. */
    fun stop(sessionId: Int): Boolean {
        if (active?.sessionId != sessionId) return false
        active = null
        return true
    }

    /** Stop whatever is running (the Stop button on the phone, the entitlement going...). */
    fun end(): State.Active? = active.also { active = null }

    fun state(nowMs: Long): State {
        val a = active ?: return State.Idle
        val reason = when {
            nowMs - renewedAtMs > leaseMs -> EndReason.LEASE_EXPIRED
            nowMs - startedAtMs > maxSessionMs -> EndReason.TIME_LIMIT
            else -> return a
        }
        active = null
        return State.Ended(a.sessionId, reason)
    }

    /** How long ago the echoed watch clock arrived, or -1 if there's nothing to echo. */
    fun echoHeldMs(nowMs: Long): Int =
        if (lastHeardAtMs == Long.MIN_VALUE) -1 else (nowMs - lastHeardAtMs).coerceIn(0, 60_000).toInt()

    private fun heard(watchClockMs: Int, nowMs: Long) {
        renewedAtMs = nowMs
        lastWatchClockMs = watchClockMs
        lastHeardAtMs = nowMs
    }
}
