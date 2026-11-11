package nz.waveformlabs.moshpoint.core.watch

import nz.waveformlabs.moshpoint.core.Trend
import kotlin.math.log10

/*
 * Buzzes on the wrist (docs/WATCH.md, problem 7): a small vocabulary that means something
 * without looking, told apart by rhythm alone because many watch motors can't vary strength.
 * This file decides WHICH buzz and WHEN; the watch only plays them.
 */

/**
 * One buzz. [pulsesMs] is on, off, on, ... in milliseconds, starting with "on".
 * [guidance] buzzes are played as notification-class vibrations, so the watch's silent mode,
 * Do Not Disturb and battery saver silence them without the app having to guess; the rest are
 * direct feedback for something the wearer is pressing right now.
 */
enum class Buzz(val guidance: Boolean, vararg pulses: Long) {
    /** "Getting there": repeats faster the closer you are. */
    TICK(true, 35),

    /** "You're facing them". */
    FACING(true, 30, 90, 30),

    /** "Wrong way": the gap is growing. */
    WRONG_WAY(true, 380),

    /** "Found them". */
    FOUND(true, 50, 90, 50, 90, 220),

    /** "Lost the phone": guidance has stopped, silence no longer means "no change". */
    LINK_LOST(true, 260, 220, 260),

    /** One step of the hold-to-send ring filling. */
    HOLD_TICK(false, 25),

    /** "Need help was sent." */
    SOS_SENT(false, 650),

    /** A quick ping went. */
    PING_SENT(false, 45),

    /** "That did not send." */
    FAILED(false, 60, 70, 60, 70, 60, 70, 60);

    val pulsesMs: LongArray = pulses

    /** Start to finish. */
    val totalMs: Long get() = pulsesMs.sum()

    /** Time the motor is actually running. */
    val onMs: Long get() = pulsesMs.filterIndexed { i, _ -> i % 2 == 0 }.sum()
}

/**
 * Chooses the guidance buzzes for a find. Call [next] a few times a second with what's known;
 * it returns a buzz to play now, or null.
 *
 * Never a constant buzz, whatever the inputs do: after any buzz there is at least
 * [MIN_SILENCE_MS] of nothing, every pattern is well under a second, and the motor is never
 * on for more than [BUDGET_MS] in any [BUDGET_WINDOW_MS] (a tenth of the time). The fastest
 * ticking, one 35 ms tick every 0.6 s, uses about half of that.
 */
class BuzzPlanner {
    data class Input(
        /** A find is running and buzzes are wanted. False = say nothing and forget everything. */
        val active: Boolean,
        val distanceM: Double? = null,
        val trend: Trend = Trend.STEADY,
        /** [FacingLatch] says the live arrow is pointing straight ahead. */
        val facing: Boolean = false,
        /** Updates from the phone have stopped ([LinkHealth.LOST]). */
        val linkLost: Boolean = false,
    )

    private var quietUntilMs = Long.MIN_VALUE
    private var lastTickMs = Long.MIN_VALUE
    private var lastFacingMs = Long.MIN_VALUE
    private var lastWrongWayMs = Long.MIN_VALUE
    private var wasFacing = false
    private var wasLost = false
    private var lostToSay = false
    private var lastLostMs = Long.MIN_VALUE
    private var foundSaid = false

    /** True once [Buzz.FOUND] has been given: the find is over. */
    val found: Boolean get() = foundSaid

    fun reset() {
        quietUntilMs = Long.MIN_VALUE
        lastTickMs = Long.MIN_VALUE
        lastFacingMs = Long.MIN_VALUE
        lastWrongWayMs = Long.MIN_VALUE
        wasFacing = false
        wasLost = false
        lostToSay = false
        lastLostMs = Long.MIN_VALUE
        foundSaid = false
        spent.clear()
    }

    fun next(nowMs: Long, input: Input): Buzz? {
        if (!input.active) {
            reset()
            return null
        }
        val facingEdge = input.facing && !wasFacing
        wasFacing = input.facing
        if (input.linkLost && !wasLost) lostToSay = true
        if (!input.linkLost) lostToSay = false // it came back before we could say so: nothing to say
        wasLost = input.linkLost
        if (foundSaid) return null
        if (nowMs < quietUntilMs) return null

        // Lost the phone: say so once, then nothing until it's back. Old distances must not
        // keep ticking as if they were news.
        if (input.linkLost) {
            if (!lostToSay || since(lastLostMs, nowMs) < LOST_AT_MOST_EVERY_MS) return null
            lostToSay = false
            lastLostMs = nowMs
            lastTickMs = nowMs
            return play(Buzz.LINK_LOST, nowMs)
        }

        val d = input.distanceM
        if (d != null && d <= FOUND_WITHIN_M) {
            foundSaid = true
            return play(Buzz.FOUND, nowMs)
        }
        if (facingEdge && since(lastFacingMs, nowMs) >= FACING_AT_MOST_EVERY_MS) {
            lastFacingMs = nowMs
            return play(Buzz.FACING, nowMs)
        }
        if (input.trend == Trend.COLDER) {
            // Ticks stop while you're heading away: one long buzz now, and again if it goes on.
            if (since(lastWrongWayMs, nowMs) < WRONG_WAY_EVERY_MS) return null
            lastWrongWayMs = nowMs
            lastTickMs = nowMs
            return play(Buzz.WRONG_WAY, nowMs)
        }
        if (d == null) return null
        if (since(lastTickMs, nowMs) < tickIntervalMs(d)) return null
        lastTickMs = nowMs
        return play(Buzz.TICK, nowMs)
    }

