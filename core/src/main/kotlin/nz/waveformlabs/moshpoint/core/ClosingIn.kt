package nz.waveformlabs.moshpoint.core

/**
 * The finder's heartbeat: a tick each time you've got noticeably closer to the nearest mate
 * you're finding, only within [START_M]. Standing still or moving away is silent: a beat that
 * never changes tells you nothing (and it used to tick every half second at 8 m for as long as
 * the finder was open). Under [STOP_M] the "found" buzz takes over.
 *
 * Distances wobble (UWB by centimetres, Bluetooth by metres), so "closer" means closer than the
 * furthest reading since the last tick by a step ([stepAt]): a metre up close, a tenth of the
 * distance further out. Walking away and coming back ticks again on the way back in.
 */
class ClosingIn(private val startM: Double = START_M) {
    private var mate: String? = null
    private var anchorM: Double? = null

    /** The nearest mate now ([mateId] at [distanceM]; nulls: nobody measured). True: tick now. */
    fun update(mateId: String?, distanceM: Double?): Boolean {
        if (mateId == null || distanceM == null || distanceM >= startM) {
            mate = null
            anchorM = null
            return false
        }
        // Coming into range, or someone else is nearest now: start measuring from here.
        if (mateId != mate) {
            mate = mateId
            anchorM = distanceM
            return false
        }
        val anchor = anchorM ?: distanceM
        if (distanceM < STOP_M) {
            anchorM = distanceM
            return false
        }
        if (distanceM > anchor) {
            anchorM = distanceM
            return false
        }
        if (anchor - distanceM >= stepAt(anchor)) {
            anchorM = distanceM
            return true
        }
        return false
    }

    companion object {
        /** No ticks further away than this. */
        const val START_M = 20.0

        /** Right next to them: no ticks, the finder's "found" buzz says it. */
        const val STOP_M = 3.0

        /** How much closer counts as getting closer from [distanceM] away. */
        fun stepAt(distanceM: Double): Double = maxOf(1.0, distanceM * 0.1)
    }
}
