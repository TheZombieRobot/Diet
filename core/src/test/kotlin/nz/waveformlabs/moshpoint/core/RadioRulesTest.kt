package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RadioRulesTest {
    private val own = byteArrayOf(1, 2, 3)
    private val heard = byteArrayOf(4, 5, 6)

    @Test fun theRelayAdvertIsSetOnAChangeAndNowAndThenOtherwise() {
        assertTrue(RelayAdvertRefresh.send(own, null, 0, 0), "nothing on air yet")
        // Our own location alone, turn after turn: left on air.
        assertFalse(RelayAdvertRefresh.send(own.copyOf(), own, 1_000, 2_000))
        assertFalse(RelayAdvertRefresh.send(own.copyOf(), own, 1_000, 1_000 + RelayAdvertRefresh.KEEP_ALIVE_MS - 1))
        // Half a minute on: set again (a new data id for chips that report a repeat once).
        assertTrue(RelayAdvertRefresh.send(own.copyOf(), own, 1_000, 1_000 + RelayAdvertRefresh.KEEP_ALIVE_MS))
        // Someone else's location to pass on, or our new one: straight away.
        assertTrue(RelayAdvertRefresh.send(heard, own, 1_000, 2_000))
    }

    @Test fun wifiAwarePublishesOnlyWhileAMateHasBeenLooking() {
        assertFalse(AwarePublish.wanted(1_000_000, 0), "nobody has looked yet")
        assertTrue(AwarePublish.wanted(1_000_000, 1_000_000))
        assertTrue(AwarePublish.wanted(1_000_000 + AwarePublish.HOLD_MS - 1, 1_000_000))
        assertFalse(AwarePublish.wanted(1_000_000 + AwarePublish.HOLD_MS, 1_000_000))
    }

    @Test fun lightMeUpStopsAfterTenMinutesUnlessTouched() {
        val on = 5_000_000L
        assertFalse(BeaconLimit.expired(on + BeaconLimit.LIMIT_MS - 1, on, 0))
        assertTrue(BeaconLimit.expired(on + BeaconLimit.LIMIT_MS, on, 0))
        // A touch on the screen five minutes in: ten more from then.
        val touch = on + 5 * 60_000L
        assertFalse(BeaconLimit.expired(on + BeaconLimit.LIMIT_MS, on, touch))
        assertTrue(BeaconLimit.expired(touch + BeaconLimit.LIMIT_MS, on, touch))
        // A touch from before it was switched on doesn't shorten it.
        assertFalse(BeaconLimit.expired(on + 60_000, on, on - 9 * 60_000L))
    }
}
