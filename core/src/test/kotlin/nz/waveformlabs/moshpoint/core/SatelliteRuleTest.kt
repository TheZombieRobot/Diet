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
}
