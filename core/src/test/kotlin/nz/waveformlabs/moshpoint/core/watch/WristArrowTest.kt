package nz.waveformlabs.moshpoint.core.watch

import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * A watch whose 12 o'clock points at compass [headingDeg], tilted [pitchDeg] towards the
 * wearer's eyes (top edge rising) and rolled [rollDeg] to the right, as Android's rotation
 * matrix: columns are where the watch's right edge, top edge and glass point in (east, north, up).
 */
internal fun wristMatrix(headingDeg: Double, pitchDeg: Double = 0.0, rollDeg: Double = 0.0): FloatArray {
    val h = Math.toRadians(headingDeg)
    val p = Math.toRadians(pitchDeg)
    val q = Math.toRadians(rollDeg)
    // Flat: right = heading + 90, top = heading, glass = up.
    var x = doubleArrayOf(cos(h), -sin(h), 0.0)
    var y = doubleArrayOf(sin(h), cos(h), 0.0)
    var z = doubleArrayOf(0.0, 0.0, 1.0)
    // Pitch about the right edge: the top edge lifts, the glass leans back towards the wearer.
    val y1 = DoubleArray(3) { y[it] * cos(p) + z[it] * sin(p) }
    val z1 = DoubleArray(3) { -y[it] * sin(p) + z[it] * cos(p) }
    y = y1; z = z1
    // Roll about the top edge.
    val x2 = DoubleArray(3) { x[it] * cos(q) - z[it] * sin(q) }
    val z2 = DoubleArray(3) { x[it] * sin(q) + z[it] * cos(q) }
    x = x2; z = z2
    return floatArrayOf(
        x[0].toFloat(), y[0].toFloat(), z[0].toFloat(),
        x[1].toFloat(), y[1].toFloat(), z[1].toFloat(),
        x[2].toFloat(), y[2].toFloat(), z[2].toFloat(),
    )
}

private fun err(a: Double, b: Double) = abs(Geo.normalize180(a - b))

class WristPoseTest {
    @Test fun flatWatchReadsItsHeadingAndNoTilt() {
        for (h in listOf(0.0, 37.0, 90.0, 181.0, 270.0, 359.0)) {
            val pose = WristPose.fromRotationMatrix(wristMatrix(h))
            assertTrue(pose.tiltDeg < 0.1, "tilt ${pose.tiltDeg}")
            assertTrue(err(pose.magneticHeadingDeg!!, h) < 0.1, "heading $h read as ${pose.magneticHeadingDeg}")
        }
    }

    @Test fun tiltIsTheAngleFromFlatWhicheverWayItLeans() {
        assertEquals(35.0, WristPose.fromRotationMatrix(wristMatrix(120.0, pitchDeg = 35.0)).tiltDeg, 0.1)
        assertEquals(35.0, WristPose.fromRotationMatrix(wristMatrix(120.0, pitchDeg = -35.0)).tiltDeg, 0.1)
        assertEquals(50.0, WristPose.fromRotationMatrix(wristMatrix(120.0, rollDeg = 50.0)).tiltDeg, 0.1)
        assertEquals(180.0, WristPose.fromRotationMatrix(wristMatrix(0.0, rollDeg = 180.0)).tiltDeg, 0.1)
    }

    @Test fun tiltingTowardsYourEyesDoesNotMoveTheHeading() {
        // The normal way to read a watch: 12 o'clock still points the same way along the ground.
        for (pitch in listOf(10.0, 25.0, 40.0, 50.0)) {
            val pose = WristPose.fromRotationMatrix(wristMatrix(200.0, pitchDeg = pitch))
            assertTrue(err(pose.magneticHeadingDeg!!, 200.0) < 0.1, "pitch $pitch gave ${pose.magneticHeadingDeg}")
        }
    }

    @Test fun aWatchWornTheOtherWayRoundPointsTheOtherWay() {
        val m = wristMatrix(30.0)
        assertTrue(err(WristPose.fromRotationMatrix(m, displayRotation = 0).magneticHeadingDeg!!, 30.0) < 0.1)
        assertTrue(err(WristPose.fromRotationMatrix(m, displayRotation = 2).magneticHeadingDeg!!, 210.0) < 0.1)
        // Quarter turns: the screen's "up" is the watch's right or left edge.
        assertTrue(err(WristPose.fromRotationMatrix(m, displayRotation = 1).magneticHeadingDeg!!, 120.0) < 0.1)
        assertTrue(err(WristPose.fromRotationMatrix(m, displayRotation = 3).magneticHeadingDeg!!, 300.0) < 0.1)
    }

