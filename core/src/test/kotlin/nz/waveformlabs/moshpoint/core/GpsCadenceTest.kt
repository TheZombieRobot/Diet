package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GpsCadenceTest {
    private val t0 = 5_000_000L
    private val still = GpsCadence.Mode.STILL
    private val active = GpsCadence.Mode.ACTIVE

    @Test fun standingStillIsAMinuteWithoutGps() {
        assertEquals(still, GpsCadence.mode(t0, boostUntilMs = 0, lastMotionMs = null, sensesMotion = true))
        assertEquals(60_000L, still.intervalMs)
        assertFalse(still.highAccuracy)
        assertEquals(15_000L, active.intervalMs)
        assertTrue(active.highAccuracy)
    }

    @Test fun aMateLookingTurnsGpsOnUntilTheBoostRunsOut() {
        val until = t0 + GpsCadence.BOOST_MS
        assertEquals(active, GpsCadence.mode(t0, until, null, sensesMotion = true))
        assertEquals(active, GpsCadence.mode(until - 1, until, null, sensesMotion = true))
        assertEquals(still, GpsCadence.mode(until, until, null, sensesMotion = true))
        // Even long after the last walk.
        assertEquals(active, GpsCadence.mode(t0, until, t0 - 3_600_000, sensesMotion = true))
    }

    @Test fun walkingTurnsGpsOnForTwoMinutesAfterTheLastSign() {
        assertEquals(active, GpsCadence.mode(t0, 0, t0, sensesMotion = true))
        assertEquals(active, GpsCadence.mode(t0 + GpsCadence.WALK_HOLD_MS - 1, 0, t0, sensesMotion = true))
        assertEquals(still, GpsCadence.mode(t0 + GpsCadence.WALK_HOLD_MS, 0, t0, sensesMotion = true))
    }

    @Test fun aPhoneThatCantSenseWalkingKeepsTheOldCadence() {
        assertEquals(active, GpsCadence.mode(t0, 0, null, sensesMotion = false))
    }

    /**
     * The "I'm here" pin still clears itself when we walk away, on the slower fixes: standing,
     * a vague fix a minute; walking, the motion sensor turns GPS on and the walk-away watch has
     * its footsteps and precise fixes again.
     */
    @Test fun thePinStillClearsWhenWeWalkAwayOnTheSlowerFixes() {
        val bar = LatLon(-36.84770, 174.76330)
        val w = HereWatch(GigGroup.Here(1_800_000_000L, HereRule.LIFETIME_MIN, bar.lat, bar.lon, 50_500))
        var t = t0
        var lastMotion: Long? = t // the watch starting counts as a sign of walking
        var nextFixAt = t
        var lastMode: GpsCadence.Mode? = null
        var left: HereWatch.Left? = null
        fun step(walking: Boolean, metresNorth: Double) {
            if (walking) lastMotion = t
            w.onMotion(walking, t)
            val mode = GpsCadence.mode(t, 0, lastMotion, sensesMotion = true)
            // A new cadence is a new request: its first fix comes straight away.
            if (mode != lastMode) nextFixAt = t
            lastMode = mode
            if (t >= nextFixAt) {
                // Wi-Fi and cell positioning wanders tens of metres indoors; GPS while walking is better.
                val (wander, accuracy) = if (mode.highAccuracy) 0.0 to 8.0 else listOf(-35.0, 40.0, 10.0, -20.0)[((t / 60_000) % 4).toInt()] to 45.0
                left = left ?: w.onLocation(VenuePlacement.offset(bar, 0.0, metresNorth + wander), accuracy)
                nextFixAt = t + mode.intervalMs
            }
            t += 1_000
        }
        // Twenty minutes at the bar, dancing a little now and then: a fix a minute, no clear.
        repeat(20 * 60) { step(walking = false, metresNorth = 0.0) }
        assertEquals(still, GpsCadence.mode(t, 0, lastMotion, sensesMotion = true))
        assertNull(left)
        // Walking off at 1.3 m/s: GPS on, and the pin clears within a minute and a half.
        var walked = 0.0
        repeat(90) {
            walked += 1.3
            step(walking = true, metresNorth = walked)
        }
        assertEquals(HereWatch.Left.WALKED_AWAY, left)
    }
}
