package nz.waveformlabs.moshpoint.core

import java.nio.ByteBuffer
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Chat cursors (docs/RELAY_API.md section 8): the copy kept here must always read exactly like
 * the relay's mailbox read whole (`/v1/heldlookup`, newest first), whatever arrives in what order.
 */
class HeldMirrorTest {
    /** A tiny relay chat store, as server/MailboxStore keeps it: seq numbers, 200 per id, same bytes = newest. */
    private class Relay(start: Long = 1_000_000L) {
        var seq = start
        val rows = ArrayList<Triple<Long, String, ByteArray>>()

        fun put(id: String, data: ByteArray) {
            rows.removeAll { it.second == id && it.third.contentEquals(data) }
            rows += Triple(++seq, id, data)
            val mine = rows.filter { it.second == id }
            if (mine.size > 200) rows.removeAll(mine.take(mine.size - 200).toSet())
        }

        /** What `/v1/heldlookup` answers: newest first. */
        fun whole(id: String) = rows.filter { it.second == id }.sortedByDescending { it.first }.map { it.third }

        /** What `/v1/heldsince` answers for one id, at most [room] records (then MORE). */
        fun since(id: String, asked: Long, room: Int = Int.MAX_VALUE): RelayWire.Block {
            val from = if (asked > seq || asked < 0) 0L else asked
            val new = rows.filter { it.second == id && it.first > from }.sortedBy { it.first }
            if (new.size > room) return RelayWire.Block(RelayWire.MORE, new[room - 1].first, new.take(room).map { it.third })
            return RelayWire.Block(RelayWire.OK, seq, new.map { it.third })
        }
    }

    private fun msg(n: Int) = ByteBuffer.allocate(20).putInt(n).array()

    private fun HeldMirror.poll(relay: Relay, id: String, now: Long = 0L, room: Int = Int.MAX_VALUE): Int {
        var rounds = 0
        do {
            val asked = cursor(id)
            rounds++
        } while (apply(id, asked, relay.since(id, asked, room), now))
        return rounds
    }

    private fun assertSame(relay: Relay, m: HeldMirror, id: String) {
        val want = relay.whole(id)
        val got = m.newestFirst(id, 0L)
        assertEquals(want.size, got.size)
        want.zip(got).forEach { (a, b) -> assertContentEquals(a, b) }
    }

    @Test fun aPollWithNothingNewDownloadsNothingAndStillReadsWhole() {
        val relay = Relay()
        val m = HeldMirror()
        val id = "chat"
        repeat(30) { relay.put(id, msg(it)) }
        m.poll(relay, id)
        assertSame(relay, m, id)
        val before = m.cursor(id)
        // Nothing new: an empty block, the cursor stays, and the reader still sees all 30.
        val block = relay.since(id, before)
        assertEquals(0, block.records.size)
        assertFalse(m.apply(id, before, block, 0L))
        assertSame(relay, m, id)
        relay.put(id, msg(99))
        assertEquals(1, relay.since(id, m.cursor(id)).records.size, "only the new one comes")
        m.poll(relay, id)
        assertSame(relay, m, id)
    }

    @Test fun theSameBytesPostedAgainMoveToNewestAsOnTheRelay() {
        val relay = Relay()
        val m = HeldMirror()
        val id = "chat"
        repeat(5) { relay.put(id, msg(it)) }
        m.poll(relay, id)
        relay.put(id, msg(1)) // a helper uploads a message that's already there
        relay.put(id, msg(7))
        m.poll(relay, id)
        assertSame(relay, m, id)
        assertEquals(6, m.newestFirst(id, 0L).size)
    }

    @Test fun pastTwoHundredTheOldestGoAsOnTheRelay() {
        val relay = Relay()
        val m = HeldMirror()
        val id = "chat"
        repeat(150) { relay.put(id, msg(it)) }
        m.poll(relay, id)
        repeat(120) { relay.put(id, msg(1_000 + it)) }
        m.poll(relay, id)
        assertSame(relay, m, id)
        assertEquals(200, m.newestFirst(id, 0L).size)
    }

