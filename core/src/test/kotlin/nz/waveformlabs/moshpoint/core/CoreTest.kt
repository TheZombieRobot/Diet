package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.math.cos
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue

class GeoTest {
    @Test fun bearingDueEastIsNinety() {
        val b = Geo.bearingDeg(LatLon(-36.85, 174.76), LatLon(-36.85, 174.77))
        assertTrue(abs(b - 90) < 0.1, "got $b")
    }

    @Test fun distanceAboutRight() {
        // ~0.001 deg latitude ~= 111 m
        val d = Geo.distanceM(LatLon(-36.850, 174.76), LatLon(-36.851, 174.76))
        assertTrue(abs(d - 111.2) < 1.0, "got $d")
    }

    @Test fun relativeWrapsAround() {
        assertEquals(-20.0, Geo.relativeDeg(350.0, 10.0), 1e-9)
        assertEquals(20.0, Geo.relativeDeg(10.0, 350.0), 1e-9)
    }
}

class MethodArbiterTest {
    private val f = "sam"

    @Test fun noFixesMeansNoSignal() {
        assertIs<ArrowState.NoSignal>(MethodArbiter().arrowFor(f, 0.0, 1_000))
    }

    @Test fun uwbBeatsGps() {
        val a = MethodArbiter()
        a.submit(Fix(f, Method.GPS_SERVER, bearingDeg = 0.0, distanceM = 60.0, confidence = 1.0, timestampMs = 1_000))
        a.submit(Fix(f, Method.UWB, bearingDeg = 90.0, distanceM = 42.0, confidence = 1.0, timestampMs = 1_000))
        val s = assertIs<ArrowState.Pointing>(a.arrowFor(f, headingDeg = 0.0, nowMs = 1_100))
        assertEquals(Method.UWB, s.method)
        assertEquals(90.0, s.relativeDeg, 1e-9)
        assertEquals(42.0, s.distanceM)
    }

    @Test fun staleUwbFallsBackToGps() {
        val a = MethodArbiter()
        a.submit(Fix(f, Method.UWB, 90.0, 42.0, 1.0, timestampMs = 0))
        a.submit(Fix(f, Method.GPS_SERVER, 180.0, 60.0, 1.0, timestampMs = 9_000))
        val s = assertIs<ArrowState.Pointing>(a.arrowFor(f, 0.0, nowMs = 10_000))
        assertEquals(Method.GPS_SERVER, s.method)
    }

    @Test fun bluetoothOnlyGivesDistanceAndTrend() {
        val a = MethodArbiter()
        listOf(30.0, 28.0, 25.0, 20.0, 16.0, 12.0).forEachIndexed { i, d ->
            a.submit(Fix(f, Method.BLE_RSSI, null, d, 0.8, timestampMs = i * 500L))
        }
        val s = assertIs<ArrowState.DistanceOnly>(a.arrowFor(f, 0.0, nowMs = 3_000))
        assertEquals(Trend.WARMER, s.trend)
        assertEquals(12.0, s.distanceM)
    }

    @Test fun gpsArrowUsesCloserRangeDistance() {
        val a = MethodArbiter()
        a.submit(Fix(f, Method.GPS_SERVER, 45.0, 60.0, 1.0, 1_000))
        a.submit(Fix(f, Method.WIFI_AWARE, null, 18.0, 1.0, 1_000))
        val s = assertIs<ArrowState.Pointing>(a.arrowFor(f, 0.0, 1_100))
        assertEquals(Method.GPS_SERVER, s.method)
        assertEquals(18.0, s.distanceM)
    }

    @Test fun hysteresisAvoidsFlicker() {
        val a = MethodArbiter(switchMargin = 0.2)
        a.submit(Fix(f, Method.GPS_SERVER, 10.0, 50.0, 1.0, 1_000))
        assertEquals(Method.GPS_SERVER, (a.arrowFor(f, 0.0, 1_000) as ArrowState.Pointing).method)
        // Crowd relay is close in score but not better by the margin: stay on GPS.
        a.submit(Fix(f, Method.CROWD_RELAY, 20.0, 50.0, 1.0, 1_000))
        assertEquals(Method.GPS_SERVER, (a.arrowFor(f, 0.0, 1_000) as ArrowState.Pointing).method)
    }

