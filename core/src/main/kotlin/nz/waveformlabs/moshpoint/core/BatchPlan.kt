package nz.waveformlabs.moshpoint.core

/**
 * One batch a minute (docs/RELAY_API.md sections 9 and 11.4, performance P0-2): what this phone
 * sends to our own relay in one `POST /v1/batch` instead of a request every few seconds, so the
 * mobile radio can idle between minutes.
 *
 * - **Never in a batch: safety.** Need help, Check in and Home safe ([RelayUse.SAFETY]) go at
 *   once, on their own, exactly as before ([route]). So does the last-gasp location at 5%.
 * - **Puts** wait here for the minute's batch: location shares, floor boxes, crowd-relay packets
 *   and crew intros (**replaceable**: each rotating id at most once per batch, the newest copy),
 *   and the courier's crew messages that aren't safety (each one goes; none replaces another).
 *   Something someone is waiting for ([Timing.SOON]: a message just typed, our position while a
 *   mate is looking for us) goes within a couple of seconds, with everything else that's waiting.
 * - **Gets** are the crew sync's mailboxes; they go first (they're why the sync asks), then the
 *   oldest puts that still fit (200 ops, 512 KB). What doesn't fit goes straight after.
 * - A batch that got no answer puts its replaceable puts back, unless a newer copy is already
 *   waiting; one waiting longer than [keepMs] isn't worth sending any more.
 *
 * Pure, with the clock passed in (any steady millisecond clock). Not thread-safe: the app calls
 * it under one lock.
 */
