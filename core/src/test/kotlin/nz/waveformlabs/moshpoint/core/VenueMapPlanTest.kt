package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The offline venue map's plan: area, tile count, fonts, clean-up, and saving around you. */
class VenueMapPlanTest {
    private val auckland = LatLon(-36.8468, 174.7766)
    private val london = LatLon(51.5033, -0.0031) // The O2
    private val day = 24L * 3600 * 1000

    // ---- The area ----

    @Test fun theAreaReachesTwoKilometresEachWay() {
        for (c in listOf(auckland, london, LatLon(64.14, -21.93), LatLon(1.29, 103.86))) {
            val b = VenueMapPlan.box(c)
            assertEquals(4_000.0, Geo.distanceM(LatLon(b.south, c.lon), LatLon(b.north, c.lon)), 15.0)
            assertEquals(4_000.0, Geo.distanceM(LatLon(c.lat, b.west), LatLon(c.lat, b.east)), 15.0)
            assertTrue(b.contains(c))
            assertTrue(b.contains(VenuePlacement.offset(c, 45.0, 2_500.0))) // the corners are further than 2 km
            assertFalse(b.contains(VenuePlacement.offset(c, 90.0, 2_100.0)))
        }
    }

    @Test fun tileNumbersMatchTheWebMapStandard() {
        // Zoom 1 cuts the world into four: north-west is (0, 0), south-east is (1, 1).
        assertEquals(0 to 0, VenueMapPlan.tileX(-0.0031, 1) to VenueMapPlan.tileY(51.5, 1))
        assertEquals(1 to 1, VenueMapPlan.tileX(174.78, 1) to VenueMapPlan.tileY(-36.85, 1))
        // At any zoom, the tile we name really contains the point (checked with the inverse formulas).
        for (c in listOf(auckland, london, LatLon(64.14, -21.93), LatLon(-33.86, 151.21), LatLon(1.29, 103.86))) {
            for (z in listOf(0, 5, 12, 13, 14)) {
                val n = (1 shl z).toDouble()
                val x = VenueMapPlan.tileX(c.lon, z)
                val y = VenueMapPlan.tileY(c.lat, z)
                fun lonOf(col: Int) = col / n * 360.0 - 180.0
                fun latOf(row: Int) = Math.toDegrees(kotlin.math.atan(kotlin.math.sinh(Math.PI * (1 - 2 * row / n))))
                assertTrue(c.lon >= lonOf(x) && c.lon < lonOf(x + 1), "column at zoom $z")
                assertTrue(c.lat <= latOf(y) && c.lat > latOf(y + 1), "row at zoom $z")
            }
        }
        // A zoom-14 tile is about 2.4 km wide at the equator: that's why a 4 km square needs so few.
        assertEquals(2_446.0, 40_075_017.0 / (1 shl 14), 1.0)
    }

    @Test fun aVenueNeedsAFewDozenTilesNotThousands() {
        for (c in listOf(auckland, london, LatLon(64.14, -21.93), LatLon(1.29, 103.86), LatLon(69.65, 18.96))) {
            val n = VenueMapPlan.tileCount(VenueMapPlan.box(c))
            assertTrue(n in 6..70, "$c needs $n tiles")
            assertTrue(VenueMapPlan.usable(c))
        }
        // Only the detailed zoom would be fewer, never more.
        val b = VenueMapPlan.box(london)
        assertTrue(VenueMapPlan.tileCount(b, 14, 14) < VenueMapPlan.tileCount(b))
    }

    @Test fun nonsensePositionsAreRefused() {
        assertFalse(VenueMapPlan.usable(LatLon(0.0, 0.0))) // "no position" from a careless source
        assertFalse(VenueMapPlan.usable(LatLon(Double.NaN, 10.0)))
        assertFalse(VenueMapPlan.usable(LatLon(89.9, 10.0)))
        assertFalse(VenueMapPlan.usable(LatLon(10.0, 200.0)))
    }

