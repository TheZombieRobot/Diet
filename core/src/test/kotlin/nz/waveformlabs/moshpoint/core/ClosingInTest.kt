package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The finder's heartbeat: ticks as you close in, silence otherwise. */
class ClosingInTest {
    private fun ticks(c: ClosingIn, mate: String, vararg metres: Double) = metres.count { c.update(mate, it) }

    @Test fun standingStillIsSilentWhateverTheWobble() {
        val c = ClosingIn()
        // Three mates parked at 8 m, readings wobbling: the old metronome ticked every half second.
        assertEquals(0, ticks(c, "sam", 8.0, 8.3, 7.8, 8.1, 7.6, 8.2, 7.9, 8.4, 7.7, 8.0))
    }

    @Test fun walkingCloserTicksAsYouGo() {
        val c = ClosingIn()
        val walk = generateSequence(19.5) { it - 0.5 }.takeWhile { it >= 3.0 }.toList().toDoubleArray()
        val n = ticks(c, "sam", *walk)
        // A tick every metre or two on the way in: from 19.5 m to 3 m, about a dozen.
        assertTrue(n in 9..15, "$n ticks")
    }

    @Test fun movingAwayIsSilentAndComingBackTicksAgain() {
        val c = ClosingIn()
        assertEquals(0, ticks(c, "sam", 10.0, 11.0, 12.5, 14.0, 15.0))
        // Back in from 15 m: a tick once you're a step closer than the furthest you got.
        assertTrue(ticks(c, "sam", 14.0, 13.4, 12.0) >= 1)
    }

    @Test fun nothingBeyondTwentyMetresAndNoTickOnTheWayIn() {
        val c = ClosingIn()
        assertEquals(0, ticks(c, "sam", 60.0, 45.0, 30.0, 25.0, 21.0))
        // Coming into range isn't a tick (the finder buzzes once as you cross 20 m)...
        assertFalse(c.update("sam", 19.0))
        // ...getting closer from there is.
        assertTrue(c.update("sam", 17.0))
    }

    @Test fun rightNextToThemTheFoundBuzzTakesOver() {
        val c = ClosingIn()
        assertEquals(0, ticks(c, "sam", 5.0, 2.5, 1.5, 0.5))
    }

    @Test fun someoneElseBecomingNearestStartsAfresh() {
        val c = ClosingIn()
        c.update("sam", 12.0)
        // Jo is nearer now: no tick for the switch itself, then ticks as you close in on Jo.
        assertFalse(c.update("jo", 9.0))
        assertTrue(c.update("jo", 7.5))
    }

    @Test fun nobodyMeasuredResets() {
        val c = ClosingIn()
        c.update("sam", 12.0)
        assertFalse(c.update(null, null))
        assertFalse(c.update("sam", 9.0))
    }

    @Test fun theStepGrowsWithDistance() {
        assertEquals(1.0, ClosingIn.stepAt(4.0))
        assertEquals(1.0, ClosingIn.stepAt(10.0))
        assertEquals(1.8, ClosingIn.stepAt(18.0), 1e-9)
    }
}
