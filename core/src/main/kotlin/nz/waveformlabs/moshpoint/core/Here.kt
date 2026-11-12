package nz.waveformlabs.moshpoint.core

import kotlin.math.max
import kotlin.math.min

/*
 * "I'm here" (docs/IM_HERE.md): you long-press your spot on the map and your crew sees your
 * face there instead of your rough GPS dot, until you walk away or 20 minutes pass. The rules
 * every phone has to apply the same way live here, where tests can fail a build. The message
 * itself is GigGroup.Here; the courier carries it like the meet-up pin.
 */

/** Times, limits and the finder's view of an "I'm here" pin. */
object HereRule {
    /** A pin lasts this long unless it's cleared, moved, or you walk away. */
    const val LIFETIME_MIN = 20

    /** Whatever a message says, it never lasts longer than this, so a wrong or hostile value can't make a pin stick. */
    const val MAX_MIN = 30

    /** A time further ahead of this phone's clock than this is refused: it would win "newest" and outlive its limit. */
    const val FUTURE_SLACK_SEC = PinRule.FUTURE_SLACK_SEC

    /** The finger on the map: how far the chosen spot may be from where they really stand. */
    const val SPOT_SLACK_M = 5.0

    /** At the end of its life a pin's confidence has fallen to this share (it stays above their GPS). */
    const val END_CONFIDENCE = 0.85

    /** Should a message from a sender stamped [incomingSec] replace the newest one seen from them, [currentSec] (0 = none)? */
    fun accepts(incomingSec: Long, currentSec: Long, nowSec: Long): Boolean = PinRule.accepts(incomingSec, currentSec, nowSec)

    /** When it stops counting, by the sender's time, with the length capped. */
    fun endSec(timeSec: Long, minutes: Int): Long = timeSec + minutes.coerceIn(1, MAX_MIN) * 60L

    /**
     * Is it in force at [nowSec] (this phone's clock)? Judged by the sender's time, with two
     * limits for clocks that disagree: stamped more than [FUTURE_SLACK_SEC] ahead, never (so a
     * fast clock stretches a pin by at most that); and never longer than [MAX_MIN].
     */
    fun live(timeSec: Long, minutes: Int, nowSec: Long): Boolean =
        timeSec <= nowSec + FUTURE_SLACK_SEC && nowSec < endSec(timeSec, minutes)

    fun live(h: GigGroup.Here, nowSec: Long): Boolean = live(h.timeSec, h.minutes, nowSec)

    /** The time to stamp on our next pin or clear: now, but always after our last one (so it wins on every phone). */
    fun stamp(nowSec: Long, lastOwnSec: Long): Long = PinRule.stamp(nowSec, lastOwnSec)

    /** How long a clear made at [nowSec] matters: what was left of the pin it takes down (at least a minute). */
    fun clearMinutes(pin: GigGroup.Here?, nowSec: Long): Int {
        if (pin == null || pin.clear) return 1
        val left = endSec(pin.timeSec, pin.minutes) - nowSec
        return ((left + 59) / 60).toInt().coerceIn(1, MAX_MIN)
    }

    /** How old it is by the sender's time, as this phone says it ("pinned 3 min ago"); never below 0. */
    fun ageSec(h: GigGroup.Here, nowSec: Long): Long = (nowSec - h.timeSec).coerceAtLeast(0L)

    /**
     * The finder's reading for a mate's standing pin, from our own position [me] (known to
     * [myAccuracyM]): bearing and distance by geometry. Only our GPS is unsure (the spot is
     * exact, give or take a finger), so the confidence is a GPS fix's with one phone's error;
     * it falls gently with the pin's age, never below [END_CONFIDENCE] of that. Null when the
     * pin isn't in force or is a clear.
     */
    fun fix(friendId: String, me: LatLon, myAccuracyM: Double, h: GigGroup.Here, nowMs: Long): Fix? {
        val spot = h.spot ?: return null
        val nowSec = nowMs / 1000
        if (!live(h, nowSec)) return null
        val distance = Geo.distanceM(me, spot)
        val uncertainty = myAccuracyM.coerceAtLeast(0.0) + SPOT_SLACK_M
        val geometry = (1.0 - uncertainty / max(distance, 1.0)).coerceIn(0.1, 1.0)
        val life = (endSec(h.timeSec, h.minutes) - h.timeSec).coerceAtLeast(1L)
        val aged = min(1.0, ageSec(h, nowSec).toDouble() / life)
        val confidence = geometry * (1.0 - (1.0 - END_CONFIDENCE) * aged)
        return Fix(friendId, Method.HERE_PIN, Geo.bearingDeg(me, spot), distance, confidence, nowMs)
    }
}

