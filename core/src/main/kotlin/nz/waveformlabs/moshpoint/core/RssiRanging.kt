package nz.waveformlabs.moshpoint.core

import kotlin.math.pow

/**
 * Turns Bluetooth signal strength (RSSI, dBm) into a rough distance.
 *
 * Uses the log-distance path-loss model with light smoothing, because single RSSI
 * readings jump around a lot, and even more in a packed crowd where bodies soak up the
 * 2.4 GHz signal. [pathLossExponent] around 2 is open air; crowds are more like 2.7-3.5.
 * Both constants need tuning with real phones at a real gig.
 */
class RssiRanging(
    /** Expected RSSI at 1 m. Ideally comes from the broadcaster's advertised Tx power. */
    private val rssiAt1m: Double = -59.0,
    private val pathLossExponent: Double = 2.8,
    /** Smoothing factor for the exponential moving average, 0..1 (higher = snappier). */
    private val alpha: Double = 0.35,
) {
    private var smoothed: Double? = null
    private val window = ArrayDeque<Pair<Long, Int>>()

    /** The current smoothed signal (dBm), or null before the first reading. */
    val smoothedDbm: Double? get() = smoothed

    /**
     * Adds a reading and returns the smoothed distance. Takes the median of the last
     * [WINDOW_MS] first (one body walking past can knock 10-20 dB off a single reading),
     * then a light moving average, so the number moves steadily however fast adverts arrive.
     */
    fun add(rssiDbm: Int, nowMs: Long = System.currentTimeMillis()): Double {
        window.addLast(nowMs to rssiDbm)
        while (window.size > 1 && nowMs - window.first().first > WINDOW_MS) window.removeFirst()
        val sorted = window.map { it.second }.sorted()
        val median = if (sorted.size % 2 == 1) sorted[sorted.size / 2].toDouble()
        else (sorted[sorted.size / 2 - 1] + sorted[sorted.size / 2]) / 2.0
        val s = smoothed?.let { it + alpha * (median - it) } ?: median
        smoothed = s
        return distanceFor(s)
    }

    fun distanceFor(rssiDbm: Double): Double =
        10.0.pow((rssiAt1m - rssiDbm) / (10 * pathLossExponent))

    fun reset() {
        smoothed = null
        window.clear()
    }

    private companion object {
        const val WINDOW_MS = 2_000L
    }
}
