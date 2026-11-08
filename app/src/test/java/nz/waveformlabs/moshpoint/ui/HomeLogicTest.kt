package nz.waveformlabs.moshpoint.ui

import nz.waveformlabs.moshpoint.LocationBook
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HomeLogicTest {
    @Test fun initialsLikeContactMonograms() {
        assertEquals("KZ", initials("King Zipper"))
        assertEquals("B", initials("bevan"))
        assertEquals("?", initials("  "))
        assertEquals("JS", initials("jo  smith  jr"))
    }

    private fun pin(id: String, lat: Double, lon: Double, stale: Boolean = false) =
        MapPin(id, id.replaceFirstChar { it.uppercase() }, lat, lon, 0xFFFF2E93.toInt(), "live", stale)

    @Test fun matesTogetherMergeIntoOneBubble() {
        val out = crewBubbles(
            listOf(
                pin("alex", -41.2865, 174.7762),
                pin("jo", -41.28655, 174.77625), // ~7 m away
                pin("sam", -41.2900, 174.7800), // ~500 m away
            ),
        )
        assertEquals(2, out.size)
        assertTrue(out.any { it.name == "Alex & Jo" && it.caption.startsWith("together") })
        assertTrue(out.any { it.name == "Sam" })
    }

    @Test fun stalePinsNeverMerge() {
        val out = crewBubbles(listOf(pin("alex", -41.2865, 174.7762), pin("jo", -41.2865, 174.7762, stale = true)))
        assertEquals(2, out.size)
    }

    @Test fun statusLineSaysWhatMatters() {
        val live = LocationBook.Seen(0.0, 0.0, 0, 10, batteryPct = 64)
        assertEquals("live · 64%", statusLine(live, 30, liveWord = true))
        assertEquals("battery died here · 5 min ago", statusLine(live.copy(lastGasp = true), 300))
        assertEquals("12 min ago", statusLine(live.copy(batteryPct = null), 720))
    }

    @Test fun distanceLabels() {
        assertEquals("40 m", distanceLabel(43.0))
        assertEquals("1.2 km", distanceLabel(1_234.0))
        assertEquals("31 km", distanceLabel(31_400.0))
    }
}
