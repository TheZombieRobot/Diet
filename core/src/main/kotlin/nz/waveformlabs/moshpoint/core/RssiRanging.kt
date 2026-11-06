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
    private val alpha: Double = 0.25,
) {
    private var smoothed: Double? = null

    fun add(rssiDbm: Int): Double {
        val s = smoothed?.let { it + alpha * (rssiDbm - it) } ?: rssiDbm.toDouble()
        smoothed = s
        return distanceFor(s)
    }

    fun distanceFor(rssiDbm: Double): Double =
        10.0.pow((rssiAt1m - rssiDbm) / (10 * pathLossExponent))

    fun reset() {
        smoothed = null
    }
}
