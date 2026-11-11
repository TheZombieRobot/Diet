package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The floor maths: pressure to height, calibrating while together, drift, and what counts as a floor. */
class FloorsTest {
    private val cfg = FloorConfig()
    private val hour = 3_600_000L

    /** Pressure [metres] above a spot where it is [groundHpa]. */
    private fun up(groundHpa: Double, metres: Double) = groundHpa * kotlin.math.exp(-metres / Baro.SCALE_HEIGHT_M)

    /** A tracker calibrated at time 0 with their sensor reading [biasHpa] higher than ours. */
    private fun calibrated(biasHpa: Double = 0.0, byUwb: Boolean = true, atMs: Long = 0L, ground: Double = 1013.0): FloorTracker {
        val t = FloorTracker(cfg)
        val close = if (byUwb) Closeness.UWB else Closeness.BLUETOOTH
        var done = false
        for (i in 0..30) done = t.onPair(ground, ground + biasHpa, atMs + i * 1_000L - 30_000L, close) || done
        assertTrue(done)
        return t
    }

    // ---- Pressure and height ----

    @Test fun aStoreyIsAboutAThirdOfAHectopascal() {
        assertEquals(3.0, Baro.heightAboveM(1013.25, 1013.25 - 0.354), 0.05)
        assertEquals(-3.0, Baro.heightAboveM(1013.25, 1013.25 + 0.354), 0.05)
        assertEquals(0.0, Baro.heightAboveM(1000.0, 1000.0), 1e-9)
        // The same climb is fewer hectopascals in thin mountain air, but the same metres.
        assertEquals(10.0, Baro.heightAboveM(835.0, up(835.0, 10.0)), 1e-6)
    }

    @Test fun pressureSurvivesTheWireToWithinAHandsWidth() {
        for (hPa in listOf(1013.25, 998.441, 835.07, 1049.99, 700.0)) {
            val back = Baro.toHpa(Baro.toUnits(hPa)!!)
            assertTrue(abs(back - hPa) <= 0.0101, "$hPa came back as $back")
            assertTrue(abs(Baro.heightAboveM(hPa, back)) < 0.12) // rounding costs at most half a step: about 10 cm
        }
        assertTrue(Baro.toUnits(1200.0)!! <= Baro.MAX_UNITS)
        // A broken sensor's nonsense isn't sent.
        assertNull(Baro.toUnits(0.0))
        assertNull(Baro.toUnits(Double.NaN))
        assertNull(Baro.toUnits(5000.0))
    }

    @Test fun ownPressureIsSmoothedAndRemembered() {
        val h = PressureHistory()
        assertNull(h.current(0))
        for (i in 0..9) h.add(i * 1_000L, 1010.0)
        h.add(9_500L, 1012.5) // a door slams: one wild reading
        assertEquals(1010.0, h.current(10_000L)!!, 1e-9)
        // What it was a minute ago, for lining up with a mate's minute-old reading.
        for (i in 10..70) h.add(i * 1_000L, 1010.0 - (i - 10) * 0.01) // the weather, or a slow walk upstairs
        assertEquals(1010.0, h.at(10_000L)!!, 0.03)
        assertEquals(1009.4, h.current(70_000L)!!, 0.05)
        // Nothing recent: we don't know.
        assertNull(h.current(200_000L))
        assertNull(h.at(400_000L))
        // Rubbish in, nothing stored.
        val bad = PressureHistory()
        bad.add(0, Double.NaN)
        bad.add(1, 12.0)
        assertNull(bad.current(2))
    }

    // ---- Calibration ----

