package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class CrowdRelayTest {
    private val now = 1_700_000_000L
    private val secret = ByteArray(32) { 4 }
    private val ids = EphemeralId(secret)

    private fun packet(timeSec: Long, ttl: Int = 3, epochOffset: Int = 0): RelayPacket {
        val id = ids.idForEpoch(ids.epochAt(now * 1000) + epochOffset)
        return RelayPacket(ttl, id, LocationBox.seal(secret, id, SharedLocation(-36.8, 174.7, timeSec, 10)))
    }

    @Test fun encodeDecode() {
        val p = packet(now)
        val bytes = p.encode()
        assertEquals(RelayPacket.SIZE, bytes.size)
        assertEquals(p, RelayPacket.decode(bytes))
        assertEquals(now, p.timeSec)
        assertNull(RelayPacket.decode(bytes.copyOf(10)))
    }

    @Test fun friendCanOpenRelayedBox() {
        val p = packet(now)
        val loc = assertNotNull(LocationBox.open(secret, p.id, p.sealed))
        assertEquals(now, loc.timeSec)
    }

    @Test fun keepsNewestAndDedupes() {
        val c = RelayCache()
        assertTrue(c.offer(packet(now - 30), now))
        assertFalse(c.offer(packet(now - 30), now)) // same again
        assertFalse(c.offer(packet(now - 60), now)) // older
        assertTrue(c.offer(packet(now - 5), now)) // newer
        assertEquals(now - 5, c.lookup(packet(now).id, now)!!.timeSec)
    }

    @Test fun dropsStaleAndFuture() {
        val c = RelayCache(maxAgeSec = 600)
        assertFalse(c.offer(packet(now - 601), now))
        assertFalse(c.offer(packet(now + 1000), now))
    }

    @Test fun rebroadcastDecrementsTtlAndStopsAtZero() {
        val c = RelayCache()
        c.offer(packet(now, ttl = 1), now)
        val out = c.nextToBroadcast(5, now)
        assertEquals(1, out.size)
        assertEquals(0, out[0].ttl)
        val c2 = RelayCache()
        c2.offer(out[0], now)
        assertTrue(c2.nextToBroadcast(5, now).isEmpty())
    }

    @Test fun roundRobinsAirtime() {
        val c = RelayCache()
        c.offer(packet(now, epochOffset = 0), now)
        c.offer(packet(now, epochOffset = -1), now)
        val a = c.nextToBroadcast(1, now).single().id.toHex()
        val b = c.nextToBroadcast(1, now).single().id.toHex()
        assertTrue(a != b)
    }

    @Test fun capsSize() {
        val c = RelayCache(maxEntries = 2)
        for (i in 0 until 5) c.offer(packet(now - i, epochOffset = -i), now)
        assertEquals(2, c.size())
    }
}
