package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class FriendSimulatorTest {
    private fun run(sim: FriendSimulator, fromS: Int, toS: Int, heading: Double = 40.0): List<Fix> =
        (fromS * 10 until toS * 10).flatMap { sim.tick(it * 100L, heading) }

    @Test fun farAwayOnlyGps() {
        val sim = FriendSimulator("sim")
        val fixes = run(sim, 0, 10)
        assertEquals(setOf(Method.GPS_SERVER), fixes.map { it.method }.toSet())
    }

    @Test fun closeUpGetsUwbAndArbiterPicksIt() {
        val sim = FriendSimulator("sim")
        val a = MethodArbiter()
        run(sim, 0, 140).forEach(a::submit) // ~200 m at 1.4 m/s: close by now
        val (e, n) = sim.position(140_000)
        assertTrue(hypot(e, n) < 20)
        val s = a.arrowFor("sim", 40.0, 140_000)
        assertTrue(s is ArrowState.Pointing && s.method == Method.UWB, "got $s")
    }

    @Test fun noUwbFallsBackToWifiDistance() {
        val sim = FriendSimulator("sim", hasUwb = false)
        val a = MethodArbiter()
        run(sim, 0, 140).forEach(a::submit)
        val s = a.arrowFor("sim", 40.0, 140_000)
        // GPS stops under 25 m and nothing else gives direction: distance only, from Wi-Fi.
        assertTrue(s is ArrowState.DistanceOnly && s.method == Method.WIFI_AWARE, "got $s")
        assertTrue(abs(s.distanceM - hypot(sim.position(140_000).first, sim.position(140_000).second)) < 4)
    }

    @Test fun spinScanFindsSimulatedFriend() {
        val sim = FriendSimulator("sim", startBearingDeg = 120.0)
        val t = 145_000L // in the 8 m circle by now
        val scan = SpinScan()
        for (h in 0 until 360 step 10) scan.add(h.toDouble(), sim.rssiNow(t, h.toDouble()))
        val r = scan.result()
        val (e, n) = sim.position(t)
        val truth = Geo.normalize360(Math.toDegrees(kotlin.math.atan2(e, n)))
        assertTrue(r is SpinScan.Result.Found && abs(Geo.normalize180(r.bearingDeg - truth)) < 30, "got $r, truth $truth")
    }

    @Test fun noDataUsesCrowdRelay() {
        val sim = FriendSimulator("sim", noData = true)
        assertEquals(setOf(Method.CROWD_RELAY), run(sim, 0, 20).map { it.method }.toSet())
    }
}
