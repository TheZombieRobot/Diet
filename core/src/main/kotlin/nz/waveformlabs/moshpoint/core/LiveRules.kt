package nz.waveformlabs.moshpoint.core

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
     * After an app update: Live comes back only for a real session (one this version saved) or a
     * crew on tonight. Older builds left Live marked on after the service was killed, with no
     * session saved, so without this the first update would switch Live on for people who
     * weren't live.
     */
    fun restoresAfterUpdate(session: LiveSession?, crewOnNow: String?): Boolean = session != null || crewOnNow != null

    /**
     * Live going off by itself is quiet only when the night really is over ([crewOver]: no main
     * crew, or past its end by a clock that hasn't just jumped). Off while the crew is still on
     * (now asleep until a later date, or followed from home): you're told.
     */
    fun quiet(off: Off, crewOver: Boolean): Boolean = off == Off.CREW_ENDED && crewOver

    /**
     * Going live by itself because you're in a crew tonight (the app opened) is skipped for
     * the crew whose session the app itself turned off after [MAX_MS]: you said nothing yet to
     * "Still at the gig?". A later crew goes live as usual.
     */
    fun mayAutoStart(crewOnNow: String?, cappedCrew: String?): Boolean =
        crewOnNow != null && (cappedCrew.isNullOrEmpty() || cappedCrew != crewOnNow)
}