/**
 * The crew's "I'm here" pins as this phone knows them: the standing pin of each sender, and the
 * newest time ever seen from each one, so an older pin that turns up late (carried by Bluetooth
 * for a while) can't come back after a clear or a newer pin. One per crew; saved with it.
 */
class HereBook(private val maxSenders: Int = 200) {
    private val newest = LinkedHashMap<Long, Long>()
    private val pins = LinkedHashMap<Long, GigGroup.Here>()

    /** A message arrived, by any route. True if what should be shown changed. */
    fun offer(h: GigGroup.Here, nowSec: Long): Boolean {
        if (h.sender == 0L) return false
        if (!HereRule.accepts(h.timeSec, newest[h.sender] ?: 0L, nowSec)) return false
        newest.remove(h.sender)
        newest[h.sender] = h.timeSec
        while (newest.size > maxSenders) newest.remove(newest.keys.first())
        val had = pins.remove(h.sender)
        // Newer wins even when it's a clear, or already ran out on its way here: the older pin goes either way.
        if (!h.clear && HereRule.live(h, nowSec)) {
            pins[h.sender] = h
            return true
        }
        return had != null
    }

    /** [sender]'s pin, if it's standing. */
    fun of(sender: Long, nowSec: Long): GigGroup.Here? = pins[sender]?.takeIf { HereRule.live(it, nowSec) }

    /** Every standing pin. */
    fun standing(nowSec: Long): List<GigGroup.Here> = pins.values.filter { HereRule.live(it, nowSec) }

    /** The newest time seen from [sender] (0 = nothing): our next own message is stamped after it. */
    fun newestFrom(sender: Long): Long = newest[sender] ?: 0L

    /** Drop pins that ran out. True if any did (what's shown changed). */
    fun expire(nowSec: Long): Boolean = pins.values.removeAll { !HereRule.live(it, nowSec) }

    fun clear() {
        newest.clear()
        pins.clear()
    }

    /** For saving: `n:sender,time;...|p:time,minutes,lat,lon,pressure,sender,id;...`. */
    fun snapshot(): String =
        newest.entries.joinToString(";") { "${it.key},${it.value}" } + "|" +
            pins.values.joinToString(";") { "${it.timeSec},${it.minutes},${it.lat},${it.lon},${it.pressure ?: -1},${it.sender},${it.id}" }

    /** Load what [snapshot] wrote. A time saved far in the future (a wrong clock) is cut back, so it can't block that sender's later pins. */
    fun restore(saved: String?, nowSec: Long) {
        clear()
        if (saved.isNullOrEmpty()) return
        val parts = saved.split('|', limit = 2)
        parts[0].split(';').filter { it.isNotEmpty() }.forEach { e ->
            val f = e.split(',')
            val sender = f.getOrNull(0)?.toLongOrNull() ?: return@forEach
            val t = f.getOrNull(1)?.toLongOrNull() ?: return@forEach
            newest[sender] = PinRule.capped(t, nowSec)
        }
        parts.getOrNull(1)?.split(';')?.filter { it.isNotEmpty() }?.forEach { e ->
            val f = e.split(',')
            if (f.size < 7) return@forEach
            runCatching {
                val h = GigGroup.Here(
                    f[0].toLong(), f[1].toInt(), f[2].toDouble(), f[3].toDouble(),
                    f[4].toInt().takeIf { it >= 0 }, false, f[5].toLong(), f[6].toLong(),
                )
                if (h.sender != 0L && HereRule.live(h, nowSec) && h.timeSec <= (newest[h.sender] ?: Long.MAX_VALUE)) pins[h.sender] = h
            }
        }
    }
}

