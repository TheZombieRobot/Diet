package nz.waveformlabs.moshpoint.core.watch

import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class WristDirectionsTest {
    private val f = "sam"
    private fun fix(m: Method, bearing: Double?, distance: Double?, t: Long = 1_000, confidence: Double = 0.9) =
        Fix(f, m, bearing, distance, confidence, t)

    @Test fun everyDirectionMethodIsSortedIntoOneListOrTheOther() {
        // A new method that gives a direction must be thought about before the wrist may use it.
        val giving = Method.entries.filter { it.givesDirection }.toSet()
        assertEquals(giving, WristDirections.POSE_FREE + WristDirections.NEEDS_PHONE_HELD)
        assertTrue((WristDirections.POSE_FREE intersect WristDirections.NEEDS_PHONE_HELD).isEmpty())
    }

    @Test fun gpsAndCrowdBearingsSurviveAPocketTheOthersDoNot() {
        for (m in listOf(Method.GPS_SERVER, Method.CROWD_RELAY)) {
            assertEquals(77.0, WristDirections.forWrist(fix(m, 77.0, 60.0), phoneHeld = false).bearingDeg)
        }
        for (m in listOf(Method.UWB, Method.SPIN_SCAN, Method.WALK)) {
            val pocket = WristDirections.forWrist(fix(m, 77.0, 12.0), phoneHeld = false)
            assertNull(pocket.bearingDeg, "$m bearing should not reach the wrist from a pocket")
            assertEquals(12.0, pocket.distanceM, "$m distance is still good")
            assertEquals(77.0, WristDirections.forWrist(fix(m, 77.0, 12.0), phoneHeld = true).bearingDeg)
        }
    }

    @Test fun pocketedPhoneFallsBackFromUwbDirectionToGpsDirectionButKeepsUwbDistance() {
        val a = WristArbiter()
        a.submit(fix(Method.UWB, 90.0, 40.0, confidence = 0.95), phoneHeld = false)
        a.submit(fix(Method.GPS_SERVER, 80.0, 46.0, confidence = 0.9), phoneHeld = false)
        val r = a.reading(f, nowMs = 1_100, declinationDeg = 19.5)
        assertEquals(WristReading.Kind.POINTING, r.kind)
        assertEquals(Method.GPS_SERVER, r.method)
        assertEquals(80.0, r.bearingTrueDeg!!, 1e-9)
        assertEquals(40.0, r.distanceM!!, 1e-9) // the precise one
        assertEquals(19.5, r.declinationDeg)
        assertEquals(100, r.directionAgeMs)
    }

    @Test fun heldPhoneMayPassItsUwbDirectionOn() {
        val a = WristArbiter()
        a.submit(fix(Method.UWB, 90.0, 40.0, confidence = 0.95), phoneHeld = true)
        a.submit(fix(Method.GPS_SERVER, 80.0, 46.0, confidence = 0.9), phoneHeld = true)
        val r = a.reading(f, 1_100, 0.0)
        assertEquals(Method.UWB, r.method)
        assertEquals(90.0, r.bearingTrueDeg!!, 1e-9)
    }

    @Test fun closeUpFromAPocketThereIsNoHonestArrowOnlyDistance() {
        // Under 20 m the arbiter drops GPS directions (their error is bigger than the gap),
        // and the pocket has just dropped UWB's: distance and warmer/colder it is.
        val a = WristArbiter()
        a.submit(fix(Method.UWB, 200.0, 8.0, confidence = 0.95), phoneHeld = false)
        a.submit(fix(Method.GPS_SERVER, 190.0, 14.0), phoneHeld = false)
        a.submit(fix(Method.WALK, 180.0, null), phoneHeld = false)
        val r = a.reading(f, 1_100, 0.0)
        assertEquals(WristReading.Kind.DISTANCE_ONLY, r.kind)
        assertNull(r.bearingTrueDeg)
        assertEquals(8.0, r.distanceM!!, 1e-9)
        assertEquals(Method.UWB, r.method)
    }

    @Test fun bearingsComeOutAsCompassBearingsNotLeftRightAngles() {
        val a = WristArbiter()
        a.submit(fix(Method.GPS_SERVER, 270.0, 300.0), phoneHeld = false)
        assertEquals(270.0, a.reading(f, 1_100, 0.0).bearingTrueDeg!!, 1e-9)
        a.submit(fix(Method.GPS_SERVER, 359.5, 300.0, t = 2_000), phoneHeld = false)
        assertEquals(359.5, a.reading(f, 2_100, 0.0).bearingTrueDeg!!, 1e-9)
    }

    @Test fun nothingHeardIsNoSignalAndStaleFixesAgeOut() {
        val a = WristArbiter()
        assertEquals(WristReading.Kind.NO_SIGNAL, a.reading(f, 1_000, 0.0).kind)
        a.submit(fix(Method.UWB, null, 5.0), phoneHeld = false)
        assertEquals(WristReading.Kind.DISTANCE_ONLY, a.reading(f, 1_500, 0.0).kind)
        // UWB fixes live 2 s.
        assertEquals(WristReading.Kind.NO_SIGNAL, a.reading(f, 1_000 + Method.UWB.maxAgeMs + 1, 0.0).kind)
    }

    @Test fun closingInReadsAsWarmerWalkingAwayAsColder() {
        val a = WristArbiter()
        var t = 0L
        var d = 30.0
        var r = WristReading.NONE
        repeat(40) { // 8 seconds of UWB at 5 a second, walking in at 1.4 m/s
            a.submit(fix(Method.UWB, null, d, t), phoneHeld = false)
            r = a.reading(f, t + 10, 0.0)
            t += 200; d -= 0.28
        }
        assertEquals(Trend.WARMER, r.trend)
        assertTrue(r.distanceM!! < 22.0, "smoothed distance should have followed: ${r.distanceM}")
        repeat(40) {
            a.submit(fix(Method.UWB, null, d, t), phoneHeld = false)
            r = a.reading(f, t + 10, 0.0)
            t += 200; d += 0.28
        }
        assertEquals(Trend.COLDER, r.trend)
    }

    @Test fun aChangeOfDistanceMethodIsNotReadAsMovement() {
        // Bluetooth guessed 14 m, then UWB locks on at 9 m: that's a better ruler, not an approach.
        val a = WristArbiter()
        var t = 0L
        repeat(20) {
            a.submit(fix(Method.BLE_RSSI, null, 14.0, t, confidence = 0.7), phoneHeld = false)
            a.reading(f, t + 10, 0.0); t += 400
        }
        var r = WristReading.NONE
        repeat(3) {
            a.submit(fix(Method.UWB, null, 9.0, t), phoneHeld = false)
            r = a.reading(f, t + 10, 0.0); t += 200
        }
        assertEquals(Method.UWB, r.method)
        assertEquals(Trend.STEADY, r.trend)
    }

    @Test fun forgettingAMateClearsEverything() {
        val a = WristArbiter()
        a.submit(fix(Method.GPS_SERVER, 10.0, 80.0), phoneHeld = false)
        a.forget(f)
        assertEquals(WristReading.Kind.NO_SIGNAL, a.reading(f, 1_100, 0.0).kind)
    }

    @Test fun heldLikeAFinderMeansUprightOrFlatInPortrait() {
        val g = 9.81
        assertTrue(WristDirections.phoneHeldLikeAFinder(0.0, g, 0.0)) // upright, looking at the screen
        assertTrue(WristDirections.phoneHeldLikeAFinder(0.0, 0.0, g)) // flat, screen up
        assertTrue(WristDirections.phoneHeldLikeAFinder(0.5, 6.9, 6.9)) // the usual 45 degrees
        assertFalse(WristDirections.phoneHeldLikeAFinder(0.0, -g, 0.0)) // upside down in a pocket
        assertFalse(WristDirections.phoneHeldLikeAFinder(0.0, -5.0, 8.4)) // hanging from the hand
        assertFalse(WristDirections.phoneHeldLikeAFinder(0.0, 0.0, -g)) // face down
        assertFalse(WristDirections.phoneHeldLikeAFinder(g, 0.0, 0.0)) // on its side
        assertFalse(WristDirections.phoneHeldLikeAFinder(0.0, 0.3, 0.2)) // falling / thrown about
        assertFalse(WristDirections.phoneHeldLikeAFinder(0.0, 25.0, 5.0)) // mid-jump
    }
}
