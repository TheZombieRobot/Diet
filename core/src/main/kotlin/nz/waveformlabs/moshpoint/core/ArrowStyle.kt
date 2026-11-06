package nz.waveformlabs.moshpoint.core

import kotlin.math.roundToInt

/**
 * Colour and label rules for the arrows on the main screen.
 *
 * An arrow starts red when a friend first comes into range and fades into that friend's
 * own colour as you close in. Colours are packed ARGB ints so the logic stays testable
 * without Android.
 */
object ArrowStyle {
    const val RED: Int = 0xFFE53935.toInt()

    /** At or beyond this distance the arrow is fully red. */
    const val FAR_M = 150.0

    /** At or inside this distance the arrow is fully the friend's colour. */
    const val NEAR_M = 10.0

    /** 0 = far (red), 1 = near (friend colour). Unknown distance stays red. */
    fun closeness(distanceM: Double?): Double {
        if (distanceM == null) return 0.0
        return ((FAR_M - distanceM) / (FAR_M - NEAR_M)).coerceIn(0.0, 1.0)
    }

    fun arrowColor(friendColor: Int, distanceM: Double?): Int = lerpArgb(RED, friendColor, closeness(distanceM))

    fun lerpArgb(from: Int, to: Int, t: Double): Int {
        fun ch(c: Int, shift: Int) = (c ushr shift) and 0xFF
        fun mix(shift: Int) = (ch(from, shift) + (ch(to, shift) - ch(from, shift)) * t).roundToInt() and 0xFF
        return (mix(24) shl 24) or (mix(16) shl 16) or (mix(8) shl 8) or mix(0)
    }

    /** The small readout under each arrow, e.g. "40 m" or "1.2 km". */
    fun distanceLabel(distanceM: Double?): String = when {
        distanceM == null -> "?"
        distanceM < 1 -> "< 1 m"
        distanceM < 10 -> "${(distanceM * 10).roundToInt() / 10.0} m".replace(".0 m", " m")
        distanceM < 1000 -> "${(distanceM / 5).roundToInt() * 5} m"
        else -> "${(distanceM / 100).roundToInt() / 10.0} km"
    }
}
