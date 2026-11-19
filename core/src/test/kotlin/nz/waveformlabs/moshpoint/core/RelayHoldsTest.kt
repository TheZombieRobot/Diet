package nz.waveformlabs.moshpoint.core

import nz.waveformlabs.moshpoint.core.RelayHolds.Traffic
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RelayHoldsTest {
    private fun holds() = RelayHolds(random = { 0.0 })
    private val chat = "aa".repeat(16)
    private val pings = "bb".repeat(16)

    @Test fun clientAndAddressHoldEverythingForRetryAfter() {
        val h = holds()
        val all = assertIs<RelayHolds.Hold.All>(h.limited("client", "7", Traffic.READS, null, 0L))
        assertEquals(7_000L, all.ms)
        assertEquals(5_000L, assertIs<RelayHolds.Hold.All>(h.limited("Address", null, Traffic.RECORDS, chat, 0L)).ms, "the relay's own 5 s when it doesn't say")
        // That pause is the budget's (whole client), not a per-mailbox hold here.
        assertEquals(0L, h.heldUntil(Traffic.RECORDS, chat, 1L))
        // Never longer than 15 minutes, never under a second, junk = the default.
        assertEquals(900_000L, assertIs<RelayHolds.Hold.All>(h.limited("client", "99999999", Traffic.READS, null, 0L)).ms)
        assertEquals(1_000L, assertIs<RelayHolds.Hold.All>(h.limited("client", "0", Traffic.READS, null, 0L)).ms)
        assertEquals(5_000L, assertIs<RelayHolds.Hold.All>(h.limited("client", "soon", Traffic.READS, null, 0L)).ms)
        // Stretched by up to a quarter, so a crowd doesn't come back in step.
        assertEquals(12_500L, assertIs<RelayHolds.Hold.All>(RelayHolds(random = { 1.0 }).limited("client", "10", Traffic.READS, null, 0L)).ms)
    }

    @Test fun mailboxHoldsOnlyThatMailbox() {
        val h = holds()
        assertIs<RelayHolds.Hold.Some>(h.limited("mailbox", "10", Traffic.RECORDS, chat, 1_000L))
        assertEquals(11_000L, h.heldUntil(Traffic.RECORDS, chat, 2_000L))
        assertEquals(0L, h.heldUntil(Traffic.RECORDS, pings, 2_000L), "another mailbox carries on")
        assertEquals(0L, h.heldUntil(Traffic.READS, null, 2_000L), "lookups carry on")
        assertEquals(0L, h.heldUntil(Traffic.RECORDS, chat, 11_000L), "and it ends")
        // A mailbox answer with no mailbox to hold is treated as an older relay's 429.
        assertIs<RelayHolds.Hold.Unknown>(h.limited("mailbox", "10", Traffic.READS, null, 0L))
    }

    @Test fun bytesHoldOnlyThatKindOfTraffic() {
        val h = holds()
        assertIs<RelayHolds.Hold.Some>(h.limited("bytes", "60", Traffic.UPLOADS, chat, 0L))
        assertEquals(60_000L, h.heldUntil(Traffic.UPLOADS, "cc".repeat(16), 1L), "every upload waits")
        assertEquals(0L, h.heldUntil(Traffic.RECORDS, chat, 1L), "messages carry on")
        assertEquals(0L, h.heldUntil(Traffic.READS, null, 1L), "lookups carry on")
        assertEquals(0L, h.heldUntil(Traffic.DOWNLOADS, null, 1L), "downloads have their own budget")
        assertIs<RelayHolds.Hold.Some>(h.limited("bytes", null, Traffic.DOWNLOADS, null, 0L))
        assertEquals(60_000L, h.heldUntil(Traffic.DOWNLOADS, null, 1L))
    }

    @Test fun anOlderRelayOrAnUnknownLimitMeansTheOldPause() {
        val h = holds()
        assertIs<RelayHolds.Hold.Unknown>(h.limited(null, null, Traffic.RECORDS, chat, 0L))
        assertIs<RelayHolds.Hold.Unknown>(h.limited("reports", "60", Traffic.RECORDS, chat, 0L))
        assertEquals(0L, h.heldUntil(Traffic.RECORDS, chat, 1L), "nothing held here: the budget pauses as before")
    }

    @Test fun aPingWaitsOutBothHolds() {
        val h = holds()
        h.limited("mailbox", "600", Traffic.RECORDS, pings, 0L)
        h.limited("bytes", "600", Traffic.RECORDS, pings, 0L)
        assertTrue(h.heldUntil(Traffic.RECORDS, pings, 1L) > 1L)
    }

    @Test fun batchStatusesHoldLikeTheirHeaders() {
        val h = holds()
        h.mailboxBusy(chat, 0L)
        assertEquals(10_000L, h.heldUntil(Traffic.RECORDS, chat, 1L))
        assertEquals(0L, h.heldUntil(Traffic.RECORDS, pings, 1L))
        h.recordsOverBudget(0L)
        assertEquals(60_000L, h.heldUntil(Traffic.RECORDS, pings, 1L))
    }

    @Test fun manyBusyMailboxesStaySmall() {
        val h = holds()
        repeat(1_000) { h.limited("mailbox", "600", Traffic.RECORDS, "%032x".format(it), 0L) }
        val held = (0 until 1_000).count { h.heldUntil(Traffic.RECORDS, "%032x".format(it), 1L) > 0 }
        assertTrue(held in 1..256, "kept $held")
    }

    /** The budget takes the relay's pause as it is: no growing back-off on top. */
    @Test fun theBudgetPausesForExactlyWhatTheRelayAsked() {
        val b = RelayBudget(
            messagesPerDay = 1_000_000, requestsPerMinute = 600, messageReserve = 0, requestReserve = 0,
            throttleBaseMs = 5_000L, throttleMaxMs = 30_000L, random = { 0.0 },
        )
        repeat(3) { i ->
            val now = i * 100_000L
            val t = assertNotNull(b.take(RelayUse.BACKGROUND, true, now))
            b.settle(t, RelayBudget.Outcome.THROTTLED, now, pauseMs = 7_000L)
            assertNull(b.take(RelayUse.MESSAGE, false, now + 6_999L), "everything waits")
            assertNotNull(b.take(RelayUse.MESSAGE, false, now + 7_000L), "then goes")
        }
        // Without the relay's word, its own back-off as before: 5 s, then 10.
        val t1 = assertNotNull(b.take(RelayUse.BACKGROUND, true, 1_000_000L))
        b.settle(t1, RelayBudget.Outcome.THROTTLED, 1_000_000L)
        assertNull(b.take(RelayUse.MESSAGE, false, 1_004_999L))
        val t2 = assertNotNull(b.take(RelayUse.MESSAGE, false, 1_005_000L))
        b.settle(t2, RelayBudget.Outcome.THROTTLED, 1_005_000L)
        assertNull(b.take(RelayUse.MESSAGE, false, 1_014_999L))
        assertNotNull(b.take(RelayUse.MESSAGE, false, 1_015_000L))
    }
}