    @Test fun calibratesWhileTogetherByUwb() {
        val t = FloorTracker(cfg)
        // Their sensor reads 1.3 hPa higher than ours: uncorrected, that's 11 m, three floors down.
        assertEquals(-11.0, Baro.heightAboveM(1013.0, 1014.3), 0.3)
        assertNull(t.update(1013.0, 1014.3, 0, 0)) // never together: we say nothing
        var at = -1L
        for (i in 0..10) if (t.onPair(1013.0 + i * 0.001, 1014.3 + i * 0.001, i * 1_000L, Closeness.UWB) && at < 0) at = i * 1_000L
        assertEquals(4_000L, at) // needs 4 seconds side by side, not one lucky reading
        assertEquals(-1.3, t.calibration!!.offsetHpa, 0.001)
        assertTrue(t.calibration!!.byUwb)
        // Now the same readings mean "same floor"...
        val same = assertNotNull(t.update(1013.0, 1014.3, 11_000, 11_000))
        assertEquals(0.0, same.heightM, 0.05)
        assertNull(same.floor)
        // ...and when they climb a storey, upstairs.
        val upstairs = assertNotNull(t.update(1013.0, up(1014.3, 3.2), 12_000, 12_000))
        assertEquals(3.2, upstairs.heightM, 0.05)
        assertEquals(Floor.UP, upstairs.floor)
        assertEquals(Floor.DOWN, t.update(1013.0, up(1014.3, -3.2), 13_000, 13_000)!!.floor)
    }

    @Test fun bluetoothNeedsLongerAndIsLessSure() {
        val t = FloorTracker(cfg)
        var at = -1L
        for (i in 0..30) if (t.onPair(1000.0, 1000.4, i * 1_000L, Closeness.BLUETOOTH) && at < 0) at = i * 1_000L
        assertEquals(20_000L, at)
        assertFalse(t.calibration!!.byUwb)
        assertEquals(cfg.sigmaBleM, t.sigmaM(t.calibration!!, t.calibration!!.atMs), 1e-9)
        assertTrue(cfg.sigmaBleM > cfg.sigmaUwbM)
    }

    @Test fun walkingUpTheStairsTogetherDoesNotCalibrate() {
        val t = FloorTracker(cfg)
        // Side by side, but one is a few steps ahead on the stairs: the difference keeps moving.
        for (i in 0..20) assertFalse(t.onPair(1013.0, 1013.0 - i * 0.03, i * 1_000L, Closeness.UWB))
        assertNull(t.calibration)
        // They stop on the landing: steady again, calibrated.
        var ok = false
        for (i in 21..40) ok = t.onPair(1013.0, 1012.4, i * 1_000L, Closeness.UWB) || ok
        assertTrue(ok)
        assertEquals(0.6, t.calibration!!.offsetHpa, 0.001)
    }

    @Test fun notCloseOrAGapStartsAgain() {
        val t = FloorTracker(cfg)
        for (i in 0..2) t.onPair(1013.0, 1013.5, i * 1_000L, Closeness.UWB)
        t.onPair(1013.0, 1013.5, 3_000L, Closeness.NOT_CLOSE) // they stepped away
        for (i in 4..6) assertFalse(t.onPair(1013.0, 1013.5, i * 1_000L, Closeness.UWB))
        assertNull(t.calibration)
        // A long silence in the middle doesn't count as staying together either.
        val u = FloorTracker(cfg)
        u.onPair(1013.0, 1013.5, 0L, Closeness.UWB)
        u.onPair(1013.0, 1013.5, 1_000L, Closeness.UWB)
        for (i in 0..2) assertFalse(u.onPair(1013.0, 1013.5, 60_000L + i * 1_000L, Closeness.UWB))
        assertNull(u.calibration)
        // One reading being far apart in time from the others isn't "4 seconds together".
        val v = FloorTracker(cfg)
        for (i in 0..3) assertFalse(v.onPair(1013.0, 1013.5, i * 100L, Closeness.UWB))
    }

    @Test fun aBrokenSensorIsNotCalibratedAgainst() {
        val t = FloorTracker(cfg)
        for (i in 0..20) assertFalse(t.onPair(1013.0, 1020.0, i * 1_000L, Closeness.UWB)) // 7 hPa apart: not two healthy sensors
        for (i in 0..20) assertFalse(t.onPair(1013.0, Double.NaN, 30_000L + i * 1_000L, Closeness.UWB))
        assertNull(t.calibration)
    }

