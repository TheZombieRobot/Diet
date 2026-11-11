package nz.waveformlabs.moshpoint.core.watch

import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.HeadingFilter
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import kotlin.math.abs
import kotlin.math.acos
import kotlin.math.atan2

/*
 * The arrow on the wrist (docs/WATCH.md, problems 1 and 2).
 *
 * The phone says where the mate is in world terms: a bearing from TRUE north, a distance, and
 * how old each already was. The watch has a MAGNETIC compass. Everything that turns those two
 * into "draw the arrow at this angle, or don't" lives here, with no Android in it.
 */

/** How the watch is being held, read from the rotation-vector sensor's matrix. */
data class WristPose(
    /** Angle between the watch face and flat, face up: 0 = flat like a compass, 90 = on edge, 180 = face down. */
    val tiltDeg: Double,
    /**
     * Compass direction of the screen's 12 o'clock, degrees clockwise from MAGNETIC north, or
     * null when the screen is so near vertical that "where 12 o'clock points" means nothing.
     */
    val magneticHeadingDeg: Double?,
) {
    companion object {
        /**
         * @param r the 3x3 matrix from Android's `SensorManager.getRotationMatrixFromVector`,
         *   row by row. It turns watch axes into world axes (east, north, up), so column 0 is
         *   where the watch's right edge points, column 1 its top edge, column 2 out of the glass.
         * @param displayRotation `Surface.ROTATION_0..270` as 0..3. A watch worn the other way
         *   round draws upside down while its sensors stay put, so "12 o'clock on screen" moves.
         */
        fun fromRotationMatrix(r: FloatArray, displayRotation: Int = 0): WristPose {
            require(r.size >= 9) { "need a 3x3 rotation matrix" }
            val tilt = Math.toDegrees(acos(r[8].toDouble().coerceIn(-1.0, 1.0)))
            // World (east, north) of the screen's "up" for each way the display can be turned.
            val (east, north) = when (Math.floorMod(displayRotation, 4)) {
                0 -> r[1].toDouble() to r[4].toDouble()
                1 -> r[0].toDouble() to r[3].toDouble()
                2 -> -r[1].toDouble() to -r[4].toDouble()
                else -> -r[0].toDouble() to -r[3].toDouble()
            }
            val heading = if (east * east + north * north < MIN_HORIZONTAL * MIN_HORIZONTAL) null
            else Geo.normalize360(Math.toDegrees(atan2(east, north)))
            return WristPose(tilt, heading)
        }

        /** 12 o'clock must lie at least this much along the ground (cosine of about 78 degrees up). */
        private const val MIN_HORIZONTAL = 0.2
    }
}

/**
 * "Is the wrist held roughly flat, like a compass?" with the edges taken off.
 *
 * The arrow appears once the face has been within [enterBelowDeg] of flat for [enterDwellMs],
 * and stays until it has been past [leaveAboveDeg] for [leaveDwellMs]. The gap between the two
 * angles stops it flickering when you hold the watch right at the limit; the short waits stop
 * it flashing on as your arm swings through level.
 *
 * Why 40 and 50: people read a watch tilted 20-40 degrees towards their eyes, so anything
 * stricter hides the arrow in the normal pose. On a tilted face the angle you see and the
 * angle on the ground differ by up to asin((1-cos t)/(1+cos t)): 7.6 degrees at 40, 12.5 at
 * 50, 19.5 at 60. Past 50, "up on the screen" is turning into "sky".
 */
class WristGate(
    private val enterBelowDeg: Double = ENTER_BELOW_DEG,
    private val leaveAboveDeg: Double = LEAVE_ABOVE_DEG,
    private val enterDwellMs: Long = 300,
    private val leaveDwellMs: Long = 150,
) {
    /** True while a live arrow may be shown. */
    var flat = false
        private set

    /** When [flat] last changed (the clock passed to [update]); 0 before the first change. */
    var changedAtMs = 0L
        private set

    private var pendingSince: Long? = null

    fun update(tiltDeg: Double, nowMs: Long): Boolean {
        val wantsChange = if (flat) tiltDeg > leaveAboveDeg else tiltDeg <= enterBelowDeg
        if (!wantsChange) {
            pendingSince = null
            return flat
        }
        val since = pendingSince ?: nowMs.also { pendingSince = it }
        if (nowMs - since >= (if (flat) leaveDwellMs else enterDwellMs)) {
            flat = !flat
            changedAtMs = nowMs
            pendingSince = null
        }
        return flat
    }

    fun reset() {
        flat = false
        pendingSince = null
        changedAtMs = 0L
    }

    companion object {
        const val ENTER_BELOW_DEG = 40.0
        const val LEAVE_ABOVE_DEG = 50.0
    }
}

