package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** "At the gig", and where mates go on the map. */
class VenueTest {
    private val hour = 3_600_000L
    private val key = ByteArray(32) { it.toByte() }
    private val venue = LatLon(-36.8468, 174.7766) // Spark Arena
    private val start = 1_800_000_000L // the gig starts (unix s)
    private val startMs = start * 1000
    private val gig = GigGroup(key, "Iron Maiden", startMs - 20 * 24 * hour, start, "Spark Arena, Auckland", venue.lat, venue.lon)
    private val tonight = GigGroup(key, "Tonight", startMs, 0L, "", venue.lat, venue.lon)

    private fun north(from: LatLon, metres: Double) = VenuePlacement.offset(from, 0.0, metres)

    private fun atGig(g: GigGroup? = gig, me: LatLon? = venue, nowMs: Long = startMs, accuracyM: Double = 10.0, ageMs: Long = 5_000, following: Boolean = false, v: LatLon? = venue) =
        AtGig.atGig(g, following, v, me, accuracyM, ageMs, nowMs)

    // ---- Gig day ----

    @Test fun onlyOnGigDay() {
        // Three weeks before: standing at the venue (buying merch?) is not "at the gig".
        assertFalse(atGig(nowMs = startMs - 20 * 24 * hour + hour))
        assertFalse(atGig(nowMs = startMs - 4 * hour)) // the crew wakes 3 h before the start
        assertTrue(atGig(nowMs = startMs - 2 * hour))
        assertTrue(atGig(nowMs = startMs + 3 * hour))
        // The crew ends the morning after (12 h after the start): the next day is not gig day.
        assertTrue(atGig(nowMs = startMs + 11 * hour))
        assertFalse(atGig(nowMs = startMs + 13 * hour))
    }

    @Test fun aTonightCrewIsOnStraightAwayAndEndsInTheMorning() {
        assertTrue(atGig(g = tonight, nowMs = startMs + 60_000L))
        assertTrue(atGig(g = tonight, nowMs = startMs + 17 * hour))
        assertFalse(atGig(g = tonight, nowMs = startMs + 19 * hour))
    }

    // ---- Near the venue ----

    @Test fun onlyNearTheVenue() {
        assertTrue(atGig(me = north(venue, 150.0)))
        assertTrue(atGig(me = north(venue, 390.0)))
        assertFalse(atGig(me = north(venue, 450.0)))
        assertFalse(atGig(me = north(venue, 5_000.0))) // at home across town: the map does what it always did
        // A vague indoor position gets the benefit of the doubt, but only up to 150 m of it.
        assertTrue(atGig(me = north(venue, 480.0), accuracyM = 100.0))
        assertFalse(atGig(me = north(venue, 600.0), accuracyM = 2_000.0))
    }

    @Test fun neverWithoutKnowingWhereYouOrTheVenueAre() {
        assertFalse(atGig(me = null))
        assertFalse(atGig(v = null)) // a crew with no venue position has no venue to open on
        assertFalse(atGig(g = null))
        assertFalse(atGig(ageMs = 6 * 60_000L)) // where you were six minutes ago isn't where you are
        assertFalse(atGig(ageMs = -1))
    }

    @Test fun followersAtHomeAreNeverAtTheGig() {
        assertFalse(atGig(following = true))
    }

    @Test fun theVenueCanComeFromALookupWhenTheCrewHasNone() {
        val typed = GigGroup(key, "Shihad", startMs - hour, start, "Powerstation")
        assertFalse(AtGig.atGig(typed, false, null, venue, 10.0, 0, startMs))
        assertTrue(AtGig.atGig(typed, false, venue, north(venue, 50.0), 10.0, 0, startMs))
    }

    // ---- The venue view ----

    @Test fun venueViewShowsWhoIsThereAndLeavesOutWhoIsNot() {
        val me = north(venue, 80.0)
        val atBar = VenuePlacement.offset(venue, 90.0, 60.0)
        val inQueue = VenuePlacement.offset(venue, 200.0, 350.0)
        val atHome = VenuePlacement.offset(venue, 300.0, 9_000.0)
        val pts = AtGig.viewPoints(venue, me, listOf(atBar, inQueue, atHome))
        assertEquals(listOf(venue, me, atBar, inQueue), pts)
        // One mate there or the whole crew: the view is the venue either way.
        assertEquals(listOf(venue, me), AtGig.viewPoints(venue, me, listOf(atHome)))
        // Everything shown fits in the widest allowed view (zoom 16 is about 1 km across).
        assertTrue(pts.all { Geo.distanceM(it, venue) <= AtGig.VENUE_RADIUS_M })
        assertTrue(AtGig.VIEW_MIN_ZOOM < AtGig.VIEW_MAX_ZOOM)
    }

    // ---- Placing mates ----

