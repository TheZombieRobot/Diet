package nz.waveformlabs.moshpoint.core

import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class DistanceSmootherTest {
    @Test fun wobbleDoesNotChangeTheShownValue() {
        val s = DistanceSmoother()
        val rnd = Random(2)
        val shown = (0 until 100).map { DistanceSmoother.roundForDisplay(s.update(20.0 + (rnd.nextDouble() - 0.5) * 2.0)) }.drop(10)
        val changes = shown.zipWithNext().count { (a, b) -> a != b }
        assertTrue(changes <= 3, "flickered $changes times: ${shown.distinct()}")
    }

    @Test fun followsARealApproach() {
        val s = DistanceSmoother()
        var last = 0.0
        for (d in 40 downTo 5) last = s.update(d.toDouble())
        assertTrue(last < 9, "lagging: $last")
    }

    @Test fun displayRounding() {
        assertEquals(3.5, DistanceSmoother.roundForDisplay(3.4))
        assertEquals(42.0, DistanceSmoother.roundForDisplay(41.6))
        assertEquals(125.0, DistanceSmoother.roundForDisplay(123.0))
    }
}
