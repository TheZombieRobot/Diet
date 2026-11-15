package nz.waveformlabs.moshpoint.ui

import nz.waveformlabs.moshpoint.ui.finder.clampOrCentre
import org.junit.Test
import kotlin.test.assertEquals

/** The radar's labels stay on the radar, and a radar too small for them no longer crashes (reliability P1-8). */
class RadarLogicTest {
    @Test fun labelsStayInside() {
        assertEquals(50f, clampOrCentre(50f, 10f, 90f))
        assertEquals(10f, clampOrCentre(-5f, 10f, 90f))
        assertEquals(90f, clampOrCentre(400f, 10f, 90f))
    }

    /** An 80 px radar and a 100 px chip: no room, so the chip sits in the middle (coerceIn threw here). */
    @Test fun noRoomMeansTheMiddle() {
        val size = 80f
        val half = 50f
        assertEquals(size / 2, clampOrCentre(5f, half, size - half))
        assertEquals(size / 2, clampOrCentre(500f, half, size - half))
    }
}