    @Test fun bluetoothCannotUndoAFreshUwbCalibration() {
        val t = calibrated(biasHpa = 0.5, byUwb = true)
        val uwb = t.calibration!!
        // Ten minutes later Bluetooth thinks they're side by side, but the readings say a floor
        // apart (0.4 hPa): strong signal through a thin floor. The UWB answer stands.
        for (i in 0..40) assertFalse(t.onPair(1013.0, 1013.5 - 0.4, 600_000L + i * 1_000L, Closeness.BLUETOOTH))
        assertEquals(uwb, t.calibration)
        // A Bluetooth calibration that agrees to within a couple of metres is welcome (it's newer).
        var ok = false
        for (i in 0..40) ok = t.onPair(1013.0, 1013.5 + 0.1, 700_000L + i * 1_000L, Closeness.BLUETOOTH) || ok
        assertTrue(ok)
        // And once the UWB one is over an hour old, Bluetooth may replace it whatever it says.
        val old = calibrated(biasHpa = 0.5, byUwb = true)
        var replaced = false
        for (i in 0..40) replaced = old.onPair(1013.0, 1013.5 - 0.4, 2 * hour + i * 1_000L, Closeness.BLUETOOTH) || replaced
        assertTrue(replaced)
        // UWB always wins over an earlier Bluetooth one.
        val ble = calibrated(biasHpa = 0.5, byUwb = false)
        var byUwb = false
        for (i in 0..10) byUwb = ble.onPair(1013.0, 1013.5 - 0.4, 60_000L + i * 1_000L, Closeness.UWB) || byUwb
        assertTrue(byUwb)
        assertTrue(ble.calibration!!.byUwb)
    }

    // ---- Weather ----

    @Test fun weatherCancelsWhenReadingsAreFromTheSameMoment() {
        val t = calibrated(biasHpa = -0.8)
        // A front comes through: 6 hPa lower for everyone, three hours on. Same floor: still no tag.
        val e = assertNotNull(t.update(1007.0, 1007.0 - 0.8, 3 * hour, 3 * hour))
        assertEquals(0.0, e.heightM, 0.05)
        assertNull(e.floor)
        // Had we compared their fresh reading with our three-hour-old one, it would look like 50 m.
        assertTrue(abs(Baro.heightAboveM(1013.0, 1007.0 - 0.8 + 0.8)) > 40)
    }

    // ---- Drift: the calibration ages ----

    @Test fun uncertaintyGrowsAndTheBarRisesWithIt() {
        val t = calibrated()
        val c = t.calibration!!
        assertEquals(0.4, t.sigmaM(c, c.atMs), 1e-9)
        assertEquals(0.72, t.sigmaM(c, c.atMs + 2 * hour), 0.01)
        assertEquals(1.26, t.sigmaM(c, c.atMs + 4 * hour), 0.01)
        assertEquals(1.84, t.sigmaM(c, c.atMs + 6 * hour), 0.01)
        // The bar: 2.5 m when fresh, then 1.5 m + twice the uncertainty.
        assertEquals(2.5, t.thresholdM(t.sigmaM(c, c.atMs)), 1e-9)
        assertEquals(2.94, t.thresholdM(t.sigmaM(c, c.atMs + 2 * hour)), 0.01)
        assertEquals(4.03, t.thresholdM(t.sigmaM(c, c.atMs + 4 * hour)), 0.01)
        assertEquals(5.19, t.thresholdM(t.sigmaM(c, c.atMs + 6 * hour)), 0.01)
    }

    @Test fun anOrdinaryStoreyShowsForAboutTwoHoursATallBalconyForFour() {
        fun tagAt(metres: Double, afterMs: Long): Floor? {
            val t = calibrated()
            return t.update(1013.0, up(1013.0, metres), afterMs, afterMs)?.floor
        }
        assertEquals(Floor.UP, tagAt(3.0, 10 * 60_000L))
        assertEquals(Floor.UP, tagAt(3.0, 2 * hour))
        assertNull(tagAt(3.0, 3 * hour)) // by now a metre of drift could be hiding in it
        assertEquals(Floor.UP, tagAt(4.5, 4 * hour))
        assertNull(tagAt(4.5, 5 * hour))
        assertEquals(Floor.DOWN, tagAt(-4.5, 4 * hour))
    }

