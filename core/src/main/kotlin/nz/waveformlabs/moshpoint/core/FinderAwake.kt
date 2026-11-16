package nz.waveformlabs.moshpoint.core

/**
 * When the open finder keeps the phone's screen on (docs/WAVE2C_BATTERY.md; performance audit P0-3).
 *
 * It used to hold the screen on for as long as it was open. In a pocket that kept the fast
 * Bluetooth scan, the 50 Hz compass, GPS every 3 s and the relay polls going: 8–13% of the
 * battery an hour. Now it holds the screen on:
 *  - for [AFTER_TOUCH_MS] after the last touch (opening the finder counts as one);
 *  - while a mate being found is closer than [CLOSE_M]: the last stretch, following the arrow
 *    through the crowd without touching. Only up to [CLOSE_MAX_MS] after the last touch, so a
 *    phone left on the table next to a mate doesn't stay lit all night;
 *  - never once the proximity sensor has read "near" for [POCKET_AFTER_MS] (a pocket or a bag;
 *    a thumb passing over the sensor is shorter).
 * Let go, Android's own screen timeout takes over. When the screen goes off the activity stops
 * and the finder engine stops after its grace period, exactly as when leaving the finder; coming
 * back starts it again.
 */
object FinderAwake {
    const val AFTER_TOUCH_MS = 90_000L
    const val CLOSE_M = 30.0
    const val CLOSE_MAX_MS = 10 * 60_000L
    const val POCKET_AFTER_MS = 1_000L

    /** Android's own threshold for a proximity sensor that measures distance (the call screen's). */
    const val PROXIMITY_NEAR_CM = 5f

    /**
     * Keep the screen on right now? Times on one monotonic clock (Android's elapsed real time).
     * [nearestM]: the nearest mate being found ([nearestM] of the arrows), null if none has a
     * distance. [nearSinceMs]: since when the proximity sensor has read "near", null if it
     * doesn't (or the phone has none).
     */
    fun keepOn(nowMs: Long, lastTouchMs: Long, nearestM: Double?, nearSinceMs: Long?): Boolean {
        if (nearSinceMs != null && nowMs - nearSinceMs >= POCKET_AFTER_MS) return false
        val sinceTouch = nowMs - lastTouchMs
        if (sinceTouch < AFTER_TOUCH_MS) return true
        return nearestM != null && nearestM < CLOSE_M && sinceTouch < CLOSE_MAX_MS
    }

    /** The nearest distance among the finder's arrows (with a direction or without), or null. */
    fun nearestM(arrows: List<ArrowState>): Double? = arrows.mapNotNull {
        when (it) {
            is ArrowState.Pointing -> it.distanceM
            is ArrowState.DistanceOnly -> it.distanceM
            is ArrowState.NoSignal -> null
        }
    }.minOrNull()

    /**
     * A proximity reading means "near", read as Android reads it to switch the screen off during
     * a call: under [PROXIMITY_NEAR_CM] or the sensor's maximum range, whichever is less (sensors
     * that only know near and far report 0 and their maximum).
     */
    fun isNear(distanceCm: Float, maximumRangeCm: Float): Boolean =
        distanceCm >= 0f && distanceCm < minOf(maximumRangeCm, PROXIMITY_NEAR_CM)
}
