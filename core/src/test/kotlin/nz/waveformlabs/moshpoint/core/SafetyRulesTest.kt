package nz.waveformlabs.moshpoint.core

import nz.waveformlabs.moshpoint.core.watch.PingOutcome
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Launch blockers 1–3 and the reliability fixes around them (docs/WAVE2_SAFETY.md). */
class SafetyRulesTest {
    // ---- Need help: what the dialog says is what the outbox knows ----

    @Test fun helpSaysWhatTheOutboxKnows() {
        assertEquals(PingOutcome.UNCONFIRMED, HelpRules.outcomeOf(OutboxState.SENDING))
        assertEquals(PingOutcome.WAITING, HelpRules.outcomeOf(OutboxState.WAITING))
        assertEquals(PingOutcome.SENT_NEARBY, HelpRules.outcomeOf(OutboxState.NEARBY))
        assertEquals(PingOutcome.SENT, HelpRules.outcomeOf(OutboxState.SENT))
        assertEquals(PingOutcome.FAILED, HelpRules.outcomeOf(OutboxState.FAILED))
        // The outbox refused it (no crew it knows, or not a message of ours): nobody has it.
        assertEquals(PingOutcome.FAILED, HelpRules.outcomeOf(null))
    }

    /** The old dialog said "Crew alerted ✓" on the tap itself. Nothing but SENT may say sent. */
    @Test fun onlyTheRelayHavingItCountsAsSent() {
        val sentToAll = listOf(OutboxState.SENDING, OutboxState.WAITING, OutboxState.NEARBY, OutboxState.FAILED, null)
            .filter { HelpRules.outcomeOf(it) == PingOutcome.SENT }
        assertTrue(sentToAll.isEmpty())
    }

    @Test fun helpOnlyMovesForward() {
        // A late "waiting" never takes back "sent nearby" or "sent".
        assertEquals(OutboxState.NEARBY, HelpRules.next(OutboxState.NEARBY, OutboxState.WAITING))
        assertEquals(OutboxState.SENT, HelpRules.next(OutboxState.SENT, OutboxState.WAITING))
        assertEquals(OutboxState.SENT, HelpRules.next(OutboxState.SENT, OutboxState.FAILED))
        // Forward steps are taken.
        assertEquals(OutboxState.WAITING, HelpRules.next(OutboxState.SENDING, OutboxState.WAITING))
        assertEquals(OutboxState.NEARBY, HelpRules.next(OutboxState.WAITING, OutboxState.NEARBY))
        assertEquals(OutboxState.SENT, HelpRules.next(OutboxState.NEARBY, OutboxState.SENT))
        // A first try that failed, or a wait that ran out, may still end as "Not sent".
        assertEquals(OutboxState.FAILED, HelpRules.next(OutboxState.WAITING, OutboxState.FAILED))
        assertEquals(OutboxState.FAILED, HelpRules.next(OutboxState.SENDING, OutboxState.FAILED))
    }

    @Test fun whyNotSentYet() {
        // Not live with no signal: the Bluetooth radio is off, so offer Go live.
        assertEquals(HelpRules.Wait.GO_LIVE, HelpRules.waitReason(online = false, live = false, bluetoothOn = true, canCarry = true))
        assertEquals(HelpRules.Wait.BLUETOOTH_OFF, HelpRules.waitReason(online = false, live = true, bluetoothOn = false, canCarry = false))
        assertEquals(HelpRules.Wait.CANT_CARRY, HelpRules.waitReason(online = false, live = true, bluetoothOn = true, canCarry = false))
        assertEquals(HelpRules.Wait.LOOKING_NEARBY, HelpRules.waitReason(online = false, live = true, bluetoothOn = true, canCarry = true))
        // With signal, Go live wouldn't help: the relay is just slow, and it retries by itself.
        assertEquals(HelpRules.Wait.RETRYING, HelpRules.waitReason(online = true, live = false, bluetoothOn = false, canCarry = false))
    }

    @Test fun textOrCallIsPointedAtWhileNobodyHasIt() {
        assertTrue(HelpRules.pointToTextOrCall(PingOutcome.WAITING))
        assertTrue(HelpRules.pointToTextOrCall(PingOutcome.FAILED))
        assertFalse(HelpRules.pointToTextOrCall(PingOutcome.SENT))
        assertFalse(HelpRules.pointToTextOrCall(PingOutcome.SENT_NEARBY))
        assertFalse(HelpRules.pointToTextOrCall(PingOutcome.UNCONFIRMED))
    }

    @Test fun anAlertIsNeverSentTwiceByATap() {
        assertTrue(HelpRules.maySend(null))
        assertTrue(HelpRules.maySend(PingOutcome.FAILED))
        listOf(PingOutcome.UNCONFIRMED, PingOutcome.WAITING, PingOutcome.SENT_NEARBY, PingOutcome.SENT)
            .forEach { assertFalse(HelpRules.maySend(it), "$it") }
    }

