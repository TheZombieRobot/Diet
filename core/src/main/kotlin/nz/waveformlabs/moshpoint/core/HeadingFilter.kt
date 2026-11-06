package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin

/**
 * Smooths compass headings so the arrow doesn't jitter, without making it laggy.
 *
 * Averages on the unit circle (so 359° and 1° average to 0°, not 180°) and adapts:
 * small wobbles get heavy smoothing, a real turn gets through almost at once.
 */
class HeadingFilter(
    /** Smoothing when the heading barely changes (jitter). Lower = smoother. */
    private val slowAlpha: Double = 0.08,
    /** Smoothing during a real turn. */
    private val fastAlpha: Double = 0.6,
    /** A change this big (degrees) counts as a real turn. */
    private val fastAboveDeg: Double = 25.0,
) {
    private var x = 0.0
    private var y = 0.0
    private var started = false

    val value: Double get() = Geo.normalize360(Math.toDegrees(atan2(y, x)))

    fun add(headingDeg: Double): Double {
        val r = Math.toRadians(headingDeg)
        if (!started) {
            x = cos(r)
            y = sin(r)
            started = true
            return value
        }
        val diff = abs(Geo.normalize180(headingDeg - value))
        val t = (diff / fastAboveDeg).coerceIn(0.0, 1.0)
        val alpha = slowAlpha + (fastAlpha - slowAlpha) * t
        x += alpha * (cos(r) - x)
        y += alpha * (sin(r) - y)
        return value
    }

    fun reset() {
        started = false
    }
}