    @Test fun afterSixAndAHalfHoursWeSayNothingUntilTheyMeetAgain() {
        val t = calibrated()
        assertNotNull(t.update(1013.0, up(1013.0, 9.0), 6 * hour, 6 * hour))
        assertNull(t.update(1013.0, up(1013.0, 9.0), 7 * hour, 7 * hour)) // even three floors: too unsure
        assertNull(t.floor)
        // Together again: fresh calibration, tags come back.
        var ok = false
        for (i in 0..10) ok = t.onPair(1013.0, 1013.2, 7 * hour + i * 1_000L, Closeness.UWB) || ok
        assertTrue(ok)
        assertEquals(Floor.UP, t.update(1013.0, up(1013.2, 3.0), 7 * hour + 60_000L, 7 * hour + 60_000L)!!.floor)
    }

    // ---- What counts as a floor ----

    @Test fun stepsRampsAndMezzaninesAreNotAFloor() {
        val t = calibrated()
        for (m in listOf(0.0, 0.5, -0.8, 1.2, 2.0, -2.3)) assertNull(t.update(1013.0, up(1013.0, m), 1_000, 1_000)!!.floor, "$m m")
        assertEquals(Floor.UP, t.update(1013.0, up(1013.0, 2.6), 2_000, 2_000)!!.floor)
    }

    @Test fun theTagDoesNotFlickerAtTheEdge() {
        val t = calibrated()
        assertEquals(Floor.UP, t.update(1013.0, up(1013.0, 2.7), 1_000, 1_000)!!.floor)
        // Readings wobble around the bar: once shown, it stays down to 60% of it (1.5 m).
        for (m in listOf(2.4, 2.1, 1.8, 1.6, 2.2)) assertEquals(Floor.UP, t.update(1013.0, up(1013.0, m), 2_000, 2_000)!!.floor, "$m m")
        assertNull(t.update(1013.0, up(1013.0, 1.3), 3_000, 3_000)!!.floor)
        // And coming back up needs the full bar again.
        assertNull(t.update(1013.0, up(1013.0, 2.2), 4_000, 4_000)!!.floor)
        // Upstairs never turns into downstairs without passing through "same floor" numbers.
        assertEquals(Floor.DOWN, t.update(1013.0, up(1013.0, -3.0), 5_000, 5_000)!!.floor)
        assertNull(t.update(1013.0, up(1013.0, 1.6), 6_000, 6_000)!!.floor)
    }

    // ---- Never say what we don't know ----

    @Test fun noTagWithoutASensorACalibrationOrAFreshReading() {
        val t = calibrated()
        assertEquals(Floor.UP, t.update(1013.0, up(1013.0, 4.0), 1_000, 1_000)!!.floor)
        // Their reading is three minutes old: they may have come back down since.
        assertNull(t.update(1013.0, up(1013.0, 4.0), 1_000, 1_000 + 180_000L))
        assertNull(t.floor)
        // One phone has no sensor.
        assertNull(t.update(null, up(1013.0, 4.0), 2_000, 2_000))
        assertNull(t.update(1013.0, null, 2_000, 2_000))
        // Never calibrated.
        assertNull(FloorTracker(cfg).update(1013.0, up(1013.0, 4.0), 0, 0))
    }

    @Test fun aSavedCalibrationCanBeRestored() {
        val t = FloorTracker(cfg)
        t.calibration = FloorTracker.Calibration(offsetHpa = -0.5, atMs = 0, byUwb = false)
        assertEquals(Floor.UP, t.update(1013.0, up(1013.5, 3.5), 60_000, 60_000)!!.floor)
    }
}
