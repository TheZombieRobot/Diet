package nz.waveformlabs.moshpoint.core

/**
 * How often, and how precisely, this phone asks for its own position while Live runs or while
 * our "I'm here" pin is watched (docs/WAVE2C_BATTERY.md; performance audit P1-9).
 *
 * It used to ask for GPS and network fixes every 15 s for all of Live (and the pin watch added a
 * 10 s request), although the upload goes out every 3 minutes while you stand still. Indoors GPS
 * hunts for a fix the whole time. Now:
 *  - **[Mode.ACTIVE]**, GPS and network every 15 s (as before): while a mate is looking for us
 *    (their "looking" advert heard: [BOOST_MS], refreshed each time), while we're walking (a sign
 *    of walking in the last [WALK_HOLD_MS]), and on a phone that can't tell walking from standing
 *    with the screen off;
 *  - **[Mode.STILL]**, Wi-Fi and cell positioning (no GPS) every 60 s: otherwise.
 * Starting Live or the pin watch counts as a sign of walking, so each starts with GPS fixes.
 */
object GpsCadence {
    enum class Mode(val intervalMs: Long, val highAccuracy: Boolean) {
        STILL(60_000L, highAccuracy = false),
        ACTIVE(15_000L, highAccuracy = true),
    }

    /** After the last sign of walking, GPS stays on this long. */
    const val WALK_HOLD_MS = 2 * 60_000L

    /** A mate's "looking" advert keeps GPS on this long (and uploads more often: LocationUploader). */
    const val BOOST_MS = 5 * 60_000L

    /**
     * The mode right now. Times on one monotonic clock. [boostUntilMs]: a mate is looking until
     * then (0: nobody). [lastMotionMs]: the last sign of walking, null if none. [sensesMotion]:
     * the phone has a motion sensor that can wake it (Android's significant motion sensor).
     */
    fun mode(nowMs: Long, boostUntilMs: Long, lastMotionMs: Long?, sensesMotion: Boolean): Mode = when {
        nowMs < boostUntilMs -> Mode.ACTIVE
        !sensesMotion -> Mode.ACTIVE
        lastMotionMs != null && nowMs - lastMotionMs < WALK_HOLD_MS -> Mode.ACTIVE
        else -> Mode.STILL
    }
}
