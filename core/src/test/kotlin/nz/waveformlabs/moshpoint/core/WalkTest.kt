package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.log10
import kotlin.math.sin
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WalkDirectionTest {
    /** Walk an L-shaped path near a friend 20 m away at [bearing]; noisy smoothed RSSI. */
    private fun walk(bearing: Double, legs: List<Pair<Double, Long>>, seed: Int = 1): WalkDirection {
        val w = WalkDirection()
        val rnd = Random(seed)
        val fx = 20 * sin(Math.toRadians(bearing))
        val fy = 20 * cos(Math.toRadians(bearing))
        var x = 0.0
        var y = 0.0
        var t = 0L
        for ((heading, ms) in legs) {
            val end = t + ms
            while (t < end) {
                x += 1.2 * 0.25 * sin(Math.toRadians(heading))
                y += 1.2 * 0.25 * cos(Math.toRadians(heading))
                val d = hypot(fx - x, fy - y).coerceAtLeast(1.0)
                val raw = -59 - 28 * log10(d) + rnd.nextDouble(-8.0, 8.0)
                w.add(t, heading + rnd.nextDouble(-8.0, 8.0), raw, moving = true)
                t += 250
            }
        }
        return w
    }

    @Test fun findsFriendAfterWalkingTwoWays() {
        for (bearing in listOf(40.0, 160.0, 290.0, 225.0)) {
            val est = assertNotNull(walk(bearing, listOf(0.0 to 15_000L, 90.0 to 15_000L)).estimate(), "bearing $bearing")
            assertTrue(abs(Geo.relativeDeg(est.first, bearing)) < 45, "wanted $bearing got ${est.first}")
        }
    }

    @Test fun noisyCrowdStillRoughlyRight() {
        var ok = 0
        for (seed in 1..20) {
            val est = walk(100.0, listOf(0.0 to 12_000L, 90.0 to 10_000L, 180.0 to 8_000L), seed).estimate() ?: continue
            if (abs(Geo.relativeDeg(est.first, 100.0)) < 50) ok++ else ok -= 2 // wrong is worse than nothing
        }
        assertTrue(ok >= 12, "score $ok")
    }

    @Test fun oneWayOnlyIsNotEnough() {
        assertNull(walk(40.0, listOf(0.0 to 20_000L)).estimate())
    }

    @Test fun standingStillGivesNothing() {
        val w = WalkDirection()
        for (i in 0 until 200) w.add(i * 250L, (i * 3.0) % 360, -70.0 + (i % 5), moving = false)
        assertNull(w.estimate())
    }
}

class TrendTrackerTest {
    @Test fun warmerWhenDistanceShrinks() {
        val t = TrendTracker()
        for (i in 0 until 40) t.add(30.0 - i * 0.5, i * 200L)
        assertEquals(Trend.WARMER, t.trend())
    }

    @Test fun steadyWhenJustNoisy() {
        val t = TrendTracker()
        for (i in 0 until 40) t.add(10.0 + (if (i % 2 == 0) 0.5 else -0.5), i * 200L)
        assertEquals(Trend.STEADY, t.trend())
    }
}

class GroupHostTest {
    @Test fun qrCarriesHostAndOldParserStillReadsName() {
        val g = GigGroup.create("Zip's crew", 0)
        val host = GigGroup.Intro(ByteArray(32) { it.toByte() }, "King Zipper")
        val qr = GigGroup.qr(g, host)
        assertEquals(host, GigGroup.hostOf(qr))
        val parsed = assertNotNull(GigGroup.parseQr(qr, 0))
        assertEquals("Zip's crew", parsed.name)
        assertTrue(parsed.key.contentEquals(g.key))
        assertNull(GigGroup.hostOf(GigGroup.qr(g)))
        // Found inside a shared message too.
        val inv = Invite.find("Join my crew! https://x.y/z $qr") as Invite.Group
        assertEquals(host, GigGroup.hostOf(inv.qrText))
    }
}

class RallyTest {
    @Test fun crewCanOpenRallyOthersCannot() {
        val g = GigGroup.create("crew", 0)
        val r = GigGroup.Rally(-41.2865, 174.7762, "Sound desk 🍺", 1_800_000_000L)
        val blob = g.sealRally(r)
        assertTrue(blob.size <= 128) // fits a relay record
        assertEquals(r, g.openRally(blob))
        assertNull(GigGroup.create("other", 0).openRally(blob))
        assertTrue(g.rallyIdForDay(5).contentEquals(g.rallyIdForDay(5)))
        assertTrue(!g.rallyIdForDay(5).contentEquals(g.rallyIdForDay(6)))
    }
}


class LocationStatusTest {
    @Test fun batteryAndLastGaspRoundTrip() {
        val secret = ByteArray(32) { 7 }
        val id = ByteArray(16) { 3 }
        val loc = SharedLocation(-41.2865, 174.7762, 1_800_000_000L, 12, batteryPct = 4, lastGasp = true)
        val out = assertNotNull(LocationBox.open(secret, id, LocationBox.seal(secret, id, loc)))
        assertEquals(4, out.batteryPct)
        assertTrue(out.lastGasp)
        val plain = assertNotNull(LocationBox.open(secret, id, LocationBox.seal(secret, id, loc.copy(batteryPct = null, lastGasp = false))))
        assertNull(plain.batteryPct)
    }
}

class PingTest {
    @Test fun pingRoundTripWithAndWithoutLocation() {
        val g = GigGroup.create("crew", 0)
        val p = GigGroup.Ping(GigGroup.Ping.NEED_HELP, "Bevan", 1_800_000_000L, -41.2865, 174.7762)
        val out = assertNotNull(g.openPing(g.sealPing(p)))
        assertEquals(p.kind, out.kind)
        assertEquals("Bevan", out.from)
        assertEquals(-41.2865, out.lat!!, 1e-6)
        val q = assertNotNull(g.openPing(g.sealPing(GigGroup.Ping(GigGroup.Ping.COMING, "Zip", 5L))))
        assertNull(q.lat)
        assertNull(GigGroup.create("x", 0).openPing(g.sealPing(p)))
        assertNull(g.openRally(g.sealPing(p))) // different message types don't mix
    }
}

