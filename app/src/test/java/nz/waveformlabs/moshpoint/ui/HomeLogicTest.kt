package nz.waveformlabs.moshpoint.ui

import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.map.LocationBook
import nz.waveformlabs.moshpoint.ui.finder.RadarSpot
import nz.waveformlabs.moshpoint.ui.finder.clusterSpots
import nz.waveformlabs.moshpoint.ui.finder.radarFrac
import nz.waveformlabs.moshpoint.ui.home.dotLine
import nz.waveformlabs.moshpoint.ui.home.faceOrderKey
import nz.waveformlabs.moshpoint.ui.home.faceStatus
import nz.waveformlabs.moshpoint.ui.home.keepNumbers
import nz.waveformlabs.moshpoint.ui.home.liveFirst
import nz.waveformlabs.moshpoint.ui.home.tracked
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

    // The home's faces (docs/HOME_REDESIGN.md): live first and nearest first, then the most recently seen.
    private fun mate(id: String) = nz.waveformlabs.moshpoint.friends.Friend(nz.waveformlabs.moshpoint.core.FriendRecord(id, id, 0, ByteArray(32), true, 0L))

    @Test fun facesLiveFirstThenNearestThenLastSeen() {
        val now = 1_000_000L
        val seen = mapOf(
            "near" to LocationBook.Seen(0.0, 0.0, now - 30, 10),
            "far" to LocationBook.Seen(0.0, 0.0, now - 60, 10),
            "nowhere" to LocationBook.Seen(0.0, 0.0, now - 20, 10), // live, but no distance yet
            "dead" to LocationBook.Seen(0.0, 0.0, now - 10, 10, lastGasp = true),
            "old" to LocationBook.Seen(0.0, 0.0, now - 900, 10),
            "older" to LocationBook.Seen(0.0, 0.0, now - 3600, 10),
        )
        val crew = listOf("never", "older", "far", "dead", "nowhere", "old", "near").map(::mate)
        val order = liveFirst(crew, seen, now, mapOf("near" to 8.0, "far" to 120.0)).map { it.id }
        assertEquals(listOf("near", "far", "nowhere", "dead", "old", "older", "never"), order)
    }

    @Test fun faceStatusSaysLiveOrWhenLastSeen() = inLocale(java.util.Locale("en", "NZ")) {
        val now = 1_000_000L
        val live = faceStatus(LocationBook.Seen(0.0, 0.0, now - 30, 10, batteryPct = 64), now, 40.0)
        assertTrue(live.live && live.distance)
        assertEquals(finderDistanceLabel(40.0), live.text)
        assertEquals("8\u00A0m", faceStatus(LocationBook.Seen(0.0, 0.0, now - 30, 10), now, 8.0).text) // not "0 m"
        assertEquals(null, live.battery) // only said when low
        assertEquals(8, faceStatus(LocationBook.Seen(0.0, 0.0, now - 30, 10, batteryPct = 8), now, 40.0).battery)
        assertEquals("live", faceStatus(LocationBook.Seen(0.0, 0.0, now - 30, 10), now, null).text)
        val gone = faceStatus(LocationBook.Seen(0.0, 0.0, now - 900, 10), now, 40.0)
        assertTrue(!gone.live && !gone.distance)
        assertEquals("15 min ago", gone.text)
        assertEquals("phone died", faceStatus(LocationBook.Seen(0.0, 0.0, now - 10, 10, lastGasp = true), now, 5.0).text)
        assertEquals("not sharing yet", faceStatus(null, now, null).text)
    }

    @Test fun facesKeepTheirOrderUntilSomethingClearlyChanges() {
        val now = 1_000_000L
        val crew = listOf(HomeFixtures.rae, HomeFixtures.sam, HomeFixtures.alex)
        val seen = mapOf("rae" to LocationBook.Seen(0.0, 0.0, now - 20, 10), "sam" to LocationBook.Seen(0.0, 0.0, now - 40, 10), "alex" to LocationBook.Seen(0.0, 0.0, now - 900, 10))
        val key = faceOrderKey(crew, seen, now, mapOf("rae" to 30.0, "sam" to 60.0))
        // A few metres either way (GPS jitter) keeps the order...
        assertEquals(key, faceOrderKey(crew, seen, now + 30, mapOf("rae" to 34.0, "sam" to 57.0)))
        // ...a clear move, someone going live or not, or someone joining re-sorts it.
        assertTrue(key != faceOrderKey(crew, seen, now, mapOf("rae" to 30.0, "sam" to 140.0)))
        assertTrue(key != faceOrderKey(crew, seen, now + 200, mapOf("rae" to 30.0, "sam" to 60.0)))
        assertTrue(key != faceOrderKey(crew + HomeFixtures.jo, seen, now, mapOf("rae" to 30.0, "sam" to 60.0)))
    }

    @Test fun eyebrowsAreTrackedOnlyInScriptsThatTakeIt() {
        val wide = 2.5.sp
        assertEquals(wide, tracked("TONIGHT", wide))
        assertEquals(wide, tracked("HEUTE ABEND", wide))
        assertEquals(wide, tracked("TỐI NAY", wide)) // Vietnamese: Latin Extended Additional
        assertEquals(0f, tracked("الليلة", wide).value)
        assertEquals(0f, tracked("คืนนี้", wide).value)
        assertEquals(0f, tracked("आज रात", wide).value)
    }

    @Test fun dotLinesKeepShortPartsWholeOnlyWhileTheyFit() = inLocale(java.util.Locale("pl")) {
        val parts = listOf("Kliknij znajomego, by szukać", "przytrzymaj: opcje")
        assertEquals("Kliknij\u00A0znajomego,\u00A0by\u00A0szukać\u00A0· przytrzymaj:\u00A0opcje", dotLine(parts, keep = 40))
        // Too wide for one line (200%): its spaces stay breakable, so it wraps between words.
        val seen = mutableListOf<String>()
        val narrow = dotLine(parts, keep = 40) { seen += it; it.length < 25 }
        assertEquals("Kliknij znajomego, by szukać\u00A0· przytrzymaj:\u00A0opcje", narrow)
        assertEquals("Kliknij\u00A0znajomego,\u00A0by\u00A0szukać\u00A0·", seen.first()) // measured with its dot
    }

    @Test fun numbersKeepTheirWordInEveryScript() {
        assertEquals("15\u00A0min ago", keepNumbers("15 min ago"))
        assertEquals("قبل ١٥\u00A0دقيقة", keepNumbers("قبل ١٥ دقيقة")) // Arabic-Indic digits
        assertEquals("15\u00A0मिनट पहले", keepNumbers("15 मिनट पहले"))
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
