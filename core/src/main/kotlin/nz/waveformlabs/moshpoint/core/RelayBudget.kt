package nz.waveformlabs.moshpoint.core

/** How an upload to the relay went. Only [SENT] means the relay has it. */
enum class PutResult {
    SENT,
    /** Nothing reached the relay (no network, timed out, or we're holding off). Costs no budget. */
    NO_NETWORK,
    /** The relay, or our own budget for it, said "too many". Try again later. */
    THROTTLED,
    /** The relay answered but wouldn't take it (bad size, full, server error). */
    REFUSED;

    val ok: Boolean get() = this == SENT
}

/** What a relay request is for. Decides how deep into the budget it may reach. */
enum class RelayUse {
    /** Location shares, intros, History copies, photos: useful, never urgent. */
    BACKGROUND,
    /** Crew chat, quick pings, pins, and messages carried for crew mates. */
    MESSAGE,
    /** Need help, Check in, Home safe. */
    SAFETY,
}

/**
 * Keeps this phone inside the free public relay's limits (about 250 messages a day and 12
 * requests a minute per internet address; we use 200 and 8 to leave room for other phones
 * behind the same address).
 *
 * Two things the old budget got wrong, which left the first phone back on signal unable to
 * upload anything:
 *  - It charged before connecting, so every retry with no signal spent the day's budget.
 *    Here a request is only charged once the relay has answered ([settle]).
 *  - Location shares could use every last message. Here the end of the budget is kept back:
 *    [BACKGROUND][RelayUse.BACKGROUND] stops first, then [MESSAGE][RelayUse.MESSAGE], and
 *    [SAFETY][RelayUse.SAFETY] can use it all.
 *
 * Pure logic with the clock passed in (any steady millisecond clock), so it's tested in core.
 */
