package nz.waveformlabs.moshpoint.core

/**
 * Which of our relay's new endpoints this phone may use (docs/RELAY_API.md section 11): an older
 * relay answers them `404`, and then the app falls back to the old endpoint, exactly as before.
 *
 * - Only for our own relay: with none (blank base, the free public relay) nothing new is used.
 * - After a `404` (or `405`), a `400` (the relay can't read what we sent) or an answer we can't
 *   read, the old endpoint is used for an hour, then the new one is tried again (the relay may
 *   have been updated meanwhile). Per relay: a phone moved to another relay tries it afresh.
 *
 * Pure, with the clock passed in (any steady millisecond clock).
 */
class RelayEndpoints(private val retryMs: Long = 3_600_000L) {
    enum class Endpoint {
        /** `POST /v1/heldsince` (cursors), else `POST /v1/heldlookup`. */
        HELD_SINCE,
        /** `POST /v1/batch`, else one request per put and `POST /v1/lookup`. */
        BATCH,
    }

    private val missing = HashMap<Endpoint, Pair<String, Long>>()

    /** May the app use [e] on the relay at [base] now? */
    @Synchronized
    fun usable(e: Endpoint, base: String, nowMs: Long): Boolean {
        if (base.isEmpty()) return false
        val (where, at) = missing[e] ?: return true
        return where != base || nowMs < at || nowMs - at >= retryMs
    }

    /** [base] answered a request to [e] with HTTP [code] (or [unreadable]: an answer that isn't one). Returns true if [e] counts as missing now. */
    @Synchronized
    fun answered(e: Endpoint, base: String, code: Int, nowMs: Long, unreadable: Boolean = false): Boolean {
        if (unreadable || code == 404 || code == 405 || code == 400) {
            missing[e] = base to nowMs
            return true
        }
        if (code in 200..299) missing.remove(e)
        return false
    }
}
