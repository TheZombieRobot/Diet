package nz.waveformlabs.moshpoint.ui

import nz.waveformlabs.moshpoint.LocationBook
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class HomeLogicTest {
    // Real app resources (words) for the formatting checks.
    @get:org.junit.Rule
    val paparazzi = app.cash.paparazzi.Paparazzi()

    private fun inLocale(l: java.util.Locale, block: () -> Unit) {
        val was = java.util.Locale.getDefault()
        java.util.Locale.setDefault(l)
        nz.waveformlabs.moshpoint.Txt.init(paparazzi.context)
        try { block() } finally { java.util.Locale.setDefault(was) }
    }

    @Test fun initialsLikeContactMonograms() {
        assertEquals("KZ", initials("King Zipper"))
        assertEquals("B", initials("bevan"))
        assertEquals("?", initials("  "))
        assertEquals("JS", initials("jo  smith  jr"))
    }

    private fun pin(id: String, lat: Double, lon: Double, stale: Boolean = false) =
        MapPin(id, id.replaceFirstChar { it.uppercase() }, lat, lon, 0xFFFF2E93.toInt(), "live", stale)

    @Test fun matesTogetherMergeIntoOneBubble() = inLocale(java.util.Locale("en", "NZ")) {
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

    @Test fun statusLineSaysWhatMatters() = inLocale(java.util.Locale("en", "NZ")) {
        val live = LocationBook.Seen(0.0, 0.0, 0, 10, batteryPct = 64)
        assertEquals("live · 64%", statusLine(live, 30, liveWord = true))
        assertEquals("battery died here · 5 min ago", statusLine(live.copy(lastGasp = true), 300))
        assertEquals("12 min ago", statusLine(live.copy(batteryPct = null), 720))
    }

    @Test fun distanceLabels() {
        inLocale(java.util.Locale("en", "NZ")) {
            assertEquals("40\u00A0m", distanceLabel(43.0))
            assertEquals("1.2\u00A0km", distanceLabel(1_234.0))
            assertEquals("31\u00A0km", distanceLabel(31_400.0))
        }
        // Feet and miles where that's the norm; local decimal commas elsewhere.
        inLocale(java.util.Locale.US) {
            assertEquals("140\u00A0ft", distanceLabel(43.0))
            assertEquals("0.8\u00A0mi", distanceLabel(1_234.0))
        }
        inLocale(java.util.Locale.GERMANY) { assertEquals("1,2\u00A0km", distanceLabel(1_234.0)) }
    }

    @Test fun crewRadarStacksMatesInTheSameSpotAndSplitsThem() {
        val join = 0.28f
        val split = join * 1.35f
        // Two mates the same way at a similar distance share a bubble; the nearer one leads.
        val together = clusterSpots(listOf(RadarSpot("jo", 30f, 0.62f), RadarSpot("sam", 33f, 0.60f), RadarSpot("mia", 200f, 0.5f)), emptyMap(), join, split)
        assertEquals(listOf("sam", "jo"), together["sam"])
        assertEquals(listOf("mia"), together["mia"])
        // Moving apart a little: still together (no flicker at the edge)...
        val prev = mapOf("sam" to "sam", "jo" to "sam")
        val nudged = clusterSpots(listOf(RadarSpot("jo", 52f, 0.62f), RadarSpot("sam", 33f, 0.60f)), prev, join, split)
        assertEquals(1, nudged.size)
        // ...and clearly apart: two arrows.
        val apart = clusterSpots(listOf(RadarSpot("jo", 90f, 0.62f), RadarSpot("sam", 33f, 0.60f)), prev, join, split)
        assertEquals(2, apart.size)
        // Same direction but very different distance: separate bubbles on the radar.
        assertEquals(2, clusterSpots(listOf(RadarSpot("a", 10f, 0.35f), RadarSpot("b", 10f, 0.95f)), emptyMap(), join, split).size)
    }

    @Test fun radarScaleFitsTheFarthestMate() {
        assertTrue(radarFrac(5.0, 2000.0) < radarFrac(50.0, 2000.0))
        assertEquals(1f, radarFrac(2000.0, 2000.0), 0.001f)
        assertEquals(1f, radarFrac(null, 100.0))
    }
}
