package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FinderAwakeTest {
    private val touch = 1_000_000L

    @Test fun onFor90sAfterATouchThenLetGo() {
        assertTrue(FinderAwake.keepOn(touch, touch, null, null))
        assertTrue(FinderAwake.keepOn(touch + 89_999, touch, null, null))
        assertFalse(FinderAwake.keepOn(touch + 90_000, touch, null, null))
        // A mate far away doesn't hold it.
        assertFalse(FinderAwake.keepOn(touch + 120_000, touch, 80.0, null))
    }

    @Test fun aMateCloseByHoldsItOnWithoutTouching() {
        assertTrue(FinderAwake.keepOn(touch + 5 * 60_000, touch, 25.0, null))
        assertTrue(FinderAwake.keepOn(touch + 5 * 60_000, touch, 2.0, null))
        assertFalse(FinderAwake.keepOn(touch + 5 * 60_000, touch, 30.0, null))
        // ...but not all night (on the table next to them): ten minutes after the last touch.
        assertTrue(FinderAwake.keepOn(touch + FinderAwake.CLOSE_MAX_MS - 1, touch, 2.0, null))
        assertFalse(FinderAwake.keepOn(touch + FinderAwake.CLOSE_MAX_MS, touch, 2.0, null))
    }

    @Test fun aPocketLetsGoWhateverElse() {
        val now = touch + 10_000
        // Just covered (a thumb over the sensor): still on.
        assertTrue(FinderAwake.keepOn(now, touch, 2.0, now - 500))
        // Covered for a second: a pocket. Off, however recent the touch or close the mate.
        assertFalse(FinderAwake.keepOn(now, touch, 2.0, now - FinderAwake.POCKET_AFTER_MS))
        assertFalse(FinderAwake.keepOn(now, now, null, now - 5_000))
        // Out of the pocket again (no longer near): the touch rule applies again.
        assertTrue(FinderAwake.keepOn(now, touch, null, null))
    }

    @Test fun nearestMateOfTheArrows() {
        val arrows = listOf(
            ArrowState.NoSignal("a"),
            ArrowState.Pointing("b", 10.0, 42.0, Method.GPS_SERVER, unsure = false),
            ArrowState.Pointing("c", 10.0, null, Method.SPIN_SCAN, unsure = true),
            ArrowState.DistanceOnly("d", 18.5, Trend.STEADY, Method.BLE_RSSI),
        )
        assertEquals(18.5, FinderAwake.nearestM(arrows))
        assertNull(FinderAwake.nearestM(listOf(ArrowState.NoSignal("a"))))
        assertNull(FinderAwake.nearestM(emptyList()))
    }

    @Test fun proximityReadAsAndroidReadsIt() {
        // Binary sensors: 0 near, their maximum far (5 cm, 8 cm, or 1 on some phones).
        assertTrue(FinderAwake.isNear(0f, 5f))
        assertFalse(FinderAwake.isNear(5f, 5f))
        assertTrue(FinderAwake.isNear(0f, 1f))
        assertFalse(FinderAwake.isNear(1f, 1f))
        assertFalse(FinderAwake.isNear(8f, 8f))
        // Sensors that measure: near under 5 cm.
        assertTrue(FinderAwake.isNear(3f, 10f))
        assertFalse(FinderAwake.isNear(6f, 10f))
        assertFalse(FinderAwake.isNear(-1f, 5f))
    }
}