/**
 * Works out how long a message takes from phone to watch without ever comparing the two
 * clocks (they can be seconds apart). The watch stamps each renewal with its own clock; the
 * phone sends that stamp back with how long it held it. Round trip = now - stamp - held.
 */
class LinkClock {
    /** Smoothed one-way delay, or null until the first echo. */
    var transitMs: Long? = null
        private set

    /**
     * @param nowWatchMs the watch's clock now (low 32 bits are enough).
     * @param echoedWatchMs the stamp the phone sent back.
     * @param heldMs how long the phone says it sat on it; negative = the phone had nothing to echo.
     */
    fun onEcho(nowWatchMs: Int, echoedWatchMs: Int, heldMs: Int) {
        if (heldMs < 0) return
        // Int subtraction wraps the same way the 32-bit stamp does.
        val roundTrip = (nowWatchMs - echoedWatchMs).toLong() - heldMs
        if (roundTrip < 0 || roundTrip > MAX_ROUND_TRIP_MS) return
        val oneWay = roundTrip / 2
        transitMs = transitMs?.let { it + ((oneWay - it) * 3) / 10 } ?: oneWay
    }

    fun reset() {
        transitMs = null
    }

    private companion object {
        const val MAX_ROUND_TRIP_MS = 10_000L
    }
}

/**
 * What the phone last said about one mate. Ages are how old each reading already was when the
 * phone sent it, so no clock has to agree with any other.
 */
data class WristReading(
    val kind: Kind,
    /** Degrees clockwise from true north; set only when [kind] is [Kind.POINTING]. */
    val bearingTrueDeg: Double? = null,
    val distanceM: Double? = null,
    val trend: Trend = Trend.STEADY,
    /** Where the direction came from when pointing, else where the distance came from. */
    val method: Method? = null,
    /** The phone's own doubt about the direction (old or low-confidence fix). */
    val unsure: Boolean = false,
    val directionAgeMs: Long = 0,
    val distanceAgeMs: Long = 0,
    /** Degrees to add to a magnetic heading to get true north: the value the phone's finder is using. */
    val declinationDeg: Double = 0.0,
) {
    enum class Kind { NO_SIGNAL, DISTANCE_ONLY, POINTING }

    companion object {
        val NONE = WristReading(Kind.NO_SIGNAL)
    }
}

/** Why there's a distance but no arrow. */
enum class NoArrow {
    /** The phone has no direction that is valid on a wrist right now (problem 3). */
    NO_DIRECTION,
    /** There is a direction, but the wrist isn't flat enough to show it honestly. */
    HOLD_FLAT,
    /** This watch has no working compass. */
    NO_COMPASS,
}

/** What the finder screen should draw. */
sealed interface WristView {
    /** Nothing usable yet. */
    data object Searching : WristView

    /** Distance (if known) but no arrow, and why. */
    data class DistanceOnly(val distanceM: Double?, val trend: Trend, val why: NoArrow) : WristView

    /**
     * A live arrow.
     * @param angleDeg clockwise from the screen's 12 o'clock, -180..180.
     * @param rough dim it: the direction is old, low-confidence, or the compass is unsure.
     */
    data class Arrow(val angleDeg: Double, val distanceM: Double?, val rough: Boolean) : WristView
}

object WristArrow {
    /** A brisk walk through a crowd, metres a second: how fast a bearing can go stale. */
    const val WALK_MPS = 1.4

    /** Past this much possible drift the arrow is drawn as rough. */
    const val ROUGH_DRIFT_DEG = 25.0

    /** Used for drift when the distance isn't known: about where GPS arrows stop being offered. */
    private const val UNKNOWN_DISTANCE_M = 20.0

    /** The heading filter for a watch compass read 25 times a second (see docs/WATCH.md, problem 1). */
    fun headingFilter() = HeadingFilter(slowAlpha = 0.15, fastAlpha = 0.8, fastAboveDeg = 25.0)

