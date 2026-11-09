package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.log10
import kotlin.math.sin
import kotlin.random.Random

/**
 * A pretend friend for testing on one phone (debug builds only).
 *
 * They start [startDistanceM] away, walk towards you, pass, then wander in circles
 * close by. As they move, each method produces readings the way the real one would:
 * GPS when far (noisy), Bluetooth signal strength and Wi-Fi Aware when nearer, UWB
 * within 50 m (precise, but only gives direction when they're in front of the phone).
 * That exercises the arrows, colours, hand-overs and debug panel without a second phone.
 *
 * Positions are metres east/north of you; you're treated as standing still.
 */
class FriendSimulator(
    private val friendId: String,
    private val startDistanceM: Double = 200.0,
    private val startBearingDeg: Double = 40.0,
    private val walkSpeedMps: Double = 1.4,
    /** Pretend this phone has UWB / Wi-Fi Aware (so you can test the fallbacks too). */
    var hasUwb: Boolean = true,
    var hasWifiAware: Boolean = true,
    /** Pretend there's no mobile data, so far-away fixes come via crowd relay instead. */
    var noData: Boolean = false,
    seed: Int = 1,
) {
    private val rnd = Random(seed)
    private var startMs = -1L
    private val last = mutableMapOf<Method, Long>()
    private val rssi = RssiRanging()

    /**
     * Pinned to a real spot (debug "pin ahead"): returns where that spot is from you right now,
     * metres (east, north), from your real GPS. The friend stands still there, so walking
     * towards it closes the gap like a real mate. Null = not pinned, or no GPS yet.
     */
    var pinnedOffset: (() -> Pair<Double, Double>?)? = null

    /** Where the friend is at [nowMs]: metres (east, north). */
    fun position(nowMs: Long): Pair<Double, Double> {
        pinnedOffset?.invoke()?.let { return it }
        if (startMs < 0) startMs = nowMs
        val t = (nowMs - startMs) / 1000.0
        val walkIn = (startDistanceM - 8.0) / walkSpeedMps
        val b = Math.toRadians(startBearingDeg)
        return if (t < walkIn) {
            val d = startDistanceM - walkSpeedMps * t
            d * sin(b) to d * cos(b)
        } else {
            // Then wander in an 8 m circle around you, one lap a minute.
            val a = b + (t - walkIn) / 60.0 * 2 * Math.PI
            8.0 * sin(a) to 8.0 * cos(a)
        }
    }

    /** Latest simulated Bluetooth signal strength (dBm), for spin-to-scan. */
    var lastRssi: Double? = null
        private set

    /**
     * Simulated Bluetooth signal: log-distance path loss, crowd fading, and the body shadow
     * spin-to-scan relies on (about 8 dB weaker when your back is to them).
     */
    fun rssiNow(nowMs: Long, headingDeg: Double): Double {
        val (e, n) = position(nowMs)
        val d = hypot(e, n)
        val bearing = Math.toDegrees(atan2(e, n))
        val facing = cos(Math.toRadians(bearing - headingDeg)) // 1 facing them, -1 back to them
        val shadow = -4.0 * (1 - facing)
        return -59.0 - 28.0 * log10(maxOf(d, 0.3)) + shadow + (rnd.nextDouble() - 0.5) * 6
    }

    /** Readings due at [nowMs]. [headingDeg] is where the phone points (for UWB's field of view). */
    fun tick(nowMs: Long, headingDeg: Double): List<Fix> {
        val (e, n) = position(nowMs)
        val d = hypot(e, n)
        val bearing = Geo.normalize360(Math.toDegrees(atan2(e, n)))
        val out = mutableListOf<Fix>()

        fun due(m: Method, everyMs: Long): Boolean {
            val prev = last[m] ?: Long.MIN_VALUE / 2
            if (nowMs - prev < everyMs) return false
            last[m] = nowMs
            return true
        }
        fun noise(sd: Double) = (rnd.nextDouble() + rnd.nextDouble() + rnd.nextDouble() - 1.5) * 2 * sd

        if (d > 25 && due(if (noData) Method.CROWD_RELAY else Method.GPS_SERVER, if (noData) 8_000 else 4_000)) {
            // GPS error ~8 m each end; turn that into bearing/distance error.
            val ge = e + noise(8.0)
            val gn = n + noise(8.0)
            val gd = hypot(ge, gn)
            out += Fix(
                friendId, if (noData) Method.CROWD_RELAY else Method.GPS_SERVER,
                Geo.normalize360(Math.toDegrees(atan2(ge, gn))), gd,
                confidence = (1.0 - 16.0 / maxOf(gd, 1.0)).coerceIn(0.1, 1.0), timestampMs = nowMs,
            )
        }
        if (d < 70 && due(Method.BLE_RSSI, 400)) {
            val dbm = rssiNow(nowMs, headingDeg)
            lastRssi = dbm
            out += Fix(friendId, Method.BLE_RSSI, null, rssi.add(dbm.toInt()), 0.7, nowMs)
        }
        if (hasWifiAware && d < 40 && due(Method.WIFI_AWARE, 1_000)) {
            out += Fix(friendId, Method.WIFI_AWARE, null, maxOf(0.3, d + noise(1.0)), 0.85, nowMs)
        }
        if (hasUwb && d < 50 && due(Method.UWB, 200)) {
            val rel = Geo.normalize180(bearing - headingDeg)
            val inView = abs(rel) < 65 // UWB angle-of-arrival covers roughly the front of the phone
            out += Fix(
                friendId, Method.UWB,
                if (inView) Geo.normalize360(bearing + noise(3.0)) else null,
                maxOf(0.1, d + noise(0.1)),
                if (inView) 0.95 else 0.8, nowMs,
            )
        }
        return out
    }
}
