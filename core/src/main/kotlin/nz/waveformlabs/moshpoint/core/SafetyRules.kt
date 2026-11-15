package nz.waveformlabs.moshpoint.core

import nz.waveformlabs.moshpoint.core.watch.PingOutcome

/**
 * The phone's Need help dialog says what the outbox ([Courier]) knows about the crew alert, and
 * nothing kinder (launch blocker 1). It uses the watch's model, [PingOutcome], so the phone and
 * the wrist always say the same thing about the same alert:
 *
 * | outbox ([OutboxState]) | [PingOutcome] | the dialog says |
 * |---|---|---|
 * | SENDING (first try under way) | UNCONFIRMED | Sending… |
 * | WAITING (no signal, no crew phone has it) | WAITING | Not sent yet (+ Go live when that's why) |
 * | NEARBY (a crew phone nearby has it) | SENT_NEARBY | Sent nearby |
 * | SENT (the relay has it) | SENT | Sent to your crew |
 * | FAILED (gave up), or not in the outbox at all | FAILED | Not sent |
 */
object HelpRules {
    /** Where an alert in outbox state [outbox] has got to; null = the outbox isn't holding it (it refused it). */
    fun outcomeOf(outbox: Int?): PingOutcome = when (outbox) {
        OutboxState.SENT -> PingOutcome.SENT
        OutboxState.NEARBY -> PingOutcome.SENT_NEARBY
        OutboxState.WAITING -> PingOutcome.WAITING
        OutboxState.SENDING -> PingOutcome.UNCONFIRMED
        else -> PingOutcome.FAILED
    }

    /**
     * The state to keep for an alert that was in [before] when the outbox reported [news]. The
     * outbox's own rule ([OutboxState.mayMove]): forward only, so "Sent" is never taken back by
     * a late report, while a try that failed may still turn into "Not sent".
     */
    fun next(before: Int, news: Int): Int = if (OutboxState.mayMove(before, news)) news else before

    /** Why an alert that is "Not sent yet" is waiting, and so what the dialog offers. */
    enum class Wait {
        /** No signal and not live: Bluetooth isn't carrying messages. Offer Go live. */
        GO_LIVE,

        /** Live, no signal, and Bluetooth is off. */
        BLUETOOTH_OFF,

        /** Live, no signal, and this phone's Bluetooth can't carry a whole message. */
        CANT_CARRY,

        /** Live, no signal, Bluetooth on: it goes to the first crew phone that comes near. */
        LOOKING_NEARBY,

        /** There is signal, but the relay didn't take it yet (slow, or asked us to wait): it retries by itself. */
        RETRYING,
    }

    /** Same order of reasons as the crew chat's no-signal note (OfflineMessages.chatHint). */
    fun waitReason(online: Boolean, live: Boolean, bluetoothOn: Boolean, canCarry: Boolean): Wait = when {
        online -> Wait.RETRYING
        !live -> Wait.GO_LIVE
        !bluetoothOn -> Wait.BLUETOOTH_OFF
        !canCarry -> Wait.CANT_CARRY
        else -> Wait.LOOKING_NEARBY
    }

    /** Is the alert still on its way, so texting or calling (which work without data) is worth pointing at? */
    fun pointToTextOrCall(outcome: PingOutcome): Boolean =
        outcome == PingOutcome.WAITING || outcome == PingOutcome.FAILED

    /**
     * Opening Need help again soon after an alert shows how that alert is doing, rather than
     * offering to send another straight away. After this long it starts afresh.
     */
    const val SHOW_LAST_FOR_MS = 30 * 60_000L

    fun showsLast(sentAtMs: Long, nowMs: Long): Boolean = nowMs >= sentAtMs && nowMs - sentAtMs < SHOW_LAST_FOR_MS

    /** May the alert row be tapped to send (again)? Only when nobody has it and nothing is on its way. */
    fun maySend(outcome: PingOutcome?): Boolean = outcome == null || outcome == PingOutcome.FAILED
}

/**
 * A live session: Live was switched on at [sinceMs] (wall clock) for the crew [crewId]
 * (GigArchive.idFor; "" = Live was switched on with no crew on).
 */
data class LiveSession(val sinceMs: Long, val crewId: String) {
    fun save(): String = "$sinceMs,$crewId"

    companion object {
        fun parse(s: String?): LiveSession? {
            val parts = s?.split(',', limit = 2) ?: return null
            if (parts.size != 2) return null
            val since = parts[0].toLongOrNull() ?: return null
            return LiveSession(since, parts[1])
        }
    }
}

/**
 * When Live switches itself off (launch blocker 3; performance P0-1: Live used to run on after
 * the gig, 13–19% of the battery a day).
 *
 *  - The crew it was switched on for has ended (expired, ended, left, or gone back to sleep
 *    until a later gig) and no other crew is on now: off, quietly (the night is over).
 *  - Switched on with no crew on: it stays a session of its own, unless a crew comes on while
 *    it's live, which it then joins (going live and then making the crew is the usual order).
 *  - Two crews the same night ("Switch"): the session follows the main crew; the night goes on.
 *  - Whatever the crew: off after [MAX_MS], with a "Still at the gig?" notice. "Stay live after
 *    a restart" doesn't change this: it is about restarts, not about staying on for ever.
 */