    @Test fun noHeadingWhenTwelveOClockPointsAtTheSky() {
        val pose = WristPose.fromRotationMatrix(wristMatrix(90.0, pitchDeg = 88.0))
        assertNull(pose.magneticHeadingDeg)
        assertEquals(88.0, pose.tiltDeg, 0.1)
    }

    @Test fun headingIsAlwaysThereInsideTheTiltLimits() {
        val rnd = Random(4)
        repeat(500) {
            val h = rnd.nextDouble() * 360
            val pitch = (rnd.nextDouble() * 2 - 1) * 35
            val roll = (rnd.nextDouble() * 2 - 1) * 35
            val pose = WristPose.fromRotationMatrix(wristMatrix(h, pitch, roll))
            if (pose.tiltDeg <= WristGate.LEAVE_ABOVE_DEG) assertNotNull(pose.magneticHeadingDeg, "h=$h pitch=$pitch roll=$roll")
        }
    }
}

class TrueNorthTest {
    @Test fun declinationTurnsTheMagneticCompassIntoTrueNorth() {
        // Auckland: magnetic north is about 20 degrees east of true north.
        assertEquals(20.0, WristArrow.trueHeadingDeg(0.0, 20.0), 1e-9)
        assertEquals(10.0, WristArrow.trueHeadingDeg(350.0, 20.0), 1e-9)
        // West declination (e.g. Seattle is east, Boston about -14).
        assertEquals(346.0, WristArrow.trueHeadingDeg(0.0, -14.0), 1e-9)
    }

    @Test fun withoutTheCorrectionTheArrowIsOffByTheDeclination() {
        // Mate due true north; watch's 12 o'clock on magnetic north. In Auckland that is
        // really 20 degrees east of north, so the mate is 20 degrees to the LEFT.
        assertEquals(-20.0, WristArrow.angleDeg(bearingTrueDeg = 0.0, magneticHeadingDeg = 0.0, declinationDeg = 20.0), 1e-9)
        // Turn the wrist 20 degrees left (magnetic 340 = true north): arrow straight up.
        assertEquals(0.0, WristArrow.angleDeg(0.0, 340.0, 20.0), 1e-9)
    }

    @Test fun arrowPointsAtARealPlace() {
        // From Spark Arena towards Britomart (roughly west-south-west), Auckland, declination ~19.6 E.
        val me = LatLon(-36.8470, 174.7770)
        val mate = LatLon(-36.8442, 174.7680)
        val bearing = Geo.bearingDeg(me, mate)
        // Wearer faces the mate: true heading = bearing, so the compass reads bearing - declination.
        val compass = Geo.normalize360(bearing - 19.6)
        assertEquals(0.0, WristArrow.angleDeg(bearing, compass, 19.6), 1e-6)
        // Same compass reading with the declination forgotten: 19.6 degrees out.
        assertEquals(19.6, abs(WristArrow.angleDeg(bearing, compass, 0.0)), 1e-6)
    }

    @Test fun wrapsAcrossNorth() {
        assertEquals(-5.0, WristArrow.angleDeg(5.0, 350.0, 20.0), 1e-9)
        assertEquals(170.0, WristArrow.angleDeg(180.0, 350.0, 20.0), 1e-9)
        assertEquals(-175.0, WristArrow.angleDeg(190.0, 345.0, 20.0), 1e-9)
    }

    @Test fun watchHeadingFilterSteadiesJitterAndStillFollowsATurn() {
        // 25 readings a second: a noisy wrist compass, then a quarter turn.
        val f = WristArrow.headingFilter()
        val rnd = Random(9)
        f.add(100.0)
        var worst = 0.0
        repeat(200) {
            val v = f.add(100.0 + (rnd.nextDouble() * 2 - 1) * 6)
            if (it > 25) worst = maxOf(worst, err(v, 100.0))
        }
        assertTrue(worst < 4.0, "jitter got through: $worst")
        repeat(8) { f.add(190.0) } // about a third of a second
        assertTrue(err(f.value, 190.0) < 10.0, "lagging a real turn: ${f.value}")
    }
}

