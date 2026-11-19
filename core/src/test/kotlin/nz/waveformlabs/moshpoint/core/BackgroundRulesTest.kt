package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Background checks re-armed without being pushed back, "storage full" once, and a clock that jumps (reliability P1-5, P1-6, P2). */
class BackgroundRulesTest {
    private val t0 = 1_800_000_000_000L
    private val hour = 3600_000L
    private val min = 60_000L
    private val day = 24 * hour

    // ---- Background checks: re-armed without ever being pushed back ----

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

    // ---- A clock jumping forward doesn't end the crew ----

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
}
