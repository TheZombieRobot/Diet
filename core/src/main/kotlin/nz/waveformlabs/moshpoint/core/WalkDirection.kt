package nz.waveformlabs.moshpoint.core

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Walk-and-watch: which way is the friend, from how the Bluetooth signal changes as you
 * walk around. This is what Find My / Tile style "hotter, colder" finding relies on, made
 * automatic.
 *
 * While you walk we dead-reckon a rough track (compass heading x a normal walking pace)
 * and fit the signal as a slope over that patch of ground:
 *
 *     rssi = r0 + gEast * east + gNorth * north
 *
 * The slope points uphill, towards the friend. Every reading counts, so the 5-10 dB of
 * crowd noise on each one averages out, and it uses real changes in distance rather than
 * the few dB a body blocks (spin-to-scan), so it holds up much better in a crowd.
 * It needs you to have walked in at least two clearly different directions: one straight
 * line only tells you warmer or colder along it.
 *
 * Feed it each raw reading with the compass heading and whether the phone thinks you're
 * walking.
 */
class WalkDirection(
    private val historyMs: Long = 45_000,
    /** Assumed pace while walking; only the shape of the track matters, not its scale. */
    private val paceMps: Double = 1.0,
) {
    private data class Point(val tMs: Long, val east: Double, val north: Double, val rssi: Double)

    private val points = ArrayDeque<Point>()
    private var east = 0.0
    private var north = 0.0
    private var lastT: Long? = null

    fun add(tMs: Long, headingDeg: Double, rssiDbm: Double, moving: Boolean) {
        val prev = lastT
        if (prev != null && moving) {
            val dt = ((tMs - prev).coerceIn(0, 1_000)) / 1000.0
            east += paceMps * dt * sin(Math.toRadians(headingDeg))
            north += paceMps * dt * cos(Math.toRadians(headingDeg))
        }
        lastT = tMs
        points.addLast(Point(tMs, east, north, rssiDbm))
        while (points.isNotEmpty() && tMs - points.first().tMs > historyMs) points.removeFirst()
    }

    fun reset() {
        points.clear()
        lastT = null
    }

    /**
     * The bearing (0..360, compass) to the friend with a confidence 0..1, or null if the
     * walking so far doesn't show it clearly.
     */
    fun estimate(): Pair<Double, Double>? {
        val pts = points.toList()
        if (pts.size < 20) return null
        val me = pts.map { it.east }.average()
        val mn = pts.map { it.north }.average()
        // How the track is spread out: both directions need a few metres of walking.
        var see = 0.0
        var snn = 0.0
        var sen = 0.0
        for (p in pts) {
            val e = p.east - me
            val n = p.north - mn
            see += e * e
            snn += n * n
            sen += e * n
        }
        val tr = (see + snn) / pts.size
        val det = (see * snn - sen * sen) / (pts.size.toDouble() * pts.size)
        val minVar = tr / 2 - sqrt((tr * tr / 4 - det).coerceAtLeast(0.0))
        if (sqrt(minVar.coerceAtLeast(0.0)) < 1.5) return null // basically one straight line

        val rows = pts.map { doubleArrayOf(1.0, it.east - me, it.north - mn) }
        val y = pts.map { it.rssi }
        val coef = LeastSquares.solve(rows, y) ?: return null
        val gE = coef[1]
        val gN = coef[2]
        val slope = hypot(gE, gN)
        val sigma = sqrt(rows.indices.sumOf { k ->
            val p = coef[0] + gE * rows[k][1] + gN * rows[k][2]
            (y[k] - p).let { it * it }
        } / (pts.size - 3).coerceAtLeast(1))
        // Standard error of the slope across the narrowest direction we walked.
        val se = sigma / sqrt(pts.size * minVar)
        val snr = slope / (se + 1e-9)
        if (slope < 0.15 || snr < 3.0) return null
        val bearing = Geo.normalize360(Math.toDegrees(atan2(gE, gN)))
        return bearing to (snr / (snr + 4.0)).coerceIn(0.0, 0.9)
    }
}

/** Small least-squares helper (normal equations, Gaussian elimination). */
internal object LeastSquares {
    fun solve(rows: List<DoubleArray>, y: List<Double>): DoubleArray? {
        val n = rows.first().size
        val a = Array(n) { i -> DoubleArray(n + 1) { j -> if (j < n) rows.sumOf { it[i] * it[j] } else rows.indices.sumOf { k -> rows[k][i] * y[k] } } }
        for (col in 0 until n) {
            val pivot = (col until n).maxBy { kotlin.math.abs(a[it][col]) }
            if (kotlin.math.abs(a[pivot][col]) < 1e-12) return null
            a[col] = a[pivot].also { a[pivot] = a[col] }
            for (r in 0 until n) if (r != col) {
                val f = a[r][col] / a[col][col]
                for (k in col..n) a[r][k] -= f * a[col][k]
            }
        }
        return DoubleArray(n) { a[it][n] / a[it][it] }
    }
}