class WristGateTest {
    @Test fun arrowAppearsOnlyAfterTheWristHasBeenFlatForAMoment() {
        val g = WristGate()
        assertFalse(g.update(30.0, 0))
        assertFalse(g.update(30.0, 200))
        assertTrue(g.update(30.0, 300))
        assertEquals(300, g.changedAtMs)
    }

    @Test fun limitsAreFortyToComeOnAndFiftyToGoOff() {
        val g = WristGate()
        // 45 degrees: not flat enough to come on...
        assertFalse(g.update(45.0, 0))
        assertFalse(g.update(45.0, 1_000))
        // ...40 is.
        g.update(40.0, 1_100)
        assertTrue(g.update(40.0, 1_400))
        // Once on, 45 and 50 keep it (no flicker at the edge).
        assertTrue(g.update(45.0, 2_000))
        assertTrue(g.update(50.0, 3_000))
        // Past 50 for 150 ms: gone.
        assertTrue(g.update(51.0, 3_100))
        assertFalse(g.update(51.0, 3_250))
        // And 45 doesn't bring it back.
        assertFalse(g.update(45.0, 5_000))
    }

    @Test fun anArmSwingingThroughLevelDoesNotFlashTheArrow() {
        val g = WristGate()
        var t = 0L
        repeat(20) {
            // 150 ms level, 400 ms hanging: never level for the full 300 ms.
            assertFalse(g.update(10.0, t)); t += 150
            assertFalse(g.update(10.0, t))
            assertFalse(g.update(80.0, t + 1)); t += 400
        }
    }

    @Test fun aQuickWobblePastTheLimitDoesNotDropTheArrow() {
        val g = WristGate()
        g.update(20.0, 0); g.update(20.0, 300)
        assertTrue(g.flat)
        assertTrue(g.update(60.0, 1_000))
        assertTrue(g.update(60.0, 1_100)) // 100 ms: not long enough
        assertTrue(g.update(20.0, 1_120))
        assertTrue(g.update(60.0, 1_200)) // the wait starts again
        assertTrue(g.update(60.0, 1_300))
        assertFalse(g.update(60.0, 1_350))
    }

    @Test fun faceDownIsNotFlat() {
        val g = WristGate()
        g.update(170.0, 0)
        assertFalse(g.update(170.0, 5_000))
    }

    @Test fun distortionAtTheLimitsIsWhatTheDocSays() {
        // Largest gap between the angle on a tilted screen and the angle on the ground.
        fun worst(tiltDeg: Double): Double {
            val c = cos(Math.toRadians(tiltDeg))
            return Math.toDegrees(kotlin.math.asin((1 - c) / (1 + c)))
        }
        assertEquals(7.6, worst(WristGate.ENTER_BELOW_DEG), 0.1)
        assertEquals(12.5, worst(WristGate.LEAVE_ABOVE_DEG), 0.1)
    }
}

class StaleReadingTest {
    private fun pointing(bearing: Double, distance: Double?, directionAgeMs: Long = 0, unsure: Boolean = false, declination: Double = 0.0) =
        WristReading(
            WristReading.Kind.POINTING, bearingTrueDeg = bearing, distanceM = distance, trend = Trend.STEADY,
            method = Method.GPS_SERVER, unsure = unsure, directionAgeMs = directionAgeMs, declinationDeg = declination,
        )

    @Test fun anOldReadingStillPointsRightAfterTheWristTurns() {
        // The phone's reading is 400 ms old and took 300 ms to arrive. Meanwhile the wrist has
        // swung from north to east. The bearing is in world terms, so the arrow just follows
        // the watch's own compass: mate at bearing 90 is now dead ahead, with no lag.
        val r = pointing(bearing = 90.0, distance = 80.0, directionAgeMs = 400)
        val before = WristArrow.view(r, sinceReceivedMs = 0, transitMs = 300, magneticHeadingDeg = 0.0, flat = true)
        val after = WristArrow.view(r, sinceReceivedMs = 250, transitMs = 300, magneticHeadingDeg = 90.0, flat = true)
        assertEquals(90.0, assertIs<WristView.Arrow>(before).angleDeg, 1e-9)
        assertEquals(0.0, assertIs<WristView.Arrow>(after).angleDeg, 1e-9)
        assertFalse(after.rough)
    }