class RelayBudget(
    private val messagesPerDay: Int = 200,
    private val requestsPerMinute: Int = 8,
    /** Messages a day that [RelayUse.BACKGROUND] may not touch. */
    private val messageReserve: Int = 50,
    /** Messages a day that only [RelayUse.SAFETY] may touch. */
    private val safetyReserve: Int = 10,
    /**
     * Requests a minute that [RelayUse.BACKGROUND] may not fill by itself: of 8, background
     * requests take at most 6. (Look-ups for an open chat aren't background, so they don't
     * squeeze location shares out; everything together still stops at 8.)
     */
    private val requestReserve: Int = 2,
    /**
     * Requests a minute kept for look-ups: uploads take at most the rest (of 8, 6). A queue
     * being flushed waits for room and takes every slot it can, and without this the phone
     * would see nothing new until it had finished. Safety pings may use these too.
     */
    private val lookUpReserve: Int = 2,
    /** After the relay says "too many": the first pause, and the longest. Our own server refills in seconds, so it gets short ones. */
    private val throttleBaseMs: Long = 60_000L,
    private val throttleMaxMs: Long = 15 * 60_000L,
    /** 0.0 ..< 1.0, for jitter (so a crowd regaining signal doesn't retry in step). */
    private val random: () -> Double = Math::random,
    /**
     * Look-ups (reading mailboxes: chat, pings, mates' positions) that got no answer this many
     * times in a row hold off: [lookUpQuietBaseMs], doubling each time, at most
     * [lookUpQuietMaxMs], each stretched by up to a quarter (docs/WAVE2C_BATTERY.md).
     */
    private val lookUpFreeFails: Int = 2,
    private val lookUpQuietBaseMs: Long = 5_000L,
    private val lookUpQuietMaxMs: Long = 30_000L,
    /**
     * Safety pings never count against [requestsPerMinute] (our own relay with batches: its cap
     * is low, and a busy minute must never hold up a Need help). Off for the public relay, whose
     * limits are real.
     */
    private val safetyAlwaysHasRoom: Boolean = false,
) {
    internal class Request(val atMs: Long, val background: Boolean, val message: Boolean)

    /** A request that has been allowed to start. Give it back to [settle] when it ends. */
    class Ticket internal constructor(internal val request: Request, internal val message: Boolean, internal val use: RelayUse, internal val duringPause: Boolean)

    enum class Outcome {
        /** The relay took it (2xx). */
        OK,
        /** The relay answered with a refusal other than "too many". */
        REFUSED,
        /** The relay said "too many" (429). */
        THROTTLED,
        /** No answer at all: no network, DNS failure, timeout. */
        NO_ANSWER,
    }

    private val requests = ArrayDeque<Request>()
    private var dayStartMs = Long.MIN_VALUE
    private var messages = 0
    private var throttledUntilMs = 0L
    private var throttleSetAtMs = Long.MIN_VALUE
    private var throttleStep = 0
    private var safetyInPauseAtMs = Long.MIN_VALUE / 2
    private var quietUntilMs = 0L
    private var quietStep = 0
    private var lookUpFails = 0
    private var lookUpQuietUntilMs = 0L

    /** Messages still available to [use] today. */
    @Synchronized
    fun messagesLeft(use: RelayUse, nowMs: Long): Int {
        rollDay(nowMs)
        return (messageCap(use) - messages).coerceAtLeast(0)
    }

    /** When the relay's "too many" pause, or (for background requests) our own hold-off after no answer, ends (0 = not waiting). */
    @Synchronized
    fun waitingUntil(use: RelayUse, nowMs: Long): Long {
        val until = maxOf(throttledUntilMs, if (use == RelayUse.BACKGROUND) quietUntilMs else 0L)
        return if (until > nowMs) until else 0L
    }

    /**
     * How long until this minute has room for the request: 0 = now. -1 = it's being held back
     * for another reason (a pause, or the day's limit), so waiting a few seconds won't help.
     */
    @Synchronized
    fun roomInMs(use: RelayUse, message: Boolean, nowMs: Long): Long {
        rollDay(nowMs)
        if (paused(use, nowMs) || (use == RelayUse.BACKGROUND && nowMs < quietUntilMs) || lookUpQuiet(use, message, nowMs)) return -1
        if (message && messages >= messageCap(use)) return -1
        prune(nowMs)
        var wait = 0L
        if (requests.size >= requestsPerMinute && !safetyRoom(use)) wait = requests.first().atMs + MINUTE_MS - nowMs
        if (use == RelayUse.BACKGROUND && requests.count { it.background } >= requestsPerMinute - requestReserve) {
            // (No background request to wait out means background has no share at all: waiting won't help.)
            val oldest = requests.firstOrNull { it.background } ?: return -1
            wait = maxOf(wait, oldest.atMs + MINUTE_MS - nowMs)
        }
        if (uploadsFull(use, message)) {
            val oldest = requests.firstOrNull { it.message } ?: return -1
            wait = maxOf(wait, oldest.atMs + MINUTE_MS - nowMs)
        }
        return wait.coerceAtLeast(0)
    }

    /**
     * Ask to make one request. [message] = it publishes something (counts towards the day).
     * Null means "not now": the caller reports [PutResult.THROTTLED] or [PutResult.NO_NETWORK]
     * (see [refusal]) without touching the network.
     */
    @Synchronized
    fun take(use: RelayUse, message: Boolean, nowMs: Long): Ticket? {
        if (refusalLocked(use, message, nowMs) != null) return null
        // Only a safety ping gets here during a pause (see [paused]).
        val duringPause = nowMs < throttledUntilMs
        if (duringPause) safetyInPauseAtMs = nowMs
        val request = Request(nowMs, use == RelayUse.BACKGROUND, message)
        requests.addLast(request)
        if (message) messages++
        return Ticket(request, message, use, duringPause)
    }

    /** Why [take] would say no right now, or null if it would say yes. */
    @Synchronized
    fun refusal(use: RelayUse, message: Boolean, nowMs: Long): PutResult? = refusalLocked(use, message, nowMs)

    private fun refusalLocked(use: RelayUse, message: Boolean, nowMs: Long): PutResult? {
        rollDay(nowMs)
        if (paused(use, nowMs)) return PutResult.THROTTLED
        // After no answer at all, background requests hold off for a moment (so retry loops
        // don't spin on a dead connection). Messages and look-ups still try: each has its own pace.
        if (use == RelayUse.BACKGROUND && nowMs < quietUntilMs) return PutResult.NO_NETWORK
        // Look-ups that keep getting no answer hold off too (uploads keep their own pace).
        if (lookUpQuiet(use, message, nowMs)) return PutResult.NO_NETWORK
        prune(nowMs)
        if (requests.size >= requestsPerMinute && !safetyRoom(use)) return PutResult.THROTTLED
        if (use == RelayUse.BACKGROUND && requests.count { it.background } >= requestsPerMinute - requestReserve) return PutResult.THROTTLED
        if (uploadsFull(use, message)) return PutResult.THROTTLED
        if (message && messages >= messageCap(use)) return PutResult.THROTTLED
        return null
    }

    private fun safetyRoom(use: RelayUse) = safetyAlwaysHasRoom && use == RelayUse.SAFETY

    /** A look-up: reading mailboxes (a [RelayUse.MESSAGE] request that publishes nothing). */
    private fun isLookUp(use: RelayUse, message: Boolean) = use == RelayUse.MESSAGE && !message

    private fun lookUpQuiet(use: RelayUse, message: Boolean, nowMs: Long) = isLookUp(use, message) && nowMs < lookUpQuietUntilMs

    /** Have uploads taken their share of this minute (the rest is kept for look-ups)? Call after [prune]. */
    private fun uploadsFull(use: RelayUse, message: Boolean): Boolean =
        message && use != RelayUse.SAFETY && requests.count { it.message } >= requestsPerMinute - lookUpReserve

    /** In the relay's "too many" pause? A safety ping still tries through it, one every [SAFETY_GAP_MS]. */
    private fun paused(use: RelayUse, nowMs: Long): Boolean =
        nowMs < throttledUntilMs && !(use == RelayUse.SAFETY && nowMs - safetyInPauseAtMs >= SAFETY_GAP_MS)

    private fun prune(nowMs: Long) {
        while (requests.isNotEmpty() && nowMs - requests.first().atMs >= MINUTE_MS) requests.removeFirst()
    }

    /**
     * The request ended. Only an answer from the relay costs anything. [pauseMs]: for
     * [Outcome.THROTTLED], how long the relay itself asked everything to wait (its `Retry-After`
     * for a `client` or `address` limit, docs/RELAY_API.md section 11.2); null = this budget's own
     * back-off, as before.
     */
    @Synchronized
    fun settle(ticket: Ticket, outcome: Outcome, nowMs: Long, pauseMs: Long? = null) {
        if (outcome != Outcome.NO_ANSWER) {
            // The relay answered: look-ups may go at their own pace again.
            lookUpFails = 0
            lookUpQuietUntilMs = 0L
        } else if (isLookUp(ticket.use, ticket.message) && ++lookUpFails >= lookUpFreeFails) {
            // With the defaults: after the second in a row 5 s, then 10, 20, and 30 at most.
            val base = minOf(lookUpQuietBaseMs shl (lookUpFails - lookUpFreeFails).coerceAtMost(4), lookUpQuietMaxMs)
            lookUpQuietUntilMs = nowMs + base + (base * 0.25 * random()).toLong()
        }
        when (outcome) {
            Outcome.OK -> {
                throttleStep = 0
                quietStep = 0
                quietUntilMs = 0L
            }
            Outcome.REFUSED -> {
                // It reached the relay (so the request counts) but nothing was published.
                if (ticket.message) messages = (messages - 1).coerceAtLeast(0)
                quietStep = 0
                quietUntilMs = 0L
            }
            Outcome.THROTTLED -> {
                if (ticket.message) messages = (messages - 1).coerceAtLeast(0)
                // Requests that were already on their way when the pause began, and a safety
                // ping sent through it, say nothing new. Only a request made after the last
                // pause was set makes the next one longer.
                if (!ticket.duringPause && ticket.request.atMs >= throttleSetAtMs) {
                    if (pauseMs != null) {
                        // The relay said how long (already stretched by the caller): no growing back-off.
                        throttledUntilMs = nowMs + pauseMs
                    } else {
                        // With the defaults: 1 min, 2, 4, 8, then 15 at most, each stretched by up to half again.
                        val base = minOf(throttleBaseMs shl throttleStep.coerceAtMost(4), throttleMaxMs)
                        throttledUntilMs = nowMs + base + (base * 0.5 * random()).toLong()
                        throttleStep++
                    }
                    throttleSetAtMs = nowMs
                }
            }
            Outcome.NO_ANSWER -> {
                // Never reached the relay: give everything back.
                requests.remove(ticket.request)
                if (ticket.message) messages = (messages - 1).coerceAtLeast(0)
                // 15 s, 30, 60, then 2 min at most, so retry loops don't spin with no signal.
                val base = minOf(15_000L shl quietStep.coerceAtMost(3), 120_000L)
                quietUntilMs = nowMs + base + (base * 0.25 * random()).toLong()
                quietStep++
            }
        }
    }

    /** The network just came back: try again straight away. */
    @Synchronized
    fun networkBack() {
        quietUntilMs = 0L
        quietStep = 0
        lookUpFails = 0
        lookUpQuietUntilMs = 0L
    }

    private fun messageCap(use: RelayUse) = when (use) {
        RelayUse.BACKGROUND -> messagesPerDay - messageReserve
        RelayUse.MESSAGE -> messagesPerDay - safetyReserve
        RelayUse.SAFETY -> messagesPerDay
    }

    private fun rollDay(nowMs: Long) {
        if (dayStartMs == Long.MIN_VALUE || nowMs - dayStartMs >= DAY_MS) {
            dayStartMs = nowMs
            messages = 0
        }
    }

    companion object {
        private const val DAY_MS = 24 * 3600_000L
        private const val MINUTE_MS = 60_000L
        private const val SAFETY_GAP_MS = 10_000L

        /**
         * Our own relay with batches (docs/RELAY_API.md section 11.6): the background's records
         * travel in one request a minute, so this is only a safety net against a runaway loop. It
         * counts every request, though, and much never rides in the batch: the finder's poll
         * every 4 s, the open chat's polls, moments, and profile photos (two asks per friend, every
         * 6 hours). So: the relay's own sustained rate for an install (120 a minute, section 10),
         * of which the background (downloads, photos, uploads) may take at most 90, so a burst of
         * it never refuses the minute's batch or the finder's poll (docs/WAVE2C_REVIEW.md, F3).
         * Safety pings never count against it.
         */
        fun withBatches(random: () -> Double = Math::random): RelayBudget = RelayBudget(
            messagesPerDay = 1_000_000, requestsPerMinute = 120, messageReserve = 0, safetyReserve = 0, requestReserve = 30,
            throttleBaseMs = 5_000L, throttleMaxMs = 30_000L, random = random, safetyAlwaysHasRoom = true,
        )
    }
}