    @Test fun moreMeansAskAgainUntilEverythingIsHere() {
        val relay = Relay()
        val m = HeldMirror()
        val id = "chat"
        repeat(57) { relay.put(id, msg(it)) }
        assertEquals(6, m.poll(relay, id, room = 10), "57 records, 10 an answer: six asks")
        assertSame(relay, m, id)
    }

    @Test fun aRelayThatDoesNotKnowTheCursorSendsEverythingAndTheCopyStartsAgain() {
        val old = Relay(start = 5_000_000L)
        val m = HeldMirror()
        val id = "chat"
        repeat(10) { old.put(id, msg(it)) }
        m.poll(old, id)
        // The phone moves to a relay that has handed out fewer numbers (or was replaced): it
        // answers everything it has, with a next below our cursor.
        val other = Relay(start = 1_000L)
        repeat(3) { other.put(id, msg(500 + it)) }
        m.poll(other, id)
        assertSame(other, m, id)
        assertEquals(3, m.newestFirst(id, 0L).size, "the old relay's records are gone from the copy")
    }

    /**
     * Review finding F4 (docs/WAVE2C_REVIEW.md): the phone moves to another relay (a test build's
     * Settings, a crew's invite) whose store started after the first one's. Every start raises a
     * relay's numbers to the clock in microseconds, so our cursor is below its top: it takes the
     * cursor as its own and sends only what's newer. The copy must read like the new relay's
     * mailbox, not like both relays' mixed (the old one's messages would count as on the new one).
     */
    @Test fun aPhoneMovedToARelayThatStartedLaterReadsOnlyThatRelay() {
        val first = Relay(start = 1_000_000L)
        val later = Relay(start = 9_000_000L)
        val m = HeldMirror()
        val id = "chat"
        repeat(5) { first.put(id, msg(it)) }
        m.relay("https://first")
        m.poll(first, id)
        assertSame(first, m, id)
        repeat(3) { later.put(id, msg(500 + it)) }
        assertTrue(m.cursor(id) < later.seq, "our cursor looks like one of its own to the later relay")
        // The same mailbox id, asked of the relay now in use, as RelayClient.heldSince does.
        m.relay("https://later")
        assertEquals(0L, m.cursor(id), "asked from everything")
        m.poll(later, id)
        assertSame(later, m, id)
        // The same relay again keeps the copy: a poll with nothing new still downloads nothing.
        m.relay("https://later")
        assertEquals(0, later.since(id, m.cursor(id)).records.size)
        assertSame(later, m, id)
    }

    @Test fun startingAgainIsAlwaysSafe() {
        val relay = Relay()
        val m = HeldMirror()
        val id = "chat"
        repeat(10) { relay.put(id, msg(it)) }
        m.poll(relay, id)
        m.forget(id)
        assertEquals(0L, m.cursor(id), "forgotten: asked from everything")
        assertTrue(m.newestFirst(id, 0L).isEmpty())
        m.poll(relay, id)
        assertSame(relay, m, id)
    }

    @Test fun anAnswerToAnAskThatNoLongerFitsIsIgnored() {
        val relay = Relay()
        val m = HeldMirror()
        val id = "chat"
        repeat(3) { relay.put(id, msg(it)) }
        val first = relay.since(id, 0L)
        m.apply(id, 0L, first, 0L)
        relay.put(id, msg(3))
        // A late answer to an ask made from cursor 0 again: it would put old records after new ones.
        assertFalse(m.apply(id, 0L, relay.since(id, 0L), 0L))
        m.poll(relay, id)
        assertSame(relay, m, id)
        // A bad block (a wrong-size ask) changes nothing.
        assertFalse(m.apply(id, m.cursor(id), RelayWire.Block(RelayWire.BAD, 0L, emptyList()), 0L))
        assertSame(relay, m, id)
    }

