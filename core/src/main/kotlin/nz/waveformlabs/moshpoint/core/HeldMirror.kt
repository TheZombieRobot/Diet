package nz.waveformlabs.moshpoint.core

/**
 * Crew chat mailboxes as this phone last saw them, kept up to date with cursors
 * (`POST /v1/heldsince`, docs/RELAY_API.md sections 8 and 11.3), so a poll downloads only what's
 * new instead of up to 200 messages per mailbox every time (performance P1-8).
 *
 * The app's readers still get **the whole mailbox, newest first**, exactly as `/v1/heldlookup`
 * answers: the courier counts on seeing everything there (what's on the relay, how full today's
 * mailbox is, whether a crew mate's upload really landed). So each mailbox's records are kept
 * here the way the relay keeps them:
 *  - new records are added after the old (the relay sends them oldest first);
 *  - the same bytes posted again come back once more and count as newest (the relay drops the
 *    old copy), so the copy here moves to the end too;
 *  - at most 200 per mailbox: past that the oldest go, as on the relay.
 * The relay's 72 hours never matter here: a chat mailbox is read for two days at most (the day's
 * id and yesterday's), and one not asked about for [idleMs] is forgotten.
 *
 * Starting again is always safe: a mailbox that isn't here (first look, forgotten, the memory
 * cap) is asked for from cursor 0, which is everything, as before. A cursor the relay doesn't
 * know (it was replaced) comes back as everything with a `next` below what was asked: the copy
 * here starts again from that answer. Kept in memory only, so every start of the app begins with
 * one full fetch.
 *
 * Pure, with the clock passed in. Thread-safe; the app also asks one poll at a time, so answers
 * never cross.
 */
class HeldMirror(
    private val maxPerId: Int = 200,
    private val maxBytes: Long = 4L * 1024 * 1024,
    private val idleMs: Long = 6 * 3600_000L,
) {
    private class Box(var cursor: Long, var usedAtMs: Long) {
        /** Oldest first, as on the relay. */
        val records = ArrayList<ByteArray>()
        var bytes = 0L
    }

    private val boxes = LinkedHashMap<String, Box>()
    private var bytes = 0L

    /** The relay this copy is of. */
    private var relay = ""

    /**
     * The relay the next asks go to. A copy of another relay's mailboxes is dropped: its cursors
     * mean nothing to this one, and a relay whose store started later takes them as its own
     * (every start raises its numbers to the clock), so its answers would mix in with the old
     * copy (docs/WAVE2C_REVIEW.md, F4). The next ask of each mailbox is from everything.
     */
    @Synchronized
    fun relay(base: String) {
        if (base == relay) return
        relay = base
        boxes.clear()
        bytes = 0L
    }

    /** The cursor to ask mailbox [id] (hex) with: 0 = everything. */
    @Synchronized
    fun cursor(id: String): Long = boxes[id]?.cursor ?: 0L

    /**
     * The relay's [block] for mailbox [id], which was asked with cursor [asked]. Returns true if
     * the relay said MORE: ask again from the new [cursor] soon.
     */
    @Synchronized
    fun apply(id: String, asked: Long, block: RelayWire.Block, nowMs: Long): Boolean {
        if (block.status != RelayWire.OK && block.status != RelayWire.MORE) return false
        var box = boxes[id]
        // Asked with a cursor this copy no longer has (forgotten meanwhile): don't mix answers.
        if ((box?.cursor ?: 0L) != asked) return false
        if (box == null) box = Box(0L, nowMs).also { boxes[id] = it }
        if (asked > 0 && block.next < asked) {
            // The relay didn't know our cursor and sent everything: start again from this answer.
            bytes -= box.bytes
            box.records.clear()
            box.bytes = 0
        }
        for (r in block.records) {
            val i = box.records.indexOfFirst { it.contentEquals(r) }
            if (i >= 0) remove(box, i)
            box.records += r
            box.bytes += r.size
            bytes += r.size
        }
        while (box.records.size > maxPerId) remove(box, 0)
        box.cursor = block.next
        box.usedAtMs = nowMs
        return block.status == RelayWire.MORE
    }

    /** Everything in mailbox [id], newest first (as `/v1/heldlookup` answers). */
    @Synchronized
    fun newestFirst(id: String, nowMs: Long): List<ByteArray> {
        val box = boxes[id] ?: return emptyList()
        box.usedAtMs = nowMs
        return box.records.asReversed().toList()
    }

    /** Forget mailbox [id]: its next ask starts from everything. */
    @Synchronized
    fun forget(id: String) {
        boxes.remove(id)?.let { bytes -= it.bytes }
    }

    /** Mailboxes held now (tests and the debug panel). */
    @Synchronized
    fun size(): Int = boxes.size

    private fun remove(box: Box, i: Int) {
        val r = box.records.removeAt(i)
        box.bytes -= r.size
        bytes -= r.size
    }

    /**
     * After a poll: forget mailboxes idle for [idleMs], then the least recently used until the
     * copy is under its cap. Never one in [keep] (the poll that just ran), so a poll's answer is
     * never half forgotten while it's being read.
     */
    @Synchronized
    fun trim(keep: Collection<String>, nowMs: Long) {
        boxes.entries.removeAll { (k, b) -> k !in keep && nowMs - b.usedAtMs > idleMs && run { bytes -= b.bytes; true } }
        while (bytes > maxBytes) {
            val victim = boxes.entries.filter { it.key !in keep }.minByOrNull { it.value.usedAtMs } ?: break
            forget(victim.key)
        }
    }
}
