package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/**
 * Simulates a line of phones in a crowd, each only in Bluetooth range of its neighbours:
 *
 *   A (visible) - s1 - s2 - s3 - s4 - s5 - B (looking for A)
 *
 * Every "second", each phone re-broadcasts what it has and neighbours offer() what they hear.
 */
class CrowdRelayNetworkTest {
    private val now = 1_700_000_000L
    private val secretA = ByteArray(32) { 11 }
    private val idA = EphemeralId(secretA).currentId(now * 1000)

    private fun run(strangers: Int, seconds: Int): Pair<List<RelayCache>, RelayPacket> {
        val sealed = LocationBox.seal(secretA, idA, SharedLocation(-36.85, 174.76, now, 9))
        val own = RelayPacket(RelayPacket.MAX_TTL, idA, sealed)
        val phones = List(strangers + 2) { RelayCache() } // [A, s1..sN, B]
        phones[0].offer(own, now)
        repeat(seconds) { t ->
            // Everyone sends one packet per second (their least-sent one) to both neighbours.
            val sends = phones.map { it.nextToBroadcast(1, now + t) }
            sends.forEachIndexed { i, packets ->
                for (p in packets) {
                    if (i > 0) phones[i - 1].offer(p, now + t)
                    if (i < phones.lastIndex) phones[i + 1].offer(p, now + t)
                }
            }
        }
        return phones to own
    }

    @Test fun reachesFriendFiveHopsAwayAndOpens() {
        val (phones, _) = run(strangers = 5, seconds = 20)
        val atB = assertNotNull(phones.last().lookup(idA, now + 20))
        val loc = assertNotNull(LocationBox.open(secretA, atB.id, atB.sealed))
        assertEquals(-36.85, loc.lat, 1e-6)
    }

    @Test fun hopLimitStopsFloodingTheWholeVenue() {
        // MAX_TTL hops of re-broadcast: phones further than that never get it.
        val (phones, _) = run(strangers = RelayPacket.MAX_TTL + 3, seconds = 40)
        assertNull(phones.last().lookup(idA, now + 40))
        assertNotNull(phones[RelayPacket.MAX_TTL].lookup(idA, now + 40))
    }
}
