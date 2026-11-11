package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class CheckInsTest {
    private val now = 1_800_000_000L
    private val jo = 77L
    private val checkIn = GigGroup.Ping.CHECK_IN
    private val homeSafe = GigGroup.Ping.HOME_SAFE

    @Test fun overdueRaisesTheAlarmOnce() {
        val c = CheckIns()
        assertTrue(c.onPing(jo, "Jo", checkIn, now, 45, now + 2))
        assertEquals(now + 45 * 60, c.waiting()[jo])
        assertTrue(c.due(now + 45 * 60 + 60).isEmpty()) // a little slack
        val due = c.due(now + 45 * 60 + 200)
        assertEquals(listOf("Jo"), due.map { it.name })
        assertFalse(due.single().late)
        assertTrue(c.due(now + 46 * 60 + 300).isEmpty()) // once
    }

    @Test fun homeSafeEndsIt() {
        val c = CheckIns()
        c.onPing(jo, "Jo", checkIn, now, 45, now)
        assertTrue(c.onPing(jo, "Jo", homeSafe, now + 30 * 60, 0, now + 30 * 60))
        assertTrue(c.waiting().isEmpty())
        assertTrue(c.due(now + 3 * 3600).isEmpty())
    }

    /**
     * The bug: Home safe came by the relay, the Check in it answered arrived later (carried
     * by a mate's phone). Last-arrived won, the check-in came back, and every phone alarmed.
     */
    @Test fun homeSafeArrivingBeforeItsCheckInStillWins() {
        val c = CheckIns()
        assertTrue(c.onPing(jo, "Jo", homeSafe, now + 40 * 60, 0, now + 41 * 60))
        assertFalse(c.onPing(jo, "Jo", checkIn, now, 45, now + 50 * 60), "an older check-in must not bring it back")
        assertTrue(c.waiting().isEmpty())
        assertTrue(c.due(now + 5 * 3600).isEmpty())
    }

    @Test fun orderIsByTheSendersClockNotTheReaders() {
        // Jo's phone is 10 minutes slow; this phone's clock is right. Arrival order is reversed.
        val skew = -600L
        val c = CheckIns()
        c.onPing(jo, "Jo", homeSafe, now + 40 * 60 + skew, 0, now + 40 * 60 + 5)
        c.onPing(jo, "Jo", checkIn, now + skew, 45, now + 44 * 60)
        assertTrue(c.due(now + 4 * 3600).isEmpty())

        // And a reader whose own clock is 10 minutes fast sees the same thing.
        val fast = CheckIns()
        fast.onPing(jo, "Jo", checkIn, now, 45, now + 600)
        fast.onPing(jo, "Jo", homeSafe, now + 40 * 60, 0, now + 40 * 60 + 600)
        assertTrue(fast.due(now + 4 * 3600).isEmpty())
    }

    @Test fun aNewCheckInAfterHomeSafeCounts() {
        val c = CheckIns()
        c.onPing(jo, "Jo", checkIn, now, 30, now)
        c.onPing(jo, "Jo", homeSafe, now + 600, 0, now + 600)
        assertTrue(c.onPing(jo, "Jo", checkIn, now + 3600, 20, now + 3600))
        assertEquals(1, c.due(now + 3600 + 20 * 60 + 200).size)
    }

    @Test fun sameSecondHomeSafeWinsAndRepeatsChangeNothing() {
        val c = CheckIns()
        c.onPing(jo, "Jo", checkIn, now, 30, now)
        assertFalse(c.onPing(jo, "Jo", checkIn, now, 30, now + 9)) // the same ping by another route
        assertTrue(c.onPing(jo, "Jo", homeSafe, now, 0, now + 10))
        assertFalse(c.onPing(jo, "Jo", checkIn, now, 30, now + 11))
        assertTrue(c.waiting().isEmpty())
    }

    @Test fun aCheckInThatArrivesAlreadyOverdueWaitsForAHomeSafeBehindIt() {
        // Carried by Bluetooth for two hours. Jo's Home safe is in the same batch, seconds behind.
        val c = CheckIns()
        val arrived = now + 2 * 3600
        c.onPing(jo, "Jo", checkIn, now, 45, arrived)
        assertTrue(c.due(arrived + 30).isEmpty(), "don't alarm the moment it lands")
        c.onPing(jo, "Jo", homeSafe, now + 50 * 60, 0, arrived + 40)
        assertTrue(c.due(arrived + 3600).isEmpty())

        // No Home safe follows: then it does alarm, marked late.
        val d = CheckIns()
        d.onPing(jo, "Jo", checkIn, now, 45, arrived)
        val due = d.due(arrived + CheckIns.SETTLE_SEC + 1)
        assertEquals(1, due.size)
        assertTrue(due.single().late)
    }

    @Test fun keptPerPersonNotPerName() {
        // Two people both called "Mate".
        val c = CheckIns()
        c.onPing(1L, "Mate", checkIn, now, 30, now)
        c.onPing(2L, "Mate", checkIn, now, 60, now)
        c.onPing(1L, "Mate", homeSafe, now + 300, 0, now + 300)
        assertEquals(setOf(2L), c.waiting().keys)
        assertFalse(c.onPing(0L, "Nobody", checkIn, now, 30, now), "unsigned: could be anyone")
    }

    @Test fun survivesARestart() {
        val c = CheckIns()
        c.onPing(jo, "Jo\tBloggs", checkIn, now, 45, now)
        c.onPing(5L, "Sam", homeSafe, now, 0, now)
        val back = CheckIns.restore(c.snapshot())
        assertEquals(c.waiting(), back.waiting())
        assertEquals(1, back.due(now + 46 * 60 + 200).size)
        // An alarm already raised isn't raised again after a restart.
        assertTrue(CheckIns.restore(back.snapshot()).due(now + 2 * 3600).isEmpty())
        assertTrue(CheckIns.restore(null).waiting().isEmpty())
        assertTrue(CheckIns.restore("rubbish\n\t\t").waiting().isEmpty())
    }

    @Test fun aCheckInStampedInTheFutureCountsFromArrival() {
        val c = CheckIns()
        c.onPing(jo, "Jo", checkIn, now + 6 * 3600, 30, now)
        assertEquals(now + 30 * 60, c.waiting()[jo])
    }
}
