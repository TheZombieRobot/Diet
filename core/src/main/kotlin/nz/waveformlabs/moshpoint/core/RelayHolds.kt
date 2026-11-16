package nz.waveformlabs.moshpoint.core

/**
 * What our relay's "too many" (429) holds back, by the limit its `X-Moshpoint-Limit` names
 * (docs/RELAY_API.md sections 1, 10 and 11.2):
 *
 * - `client` / `address`: this install (or everyone behind its address) is over its request
 *   limit. **Everything** waits `Retry-After` seconds: the app's whole-client pause
 *   ([RelayBudget], given [Hold.All.ms]).
 * - `mailbox`: that one mailbox was written too often (or a moments mailbox is full for the
 *   day). **Only that mailbox** waits; everything else carries on.
 * - `bytes`: an hourly byte or upload budget. **Only that kind of traffic** waits (record puts,
 *   uploads or downloads: the kind of the request that hit it); lookups and the rest carry on.
 * - No header (an older relay), or one this build doesn't know: [Hold.Unknown], the app's pause
 *   as before (its own back-off, 5 to 30 s on our relay).
 *
 * Pure, with the clock passed in (any steady millisecond clock).
 */
class RelayHolds(private val random: () -> Double = Math::random) {
    /** What a request to the relay is, for holds. */
    enum class Traffic {
        /** Box and chat records going up (`PUT /v1/box`, `/v1/held`). */
        RECORDS,
        /** Moments and profile photos going up. */
        UPLOADS,
        /** Moments and profile photos coming down. */
        DOWNLOADS,
        /** Reading mailboxes, lists, anything else. */
        READS,
    }

    /** What a 429 asks of the app. */
    sealed class Hold {
        /** Everything waits [ms] (the whole-client pause). */
        class All(val ms: Long) : Hold()

        /** Only that mailbox, or that kind of traffic, waits; held here ([heldUntil]). */
        object Some : Hold()

        /** No (known) `X-Moshpoint-Limit`: the app's own pause, as before. */
        object Unknown : Hold()
    }

    private val mailboxes = LinkedHashMap<String, Long>()
    private val kinds = HashMap<Traffic, Long>()

    /**
     * A 429 answered a request of [traffic] (to [mailbox], its id as in the URL, if it has one).
     * [limit] and [retryAfter] are the answer's `X-Moshpoint-Limit` and `Retry-After` headers.
     */
    @Synchronized
    fun limited(limit: String?, retryAfter: String?, traffic: Traffic, mailbox: String?, nowMs: Long): Hold {
        val kind = limit?.trim()?.lowercase()
        return when (kind) {
            "client", "address" -> Hold.All(stretch(waitMs(retryAfter, CLIENT_DEFAULT_S)))
            "mailbox" -> {
                if (mailbox.isNullOrEmpty()) return Hold.Unknown
                prune(nowMs)
                if (mailboxes.size >= MAX_MAILBOXES) mailboxes.remove(mailboxes.keys.first())
                mailboxes[mailbox] = maxOf(mailboxes[mailbox] ?: 0L, nowMs + stretch(waitMs(retryAfter, MAILBOX_DEFAULT_S)))
                Hold.Some
            }
            "bytes" -> {
                hold(traffic, waitMs(retryAfter, BYTES_DEFAULT_S), nowMs)
                Hold.Some
            }
            else -> Hold.Unknown
        }
    }

    /**
     * A batch said one of its puts was over this client's record budget (status BYTES): record
     * puts wait as after a `bytes` 429 (the batch answer carries no `Retry-After`).
     */
    @Synchronized
    fun recordsOverBudget(nowMs: Long) = hold(Traffic.RECORDS, BYTES_DEFAULT_S * 1000, nowMs)

    /** A batch said a put's mailbox is busy (status MAILBOX): that mailbox waits, as after a `mailbox` 429. */
    @Synchronized
    fun mailboxBusy(mailbox: String, nowMs: Long) {
        prune(nowMs)
        if (mailboxes.size >= MAX_MAILBOXES) mailboxes.remove(mailboxes.keys.first())
        mailboxes[mailbox] = maxOf(mailboxes[mailbox] ?: 0L, nowMs + stretch(MAILBOX_DEFAULT_S * 1000))
    }

    /** Until when a request of [traffic] to [mailbox] must wait (0 = it may go now). */
    @Synchronized
    fun heldUntil(traffic: Traffic, mailbox: String?, nowMs: Long): Long {
        var until = kinds[traffic]?.takeIf { it > nowMs } ?: 0L
        if (!mailbox.isNullOrEmpty()) mailboxes[mailbox]?.let { if (it > nowMs) until = maxOf(until, it) }
        return until
    }

    private fun hold(traffic: Traffic, ms: Long, nowMs: Long) {
        kinds[traffic] = maxOf(kinds[traffic] ?: 0L, nowMs + stretch(ms))
    }

    private fun prune(nowMs: Long) {
        mailboxes.entries.removeAll { it.value <= nowMs }
    }

    /** Up to a quarter longer, so a crowd held together doesn't come back in step. */
    private fun stretch(ms: Long): Long = ms + (ms * 0.25 * random()).toLong()

    private fun waitMs(retryAfter: String?, defaultSec: Long): Long {
        val s = retryAfter?.trim()?.toLongOrNull()?.takeIf { it >= 0 } ?: defaultSec
        return s.coerceIn(1L, MAX_WAIT_S) * 1000
    }

    companion object {
        const val LIMIT_HEADER = "X-Moshpoint-Limit"
        const val RETRY_AFTER = "Retry-After"

        /** The relay's own `Retry-After` for each limit, used when the header is missing or garbled. */
        private const val CLIENT_DEFAULT_S = 5L
        private const val MAILBOX_DEFAULT_S = 10L
        private const val BYTES_DEFAULT_S = 60L

        /** However long a relay asks for, never more than 15 minutes (the longest the app ever waited before). */
        private const val MAX_WAIT_S = 15 * 60L
        private const val MAX_MAILBOXES = 256
    }
}