object LiveRules {
    /** About 12 hours: a whole festival day, but never a forgotten night and the day after. */
    const val MAX_MS = 12 * 3600_000L

    enum class Off {
        /** The crew's night is over. Quiet: the crew's own "is over" notification says it. */
        CREW_ENDED,

        /** On for [MAX_MS]: "Still at the gig?" */
        TOO_LONG,
    }

    /** The session to keep (possibly updated) and, if Live should go off now, why. */
    class Check(val session: LiveSession, val off: Off?)

    /**
     * [session]: the saved one, or null when there is none (Live was on before this version):
     * then it counts from now. [crewOnNow]: the main crew if it's on now (on the night, not
     * asleep until a later date, not followed from home), else null.
     */
    fun check(session: LiveSession?, crewOnNow: String?, nowMs: Long): Check {
        var s = session ?: LiveSession(nowMs, crewOnNow.orEmpty())
        // The clock went back past the start: count from now, never a negative time.
        if (nowMs < s.sinceMs) s = s.copy(sinceMs = nowMs)
        if (crewOnNow != null && crewOnNow != s.crewId) {
            // Joins the crew that came on (or the one switched to the same night).
            s = s.copy(crewId = crewOnNow)
        } else if (crewOnNow == null && s.crewId.isNotEmpty()) {
            return Check(s, Off.CREW_ENDED)
        }
        if (nowMs - s.sinceMs >= MAX_MS) return Check(s, Off.TOO_LONG)
        return Check(s, null)
    }

    /** A new session, switched on now (by you, the tile, or by being in a crew tonight). */
    fun start(crewOnNow: String?, nowMs: Long) = LiveSession(nowMs, crewOnNow.orEmpty())

    /**
     * The app came to the front, or the system restarted us. Live is meant to be on ([wanted])
     * but nothing is running: start it again, unless the rules above say it should be off.
     */
    fun shouldRestore(wanted: Boolean, running: Boolean, check: Check): Boolean = wanted && !running && check.off == null

    /**
     * Going live by itself because you're in a crew tonight (the app opened) is skipped for
     * the crew whose session the app itself turned off after [MAX_MS]: you said nothing yet to
     * "Still at the gig?". A later crew goes live as usual.
     */
    fun mayAutoStart(crewOnNow: String?, cappedCrew: String?): Boolean =
        crewOnNow != null && (cappedCrew.isNullOrEmpty() || cappedCrew != crewOnNow)
}

/**
 * When to set a background check's alarm again (reliability P1-5). The app sets it at start,
 * after a reboot and after an update; doing that each time the app opens must never push a
 * planned check back (an app opened every half hour would otherwise never be checked by the
 * hourly alarm), and a check that was lost (reboot, update) runs soon.
 */
object AlarmPlan {
    /**
     * [plannedMs]: when the alarm was last planned for (0 = never). Returns when to set it for.
     * [lostDelayMs]: how soon a lost or missed check runs.
     */
    fun next(plannedMs: Long, nowMs: Long, intervalMs: Long, lostDelayMs: Long): Long = when {
        plannedMs <= 0L -> nowMs + intervalMs
        plannedMs <= nowMs -> nowMs + lostDelayMs
        // Planned further out than one interval: the clock moved back. Start again from now.
        plannedMs > nowMs + intervalMs -> nowMs + intervalMs
        else -> plannedMs
    }
}

/**
 * "Storage full" is said once, not on every write that fails (reliability P1-6): once, and
 * again only if it is still full a day later.
 */
object StorageNotice {
    const val AGAIN_AFTER_MS = 24 * 3600_000L

    fun shouldTell(lastToldMs: Long, nowMs: Long): Boolean =
        lastToldMs <= 0L || nowMs < lastToldMs || nowMs - lastToldMs >= AGAIN_AFTER_MS

    /** Is this failure a full disk (ENOSPC), going by the exception's messages? */
    fun isFull(t: Throwable?): Boolean {
        var e = t
        var depth = 0
        while (e != null && depth < 8) {
            val m = e.message.orEmpty()
            if (m.contains("ENOSPC") || m.contains("No space left", ignoreCase = true)) return true
            e = e.cause
            depth++
        }
        return false
    }
}

/**
 * Your own check-in ("Heading home, tell them if I'm not home in 45 min"): a reminder shortly
 * before the crew is alerted, so a forgotten "I'm home safe" doesn't set every crew phone off.
 */
object CheckInReminder {
    /** How long before the deadline the reminder comes. */
    const val BEFORE_SEC = 5 * 60L

    /** When to remind for a check-in due home at [deadlineSec], sent at [sentSec]. */
    fun atSec(sentSec: Long, deadlineSec: Long): Long = maxOf(sentSec + (deadlineSec - sentSec) / 2, deadlineSec - BEFORE_SEC)
}