    @Test fun reopeningShowsTheLastAlertForAWhile() {
        val t = 1_000_000_000L
        assertTrue(HelpRules.showsLast(t, t + 60_000))
        assertFalse(HelpRules.showsLast(t, t + HelpRules.SHOW_LAST_FOR_MS))
        assertFalse(HelpRules.showsLast(t, t - 1)) // clock went back: start afresh
    }

    // ---- Live: switched off when the night is over, or after about 12 hours ----

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

    // ---- Background checks: re-armed without ever being pushed back ----

    private val min = 60_000L

    @Test fun openingTheAppNeverPushesACheckBack() {
        val planned = t0 + 40 * min
        assertEquals(planned, AlarmPlan.next(planned, t0, 60 * min, min))
    }

    @Test fun aLostCheckRunsSoon() {
        // Planned before a reboot or update and never run.
        assertEquals(t0 + min, AlarmPlan.next(t0 - 5 * min, t0, 60 * min, min))
    }

    @Test fun neverPlannedOrNonsenseStartsAFreshInterval() {
        assertEquals(t0 + 60 * min, AlarmPlan.next(0L, t0, 60 * min, min))
        assertEquals(t0 + 15 * min, AlarmPlan.next(t0 + 5 * 3600_000L, t0, 15 * min, min))
    }

    // ---- Storage full: said once ----

    @Test fun storageFullIsSaidOnceADay() {
        assertTrue(StorageNotice.shouldTell(0L, t0))
        assertFalse(StorageNotice.shouldTell(t0, t0 + hour))
        assertTrue(StorageNotice.shouldTell(t0, t0 + StorageNotice.AGAIN_AFTER_MS))
        assertTrue(StorageNotice.shouldTell(t0 + hour, t0)) // clock went back
    }

    @Test fun storageFullIsRecognised() {
        assertTrue(StorageNotice.isFull(java.io.IOException("write failed: ENOSPC (No space left on device)")))
        assertTrue(StorageNotice.isFull(RuntimeException("wrapped", java.io.IOException("No space left on device"))))
        assertFalse(StorageNotice.isFull(java.io.IOException("Permission denied")))
        assertFalse(StorageNotice.isFull(null))
    }

    // ---- Check-ins: the alarm time ----

    private val now = 1_800_000_000L

    @Test fun checkInAlarmIsJustAfterTheDeadline() {
        val c = CheckIns()
        assertNull(c.nextCheckSec(now))
        c.onPing(7L, "Jo", GigGroup.Ping.CHECK_IN, now, 45, now + 2)
        val at = c.nextCheckSec(now + 10)!!
        assertEquals(now + 45 * 60 + CheckIns.GRACE_SEC + 1, at)
        // At that moment the check really finds Jo overdue (and not a second before).
        assertTrue(c.due(at - 1).isEmpty())
        assertEquals(listOf("Jo"), c.due(at).map { it.name })
        // Alerted once: nothing more to wake for.
        assertNull(c.nextCheckSec(at + 1))
    }

    @Test fun theEarliestDeadlineWins() {
        val c = CheckIns()
        c.onPing(7L, "Jo", GigGroup.Ping.CHECK_IN, now, 90, now)
        c.onPing(8L, "Sam", GigGroup.Ping.CHECK_IN, now, 30, now)
        assertEquals(now + 30 * 60 + CheckIns.GRACE_SEC + 1, c.nextCheckSec(now))
        // Sam is home safe: Jo's deadline is next.
        c.onPing(8L, "Sam", GigGroup.Ping.HOME_SAFE, now + 20 * 60, 0, now + 20 * 60)
        assertEquals(now + 90 * 60 + CheckIns.GRACE_SEC + 1, c.nextCheckSec(now + 20 * 60))
    }

    @Test fun aCheckInThatArrivesLateWaitsForItsHomeSafe() {
        val c = CheckIns()
        val arrived = now + 3 * 3600
        c.onPing(7L, "Jo", GigGroup.Ping.CHECK_IN, now, 30, arrived)
        assertEquals(arrived + CheckIns.SETTLE_SEC, c.nextCheckSec(arrived))
        assertTrue(c.due(arrived + CheckIns.SETTLE_SEC - 1).isEmpty())
        assertEquals(1, c.due(arrived + CheckIns.SETTLE_SEC).size)
    }

    @Test fun aCheckInAlreadyDueIsCheckedNow() {
        val c = CheckIns()
        c.onPing(7L, "Jo", GigGroup.Ping.CHECK_IN, now, 30, now)
        val later = now + 2 * 3600
        assertEquals(later, c.nextCheckSec(later))
    }

    @Test fun ownReminderComesBeforeTheCrewIsAlerted() {
        val sent = now
        val deadline = now + 45 * 60
        val at = CheckInReminder.atSec(sent, deadline)
        assertEquals(deadline - CheckInReminder.BEFORE_SEC, at)
        assertTrue(at < deadline + CheckIns.GRACE_SEC)
        // A very short one: halfway, never before it was sent.
        val short = CheckInReminder.atSec(sent, sent + 4 * 60)
        assertEquals(sent + 2 * 60, short)
    }

