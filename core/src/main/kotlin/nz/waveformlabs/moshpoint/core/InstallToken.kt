package nz.waveformlabs.moshpoint.core

/**
 * The relay's install token (docs/RELAY_API.md sections 7 and 11.1), as a rule: when to ask our
 * own relay for one, which relay it belongs to, and when to drop it. Pure, with the clock passed
 * in (wall-clock milliseconds: the saved form outlives a restart); the app makes the requests and
 * keeps [save] in its prefs.
 *
 * - Asked for at first start, then kept. Sent only to the relay that issued it: a phone that
 *   moves to another relay (a test build's Settings) asks that one for its own.
 * - Never for the free public relay (blank [base]): it has no tokens.
 * - Asked at most once an hour, counting every ask the relay answered (a token, `429`, or `404`
 *   from an older relay). An ask that never reached it (no signal) may be tried again after a
 *   minute, so a first start in a basement still gets one soon after signal comes back.
 * - `X-Moshpoint-Token: invalid` drops it; the next ask is still at most once an hour.
 *
 * Without a token every request works as before (the address's limits), so nothing waits for one.
 */
class InstallToken(saved: String? = null) {
    private var relay = ""
    private var token = ""
    /** The relay the last answered ask went to, and when (Long.MIN_VALUE / 2 = never). */
    private var askedRelay = ""
    private var answeredAtMs = NEVER
    /** When the last ask started (in flight, or got no answer). Not saved. */
    private var triedAtMs = NEVER

    init {
        restore(saved)
    }

    /** The token to send to [base], or null (none, or it belongs to another relay). */
    @Synchronized
    fun tokenFor(base: String): String? = token.takeIf { it.isNotEmpty() && base.isNotEmpty() && relay == base }

    /** Should the app ask [base] for a token now? Call [asking] when it does. */
    @Synchronized
    fun shouldAsk(base: String, nowMs: Long): Boolean {
        if (base.isEmpty() || tokenFor(base) != null) return false
        if (nowMs >= triedAtMs && nowMs - triedAtMs < RETRY_MS) return false
        // A clock that went backwards doesn't block asking for good.
        return askedRelay != base || nowMs < answeredAtMs || nowMs - answeredAtMs >= ASK_GAP_MS
    }

    /** An ask is starting now. */
    @Synchronized
    fun asking(nowMs: Long) {
        triedAtMs = nowMs
    }

    /**
     * [base] answered the ask with HTTP [code] and [body]. Returns true if this changed what
     * [save] writes. Anything but a well-formed token (44 base64url characters) is a refusal.
     */
    @Synchronized
    fun answered(base: String, code: Int, body: String?, nowMs: Long): Boolean {
        askedRelay = base
        answeredAtMs = nowMs
        triedAtMs = NEVER
        val t = body?.trim()
        if (code == 200 && t != null && wellFormed(t)) {
            relay = base
            token = t
        }
        return true
    }

    /** The ask got no answer (no network, timed out, the relay's host answered 5xx): may ask again soon. */
    @Synchronized
    fun noAnswer(nowMs: Long) {
        triedAtMs = nowMs
    }

    /** An answer from [base] said `X-Moshpoint-Token: invalid`. Returns true if the token was dropped. */
    @Synchronized
    fun invalid(base: String): Boolean {
        if (token.isEmpty() || relay != base) return false
        token = ""
        relay = ""
        return true
    }

    /** One line for the app's prefs. */
    @Synchronized
    fun save(): String = listOf("1", relay, token, askedRelay, answeredAtMs.toString()).joinToString(SEP)

    private fun restore(saved: String?) {
        val p = saved?.split(SEP) ?: return
        if (p.size != 5 || p[0] != "1") return
        if (p[2].isEmpty() || wellFormed(p[2])) {
            relay = if (p[2].isEmpty()) "" else p[1]
            token = p[2]
        }
        askedRelay = p[3]
        answeredAtMs = p[4].toLongOrNull() ?: NEVER
    }

    companion object {
        const val HEADER = "X-Moshpoint-Token"
        const val INVALID = "invalid"
        const val ASK_GAP_MS = 3_600_000L
        const val RETRY_MS = 60_000L
        private const val NEVER = Long.MIN_VALUE / 2
        private const val SEP = "\n"
        private val SHAPE = Regex("^[A-Za-z0-9_-]{44}$")

        /** The relay's tokens are 44 base64url characters; nothing else goes into a header. */
        fun wellFormed(t: String): Boolean = SHAPE.matches(t)
    }
}
