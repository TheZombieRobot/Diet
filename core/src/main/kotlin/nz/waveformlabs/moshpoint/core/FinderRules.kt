package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.sqrt

// The finder module's small rules (docs/FINDER_MODULE.md), moved here from its Android code so
// they are tested. Each is the same arithmetic it was there, in the same order and with the same
// number types (some of it is Float on purpose: that is what the sensors and Location give).

/**
 * Android quietly stops delivering scan results to an app that starts more than 5 Bluetooth
 * scans in 30 seconds. The finder's one shared scan (BleHub) counts its starts here and keeps one
 * spare: at most [MAX_STARTS] starts in any [WINDOW_MS]. Times are `elapsedRealtime` ms.
 */
class ScanStarts {
    private val starts = ArrayDeque<Long>()

    /** Starts inside the window, as of the last [prune]. */
    val count: Int get() = starts.size

    /** Forget starts that have left the window. */
    fun prune(nowMs: Long) {
        while (starts.isNotEmpty() && nowMs - starts.first() > WINDOW_MS) starts.removeFirst()
    }

    /** No room for another start now. */
    fun full(nowMs: Long): Boolean {
        prune(nowMs)
        return starts.size >= MAX_STARTS
    }

    /** A scan was started at [nowMs]. */
    fun started(nowMs: Long) {
        starts.addLast(nowMs)
    }

    /** How long until there is room for a start (0: now). */
    fun delayToNext(nowMs: Long): Long {
        prune(nowMs)
        if (starts.size < MAX_STARTS) return 0
        return (starts.first() + WINDOW_MS - nowMs + 200).coerceAtLeast(200)
    }

    /** A restart (to hear everyone afresh) may happen: the last start was at least [minGapMs] ago, and there is room. */
    fun mayRestart(nowMs: Long, minGapMs: Long): Boolean {
        prune(nowMs)
        val last = starts.lastOrNull() ?: 0L
        return !(nowMs - last < minGapMs || starts.size >= MAX_STARTS)
    }

    companion object {
        const val WINDOW_MS = 30_000L

        /** Android allows 5 starts per 30 s; keep one spare for safety. */
        const val MAX_STARTS = 4
    }
}

/**
 * "Is the person walking?" from the accelerometer: footsteps make the phone bounce, so the
 * spread of the acceleration's size over the last [WINDOW_MS] jumps up. Standing still (even
 * dancing on the spot, which comes in bursts) stays under [WALKING_SD].
 */
class WalkingTest {
    private val samples = ArrayDeque<Pair<Long, Double>>()

    /**
     * One reading (m/s² on the phone's x, y, z) at [nowMs] (`elapsedRealtime`). Returns walking or
     * not, or null while there are fewer than [MIN_SAMPLES] readings in the window (keep the last
     * answer then).
     */
    fun add(nowMs: Long, x: Float, y: Float, z: Float): Boolean? {
        val m = sqrt(x * x + y * y + z * z.toDouble())
        samples.addLast(nowMs to m)
        while (samples.isNotEmpty() && nowMs - samples.first().first > WINDOW_MS) samples.removeFirst()
        if (samples.size < MIN_SAMPLES) return null
        val mean = samples.sumOf { it.second } / samples.size
        val sd = sqrt(samples.sumOf { (it.second - mean) * (it.second - mean) } / samples.size)
        return sd > WALKING_SD
    }

    fun clear() {
        samples.clear()
    }

    companion object {
        const val WINDOW_MS = 1_500L
        const val MIN_SAMPLES = 10
        const val WALKING_SD = 0.9
    }
}

/**
 * Which way the person holding the phone is facing, from the rotation-vector sensor's 3×3
 * rotation matrix (row-major; rows east, north, up; columns the phone's x, y, z).
 *
 * `SensorManager.getOrientation` only uses the top edge of the phone, which goes haywire once the
 * phone is held upright (looking at the screen, or against your chest): the arrow and the scan
 * then point anywhere. Instead this adds the top edge (right when the phone is flat) to the back
 * of the phone (right when it's upright) and takes the horizontal part.
 */
object CompassHeading {
    /** Degrees clockwise from magnetic north, [0, 360); null when the phone points straight up or down. */
    fun fromRotation(rot: FloatArray): Double? {
        val east = rot[1] - rot[2]
        val north = rot[4] - rot[5]
        if (east * east + north * north < 1e-4f) return null
        val deg = Math.toDegrees(atan2(east.toDouble(), north.toDouble()))
        return (deg + 360) % 360
    }
}

/** Which of two GPS / network positions of this phone to keep. */
object LocationPick {
    /**
     * Keep the new one if it is over 30 s newer, never if it is over 30 s older, and otherwise if
     * it is no more than 1.5 times vaguer. Times are `elapsedRealtimeNanos`; accuracy in metres.
     */
    fun isBetter(newAtNanos: Long, newAccuracyM: Float, oldAtNanos: Long, oldAccuracyM: Float): Boolean {
        val newer = newAtNanos - oldAtNanos
        if (newer > 30_000_000_000L) return true // old fix is >30 s older
        if (newer < -30_000_000_000L) return false
        return newAccuracyM <= oldAccuracyM * 1.5f
    }
}

/** A bearing from our GPS position to a mate's shared one (crowd relay or relay server). */
object GpsFixRule {
    /** Older shared positions aren't used. Public relay posts every ~75 s (more when moving), so allow a few minutes. */
    const val MAX_AGE_MS = 240_000L

    /**
     * How far to trust it, 0.1 to 1: low when the two error circles together are as big as the gap
     * (GPS is useless for direction then), and lower as it ages.
     */
    fun confidence(myAccuracyM: Float, theirAccuracyM: Int, distanceM: Double, ageMs: Long): Double {
        val uncertainty = myAccuracyM + theirAccuracyM
        return (1.0 - uncertainty / max(distanceM, 1.0)).coerceIn(0.1, 1.0) *
            (1.0 - ageMs.toDouble() / MAX_AGE_MS).coerceIn(0.2, 1.0)
    }
}

/**
 * The compass headings of the last few seconds, so a Bluetooth reading (spin scan, walk-and-watch)
 * gets the heading at the moment it was received rather than when its callback ran: otherwise
 * turning while scanning shifts the answer in the direction you're turning.
 */
class HeadingLog {
    private val log = ArrayDeque<Pair<Long, Double>>()

    /** A raw (unsmoothed) heading at [atMs] (`elapsedRealtime`). Keeps the last [MAX]. */
    fun add(atMs: Long, headingDeg: Double) {
        log.addLast(atMs to headingDeg)
        while (log.size > MAX) log.removeFirst()
    }

    /** The logged heading nearest [atMs] if within a second, else [fallback] (also for an unknown time, `atMs` ≤ 0). */
    fun at(atMs: Long, fallback: Double): Double {
        if (atMs <= 0 || log.isEmpty()) return fallback
        var best = log.last()
        for (e in log) if (abs(e.first - atMs) < abs(best.first - atMs)) best = e
        return if (abs(best.first - atMs) < 1_000) best.second else fallback
    }

    companion object {
        /** A few seconds at SENSOR_DELAY_GAME. */
        const val MAX = 200
    }
}