/**
 * Watches our own standing pin and says when we've left it (docs/IM_HERE.md, problem 4). Fed
 * our GPS positions, the motion detector's "walking or not", and our pressure, while the pin
 * stands and the app is open or we're live.
 *
 * - **Walked away:** GPS puts us [Config.leaveM] further from the spot than the closest we've
 *   been to it since pinning (benefit of the doubt for the fix's accuracy, up to a limit), and
 *   the accelerometer has felt at least [Config.walkNeededMs] of walking since the pin. Indoor
 *   GPS drifts 30 m while you stand at a bar; it doesn't make footsteps. Without a motion
 *   sensor the distance has to be [Config.noMotionLeaveM].
 * - **Changed floor:** our pressure moved [Config.floorHpa] (about 2.5 m) from a reference that
 *   starts at the pin's pressure and follows slow weather while we stay put. Weather moves a
 *   few hundredths of a hPa a minute; stairs and lifts move 0.3 hPa in under a minute. GPS can't
 *   tell the bar on level 2 from the toilets under it.
 */
class HereWatch(pin: GigGroup.Here, private val cfg: Config = Config()) {
    data class Config(
        val leaveM: Double = 30.0,
        /** A fix's accuracy is believed up to this much. */
        val maxAccuracyAllowanceM: Double = 60.0,
        /** Fixes vaguer than this say nothing. */
        val ignoreAccuracyAboveM: Double = 100.0,
        val walkNeededMs: Long = 10_000L,
        /** A gap between motion reports longer than this isn't counted as walking. */
        val maxMotionStepMs: Long = 3_000L,
        val noMotionLeaveM: Double = 60.0,
        val floorHpa: Double = 0.30,
        /** Within this of the reference we're on the same floor, and the reference follows the weather. */
        val sameFloorHpa: Double = 0.12,
        /** How fast the reference may follow (hPa a minute): faster than any weather, slower than stairs. */
        val followHpaPerMin: Double = 0.06,
    )

    enum class Left { WALKED_AWAY, OTHER_FLOOR }

    private val spot = pin.spot
    private var closestM = Double.MAX_VALUE
    private var walkedMs = 0L
    private var lastMotionMs = Long.MIN_VALUE
    private var lastMoving = false
    private var refHpa: Double? = pin.pressure?.let { Baro.toHpa(it) }?.takeIf { Baro.plausible(it) }
    private var refAtMs = Long.MIN_VALUE

    /** How much walking the motion detector has felt since the pin (for tests and the debug log). */
    val walkedSoFarMs: Long get() = walkedMs

    /** The motion detector's verdict, reported about once a second. */
    fun onMotion(moving: Boolean, nowMs: Long) {
        val last = lastMotionMs
        if (last != Long.MIN_VALUE && lastMoving && moving) {
            val step = nowMs - last
            if (step in 1..cfg.maxMotionStepMs) walkedMs += step
        }
        lastMotionMs = nowMs
        lastMoving = moving
    }

    /** A GPS position for this phone. Returns [Left.WALKED_AWAY] when we've walked away from the spot. */
    fun onLocation(at: LatLon, accuracyM: Double, hasMotionSensor: Boolean = true): Left? {
        val spot = spot ?: return null
        if (!accuracyM.isFinite() || accuracyM > cfg.ignoreAccuracyAboveM) return null
        val allowance = accuracyM.coerceIn(0.0, cfg.maxAccuracyAllowanceM)
        val d = Geo.distanceM(at, spot)
        // As close as this fix lets us have been: we may have been right on the spot.
        closestM = min(closestM, (d - allowance).coerceAtLeast(0.0))
        val away = d - allowance - closestM
        val leave = if (hasMotionSensor) cfg.leaveM else cfg.noMotionLeaveM
        if (away <= leave) return null
        if (hasMotionSensor && walkedMs < cfg.walkNeededMs) return null
        return Left.WALKED_AWAY
    }

    /** Our pressure (smoothed). Returns [Left.OTHER_FLOOR] when we've gone up or down a floor. */
    fun onPressure(hPa: Double, nowMs: Long): Left? {
        val ref = refHpa ?: return null
        if (!Baro.plausible(hPa)) return null
        val diff = hPa - ref
        if (kotlin.math.abs(diff) >= cfg.floorHpa) return Left.OTHER_FLOOR
        // Same floor: let the reference follow the weather (at most so fast, so stairs can't drag it along).
        if (kotlin.math.abs(diff) <= cfg.sameFloorHpa) {
            val dtMin = if (refAtMs == Long.MIN_VALUE) 0.0 else (nowMs - refAtMs).coerceAtLeast(0L) / 60_000.0
            val step = cfg.followHpaPerMin * dtMin
            refHpa = ref + diff.coerceIn(-step, step)
        }
        refAtMs = nowMs
        return null
    }
}
