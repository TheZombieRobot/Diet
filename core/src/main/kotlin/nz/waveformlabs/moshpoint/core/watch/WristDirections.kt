package nz.waveformlabs.moshpoint.core.watch

import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.DistanceSmoother
import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.MethodArbiter
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.core.TrendTracker

/**
 * Which of the phone's directions still mean anything when the watch does the pointing
 * (docs/WATCH.md, problem 3).
 *
 * A bearing in a [Fix] is always "degrees from true north", but the methods get there in two
 * very different ways:
 *
 * - [POSE_FREE]: plain geometry between two GPS positions (or our GPS and a mate's pinned
 *   "I'm here" spot). It doesn't matter where the phone is or which way up: in a pocket it is
 *   as right as in the hand.
 * - [NEEDS_PHONE_HELD]: measured against the phone's own compass heading. UWB adds the angle
 *   at the phone's antennas to that heading; spin-to-scan fits signal against it while you
 *   turn with the phone on your chest; walk-and-watch treats it as the way you're walking. In
 *   a pocket the antennas face your leg (maybe upside down), your body is in the way, and the
 *   phone's "heading" is not your direction of travel. The distance from these methods stays
 *   good; the direction doesn't.
 */
object WristDirections {
    val POSE_FREE: Set<Method> = setOf(Method.GPS_SERVER, Method.CROWD_RELAY, Method.HERE_PIN)
    val NEEDS_PHONE_HELD: Set<Method> = setOf(Method.UWB, Method.SPIN_SCAN, Method.WALK)

    /** Can a bearing from [method] be shown on the wrist? */
    fun bearingValid(method: Method, phoneHeld: Boolean): Boolean =
        method in POSE_FREE || (phoneHeld && method in NEEDS_PHONE_HELD)

    /**
     * The same fix as the wrist may use it: the bearing is dropped (never the distance) when
     * it depends on a phone that isn't being held up as a finder.
     */
    fun forWrist(fix: Fix, phoneHeld: Boolean): Fix =
        if (fix.bearingDeg != null && !bearingValid(fix.method, phoneHeld)) fix.copy(bearingDeg = null) else fix

    /**
     * Is the phone being held the way its own finder needs: upright or flat, in portrait?
     * From the accelerometer at rest (m/s², phone axes: x right, y up the screen, z out of the
     * glass). The phone's compass maths ("top edge + back of the phone") only holds from flat
     * to upright, and UWB's angle only reads true with the phone the right way up.
     */
    fun phoneHeldLikeAFinder(ax: Double, ay: Double, az: Double): Boolean {
        val g = kotlin.math.sqrt(ax * ax + ay * ay + az * az)
        if (g < 4.0 || g > 16.0) return false // falling, shaking or swinging: no idea
        return ay / g >= -0.25 && // top edge not hanging down
            az / g >= -0.25 && // screen not facing the floor
            kotlin.math.abs(ax) / g <= 0.5 // not turned on its side
    }
}

/**
 * The phone's arbiter for the wrist: the ordinary [MethodArbiter], fed only directions the
 * wrist can trust. So every existing rule still applies (stale fixes dropped, GPS direction
 * ignored once a close-range method says under 20 m, hysteresis between methods, "unsure"),
 * just over a smaller set of directions.
 *
 * Asking the arbiter for an arrow with a heading of 0 gives the bearing from true north
 * itself, which is exactly what the watch needs to do its own pointing.
 */
class WristArbiter {
    private val arbiter = MethodArbiter()
    private val smoothers = mutableMapOf<String, DistanceSmoother>()
    private val trends = mutableMapOf<String, Trending>()

    private class Trending(val method: Method) {
        // Sharper for methods that measure distance properly, so a real approach shows sooner.
        val tracker = TrendTracker(deadband = if (method == Method.UWB || method == Method.WIFI_AWARE) 0.04 else 0.08)
        var lastSampleMs = Long.MIN_VALUE
        var shownM = 0.0
    }

    /** @param phoneHeld the phone is demonstrably being held up as a finder right now. */
    fun submit(fix: Fix, phoneHeld: Boolean) = arbiter.submit(WristDirections.forWrist(fix, phoneHeld))

    fun forget(friendId: String) {
        arbiter.forget(friendId)
        smoothers.remove(friendId)
        trends.remove(friendId)
    }

    /** What to tell the watch about [friendId] right now. */
    fun reading(friendId: String, nowMs: Long, declinationDeg: Double): WristReading {
        val state = arbiter.arrowFor(friendId, headingDeg = 0.0, nowMs = nowMs)
        if (state is ArrowState.NoSignal) {
            smoothers.remove(friendId)
            trends.remove(friendId)
            return WristReading.NONE.copy(declinationDeg = declinationDeg)
        }
        // The fix the arbiter took the distance from: its best-scoring live fix that has one.
        val distanceFix = Method.entries.mapNotNull { arbiter.latestFix(friendId, it) }
            .filter { it.distanceM != null && arbiter.scoreOf(it, nowMs) > 0.0 }
            .maxByOrNull { arbiter.scoreOf(it, nowMs) }
        var shown: Double? = null
        var trend = Trend.STEADY
        if (distanceFix != null) {
            // A different method has a different bias: start the trend again rather than
            // read the jump between them as "warmer" or "colder".
            val t = trends[friendId]?.takeIf { it.method == distanceFix.method }
                ?: Trending(distanceFix.method).also { trends[friendId] = it }
            if (distanceFix.timestampMs > t.lastSampleMs) {
                t.lastSampleMs = distanceFix.timestampMs
                t.tracker.add(distanceFix.distanceM!!, distanceFix.timestampMs)
                t.shownM = smoothers.getOrPut(friendId) { DistanceSmoother() }.update(distanceFix.distanceM)
            }
            shown = t.shownM
            trend = t.tracker.trend()
        }
        val distanceAge = distanceFix?.let { (nowMs - it.timestampMs).coerceAtLeast(0) } ?: 0L
        return when (state) {
            is ArrowState.Pointing -> {
                val directionFix = arbiter.latestFix(friendId, state.method)
                WristReading(
                    kind = WristReading.Kind.POINTING,
                    bearingTrueDeg = Geo.normalize360(state.relativeDeg),
                    distanceM = shown,
                    trend = trend,
                    method = state.method,
                    unsure = state.unsure,
                    directionAgeMs = directionFix?.let { (nowMs - it.timestampMs).coerceAtLeast(0) } ?: 0L,
                    distanceAgeMs = distanceAge,
                    declinationDeg = declinationDeg,
                )
            }
            else -> WristReading(
                kind = WristReading.Kind.DISTANCE_ONLY,
                distanceM = shown,
                trend = trend,
                method = distanceFix?.method,
                distanceAgeMs = distanceAge,
                declinationDeg = declinationDeg,
            )
        }
    }
}
