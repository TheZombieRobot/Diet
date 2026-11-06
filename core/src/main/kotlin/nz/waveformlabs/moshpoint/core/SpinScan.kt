package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Spin-to-scan: works out roughly which way a friend is on phones without UWB.
 *
 * The user holds the phone flat against their chest and turns slowly in a full circle.
 * When they face the friend, nothing is between the phone and the friend, so the
 * Bluetooth signal is strongest. When they face away, their body blocks the signal and
 * it drops. We record (compass heading, RSSI) pairs and fit
 *
 *     rssi(h) = a + b * cos(h - theta)
 *
 * by least squares. `theta` is the heading where the signal peaks, i.e. the direction to
 * the friend. The fit uses every sample, so it copes with noisy readings far better than
 * just taking the single strongest one.
 */
class SpinScan(
    /** How much of the circle must be covered before a result is given. */
    private val requiredCoverageDeg: Double = 300.0,
    private val minSamples: Int = 12,
) {
    data class Sample(val headingDeg: Double, val rssiDbm: Double)

    sealed interface Result {
        /** Keep turning. [coverageDeg] is how much of the circle has been seen so far. */
        data class NeedMore(val coverageDeg: Double) : Result

        /** Signal didn't change enough with direction to tell which way (too close, or blocked). */
        data object Inconclusive : Result

        /**
         * @param bearingDeg absolute bearing to the friend (from the compass), 0..360.
         * @param confidence 0..1, how clearly the body shadow showed up.
         */
        data class Found(val bearingDeg: Double, val confidence: Double) : Result
    }

    private val samples = mutableListOf<Sample>()

    fun add(headingDeg: Double, rssiDbm: Double) {
        samples += Sample(Geo.normalize360(headingDeg), rssiDbm)
    }

    fun reset() = samples.clear()

    /** Which of [count] equal slices of the circle have at least one sample (for the progress ring). */
    fun sectors(count: Int = 36): BooleanArray {
        val out = BooleanArray(count)
        for (s in samples) out[((s.headingDeg / 360.0 * count).toInt()).coerceIn(0, count - 1)] = true
        return out
    }

    /** Angular coverage: 360 minus the largest gap between consecutive headings. */
    fun coverageDeg(): Double {
        if (samples.size < 2) return 0.0
        val sorted = samples.map { it.headingDeg }.sorted()
        var maxGap = 360.0 - sorted.last() + sorted.first()
        for (i in 1 until sorted.size) maxGap = maxOf(maxGap, sorted[i] - sorted[i - 1])
        return 360.0 - maxGap
    }

    fun result(): Result {
        val coverage = coverageDeg()
        if (samples.size < minSamples || coverage < requiredCoverageDeg) return Result.NeedMore(coverage)

        // Linear least squares on rssi = a + c*cos(h) + s*sin(h).
        val n = samples.size
        val rows = samples.map { doubleArrayOf(1.0, cos(Math.toRadians(it.headingDeg)), sin(Math.toRadians(it.headingDeg))) }
        val y = samples.map { it.rssiDbm }
        val ata = Array(3) { i -> DoubleArray(3) { j -> rows.sumOf { it[i] * it[j] } } }
        val aty = DoubleArray(3) { i -> rows.indices.sumOf { k -> rows[k][i] * y[k] } }
        val coef = solve3(ata, aty) ?: return Result.Inconclusive
        val (a, c, s) = Triple(coef[0], coef[1], coef[2])

        val amplitude = sqrt(c * c + s * s)
        val residualRms = sqrt(rows.indices.sumOf { k ->
            val pred = a + c * rows[k][1] + s * rows[k][2]
            (y[k] - pred).let { it * it }
        } / n)

        // A body typically costs several dB. Under ~1.5 dB swing we can't tell direction.
        if (amplitude < 1.5) return Result.Inconclusive
        val snr = amplitude / (residualRms + 1e-9)
        val confidence = (snr / (snr + 1.0)).coerceIn(0.0, 1.0)
        val bearing = Geo.normalize360(Math.toDegrees(atan2(s, c)))
        return Result.Found(bearing, confidence)
    }

    /** Gaussian elimination for a 3x3 system. Returns null if singular. */
    private fun solve3(m: Array<DoubleArray>, v: DoubleArray): DoubleArray? {
        val a = Array(3) { i -> m[i].copyOf() + v[i] }
        for (col in 0 until 3) {
            val pivot = (col until 3).maxBy { abs(a[it][col]) }
            if (abs(a[pivot][col]) < 1e-12) return null
            a[col] = a[pivot].also { a[pivot] = a[col] }
            for (r in 0 until 3) if (r != col) {
                val f = a[r][col] / a[col][col]
                for (k in col..3) a[r][k] -= f * a[col][k]
            }
        }
        return DoubleArray(3) { a[it][3] / a[it][it] }
    }
}
