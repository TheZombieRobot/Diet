package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import nz.waveformlabs.moshpoint.core.SatelliteRule.Request

class SatelliteRuleTest {
    @Test fun android16FindsAConstrainedNetworkByTheMissingCapability() {
        assertTrue(SatelliteRule.constrained(sdk = 36, satelliteTransport = false, notBandwidthConstrained = false))
        assertFalse(SatelliteRule.constrained(sdk = 36, satelliteTransport = false, notBandwidthConstrained = true), "Wi-Fi, mobile data")
        assertTrue(SatelliteRule.constrained(sdk = 36, satelliteTransport = true, notBandwidthConstrained = true))
    }

    @Test fun android15GoesByTheSatelliteTransportOnly() {
        assertTrue(SatelliteRule.constrained(sdk = 35, satelliteTransport = true, notBandwidthConstrained = false))
        assertFalse(SatelliteRule.constrained(sdk = 35, satelliteTransport = false, notBandwidthConstrained = false), "the capability doesn't exist before 16")
    }

    @Test fun olderPhonesNeverHaveOne() {
        for (sdk in 29..34) {
            assertFalse(SatelliteRule.constrained(sdk, satelliteTransport = true, notBandwidthConstrained = false), "API $sdk")
        }
    }

    @Test fun onlyAMemberWhoSwitchedItOn() {
        assertTrue(SatelliteRule.allowed(switchOn = true, member = true))
        assertFalse(SatelliteRule.allowed(switchOn = false, member = true), "off by default")
        assertFalse(SatelliteRule.allowed(switchOn = true, member = false), "Moshpoint+ only")
        assertFalse(SatelliteRule.allowed(switchOn = false, member = false))
    }

    @Test fun aSatelliteNetworkCountsAsNoSignalUnlessAllowed() {
        assertFalse(SatelliteRule.usable(online = true, constrained = true, allowed = false))
        assertTrue(SatelliteRule.usable(online = true, constrained = true, allowed = true))
        assertTrue(SatelliteRule.usable(online = true, constrained = false, allowed = false), "a normal network, as before")
        assertFalse(SatelliteRule.usable(online = false, constrained = false, allowed = true))
    }

    @Test fun aNormalNetworkTakesEverythingAsBefore() {
        for (r in Request.entries) {
            assertTrue(SatelliteRule.mayGo(constrained = false, allowed = false, request = r, nowMs = 1_000, lastBatchMs = 999))
        }
    }

    @Test fun switchedOffNothingGoesOverSatellite() {
        for (r in Request.entries) {
            assertFalse(SatelliteRule.mayGo(constrained = true, allowed = false, request = r, nowMs = 10_000_000, lastBatchMs = null))
        }
    }

    @Test fun switchedOnOnlyTheBatchAndOnlyEveryTwoMinutes() {
        assertFalse(SatelliteRule.mayGo(true, true, Request.OTHER, 10_000_000, null), "photos, clips, faces, Discover, maps: never")
        assertTrue(SatelliteRule.mayGo(true, true, Request.BATCH, 10_000_000, null), "the first batch goes straight away")
        val last = 10_000_000L
        assertFalse(SatelliteRule.mayGo(true, true, Request.BATCH, last + 60_000, last), "the usual minute isn't enough")
        assertFalse(SatelliteRule.mayGo(true, true, Request.BATCH, last + 119_999, last))
        assertTrue(SatelliteRule.mayGo(true, true, Request.BATCH, last + 120_000, last))
    }

    @Test fun theNextBatchWaitsForTheGap() {
        assertEquals(5_000L, SatelliteRule.nextBatchAt(5_000, null))
        assertEquals(130_000L, SatelliteRule.nextBatchAt(70_000, 10_000), "due a minute after the last: waits two")
        assertEquals(300_000L, SatelliteRule.nextBatchAt(300_000, 10_000), "due after the gap: as planned")
    }

    // ---- The crew chat over satellite (docs/SPOT_LINKS.md, item 4) ----

    @Test fun theChatIsReadInTheBatchOnlyOverSatellite() {
        assertTrue(SatelliteRule.chatInBatch(constrained = true, allowed = true))
        assertFalse(SatelliteRule.chatInBatch(constrained = true, allowed = false), "the switch off, or not a member: nothing at all")
        assertFalse(SatelliteRule.chatInBatch(constrained = false, allowed = true), "a normal network: the chat's own poll, as before")
        assertFalse(SatelliteRule.chatInBatch(constrained = false, allowed = false))
    }

    /** The chat's own poll never goes over satellite: only the batch does, every two minutes, with the chat in it. */
    @Test fun neverAsARequestOfItsOwn() {
        assertFalse(SatelliteRule.mayGo(constrained = true, allowed = true, SatelliteRule.Request.OTHER, nowMs = 1_000_000, lastBatchMs = null))
        assertTrue(SatelliteRule.mayGo(constrained = true, allowed = true, SatelliteRule.Request.BATCH, nowMs = 1_000_000, lastBatchMs = null))
        assertFalse(SatelliteRule.mayGo(constrained = true, allowed = true, SatelliteRule.Request.BATCH, nowMs = 1_000_000, lastBatchMs = 1_000_000 - 60_000), "a minute after the last: not yet")
        assertTrue(SatelliteRule.mayGo(constrained = true, allowed = true, SatelliteRule.Request.BATCH, nowMs = 1_000_000, lastBatchMs = 1_000_000 - SatelliteRule.GAP_MS))
        assertTrue(SatelliteRule.mayGo(constrained = false, allowed = false, SatelliteRule.Request.OTHER, nowMs = 1_000_000, lastBatchMs = null), "normal networks unchanged")
    }

    @Test fun everyCrewsChatWhenItFits() {
        assertEquals(listOf(0, 1, 2), SatelliteRule.chatCrews(listOf(4, 2, 2), room = 100, turn = 0))
        assertEquals(listOf(0), SatelliteRule.chatCrews(listOf(4), room = 4, turn = 7))
        assertEquals(emptyList(), SatelliteRule.chatCrews(emptyList(), room = 100, turn = 0))
        assertEquals(emptyList(), SatelliteRule.chatCrews(listOf(4, 2), room = 0, turn = 0), "no room left in the batch")
    }

    /** A big night: tonight's crew always, the others take turns, and none is ever left out for long. */
    @Test fun whenTheyDontFitTheOthersTakeTurns() {
        val sizes = listOf(4, 2, 2, 2, 2)
        val batches = (0 until 4).map { SatelliteRule.chatCrews(sizes, room = 8, turn = it) }
        batches.forEach { assertTrue(0 in it, "tonight's crew in every batch: $it") }
        batches.forEach { b -> assertTrue(b.sumOf { sizes[it] } <= 8, "never more than the room: $b") }
        assertEquals((0 until 5).toSet(), batches.flatten().toSet(), "every crew within a few batches")
        assertEquals(listOf(0, 1, 2), batches[0])
        assertEquals(listOf(0, 2, 3), batches[1])
        assertEquals(listOf(0, 1, 4), batches[3], "round again: the turn wraps")
        // A crew too big for what's left is skipped (never half a crew), and a smaller one goes instead.
        assertEquals(listOf(0, 2), SatelliteRule.chatCrews(listOf(4, 6, 2), room = 8, turn = 0))
        // Even tonight's crew is skipped if it can't fit; the rest still go.
        assertEquals(listOf(1), SatelliteRule.chatCrews(listOf(10, 2), room = 4, turn = 0))
    }
}
