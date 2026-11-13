package nz.waveformlabs.moshpoint.core

import kotlin.math.sqrt
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The finder module's small rules (FinderRules.kt), as they were in its Android code. */
class FinderRulesTest {
    // ---- ScanStarts: Android's 5 scan starts in 30 s, one kept spare ----

    @Test
    fun scanStartsAllowsFourInThirtySeconds() {
        val s = ScanStarts()
        repeat(4) { i ->
            assertFalse(s.full(1_000L + i * 1_000), "room for start ${i + 1}")
            s.started(1_000L + i * 1_000)
        }
        assertTrue(s.full(5_000))
        assertEquals(4, s.count)
    }

    @Test
    fun scanStartsFreeUpOnlyAfterTheWholeWindow() {
        val s = ScanStarts()
        listOf(1_000L, 2_000L, 3_000L, 4_000L).forEach(s::started)
        // The first start leaves the window only when more than 30 s have passed.
        assertTrue(s.full(31_000))
        assertFalse(s.full(31_001))
        assertEquals(3, s.count)
    }

    @Test
    fun scanStartsSayHowLongToWait() {
        val s = ScanStarts()
        assertEquals(0, s.delayToNext(500))
        listOf(1_000L, 2_000L, 3_000L, 4_000L).forEach(s::started)
        // Until the oldest leaves the window, plus 200 ms to be sure.
        assertEquals(1_000 + 30_000 - 10_000 + 200L, s.delayToNext(10_000))
        assertEquals(200L, s.delayToNext(31_000))
        assertEquals(0, s.delayToNext(31_001))
    }

    @Test
    fun scanStartsRestartNeedsAGapAndRoom() {
        val s = ScanStarts()
        assertTrue(s.mayRestart(10_000, 6_000), "nothing started yet")
        s.started(10_000)
        assertFalse(s.mayRestart(15_999, 6_000), "under the gap")
        assertTrue(s.mayRestart(16_000, 6_000))
        assertFalse(s.mayRestart(21_000, 12_000), "a longer gap asked for")
        listOf(16_000L, 17_000L, 18_000L).forEach(s::started)
        assertFalse(s.mayRestart(30_000, 6_000), "four in the window")
        assertTrue(s.mayRestart(40_001, 6_000), "the first has left the window")
    }

    // ---- WalkingTest ----

    @Test
    fun walkingNeedsTenReadingsFirst() {
        val w = WalkingTest()
        repeat(9) { i -> assertNull(w.add(i * 20L, 0f, 0f, if (i % 2 == 0) 8f else 12f)) }
        assertTrue(w.add(180, 0f, 0f, 8f) == true)
    }

    @Test
    fun standingStillIsNotWalking() {
        val w = WalkingTest()
        var last: Boolean? = null
        repeat(40) { i -> last = w.add(i * 20L, 0.1f, 0.2f, 9.8f) ?: last }
        assertEquals(false, last)
    }

    @Test
    fun aSteadyBounceIsWalking() {
        val w = WalkingTest()
        var last: Boolean? = null
        // About 2 m/s² either side of gravity, a few steps a second.
        repeat(60) { i -> last = w.add(i * 20L, 0f, 0f, if ((i / 12) % 2 == 0) 7.8f else 11.8f) ?: last }
        assertEquals(true, last)
    }

    @Test
    fun oldReadingsLeaveTheWindow() {
        val w = WalkingTest()
        repeat(20) { i -> w.add(i * 20L, 0f, 0f, if (i % 2 == 0) 6f else 14f) }
        // 1.5 s later only still readings are left: not walking any more.
        var last: Boolean? = null
        repeat(20) { i -> last = w.add(1_900L + i * 20L, 0f, 0f, 9.8f) ?: last }
        assertEquals(false, last)
        w.clear()
        assertNull(w.add(5_000, 0f, 0f, 9.8f))
    }

    @Test
    fun theSizeOfTheAccelerationCountsNotItsDirection() {
        // The same size in any direction: no spread, so not walking.
        val w = WalkingTest()
        val g = sqrt(3.0).toFloat()
        val readings = listOf(Triple(3f, 0f, 0f), Triple(0f, 3f, 0f), Triple(0f, 0f, 3f), Triple(g, g, g))
        var last: Boolean? = null
        repeat(12) { i -> readings[i % 4].let { (x, y, z) -> last = w.add(i * 20L, x, y, z) ?: last } }
        assertEquals(false, last)
    }

    // ---- CompassHeading ----

    private fun matrix(top: Triple<Float, Float, Float>, screen: Triple<Float, Float, Float>): FloatArray {
        // Rows east, north, up; columns x (right edge), y (top edge), z (out of the screen).
        val right = Triple(
            top.second * screen.third - top.third * screen.second,
            top.third * screen.first - top.first * screen.third,
            top.first * screen.second - top.second * screen.first,
        )
        return floatArrayOf(
            right.first, top.first, screen.first,
            right.second, top.second, screen.second,
            right.third, top.third, screen.third,
        )
    }