    @Test fun twoCrewsAtOneVenueShareOneSavedArea() {
        // The same venue from two sources, a block apart: one area.
        assertTrue(VenueMapPlan.sameArea(auckland, auckland))
        assertTrue(VenueMapPlan.sameArea(auckland, VenuePlacement.offset(auckland, 120.0, 250.0)))
        assertFalse(VenueMapPlan.sameArea(auckland, VenuePlacement.offset(auckland, 0.0, 600.0)))
        // Its name is stable and safe as a folder name.
        assertEquals("-36.847,174.777", VenueMapPlan.areaKey(auckland))
        assertEquals(VenueMapPlan.areaKey(auckland), VenueMapPlan.areaKey(LatLon(auckland.lat, auckland.lon)))
        assertTrue(VenueMapPlan.areaKey(london).all { it.isDigit() || it in "-.," })
    }

    // ---- Clean-up ----

    @Test fun deletedAFewDaysAfterTheGigOrAfterLeaving() {
        val ends = 1_800_000_000_000L
        assertEquals(ends + 3 * day, VenueMapPlan.deleteAfterMs(ends))
        // Cancelled a gig that was a month away: gone three days after cancelling, not in a month.
        assertEquals(ends - 30 * day + 3 * day, VenueMapPlan.deleteAfterMs(ends, leftAtMs = ends - 30 * day))
        // "End night" at 1 am, before the crew's own end: three days from then.
        assertEquals(ends - 7 * 3_600_000L + 3 * day, VenueMapPlan.deleteAfterMs(ends, leftAtMs = ends - 7 * 3_600_000L))
        // Leaving after it had already ended changes nothing.
        assertEquals(ends + 3 * day, VenueMapPlan.deleteAfterMs(ends, leftAtMs = ends + day))
    }

    // ---- Fonts ----

    @Test fun everyFontFileMapLibreCanAskForHasAnAnswer() {
        // MapLibre asks for 130 files per font: all 256 less the ideographs the phone draws.
        assertEquals(130, VenueMapPlan.ALL_RANGES.size)
        assertTrue(VenueMapPlan.drawnByPhone(0x4E) && VenueMapPlan.drawnByPhone(0x9F) && VenueMapPlan.drawnByPhone(0xAC) && VenueMapPlan.drawnByPhone(0xD7))
        assertFalse(VenueMapPlan.drawnByPhone(0x30)) // Japanese punctuation and kana come from the font file
        // What we download is part of what can be asked for, with nothing twice.
        val wanted = VenueMapPlan.CORE_RANGES + VenueMapPlan.WORLD_RANGES
        assertEquals(wanted.size, wanted.toSet().size)
        assertTrue(VenueMapPlan.ALL_RANGES.containsAll(wanted))
        assertEquals(8, VenueMapPlan.CORE_RANGES.size)
        assertEquals(48, VenueMapPlan.WORLD_RANGES.size)
    }

    @Test fun basicFontsCoverTheLanguagesWrittenInLatinGreekAndCyrillic() {
        fun covered(text: String) = text.all { it.code / 256 in VenueMapPlan.CORE_RANGES }
        assertTrue(covered("Queen Street – Tāmaki Makaurau"))
        assertTrue(covered("Große Freiheit 36, Straße"))
        assertTrue(covered("Łódź Wytwórnia · İstanbul Küçükçiftlik"))
        assertTrue(covered("Nhà hát lớn Hà Nội, Đường Tràng Tiền"))
        assertTrue(covered("Αθήνα · Москва · Київ"))
        assertFalse(covered("ถนนข้าวสาร"))
        assertTrue("ถนนข้าวสาร".all { it.code / 256 in VenueMapPlan.WORLD_RANGES })
        assertTrue("شارع الملك فهد".filter { it != ' ' }.all { it.code / 256 in VenueMapPlan.WORLD_RANGES })
        // Arabic is drawn with its joined-up forms, which live at the top of the range.
        assertTrue(0xFE in VenueMapPlan.WORLD_RANGES && 0xFB in VenueMapPlan.WORLD_RANGES)
    }