    /** Motor time already spent in the last [BUDGET_WINDOW_MS]: (when, how long). */
    private val spent = ArrayDeque<Pair<Long, Long>>()

    /** Plays [b] unless the motor has been on too much lately; then it's skipped, not queued. */
    private fun play(b: Buzz, nowMs: Long): Buzz? {
        while (spent.isNotEmpty() && nowMs - spent.first().first >= BUDGET_WINDOW_MS) spent.removeFirst()
        // "Found" is the one buzz worth going over for: it's said once and ends the find.
        if (b != Buzz.FOUND && spent.sumOf { it.second } + b.onMs > BUDGET_MS) return null
        spent.addLast(nowMs to b.onMs)
        quietUntilMs = nowMs + b.totalMs + MIN_SILENCE_MS
        return b
    }

    private fun since(thenMs: Long, nowMs: Long) = if (thenMs == Long.MIN_VALUE) Long.MAX_VALUE else nowMs - thenMs

    companion object {
        /** "Right here": the same band the phone's finder calls found. */
        const val FOUND_WITHIN_M = 3.0
        const val MIN_SILENCE_MS = 400L
        const val FACING_AT_MOST_EVERY_MS = 3_000L
        const val WRONG_WAY_EVERY_MS = 6_000L
        const val LOST_AT_MOST_EVERY_MS = 10_000L

        /** At most this much motor time... */
        const val BUDGET_MS = 1_000L

        /** ...in any stretch this long. */
        const val BUDGET_WINDOW_MS = 10_000L
        private const val FAR_M = 150.0
        private const val FAR_TICK_MS = 8_000L
        private const val SLOWEST_TICK_MS = 4_000L
        private const val FASTEST_TICK_MS = 600L

        /**
         * Gap between ticks: 0.6 s at 3 m stretching to 4 s at 150 m, evenly per doubling of
         * distance (that's how closeness feels, and how the radio signal behaves), then a slow
         * 8 s "still on it" beyond that.
         */
        fun tickIntervalMs(distanceM: Double): Long {
            if (distanceM >= FAR_M) return FAR_TICK_MS
            val t = ((log10(distanceM.coerceAtLeast(FOUND_WITHIN_M)) - log10(FOUND_WITHIN_M)) /
                (log10(FAR_M) - log10(FOUND_WITHIN_M))).coerceIn(0.0, 1.0)
            return (FASTEST_TICK_MS + t * (SLOWEST_TICK_MS - FASTEST_TICK_MS)).toLong()
        }
    }
}

/**
 * Hold-to-send for "Need help": nothing goes unless the button is held for the whole
 * [holdMs]; letting go early cancels. Ticks mark each [tickEveryMs] so the hold can be felt.
 */
class HoldToSend(val holdMs: Long = 2_000, private val tickEveryMs: Long = 500) {
    enum class Event { TICK, SEND }

    private var pressedAtMs: Long? = null
    private var ticks = 0
    private var fired = false

    val pressed: Boolean get() = pressedAtMs != null

    fun press(nowMs: Long) {
        if (pressedAtMs != null) return
        pressedAtMs = nowMs
        ticks = 0
        fired = false
    }

    /** Finger lifted, slid off, or the screen went away. */
    fun release() {
        pressedAtMs = null
    }

    /** 0..1: how full the ring is. */
    fun progress(nowMs: Long): Float {
        val at = pressedAtMs ?: return 0f
        if (fired) return 1f
        return ((nowMs - at).toFloat() / holdMs).coerceIn(0f, 1f)
    }

    /** Call every frame while showing the button. [Event.SEND] comes exactly once per full hold. */
    fun poll(nowMs: Long): Event? {
        val at = pressedAtMs ?: return null
        if (fired) return null
        val held = nowMs - at
        if (held >= holdMs) {
            fired = true
            return Event.SEND
        }
        val due = (held / tickEveryMs).toInt()
        if (due > ticks) {
            ticks = due
            return Event.TICK
        }
        return null
    }
}