    @Test
    fun flatPhoneFacesWhereItsTopPoints() {
        val up = Triple(0f, 0f, 1f)
        assertEquals(0.0, CompassHeading.fromRotation(matrix(Triple(0f, 1f, 0f), up))!!, 1e-9)
        assertEquals(90.0, CompassHeading.fromRotation(matrix(Triple(1f, 0f, 0f), up))!!, 1e-9)
        assertEquals(180.0, CompassHeading.fromRotation(matrix(Triple(0f, -1f, 0f), up))!!, 1e-9)
        assertEquals(270.0, CompassHeading.fromRotation(matrix(Triple(-1f, 0f, 0f), up))!!, 1e-9)
    }

    @Test
    fun uprightPhoneFacesWhereItsBackPoints() {
        // Held up in front of you, looking at the screen, facing north: the screen faces south.
        val north = CompassHeading.fromRotation(matrix(Triple(0f, 0f, 1f), Triple(0f, -1f, 0f)))!!
        assertEquals(0.0, north, 1e-9)
        val east = CompassHeading.fromRotation(matrix(Triple(0f, 0f, 1f), Triple(-1f, 0f, 0f)))!!
        assertEquals(90.0, east, 1e-9)
    }

    @Test
    fun noHeadingWhenNothingIsHorizontal() {
        assertNull(CompassHeading.fromRotation(FloatArray(9)))
        val tiny = FloatArray(9).also {
            it[1] = 0.005f
            it[4] = 0.005f
        }
        assertNull(CompassHeading.fromRotation(tiny))
    }

    // ---- LocationPick ----

    @Test
    fun aMuchNewerFixAlwaysWins() {
        val s = 1_000_000_000L
        assertTrue(LocationPick.isBetter(100 * s, 500f, 69 * s, 5f))
        assertFalse(LocationPick.isBetter(69 * s, 5f, 100 * s, 500f))
    }

    @Test
    fun otherwiseNoMoreThanOneAndAHalfTimesVaguer() {
        val s = 1_000_000_000L
        assertTrue(LocationPick.isBetter(10 * s, 15f, 5 * s, 10f))
        assertFalse(LocationPick.isBetter(10 * s, 15.1f, 5 * s, 10f))
        // Exactly 30 s newer is not "much newer" yet.
        assertFalse(LocationPick.isBetter(35 * s, 16f, 5 * s, 10f))
        assertTrue(LocationPick.isBetter(5 * s, 3f, 30 * s, 10f), "an older but sharper fix within 30 s")
    }

    // ---- GpsFixRule ----

    @Test
    fun gpsConfidenceFromTheErrorCircles() {
        assertEquals(0.9, GpsFixRule.confidence(5f, 5, 100.0, 0), 1e-9)
        // As big as the gap or bigger: the floor.
        assertEquals(0.1, GpsFixRule.confidence(5f, 5, 10.0, 0), 1e-9)
        assertEquals(0.1, GpsFixRule.confidence(5f, 5, 0.2, 0), 1e-9)
    }

    @Test
    fun gpsConfidenceFallsWithAge() {
        assertEquals(0.9 * 0.5, GpsFixRule.confidence(5f, 5, 100.0, 120_000), 1e-9)
        assertEquals(0.9 * 0.2, GpsFixRule.confidence(5f, 5, 100.0, 230_000), 1e-9)
        assertEquals(240_000L, GpsFixRule.MAX_AGE_MS)
    }

    @Test
    fun gpsConfidenceAddsTheAccuraciesAsFloat() {
        val mine = 3.3f
        val expected = (1.0 - (mine + 7) / 50.0).coerceIn(0.1, 1.0)
        assertEquals(expected, GpsFixRule.confidence(mine, 7, 50.0, 0), 0.0)
    }

    // ---- HeadingLog ----

    @Test
    fun headingNearestTheReading() {
        val log = HeadingLog()
        log.add(1_000, 10.0)
        log.add(1_100, 20.0)
        log.add(1_200, 30.0)
        assertEquals(20.0, log.at(1_120, fallback = 99.0))
        assertEquals(30.0, log.at(2_150, fallback = 99.0))
    }

    @Test
    fun headingFallsBackWhenNothingIsCloseOrTheTimeIsUnknown() {
        val log = HeadingLog()
        assertEquals(99.0, log.at(1_000, fallback = 99.0), "empty")
        log.add(1_000, 10.0)
        assertEquals(99.0, log.at(0, fallback = 99.0), "unknown time")
        assertEquals(99.0, log.at(2_000, fallback = 99.0), "exactly a second away")
        assertEquals(10.0, log.at(1_999, fallback = 99.0))
    }

    @Test
    fun headingLogKeepsTheLastTwoHundred() {
        val log = HeadingLog()
        repeat(250) { i -> log.add(1_000L + i * 10_000, i.toDouble()) }
        // The first 50 are gone: their times fall back.
        assertEquals(-1.0, log.at(1_000, fallback = -1.0))
        assertEquals(50.0, log.at(1_000L + 50 * 10_000, fallback = -1.0))
    }
}