    @Test fun uwbPutsAMateWhereTheyAre() {
        val me = venue
        for ((bearing, dist) in listOf(0.0 to 5.0, 90.0 to 12.5, 225.0 to 40.0, 359.0 to 1.2)) {
            val at = VenuePlacement.offset(me, bearing, dist)
            assertEquals(dist, Geo.distanceM(me, at), 0.01)
            assertTrue(abs(Geo.normalize180(Geo.bearingDeg(me, at) - bearing)) < 0.05, "bearing $bearing")
        }
        // East is east on both sides of the equator and of the date line.
        assertTrue(VenuePlacement.offset(LatLon(51.5, -0.12), 90.0, 30.0).lon > -0.12)
        assertTrue(VenuePlacement.offset(LatLon(-17.0, 179.9999), 90.0, 50.0).lon < -179.99)
    }

    @Test fun aWrongGpsFixMovesEveryoneTogether() {
        // Sam is 6 m ahead-right, Jo 9 m behind-left. Our GPS is 25 m out.
        val real = venue
        val wrong = VenuePlacement.offset(real, 70.0, 25.0)
        fun place(me: LatLon) = VenuePlacement.offset(me, 40.0, 6.0) to VenuePlacement.offset(me, 220.0, 9.0)
        val (sam, jo) = place(real)
        val (sam2, jo2) = place(wrong)
        // The whole picture has slid 25 m...
        assertEquals(25.0, Geo.distanceM(sam, sam2), 0.01)
        assertEquals(25.0, Geo.distanceM(jo, jo2), 0.01)
        // ...but who is where around us hasn't changed by a centimetre.
        assertEquals(Geo.distanceM(sam, jo), Geo.distanceM(sam2, jo2), 0.01)
        assertEquals(Geo.bearingDeg(sam, jo), Geo.bearingDeg(sam2, jo2), 0.01)
        assertEquals(6.0, Geo.distanceM(wrong, sam2), 0.01)
        assertEquals(40.0, Geo.bearingDeg(wrong, sam2), 0.05)
    }

    @Test fun aCompassErrorTurnsTheGroupButKeepsItsShape() {
        val me = venue
        fun place(compassErr: Double) = VenuePlacement.offset(me, 40.0 + compassErr, 6.0) to VenuePlacement.offset(me, 220.0 + compassErr, 9.0)
        val (sam, jo) = place(0.0)
        val (sam2, jo2) = place(15.0)
        assertEquals(Geo.distanceM(sam, jo), Geo.distanceM(sam2, jo2), 0.01) // Sam is still opposite Jo, 15 m apart
        assertEquals(6.0, Geo.distanceM(me, sam2), 0.01)
    }

    @Test fun neverDrawWhatWeDoNotKnow() {
        val me = venue
        val now = 1_000_000L
        val gps = north(venue, 30.0)
        fun uwb(bearing: Double?, dist: Double?, age: Long = 1_000) = VenuePlacement.UwbReading(bearing, dist, now - age)
        // UWB with distance and direction: exact.
        val exact = assertIs<VenuePlacement.Spot.Exact>(VenuePlacement.spot(me, uwb(90.0, 8.0), gps, null, now))
        assertEquals(8.0, Geo.distanceM(me, exact.at), 0.01)
        // UWB behind the phone gives distance but no direction: fall back to their GPS pin...
        assertEquals(VenuePlacement.Spot.Gps(gps), VenuePlacement.spot(me, uwb(null, 8.0), gps, null, now))
        // ...and with no GPS either (Bluetooth-only, or UWB with no angle): nothing is drawn.
        assertEquals(VenuePlacement.Spot.Unknown, VenuePlacement.spot(me, uwb(null, 8.0), null, null, now))
        assertEquals(VenuePlacement.Spot.Unknown, VenuePlacement.spot(me, null, null, null, now))
        // A stale UWB reading isn't where they are now.
        assertEquals(VenuePlacement.Spot.Gps(gps), VenuePlacement.spot(me, uwb(90.0, 8.0, age = 11_000), gps, null, now))
        // We can't place anyone around us without knowing where we are.
        assertEquals(VenuePlacement.Spot.Gps(gps), VenuePlacement.spot(null, uwb(90.0, 8.0), gps, null, now))
        assertEquals(VenuePlacement.Spot.Unknown, VenuePlacement.spot(null, uwb(90.0, 8.0), null, null, now))
    }

    @Test fun aMateUpstairsIsCloserAlongTheGroundThanUwbSays() {
        // 5 m in a straight line, one floor (4 m) up: 3 m away on the map.
        assertEquals(3.0, VenuePlacement.groundDistanceM(5.0, 4.0), 1e-9)
        assertEquals(3.0, VenuePlacement.groundDistanceM(5.0, -4.0), 1e-9)
        assertEquals(5.0, VenuePlacement.groundDistanceM(5.0, null), 1e-9)
        assertEquals(0.0, VenuePlacement.groundDistanceM(3.0, 3.5), 1e-9) // directly above: on our spot
        val me = venue
        val spot = assertIs<VenuePlacement.Spot.Exact>(VenuePlacement.spot(me, VenuePlacement.UwbReading(0.0, 5.0, 0), null, 4.0, 1_000))
        assertEquals(3.0, Geo.distanceM(me, spot.at), 0.01)
    }
}
