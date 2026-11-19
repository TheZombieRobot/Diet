package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Live switching itself off when the night is over, or after about 12 hours (launch blocker 3). */
class LiveRulesTest {
    private val t0 = 1_800_000_000_000L
    private val hour = 3600_000L

    @Test fun liveEndsWithItsCrew() {
        val s = LiveRules.start("crewA", t0)
        assertNull(LiveRules.check(s, "crewA", t0 + 3 * hour).off)
        val ended = LiveRules.check(s, null, t0 + 4 * hour)
        assertEquals(LiveRules.Off.CREW_ENDED, ended.off)
    }

    @Test fun liveOutsideACrewStaysOnWhenThereIsNoCrew() {
        val s = LiveRules.start(null, t0)
        assertEquals("", s.crewId)
        assertNull(LiveRules.check(s, null, t0 + 5 * hour).off)
    }

    @Test fun liveOutsideACrewJoinsACrewThatComesOn() {
        // Go live, then make the crew: the usual order. The session belongs to that crew now.
        val s = LiveRules.start(null, t0)
        val joined = LiveRules.check(s, "crewA", t0 + hour)
        assertNull(joined.off)
        assertEquals("crewA", joined.session.crewId)
        assertEquals(t0, joined.session.sinceMs)
        assertEquals(LiveRules.Off.CREW_ENDED, LiveRules.check(joined.session, null, t0 + 6 * hour).off)
    }

    @Test fun switchingCrewsTheSameNightKeepsLiveOn() {
        val s = LiveRules.start("crewA", t0)
        val switched = LiveRules.check(s, "crewB", t0 + hour)
        assertNull(switched.off)
        assertEquals("crewB", switched.session.crewId)
    }

    @Test fun liveStopsAfterTwelveHoursWhateverTheCrew() {
        val s = LiveRules.start("crewA", t0)
        assertNull(LiveRules.check(s, "crewA", t0 + 12 * hour - 1).off)
        assertEquals(LiveRules.Off.TOO_LONG, LiveRules.check(s, "crewA", t0 + 12 * hour).off)
        val alone = LiveRules.start(null, t0)
        assertEquals(LiveRules.Off.TOO_LONG, LiveRules.check(alone, null, t0 + 13 * hour).off)
    }

    @Test fun theNightBeingOverWinsOverTheTimeLimit() {
        // Both true: the quiet reason, not "Still at the gig?".
        val s = LiveRules.start("crewA", t0)
        assertEquals(LiveRules.Off.CREW_ENDED, LiveRules.check(s, null, t0 + 20 * hour).off)
    }

    @Test fun liveFromBeforeThisVersionCountsFromNow() {
        val c = LiveRules.check(null, "crewA", t0)
        assertNull(c.off)
        assertEquals(LiveSession(t0, "crewA"), c.session)
    }

    @Test fun aClockGoingBackNeverMakesANegativeTime() {
        val s = LiveSession(t0 + 5 * hour, "crewA")
        val c = LiveRules.check(s, "crewA", t0)
        assertEquals(t0, c.session.sinceMs)
        assertNull(c.off)
    }

    @Test fun restoredOnlyWhenWantedNotRunningAndStillAllowed() {
        val ok = LiveRules.check(LiveRules.start("crewA", t0), "crewA", t0 + hour)
        assertTrue(LiveRules.shouldRestore(wanted = true, running = false, check = ok))
        assertFalse(LiveRules.shouldRestore(wanted = true, running = true, check = ok))
        assertFalse(LiveRules.shouldRestore(wanted = false, running = false, check = ok))
        val over = LiveRules.check(LiveRules.start("crewA", t0), null, t0 + hour)
        assertFalse(LiveRules.shouldRestore(wanted = true, running = false, check = over))
    }

    @Test fun afterTheTimeLimitTheSameCrewDoesntGoLiveByItself() {
        assertFalse(LiveRules.mayAutoStart("crewA", "crewA"))
        assertTrue(LiveRules.mayAutoStart("crewB", "crewA"))
        assertTrue(LiveRules.mayAutoStart("crewA", null))
        assertTrue(LiveRules.mayAutoStart("crewA", ""))
        assertFalse(LiveRules.mayAutoStart(null, null))
    }

    @Test fun sessionsSurviveARestart() {
        val s = LiveSession(t0, "ab12")
        assertEquals(s, LiveSession.parse(s.save()))
        assertEquals(LiveSession(t0, ""), LiveSession.parse(LiveSession(t0, "").save()))
        assertNull(LiveSession.parse(null))
        assertNull(LiveSession.parse("garbage"))
        assertNull(LiveSession.parse("x,crew"))
    }

    @Test fun anUpdateDoesntSwitchLiveOnForSomeoneWhoWasntLive() {
        // Old builds: Live left marked on, no session saved, no crew tonight: stays off.
        assertFalse(LiveRules.restoresAfterUpdate(null, null))
        assertTrue(LiveRules.restoresAfterUpdate(null, "crewA"))
        assertTrue(LiveRules.restoresAfterUpdate(LiveSession(t0, ""), null))
    }

    @Test fun offIsQuietOnlyWhenTheNightIsReallyOver() {
        assertTrue(LiveRules.quiet(LiveRules.Off.CREW_ENDED, crewOver = true))
        assertFalse(LiveRules.quiet(LiveRules.Off.CREW_ENDED, crewOver = false))
        assertFalse(LiveRules.quiet(LiveRules.Off.TOO_LONG, crewOver = true))
    }
}