class BatchPlan(
    private val everyMs: Long = 60_000L,
    private val soonMs: Long = 1_500L,
    private val keepMs: Long = 10 * 60_000L,
    private val maxOps: Int = RelayWire.MAX_OPS,
    private val maxBody: Int = RelayWire.MAX_BODY,
) {
    /** How a request to our relay travels. */
    enum class Route {
        /** Straight away, on its own, as before: safety, and anything when batches can't be used. */
        ALONE,
        /** In the next batch. */
        BATCH,
    }

    /** How soon a put should go. */
    enum class Timing {
        /** With the minute's batch. */
        MINUTE,
        /** Within a couple of seconds (someone is waiting for it), taking everything else waiting with it. */
        SOON,
    }

    /**
     * A record waiting for the batch, for mailbox [id] ([held] = the chat kind). [replaceable]: only
     * the newest copy for its id matters (a location, floor box, crowd-relay packet or intro).
     * [key] lets the caller find its answer (0 = nobody waits for it).
     */
    class Put(val id: ByteArray, val record: ByteArray, val held: Boolean, val replaceable: Boolean, val key: Long = 0L) {
        internal var queuedAtMs = 0L
        internal val idKey: String = (if (held) "h" else "b") + id.joinToString("") { "%02x".format(it) }
        val op: RelayWire.Op = RelayWire.put(held, id, record)
    }

    /** A mailbox to read in the batch; [since] its cursor (0 = everything). */
    class Get(val id: ByteArray, val held: Boolean, val since: Long) {
        val op: RelayWire.Op = RelayWire.get(held, id, since)
    }

    /** A batch to send: [ops] in order (its [puts], then its [gets]); [dropped] were too old to send. */
    class Taken(val puts: List<Put>, val gets: List<Get>, val dropped: List<Put>) {
        val ops: List<RelayWire.Op> get() = puts.map { it.op } + gets.map { it.op }
        val isEmpty: Boolean get() = puts.isEmpty() && gets.isEmpty()
    }

    private val queue = ArrayList<Put>()
    private var soonAtMs = Long.MAX_VALUE

    /** Puts waiting. */
    val waiting: Int get() = queue.size

    /**
     * Queue [p] for the batch. Returns the put it replaced (an older copy for the same rotating
     * id, never sent now), or null.
     */
    fun add(p: Put, timing: Timing, nowMs: Long): Put? {
        p.queuedAtMs = nowMs
        var replaced: Put? = null
        if (p.replaceable) {
            val i = queue.indexOfFirst { it.replaceable && it.idKey == p.idKey }
            if (i >= 0) replaced = queue.removeAt(i)
        }
        queue += p
        if (timing == Timing.SOON) soonAtMs = minOf(soonAtMs, nowMs + soonMs)
        return replaced
    }

    /**
     * When the app should send a batch by itself if no crew sync takes the puts first:
     * [Long.MAX_VALUE] with nothing waiting.
     */
    fun dueAtMs(): Long {
        if (queue.isEmpty()) return Long.MAX_VALUE
        return minOf(soonAtMs, queue.minOf { it.queuedAtMs } + everyMs)
    }

    /**
     * The next batch: all of [gets] first, then the oldest puts that fit in [maxOps] and
     * [maxBody] and [mayGo] now (not waiting out a busy mailbox or a byte budget: those stay, in
     * order). Taken puts leave the queue; replaceable ones waiting over [keepMs] are dropped. If
     * puts that may go are left over, the next batch is due straight away (in [soonMs]).
     */
    fun take(gets: List<Get>, nowMs: Long, mayGo: (Put) -> Boolean = { true }): Taken {
        require(gets.size <= maxOps) { "at most $maxOps gets" }
        val dropped = queue.filter { it.replaceable && nowMs - it.queuedAtMs > keepMs }
        queue.removeAll(dropped.toSet())
        var ops = gets.size
        var bytes = RelayWire.batchSize(gets.map { it.op })
        val puts = ArrayList<Put>()
        var full = false
        for (p in queue) {
            if (!mayGo(p)) continue
            if (ops + 1 > maxOps || bytes + p.op.size > maxBody) {
                full = true
                break
            }
            puts += p
            ops++
            bytes += p.op.size
        }
        queue.removeAll(puts.toSet())
        soonAtMs = if (full) nowMs + soonMs else Long.MAX_VALUE
        return Taken(puts, gets, dropped)
    }

    /**
     * Someone is waiting: a message of ours was just written. Everything waiting goes within a
     * couple of seconds, as with [Timing.SOON]. The courier's messages waiting here hold its
     * upload slots, so the one just written may not have reached the queue yet: it can only start
     * once these have gone (docs/WAVE2C_REVIEW.md, F5).
     */
    fun hurry(nowMs: Long) {
        if (queue.isNotEmpty()) soonAtMs = minOf(soonAtMs, nowMs + soonMs)
    }

    /** Take the put with [key] out of the queue (its sender stopped waiting). True if it was still waiting. */
    fun cancel(key: Long): Boolean = key != 0L && queue.removeAll { it.key == key }

    /**
     * A batch got no answer: its replaceable [puts] wait again (in their old order, ahead of
     * newer ones), unless a newer copy is already waiting or they're too old. The courier's
     * messages don't come back here: the courier decides when to try those again.
     */
    fun putBack(puts: List<Put>, nowMs: Long) {
        val back = puts.filter { p ->
            p.replaceable && nowMs - p.queuedAtMs <= keepMs && queue.none { it.replaceable && it.idKey == p.idKey }
        }
        queue.addAll(0, back)
    }

    /** Everything waiting, taken out (to send one by one when this relay has no batches). */
    fun drain(): List<Put> = queue.toList().also {
        queue.clear()
        soonAtMs = Long.MAX_VALUE
    }

    companion object {
        /** Safety never waits for a batch: it goes at once, on its own, exactly as before. */
        fun route(use: RelayUse): Route = if (use == RelayUse.SAFETY) Route.ALONE else Route.BATCH

        /**
         * A put was just queued, and the batch was due at [dueBeforeMs] ([dueAtMs] before it;
         * [Long.MAX_VALUE] with nothing waiting) and is due at [dueAfterMs] now. Must the app's
         * flusher, asleep until the batch was due (with nothing waiting, until woken), be woken to
         * look again? Whenever the batch is due sooner: a put someone is waiting for, and just as
         * much the first put into an empty queue, which is due in a minute (docs/WAVE2C_REVIEW.md, F1).
         */
        fun wakes(dueBeforeMs: Long, dueAfterMs: Long): Boolean = dueAfterMs < dueBeforeMs
    }
}