    @Test fun lowConfidenceIsUnsure() {
        val a = MethodArbiter()
        a.submit(Fix(f, Method.CROWD_RELAY, 10.0, 80.0, 0.5, 1_000))
        assertTrue((a.arrowFor(f, 0.0, 1_000) as ArrowState.Pointing).unsure)
    }
}

class SpinScanTest {
    private fun spin(friendBearing: Double, noiseDb: Double, depthDb: Double, seed: Int = 1): SpinScan {
        val rnd = Random(seed)
        val scan = SpinScan()
        var h = 0.0
        while (h < 360) {
            val shadow = depthDb / 2 * cos(Math.toRadians(h - friendBearing))
            scan.add(h, -70 + shadow + (rnd.nextDouble() * 2 - 1) * noiseDb)
            h += 10
        }
        return scan
    }

    @Test fun findsFriendDirectionThroughNoise() {
        for (target in listOf(0.0, 75.0, 200.0, 330.0)) {
            val r = assertIs<SpinScan.Result.Found>(spin(target, noiseDb = 3.0, depthDb = 10.0).result())
            val err = abs(Geo.normalize180(r.bearingDeg - target))
            assertTrue(err < 20, "target $target got ${r.bearingDeg}")
        }
    }

    @Test fun needsAFullTurn() {
        val scan = SpinScan()
        for (h in 0..180 step 10) scan.add(h.toDouble(), -70.0)
        assertIs<SpinScan.Result.NeedMore>(scan.result())
    }

    @Test fun flatSignalIsInconclusive() {
        assertIs<SpinScan.Result.Inconclusive>(spin(90.0, noiseDb = 0.2, depthDb = 0.0).result())
    }
}

class ArrowStyleTest {
    @Test fun fadesFromRedToFriendColour() {
        val blue = 0xFF1E88E5.toInt()
        assertEquals(ArrowStyle.RED, ArrowStyle.arrowColor(blue, 500.0))
        assertEquals(blue, ArrowStyle.arrowColor(blue, 5.0))
        val mid = ArrowStyle.arrowColor(blue, 80.0)
        assertTrue(mid != ArrowStyle.RED && mid != blue)
    }

    @Test fun labels() {
        assertEquals("40 m", ArrowStyle.distanceLabel(41.0))
        assertEquals("3.4 m", ArrowStyle.distanceLabel(3.4))
        assertEquals("1.2 km", ArrowStyle.distanceLabel(1234.0))
    }
}

class RssiRangingTest {
    @Test fun weakerSignalIsFurther() {
        val r = RssiRanging()
        assertEquals(1.0, r.distanceFor(-59.0), 1e-9)
        assertTrue(r.distanceFor(-80.0) > r.distanceFor(-65.0))
    }
}

class EphemeralIdTest {
    private val secret = ByteArray(32) { it.toByte() }

    @Test fun rotatesAndFriendCanRecognise() {
        val id = EphemeralId(secret)
        val t0 = 1_700_000_000_000L
        val a = id.currentId(t0)
        val b = id.currentId(t0 + EphemeralId.DEFAULT_ROTATION_MS)
        assertFalse(a.contentEquals(b))
        assertTrue(id.matches(a, t0 + 1_000))
        assertTrue(id.matches(a, t0 + EphemeralId.DEFAULT_ROTATION_MS)) // drift tolerance
    }

    @Test fun strangerCannotRecognise() {
        val mine = EphemeralId(secret)
        val stranger = EphemeralId(ByteArray(32) { 7 })
        val t = 1_700_000_000_000L
        assertFalse(stranger.matches(mine.currentId(t), t))
    }
}