    @Test fun otherAlphabetsComeStraightAwayOnlyForThoseWhoReadThem() {
        assertTrue(VenueMapPlan.needsWorldFonts(listOf("en", "ar")))
        assertTrue(VenueMapPlan.needsWorldFonts(listOf("th-TH")))
        assertTrue(VenueMapPlan.needsWorldFonts(listOf("hi_IN")))
        assertFalse(VenueMapPlan.needsWorldFonts(listOf("en-NZ", "de", "pl", "vi", "tr", "ru", "el")))
        assertFalse(VenueMapPlan.needsWorldFonts(listOf("ja", "ko", "zh-TW"))) // drawn by the phone
        assertFalse(VenueMapPlan.needsWorldFonts(emptyList()))
    }

    @Test fun fontAddressesAreTheOnesMapLibreBuilds() {
        // MapLibre replaces {fontstack} with the font's name and {range} with "start-end".
        assertEquals("0-255", VenueMapPlan.rangeName(0))
        assertEquals("65280-65535", VenueMapPlan.rangeName(0xFF))
        assertEquals(
            VenueMapPlan.GLYPH_TEMPLATE.replace("{fontstack}", VenueMapPlan.FONT).replace("{range}", "7680-7935"),
            VenueMapPlan.glyphUrl(0x1E),
        )
        // The name needs no escaping, so there is only one way to write the address.
        assertTrue(VenueMapPlan.FONT.all { it.isLetterOrDigit() })
        assertTrue(VenueMapPlan.glyphUrl(3).startsWith("https://offline.moshpoint.invalid/"))
        assertEquals("https://offline.moshpoint.invalid/pack/20261104_001001_pt.json", VenueMapPlan.packStyleUrl("20261104_001001_pt"))
        assertEquals("https://offline.moshpoint.invalid/pack/ab.json", VenueMapPlan.packStyleUrl("a/../b?"))
    }

    @Test fun anEmptyFontFileIsAValidOne() {
        // Protobuf: field 1 (a font) holding field 1 (its name) and field 2 (the range). No characters.
        val b = VenueMapPlan.emptyGlyphs(0x34)
        val name = "mp".toByteArray()
        val range = "13312-13567".toByteArray()
        val inner = byteArrayOf(0x0A, 2) + name + byteArrayOf(0x12, range.size.toByte()) + range
        assertContentEquals(byteArrayOf(0x0A, inner.size.toByte()) + inner, b)
        assertTrue(b.isNotEmpty() && b.size < 40)
        // Every length fits one byte, for any range.
        assertTrue(VenueMapPlan.ALL_RANGES.all { VenueMapPlan.emptyGlyphs(it)[1].toInt() == VenueMapPlan.emptyGlyphs(it).size - 2 })
    }

    // ---- Saving around you when nobody knows where the venue is ----

    private fun fix(at: LatLon, tMin: Double, accuracy: Double = 15.0, speed: Double? = 0.5) =
        ArrivalPlanner.Fix(at, accuracy, speed, (tMin * 60_000).toLong())

    @Test fun withNothingSavedTheFirstGoodPositionIsTaken() {
        val p = ArrivalPlanner()
        assertNull(p.onFix(fix(auckland, 0.0, accuracy = 400.0), emptyList(), 0)) // too vague to know where
        assertNull(p.onFix(fix(auckland, 0.1, speed = 14.0), emptyList(), 0)) // on the motorway: not there yet
        assertEquals(auckland, p.onFix(fix(auckland, 0.2), emptyList(), 0))
        assertEquals(auckland, p.onFix(fix(auckland, 0.3, speed = null), emptyList(), 0)) // no speed reading is fine
    }