    @Test fun idleMailboxesAndTheMemoryCapForgetButNeverThePollJustRead() {
        val relay = Relay()
        val m = HeldMirror(maxBytes = 1_000, idleMs = 1_000L)
        repeat(4) { i -> repeat(10) { relay.put("box$i", msg(i * 100 + it)) } }
        m.poll(relay, "box0", now = 0L)
        m.trim(listOf("box0"), 0L)
        m.poll(relay, "box1", now = 2_000L)
        m.trim(listOf("box1"), 2_000L)
        assertEquals(0L, m.cursor("box0"), "idle over a second: forgotten")
        assertEquals(1, m.size())
        // 20 bytes a record, 10 records a box: two boxes are 400 bytes, four would be 800, under 1,000.
        m.poll(relay, "box2", now = 2_100L)
        m.poll(relay, "box3", now = 2_200L)
        m.trim(listOf("box2", "box3"), 2_200L)
        assertEquals(3, m.size())
        val tight = HeldMirror(maxBytes = 300)
        listOf("box0", "box1").forEachIndexed { i, b -> tight.poll(relay, b, now = i.toLong()) }
        tight.trim(listOf("box1"), 1L)
        assertEquals(0L, tight.cursor("box0"), "over the cap: the least recently used goes")
        assertTrue(tight.cursor("box1") > 0, "never the one just read")
        tight.trim(listOf("box1"), 1L)
        assertSame(relay, tight, "box1")
    }

    @Test fun heldSinceBytesRoundTrip() {
        val id = ByteArray(16) { it.toByte() }
        val body = RelayWire.heldSince(listOf(id to 0x0102030405060708L))
        assertEquals(24, body.size)
        assertContentEquals(id, body.copyOfRange(0, 16))
        assertEquals(0x0102030405060708L, ByteBuffer.wrap(body, 16, 8).long)
        // An answer: version 1, two blocks.
        val r = byteArrayOf(1, 2) +
            byteArrayOf(0) + ByteBuffer.allocate(10).putLong(77L).putShort(2).array() +
            byteArrayOf(0, 3, 9, 8, 7) + byteArrayOf(0, 1, 5) +
            byteArrayOf(1) + ByteBuffer.allocate(10).putLong(9L).putShort(0).array()
        val blocks = RelayWire.parseHeldSince(r, 2)!!
        assertEquals(RelayWire.OK, blocks[0].status)
        assertEquals(77L, blocks[0].next)
        assertContentEquals(byteArrayOf(9, 8, 7), blocks[0].records[0])
        assertContentEquals(byteArrayOf(5), blocks[0].records[1])
        assertEquals(RelayWire.MORE, blocks[1].status)
        assertNull(RelayWire.parseHeldSince(r, 3), "a block short")
        assertNull(RelayWire.parseHeldSince(r + 0, 2), "a byte over")
        assertNull(RelayWire.parseHeldSince(r.copyOf(r.size - 1), 2), "cut off")
        assertNull(RelayWire.parseHeldSince(byteArrayOf(), 1))
    }

    @Test fun endpointsFallBackOnAnOlderRelayAndTryAgainAfterAnHour() {
        val e = RelayEndpoints()
        val held = RelayEndpoints.Endpoint.HELD_SINCE
        assertFalse(e.usable(held, "", 0L), "never for the free public relay")
        assertTrue(e.usable(held, "https://a", 0L))
        assertTrue(e.answered(held, "https://a", 404, 0L))
        assertFalse(e.usable(held, "https://a", 3_599_999L))
        assertTrue(e.usable(RelayEndpoints.Endpoint.BATCH, "https://a", 1L), "each endpoint on its own")
        assertTrue(e.usable(held, "https://b", 1L), "another relay is tried afresh")
        assertTrue(e.usable(held, "https://a", 3_600_000L))
        assertFalse(e.answered(held, "https://a", 200, 3_600_000L))
        assertTrue(e.answered(held, "https://a", 200, 3_600_001L, unreadable = true))
        assertFalse(e.usable(held, "https://a", 3_600_002L))
        assertFalse(e.answered(held, "https://a", 503, 0L), "busy isn't missing")
        assertFalse(e.answered(held, "https://a", 429, 0L))
    }
}