    @Test fun driftIsHowFarTheBearingCouldHaveMovedWhileWalking() {
        assertEquals(0.8, WristArrow.driftDeg(1_000, 100.0), 0.05) // far away: a second is nothing
        assertEquals(4.0, WristArrow.driftDeg(1_000, 20.0), 0.05)
        assertEquals(54.5, WristArrow.driftDeg(5_000, 5.0), 0.5) // close: five seconds is a lifetime
        assertEquals(0.0, WristArrow.driftDeg(0, 5.0), 1e-9)
        assertEquals(0.0, WristArrow.driftDeg(-50, 5.0), 1e-9)
    }

    @Test fun aFewHundredMillisecondsIsNeverEnoughToDoubtAnArrow() {
        // GPS arrows only exist beyond about 20 m. Worst case there, 800 ms old: 3 degrees.
        val v = WristArrow.view(pointing(10.0, 20.0, directionAgeMs = 300), sinceReceivedMs = 300, transitMs = 200, magneticHeadingDeg = 0.0, flat = true)
        assertFalse(assertIs<WristView.Arrow>(v).rough)
        assertTrue(WristArrow.driftDeg(800, 20.0) < 4.0)
    }

    @Test fun anOldDirectionUpCloseIsShownAsRough() {
        // 20 m away, direction 8.5 s old in all: could be out by 30 degrees.
        val r = pointing(10.0, 20.0, directionAgeMs = 6_000)
        val fresh = WristArrow.view(pointing(10.0, 20.0, 1_000), 0, 0, 0.0, flat = true)
        val old = WristArrow.view(r, sinceReceivedMs = 2_000, transitMs = 500, magneticHeadingDeg = 0.0, flat = true)
        assertFalse(assertIs<WristView.Arrow>(fresh).rough)
        assertTrue(assertIs<WristView.Arrow>(old).rough)
        // The same age from 150 m is fine.
        assertFalse(assertIs<WristView.Arrow>(WristArrow.view(pointing(10.0, 150.0, 6_000), 2_000, 500, 0.0, flat = true)).rough)
    }

    @Test fun timeOnTheLinkAndTimeSinceArrivalBothCount() {
        val r = pointing(10.0, 20.0, directionAgeMs = 2_000) // 8 degrees by itself
        assertFalse(assertIs<WristView.Arrow>(WristArrow.view(r, 0, 0, 0.0, flat = true)).rough)
        assertTrue(assertIs<WristView.Arrow>(WristArrow.view(r, sinceReceivedMs = 5_000, transitMs = 0, magneticHeadingDeg = 0.0, flat = true)).rough)
        assertTrue(assertIs<WristView.Arrow>(WristArrow.view(r, sinceReceivedMs = 0, transitMs = 5_000, magneticHeadingDeg = 0.0, flat = true)).rough)
    }

    @Test fun thePhonesOwnDoubtAndABadCompassAndAQuietLinkAllDimTheArrow() {
        val ok = pointing(10.0, 100.0)
        assertTrue(assertIs<WristView.Arrow>(WristArrow.view(pointing(10.0, 100.0, unsure = true), 0, 0, 0.0, flat = true)).rough)
        assertTrue(assertIs<WristView.Arrow>(WristArrow.view(ok, 0, 0, 0.0, flat = true, compassRough = true)).rough)
        assertTrue(assertIs<WristView.Arrow>(WristArrow.view(ok, 0, 0, 0.0, flat = true, linkStale = true)).rough)
        assertFalse(assertIs<WristView.Arrow>(WristArrow.view(ok, 0, 0, 0.0, flat = true)).rough)
    }

    @Test fun noArrowUnlessTheWristIsFlat() {
        val v = WristArrow.view(pointing(10.0, 40.0), 0, 0, magneticHeadingDeg = 0.0, flat = false)
        val d = assertIs<WristView.DistanceOnly>(v)
        assertEquals(NoArrow.HOLD_FLAT, d.why)
        assertEquals(40.0, d.distanceM)
    }

