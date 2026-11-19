package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The finder's arrow to a place (a texted spot, docs/SPOT_LINKS.md): our own GPS and the
 * compass, nothing else, so it works with no data and no signal.
 */
class PlaceRuleTest {
    private val spot = LatLon(-36.84850, 174.76330)
    private val now = 1_800_000_000_000L
    private fun from(bearing: Double, m: Double) = VenuePlacement.offset(spot, bearing, m)

    @Test fun pointsFromOurGpsToThePlace() {
        val me = from(180.0, 300.0) // 300 m south of the spot
        val f = assertNotNull(PlaceRule.fix("t1", me, 5.0, 0, spot, now))
        assertEquals(Method.PLACE, f.method)
        assertEquals("t1", f.friendId)
        assertEquals(0.0, f.bearingDeg!!, 0.5)
        assertEquals(300.0, f.distanceM!!, 0.5)
        assertTrue(f.confidence > 0.9, "${f.confidence}")
    }

    /** The compass turns it: the arrow is drawn against which way the phone faces, like a mate's. */
    @Test fun theArrowTurnsWithTheCompass() {
        val me = from(225.0, 400.0) // 400 m south-west: the spot is to the north-east
        val a = MethodArbiter()
        a.submit(assertNotNull(PlaceRule.fix("t1", me, 5.0, 0, spot, now)))
        val facingNorth = assertIs<ArrowState.Pointing>(a.arrowFor("t1", 0.0, now))
        assertEquals(45.0, facingNorth.relativeDeg, 1.0)
        assertEquals(400.0, facingNorth.distanceM!!, 1.0)
        assertEquals(Method.PLACE, facingNorth.method)
        assertFalse(facingNorth.unsure)
        assertEquals(-45.0, assertIs<ArrowState.Pointing>(a.arrowFor("t1", 90.0, now)).relativeDeg, 1.0)
        assertEquals(0.0, assertIs<ArrowState.Pointing>(a.arrowFor("t1", 45.0, now)).relativeDeg, 1.0)
    }

    /** Up close our GPS error is as big as the gap: an arrow, but marked rough. */
    @Test fun closeUpItsRough() {
        val a = MethodArbiter()
        a.submit(assertNotNull(PlaceRule.fix("t1", from(180.0, 20.0), 8.0, 0, spot, now)))
        assertTrue(assertIs<ArrowState.Pointing>(a.arrowFor("t1", 0.0, now)).unsure)
        val b = MethodArbiter()
        b.submit(assertNotNull(PlaceRule.fix("t1", from(180.0, 20.0), 40.0, 0, spot, now)))
        assertEquals(0.1, assertNotNull(PlaceRule.fix("t1", from(180.0, 20.0), 40.0, 0, spot, now)).confidence, 1e-9)
        assertTrue(assertIs<ArrowState.Pointing>(b.arrowFor("t1", 0.0, now)).unsure, "a vague fix close by")
    }

    /** It ages with our own GPS fix: walking on with a stale one, the arrow goes rough, then away. */
    @Test fun itAgesWithOurOwnFix() {
        val me = from(180.0, 500.0)
        val a = MethodArbiter()
        a.submit(assertNotNull(PlaceRule.fix("t1", me, 5.0, 0, spot, now)))
        assertFalse(assertIs<ArrowState.Pointing>(a.arrowFor("t1", 0.0, now)).unsure)
        assertFalse(assertIs<ArrowState.Pointing>(a.arrowFor("t1", 0.0, now + 20_000)).unsure, "a gap between fixes")
        assertTrue(assertIs<ArrowState.Pointing>(a.arrowFor("t1", 0.0, now + 37_000)).unsure, "37 s without a new fix")
        assertIs<ArrowState.NoSignal>(a.arrowFor("t1", 0.0, now + Method.PLACE.maxAgeMs + 1))
        // A fix that's already that old when it's read makes no reading at all.
        assertNull(PlaceRule.fix("t1", me, 5.0, Method.PLACE.maxAgeMs + 1, spot, now))
        assertEquals(now - 12_000, assertNotNull(PlaceRule.fix("t1", me, 5.0, 12_000, spot, now)).timestampMs, "stamped with our fix's time")
    }

    @Test fun onlyRealPlaces() {
        val me = from(180.0, 300.0)
        assertNull(PlaceRule.fix("t1", me, 5.0, 0, LatLon(0.0, 0.0), now), "0, 0 is no position")
        assertNull(PlaceRule.fix("t1", me, 5.0, 0, LatLon(Double.NaN, 174.7), now))
        assertNull(PlaceRule.fix("t1", me, 5.0, 0, LatLon(-91.0, 174.7), now))
        assertNull(PlaceRule.fix("t1", LatLon(0.0, 0.0), 5.0, 0, spot, now), "no fix of our own")
        assertNull(PlaceRule.fix("t1", me, 5.0, -1, spot, now), "a fix from the future")
        // No accuracy worth using: treated as a poor fix, never as a perfect one.
        val vague = assertNotNull(PlaceRule.fix("t1", me, Double.NaN, 0, spot, now))
        assertEquals(1.0 - (PlaceRule.UNKNOWN_ACCURACY_M + PlaceRule.SPOT_SLACK_M) / 300.0, vague.confidence, 0.01)
    }

    /** A place is found the same way the whole way there: a mate's methods never touch it. */
    @Test fun aPlaceIsFoundByItsOwnMethodOnly() {
        val a = MethodArbiter()
        a.submit(assertNotNull(PlaceRule.fix("t1", from(180.0, 2_000.0), 5.0, 0, spot, now)))
        a.submit(Fix("sam", Method.GPS_SERVER, 90.0, 50.0, 0.9, now))
        val arrow = assertIs<ArrowState.Pointing>(a.arrowFor("t1", 0.0, now))
        assertEquals(Method.PLACE, arrow.method)
        assertEquals(2_000.0, arrow.distanceM!!, 2.0)
        assertEquals(Method.GPS_SERVER, assertIs<ArrowState.Pointing>(a.arrowFor("sam", 0.0, now)).method)
    }
}