    // ---- A clock jumping forward doesn't end the crew ----

    private val day = 24 * hour

    @Test fun aClockInStepIsTrusted() {
        val a = ClockCheck.check(null, t0, 1_000L, 5)
        assertEquals(t0, a.trustedNowMs)
        val b = ClockCheck.check(a.anchor, t0 + hour, 1_000L + hour, 5)
        assertEquals(t0 + hour, b.trustedNowMs)
    }

    @Test fun aJumpForwardIsNotBelievedAtOnce() {
        val a = ClockCheck.check(null, t0, 1_000L, 5).anchor
        // Ten seconds of real time later, the clock says two days later.
        val jumped = ClockCheck.check(a, t0 + 2 * day, 11_000L, 5)
        assertEquals(t0 + 10_000L, jumped.trustedNowMs)
        // An hour on, still counted from before the jump.
        val later = ClockCheck.check(jumped.anchor, t0 + 2 * day + hour, 11_000L + hour, 5)
        assertEquals(t0 + 10_000L + hour, later.trustedNowMs)
        // Set right again: trusted at once.
        val fixed = ClockCheck.check(later.anchor, t0 + 10_000L + 2 * hour, 11_000L + 2 * hour, 5)
        assertEquals(t0 + 10_000L + 2 * hour, fixed.trustedNowMs)
    }

    @Test fun aJumpThatStandsIsAcceptedInTheEnd() {
        val a = ClockCheck.check(null, t0, 0L, 5).anchor
        var r = ClockCheck.check(a, t0 + day, 60_000L, 5)
        assertEquals(t0 + 60_000L, r.trustedNowMs)
        r = ClockCheck.check(r.anchor, t0 + day + ClockCheck.ACCEPT_AFTER_MS, 60_000L + ClockCheck.ACCEPT_AFTER_MS, 5)
        assertEquals(t0 + day + ClockCheck.ACCEPT_AFTER_MS, r.trustedNowMs)
    }

    @Test fun smallDriftAGoingBackOrARebootAreTakenAsTheyAre() {
        val a = ClockCheck.check(null, t0, 50_000L, 5).anchor
        assertEquals(t0 + 5 * 60_000L, ClockCheck.check(a, t0 + 5 * 60_000L, 50_000L, 5).trustedNowMs)
        assertEquals(t0 - day, ClockCheck.check(a, t0 - day, 60_000L, 5).trustedNowMs)
        assertEquals(t0 + 3 * day, ClockCheck.check(a, t0 + 3 * day, 10L, 6).trustedNowMs)
    }

    @Test fun anchorsSurviveARestart() {
        val a = ClockCheck.Anchor(t0, 123L, 7, 99L)
        assertEquals(a, ClockCheck.Anchor.parse(a.save()))
        assertNull(ClockCheck.Anchor.parse("1,2,3"))
        assertNull(ClockCheck.Anchor.parse(null))
    }

    // ---- Review round: the reminder, the update, quiet or told ----

    @Test fun theReminderIsSetOnceAndNeverInThePast() {
        val sent = now
        val deadline = now + 45 * 60
        val at = CheckInReminder.atSec(sent, deadline)
        assertEquals(at, CheckInReminder.armAt(sent, deadline, now + 60, shownForDeadline = 0L))
        // Shown: never again for this check-in, whatever plans it again.
        assertNull(CheckInReminder.armAt(sent, deadline, now + 60, shownForDeadline = deadline))
        assertNull(CheckInReminder.armAt(sent, deadline, at + 1, shownForDeadline = deadline))
        // Past the deadline: nothing.
        assertNull(CheckInReminder.armAt(sent, deadline, deadline, shownForDeadline = 0L))
        // Its time went by with the phone off, deadline still ahead: once, now, not in the past.
        assertEquals(at + 60 + CheckInReminder.LATE_DELAY_SEC, CheckInReminder.armAt(sent, deadline, at + 60, shownForDeadline = 0L))
        // A new check-in (a new deadline) gets its own reminder.
        assertEquals(CheckInReminder.atSec(now + 7200, now + 9000), CheckInReminder.armAt(now + 7200, now + 9000, now + 7200, shownForDeadline = deadline))
        assertNull(CheckInReminder.armAt(0L, 0L, now, 0L))
    }

    @Test fun theReminderOnlyPromisesAnAlertTheCrewCanRaise() {
        assertTrue(CheckInReminder.crewHasIt(OutboxState.SENT))
        assertTrue(CheckInReminder.crewHasIt(OutboxState.NEARBY))
        listOf(OutboxState.SENDING, OutboxState.WAITING, OutboxState.FAILED, null)
            .forEach { assertFalse(CheckInReminder.crewHasIt(it), "$it") }
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