    /** Magnetic compass + declination = heading from true north. */
    fun trueHeadingDeg(magneticHeadingDeg: Double, declinationDeg: Double): Double =
        Geo.normalize360(magneticHeadingDeg + declinationDeg)

    /** Where to draw the arrow: clockwise from the screen's 12 o'clock, -180..180. */
    fun angleDeg(bearingTrueDeg: Double, magneticHeadingDeg: Double, declinationDeg: Double): Double =
        Geo.relativeDeg(bearingTrueDeg, trueHeadingDeg(magneticHeadingDeg, declinationDeg))

    /**
     * The furthest the true bearing can have swung since the reading was taken, if the wearer
     * has been walking the worst way (straight across) the whole time. A bearing doesn't go
     * stale because the wrist turned (the watch's own compass covers that), only because the
     * wearer moved: at 100 m a reading can be many seconds old and still be right; at 5 m
     * it's wrong almost at once.
     */
    fun driftDeg(ageMs: Long, distanceM: Double?): Double {
        val walked = WALK_MPS * ageMs.coerceAtLeast(0) / 1000.0
        return Math.toDegrees(atan2(walked, (distanceM ?: UNKNOWN_DISTANCE_M).coerceAtLeast(0.5)))
    }

    /**
     * @param sinceReceivedMs how long ago (watch clock) this reading arrived.
     * @param transitMs estimated time it spent on the link ([LinkClock]); 0 if unknown.
     * @param magneticHeadingDeg the watch's filtered compass heading, null with no compass.
     * @param flat [WristGate] says the wrist is held like a compass.
     * @param compassRough the sensor reports poor accuracy (needs a figure-8).
     * @param linkStale updates have stopped arriving on time.
     */
    fun view(
        reading: WristReading?,
        sinceReceivedMs: Long,
        transitMs: Long,
        magneticHeadingDeg: Double?,
        flat: Boolean,
        compassRough: Boolean = false,
        linkStale: Boolean = false,
    ): WristView {
        if (reading == null || reading.kind == WristReading.Kind.NO_SIGNAL) return WristView.Searching
        val bearing = reading.bearingTrueDeg
        if (reading.kind != WristReading.Kind.POINTING || bearing == null) {
            return WristView.DistanceOnly(reading.distanceM, reading.trend, NoArrow.NO_DIRECTION)
        }
        if (magneticHeadingDeg == null) return WristView.DistanceOnly(reading.distanceM, reading.trend, NoArrow.NO_COMPASS)
        if (!flat) return WristView.DistanceOnly(reading.distanceM, reading.trend, NoArrow.HOLD_FLAT)
        val age = reading.directionAgeMs + transitMs.coerceAtLeast(0) + sinceReceivedMs.coerceAtLeast(0)
        val rough = reading.unsure || compassRough || linkStale || driftDeg(age, reading.distanceM) > ROUGH_DRIFT_DEG
        return WristView.Arrow(angleDeg(bearing, magneticHeadingDeg, reading.declinationDeg), reading.distanceM, rough)
    }
}

/**
 * "You're facing them", without chatter: on when the arrow comes within [enterDeg] of straight
 * up the screen, off again only once it has swung past [leaveDeg] (or there's no arrow).
 */
class FacingLatch(private val enterDeg: Double = 15.0, private val leaveDeg: Double = 30.0) {
    var facing = false
        private set

    /** @param angleDeg the live arrow's angle, or null when no trustworthy arrow is showing. */
    fun update(angleDeg: Double?): Boolean {
        facing = when {
            angleDeg == null -> false
            facing -> abs(angleDeg) <= leaveDeg
            else -> abs(angleDeg) <= enterDeg
        }
        return facing
    }
}

/** Has the phone gone quiet? Judged against how often it was asked to speak. */
enum class LinkHealth {
    FRESH, STALE, LOST;

    companion object {
        fun of(msSinceUpdate: Long, fast: Boolean): LinkHealth = when {
            msSinceUpdate > LOST_AFTER_MS -> LOST
            msSinceUpdate > (if (fast) STALE_AFTER_FAST_MS else STALE_AFTER_SLOW_MS) -> STALE
            else -> FRESH
        }

        /** Five missed updates at two a second. */
        const val STALE_AFTER_FAST_MS = 2_500L

        /** Three missed updates at one every two seconds. */
        const val STALE_AFTER_SLOW_MS = 6_500L
        const val LOST_AFTER_MS = 10_000L
    }
}
