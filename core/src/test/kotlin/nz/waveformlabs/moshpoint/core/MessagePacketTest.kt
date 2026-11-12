package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MessagePacketTest {
    private val now = 1_800_000_000L
    private val group = GigGroup.create("Laneway", now * 1000)
    private val jo = CrewKeys.generate()

    private fun ping(kind: Int = GigGroup.Ping.COMING, text: String = "", t: Long = now, name: String = "Jo") =
        group.sealPing(GigGroup.Ping(kind, name, t, -36.8485, 174.7633, text = text), jo)

    @Test fun aSignedPingFitsOnePacketAndALongChatLineTakesTwo() {
        // The longest quick ping: a 24-byte name, no text.
        val quick = ping(name = "A".repeat(24))
        assertTrue(quick.size <= MessagePacket.MAX_PAYLOAD, "quick ping is ${quick.size}")
        assertEquals(1, MessagePacket.split(quick, 5).size)
        // The longest chat line the app sends: 160 bytes of text.
        val long = ping(GigGroup.Ping.CHAT, "🎸".repeat(40), name = "A".repeat(24))
        assertTrue(long.size > MessagePacket.MAX_PAYLOAD && long.size <= MessagePacket.MAX_SEALED, "long chat is ${long.size}")
        val parts = MessagePacket.split(long, 0)
        assertEquals(2, parts.size)
        parts.forEach { assertTrue(it.encode().size <= MessagePacket.MAX_SIZE) }
        // Too long to send at all.
        assertTrue(MessagePacket.split(ByteArray(MessagePacket.MAX_SEALED + 1), 0).isEmpty())
    }

    @Test fun encodeDecode() {
        val sealed = ping()
        val p = MessagePacket.split(sealed, 4).single()
        val back = assertNotNull(MessagePacket.decode(p.encode()))
        assertEquals(4, back.ttl)
        assertContentEquals(sealed, back.payload)
        assertEquals(now, back.timeSec)
        assertEquals(p.relayKey, back.relayKey)
        // One fewer hop is the same packet to a relay.
        assertEquals(p.relayKey, p.hop()!!.relayKey)
        assertEquals(3, p.hop()!!.ttl)
        assertNull(MessagePacket(0, 0, 1, sealed).hop())
        // Rubbish in, nothing out.
        assertNull(MessagePacket.decode(ByteArray(0)))
        assertNull(MessagePacket.decode(byteArrayOf(2, 1, 0)))
        assertNull(MessagePacket.decode(byteArrayOf(2, 9, 0, 1, 2, 3))) // more hops than allowed
        assertNull(MessagePacket.decode(byteArrayOf(2, 1, 0x31, 1, 2, 3))) // fragment 3 of 2
        assertNull(MessagePacket.decode(ByteArray(MessagePacket.MAX_SIZE + 1) { 2 }))
    }

    @Test fun olderPhonesIgnoreVersionTwoAndViceVersa() {
        // Whatever its size, even exactly the 48 bytes a location packet has.
        for (size in listOf(20, 45, 150, 197)) {
            val v2 = MessagePacket(3, 0, 1, ByteArray(size) { 7 }).encode()
            assertNull(RelayPacket.decode(v2), "a version 1 phone must drop a ${v2.size}-byte version 2 packet")
        }
        assertEquals(RelayPacket.SIZE, MessagePacket(3, 0, 1, ByteArray(45)).encode().size)
        // And a location packet isn't mistaken for a message.
        val id = EphemeralId(ByteArray(32) { 4 }).currentId(now * 1000)
        val v1 = RelayPacket(3, id, LocationBox.seal(ByteArray(32) { 4 }, id, SharedLocation(-36.8, 174.7, now, 10))).encode()
        assertNull(MessagePacket.decode(v1))
        assertNotNull(RelayPacket.decode(v1))
    }

    @Test fun fragmentsGoBackTogetherInEitherOrder() {
        val long = ping(GigGroup.Ping.CHAT, "x".repeat(150))
        val (a, b) = MessagePacket.split(long, 0)
        val r = Reassembly()
        assertNull(r.offer(b, 0))
        assertContentEquals(long, r.offer(a, 10))
        assertEquals("x".repeat(150), group.openPing(r.offer(a, 20).let { r.offer(b, 30)!! })!!.text)
        // Half a message is forgotten after a minute.
        val r2 = Reassembly()
        assertNull(r2.offer(a, 0))
        assertNull(r2.offer(MessagePacket.split(ping(GigGroup.Ping.CHAT, "y".repeat(150)), 0)[1], 61_000))
        assertNull(r2.offer(b, 62_000))
        // A fragment of something else with the same key can't complete it.
        val fake = MessagePacket(0, 1, 2, a.payload.copyOf(4) + ByteArray(50))
        val r3 = Reassembly()
        r3.offer(a, 0)
        assertNull(r3.offer(fake, 1))
    }

    @Test fun aRelayThatCannotReadItLearnsNothingAboutTheCrew() {
        // Two pings from the same person in the same crew share nothing a listener can match on.
        val one = MessagePacket.split(ping(t = now), 5).single().encode()
        val two = MessagePacket.split(ping(t = now), 5).single().encode()
        // Same time, so the first 4 payload bytes match (the timestamp); nothing after that should.
        val same = (7 until minOf(one.size, two.size)).count { one[it] == two[it] }
        assertTrue(same < 12, "$same matching bytes after the timestamp")
        assertNotEquals(MessagePacket.decode(one)!!.relayKey, MessagePacket.decode(two)!!.relayKey)
    }

    // ---- What a stranger's phone does with a packet ----

    @Test fun relayPassesEachPacketOnTwiceWithOneFewerHop() {
        val relay = MessageRelay()
        val p = MessagePacket.split(ping(), 4).single()
        assertTrue(relay.offer(p, now))
        assertFalse(relay.offer(p, now + 1), "heard again")
        assertFalse(relay.offer(p.hop()!!, now + 2), "the same packet coming back with fewer hops")
        assertEquals(3, relay.next(now + 3)!!.ttl)
        assertEquals(3, relay.next(now + 9)!!.ttl)
        assertNull(relay.next(now + 15))
        assertFalse(relay.offer(p, now + 20), "and it isn't taken up again afterwards")
    }

    @Test fun relayNeverPassesOnChatOrFragmentsOrStaleOrFuturePackets() {
        val relay = MessageRelay()
        assertFalse(relay.offer(MessagePacket.split(ping(GigGroup.Ping.CHAT, "hi"), 0).single(), now), "no hops left")
        assertFalse(relay.offer(MessagePacket.split(ping(GigGroup.Ping.CHAT, "x".repeat(150)), 3)[0], now), "a fragment")
        assertFalse(relay.offer(MessagePacket.split(ping(t = now - 2 * 3600), 3).single(), now), "two hours old")
        assertFalse(relay.offer(MessagePacket.split(ping(t = now + 600), 3).single(), now), "stamped ten minutes ahead")
        assertTrue(relay.offer(MessagePacket.split(ping(t = now + 60), 3).single(), now), "clocks a little apart is fine")
        assertEquals(1, relay.waitingCount())
    }

    @Test fun relayLimitsHowMuchItTakesFromTheAir() {
        val relay = MessageRelay(maxEntries = 4, perMinute = 6)
        var taken = 0
        repeat(20) { if (relay.offer(MessagePacket.split(ping(text = "flood $it"), 5).single(), now)) taken++ }
        assertEquals(6, taken, "six new packets a minute, however many are shouted at it")
        assertEquals(4, relay.waitingCount(), "and only so many waiting")
        // A minute later it takes some more.
        assertTrue(relay.offer(MessagePacket.split(ping(text = "later"), 5).single(), now + 61))
    }

    @Test fun ourOwnPacketsAreNotPassedOnWhenTheyComeBack() {
        val relay = MessageRelay()
        val p = MessagePacket.split(ping(), 5).single()
        relay.know(p, now)
        assertFalse(relay.offer(p.hop()!!, now + 3))
    }

    // ---- Whose turn it is in the relay's advertising set ----

    private fun turns(seconds: Int, messageWaiting: Boolean): List<RelaySchedule.Slot> {
        val s = RelaySchedule()
        val out = ArrayList<RelaySchedule.Slot>()
        var ms = now * 1000
        while (ms < (now + seconds) * 1000) {
            val slot = s.next(ms / 1000, messageWaiting)
            out += slot
            ms += slot.holdMs
        }
        return out
    }

    @Test fun withNoMessagesTheRelayBehavesExactlyAsBefore() {
        // Before: our own location on every third second, a heard one otherwise, one second each.
        val s = RelaySchedule()
        for (t in now until now + 60) {
            val slot = s.next(t, messageWaiting = false)
            assertEquals(1_000L, slot.holdMs)
            assertEquals(if (t % 3 == 0L) RelaySchedule.Turn.OWN_LOCATION else RelaySchedule.Turn.HEARD_LOCATION, slot.turn)
        }
    }

    @Test fun underTheHeaviestMessageLoadLocationsAreNeverStarved() {
        val slots = turns(600, messageWaiting = true)
        var sinceOwn = 0L
        var worstGap = 0L
        var heard = 0
        var messages = 0
        for (s in slots) {
            when (s.turn) {
                RelaySchedule.Turn.OWN_LOCATION -> { worstGap = maxOf(worstGap, sinceOwn); sinceOwn = 0L }
                RelaySchedule.Turn.HEARD_LOCATION -> heard++
                RelaySchedule.Turn.MESSAGE -> messages++
            }
            sinceOwn += s.holdMs
        }
        assertTrue(worstGap <= 8_500L, "our own location went ${worstGap} ms without a turn")
        assertTrue(heard >= messages, "the crowd's locations got $heard turns to $messages messages")
        // A message is on air long enough for a phone listening half a second in every five.
        slots.filter { it.turn == RelaySchedule.Turn.MESSAGE }.forEach { assertTrue(it.holdMs >= 5_120 + 250) }
        // Never two messages back to back.
        slots.zipWithNext().forEach { (a, b) -> assertFalse(a.turn == RelaySchedule.Turn.MESSAGE && b.turn == RelaySchedule.Turn.MESSAGE) }
    }

    @Test fun aMessageGoesOutStraightAwayThenLocationsCatchUp() {
        val s = RelaySchedule()
        repeat(5) { s.next(now + it, false) }
        assertEquals(RelaySchedule.Turn.MESSAGE, s.next(now + 5, true).turn)
        assertEquals(RelaySchedule.Turn.OWN_LOCATION, s.next(now + 11, true).turn)
        assertNotEquals(RelaySchedule.Turn.MESSAGE, s.next(now + 12, true).turn)
        assertNotEquals(RelaySchedule.Turn.MESSAGE, s.next(now + 13, true).turn)
        assertEquals(RelaySchedule.Turn.MESSAGE, s.next(now + 14, true).turn)
    }
}
