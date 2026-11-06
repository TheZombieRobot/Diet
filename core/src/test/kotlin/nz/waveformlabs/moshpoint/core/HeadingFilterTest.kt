package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertTrue

class HeadingFilterTest {
    private fun err(a: Double, b: Double) = abs(Geo.normalize180(a - b))

    @Test fun wrapsAcrossNorthWithoutSwingingRound() {
        val f = HeadingFilter()
        f.add(358.0)
        repeat(50) { i -> f.add(if (i % 2 == 0) 2.0 else 358.0) }
        assertTrue(err(f.value, 0.0) < 3, "got ${f.value}")
    }

    @Test fun smoothsJitter() {
        val f = HeadingFilter()
        val rnd = Random(3)
        var maxErr = 0.0
        f.add(90.0)
        repeat(300) {
            val v = f.add(90.0 + (rnd.nextDouble() * 2 - 1) * 6)
            if (it > 20) maxErr = maxOf(maxErr, err(v, 90.0))
        }
        assertTrue(maxErr < 3.0, "jitter got through: $maxErr")
    }

    @Test fun followsARealTurnQuickly() {
        val f = HeadingFilter()
        f.add(0.0)
        repeat(5) { f.add(0.0) }
        // Turn to 120 degrees: within ~10 samples (0.2 s at 50 Hz) we should be close.
        repeat(10) { f.add(120.0) }
        assertTrue(err(f.value, 120.0) < 10, "lagging: ${f.value}")
    }
}
