package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.math.max

/**
 * Steadies the distance shown on screen. Raw readings wobble by a metre or two, and with
 * a rolling number that reads as constant twitching (12, 13, 12, 13...). This:
 *  - smooths readings (exponential average, faster when close where precision matters),
 *  - only changes the shown value when the smoothed one has moved by more than a
 *    deadband (about 5%, at least 0.5 m),
 *  - but never lags a real approach: if you've clearly closed in, it updates at once.
 */
class DistanceSmoother(
    private val alpha: Double = 0.35,
    private val deadbandFraction: Double = 0.05,
    private val minDeadbandM: Double = 0.5,
) {
    private var smoothed: Double? = null
    private var shown: Double? = null

    fun reset() {
        smoothed = null
        shown = null
    }

    /** Feed a raw distance; returns what to display. */
    fun update(rawM: Double): Double {
        val s = smoothed?.let { it + alpha * (rawM - it) } ?: rawM
        smoothed = s
        val current = shown
        if (current == null) {
            shown = s
            return s
        }
        val deadband = max(minDeadbandM, current * deadbandFraction)
        if (abs(s - current) > deadband) shown = s
        return shown!!
    }

    companion object {
        /** Round for display so the number doesn't flicker between nearby values. */
        fun roundForDisplay(m: Double): Double = when {
            m < 10 -> Math.round(m * 2) / 2.0   // half metres when close
            m < 100 -> Math.round(m).toDouble()
            else -> Math.round(m / 5) * 5.0
        }
    }
}