    @Test fun noCompassMeansDistanceAndBuzzesOnly() {
        val d = assertIs<WristView.DistanceOnly>(WristArrow.view(pointing(10.0, 40.0), 0, 0, magneticHeadingDeg = null, flat = true))
        assertEquals(NoArrow.NO_COMPASS, d.why)
    }

    @Test fun distanceOnlyFromThePhoneStaysDistanceOnlyHoweverFlatTheWrist() {
        val r = WristReading(WristReading.Kind.DISTANCE_ONLY, distanceM = 6.0, trend = Trend.WARMER, method = Method.UWB)
        val d = assertIs<WristView.DistanceOnly>(WristArrow.view(r, 0, 0, 0.0, flat = true))
        assertEquals(NoArrow.NO_DIRECTION, d.why)
        assertEquals(Trend.WARMER, d.trend)
    }

    @Test fun nothingYetIsSearching() {
        assertIs<WristView.Searching>(WristArrow.view(null, 0, 0, 0.0, flat = true))
        assertIs<WristView.Searching>(WristArrow.view(WristReading.NONE, 0, 0, 0.0, flat = true))
    }

    @Test fun declinationFromThePhoneIsApplied() {
        val v = WristArrow.view(pointing(0.0, 100.0, declination = 20.0), 0, 0, magneticHeadingDeg = 0.0, flat = true)
        assertEquals(-20.0, assertIs<WristView.Arrow>(v).angleDeg, 1e-9)
    }
}

class LinkClockTest {
    @Test fun measuresTheLinkFromAnEchoOfTheWatchsOwnClock() {
        val c = LinkClock()
        assertNull(c.transitMs)
        // Watch stamped 10_000; phone held it 1_200 ms; the echo lands at 11_500: 300 ms round trip.
        c.onEcho(nowWatchMs = 11_500, echoedWatchMs = 10_000, heldMs = 1_200)
        assertEquals(150, c.transitMs)
    }

    @Test fun smoothsAndIgnoresNonsense() {
        val c = LinkClock()
        c.onEcho(1_300, 1_000, 0) // 150 one way
        c.onEcho(2_900, 2_000, 0) // 450 one way: moves part of the way
        assertEquals(240, c.transitMs)
        c.onEcho(3_000, 3_500, 0) // echo from the future
        c.onEcho(60_000, 1_000, 0) // a minute: not a link delay
        c.onEcho(5_000, 4_000, -1) // phone had nothing to echo
        assertEquals(240, c.transitMs)
    }

    @Test fun survivesTheWatchClockWrappingRound() {
        val c = LinkClock()
        c.onEcho(nowWatchMs = Int.MIN_VALUE + 100, echoedWatchMs = Int.MAX_VALUE - 99, heldMs = 0) // 200 ms apart across the wrap
        assertEquals(100, c.transitMs)
    }
}

class LinkHealthTest {
    @Test fun judgedAgainstThePaceThePhoneWasAskedFor() {
        assertEquals(LinkHealth.FRESH, LinkHealth.of(600, fast = true))
        assertEquals(LinkHealth.STALE, LinkHealth.of(3_000, fast = true))
        assertEquals(LinkHealth.FRESH, LinkHealth.of(3_000, fast = false)) // one every 2 s: 3 s is nothing
        assertEquals(LinkHealth.STALE, LinkHealth.of(7_000, fast = false))
        assertEquals(LinkHealth.LOST, LinkHealth.of(10_001, fast = true))
        assertEquals(LinkHealth.LOST, LinkHealth.of(10_001, fast = false))
    }
}

class FacingLatchTest {
    @Test fun comesOnWithinFifteenDegreesAndStaysUntilThirty() {
        val f = FacingLatch()
        assertFalse(f.update(40.0))
        assertFalse(f.update(-16.0))
        assertTrue(f.update(-15.0))
        assertTrue(f.update(25.0)) // wobble: still facing
        assertFalse(f.update(31.0))
        assertFalse(f.update(20.0)) // has to come back inside 15
        assertTrue(f.update(3.0))
        assertFalse(f.update(null)) // arrow gone
    }
}