    @Test fun insideASavedAreaNothingMoreIsSaved() {
        val p = ArrivalPlanner()
        val saved = listOf(auckland)
        for (m in 0..20) assertNull(p.onFix(fix(VenuePlacement.offset(auckland, 10.0, 800.0), m.toDouble()), saved, 1))
    }

    @Test fun settlingFarFromEverySavedAreaSavesThatSpotToo() {
        // Pre-drinks at home got saved; the venue is 6 km away.
        val p = ArrivalPlanner()
        val home = VenuePlacement.offset(auckland, 250.0, 6_000.0)
        val saved = listOf(home)
        // In the taxi: moving, never settled.
        for (m in 0..8) assertNull(p.onFix(fix(VenuePlacement.offset(home, 70.0, m * 700.0), m.toDouble(), speed = 12.0), saved, 1))
        // In the queue, shuffling within a few metres: after five minutes, this is the place.
        var got: LatLon? = null
        for (m in 9..16) got = got ?: p.onFix(fix(VenuePlacement.offset(auckland, m * 30.0, 12.0), m.toDouble()), saved, 1)
        val centre = assertNotNull(got)
        assertTrue(Geo.distanceM(centre, auckland) < 20.0)
        // Told about it, the planner is quiet again.
        val p2 = ArrivalPlanner()
        for (m in 9..30) assertNull(p2.onFix(fix(auckland, m.toDouble()), saved + centre, 2))
    }

    @Test fun aShortStopOrAWalkIsNotArriving() {
        val p = ArrivalPlanner()
        val saved = listOf(VenuePlacement.offset(auckland, 0.0, 8_000.0))
        // Three minutes at the lights.
        for (m in 0..3) assertNull(p.onFix(fix(auckland, m.toDouble()), saved, 0))
        // Walking steadily: 200 m a minute, never within 150 m for five minutes.
        for (m in 4..20) assertNull(p.onFix(fix(VenuePlacement.offset(auckland, 90.0, (m - 3) * 200.0), m.toDouble(), speed = 1.4), saved, 0))
    }

    @Test fun atMostTwoAreasAroundYouPerCrew() {
        val p = ArrivalPlanner()
        val saved = listOf(VenuePlacement.offset(auckland, 0.0, 8_000.0))
        for (m in 0..20) assertNull(p.onFix(fix(auckland, m.toDouble()), saved, VenueMapPlan.MAX_AROUND_YOU))
        assertNull(ArrivalPlanner().onFix(fix(auckland, 0.0), emptyList(), VenueMapPlan.MAX_AROUND_YOU))
    }

    // ---- Venue names ----

    @Test fun typedVenueNamesAreTidiedForLookingUp() {
        assertEquals("Spark Arena, Auckland", VenueQuery.normalise("  Spark   Arena,\tAuckland \n"))
        assertEquals(VenueQuery.cacheKey("SPARK arena"), VenueQuery.cacheKey(" spark  Arena "))
        assertTrue(VenueQuery.usable(" The O2 "))
        assertFalse(VenueQuery.usable("O2")) // two letters could be anywhere on Earth
        assertFalse(VenueQuery.usable(" a "))
        assertFalse(VenueQuery.usable(""))
        assertEquals(80, VenueQuery.normalise("x".repeat(500)).length)
    }

    @Test fun theSearchBoxIsRoughAndContainsThePhone() {
        // left,top,right,bottom in whole degrees: about 300 km across, so it doesn't say where you are.
        assertEquals("173,-35,176,-38", VenueQuery.viewbox(auckland))
        assertEquals("-2,53,1,50", VenueQuery.viewbox(london))
        assertNull(VenueQuery.viewbox(null))
        assertNull(VenueQuery.viewbox(LatLon(Double.NaN, 0.0)))
        val parts = VenueQuery.viewbox(LatLon(89.5, 179.5))!!.split(',').map { it.toInt() }
        assertTrue(parts[0] >= -180 && parts[2] <= 180 && parts[1] <= 90 && parts[3] >= -90)
    }
}
