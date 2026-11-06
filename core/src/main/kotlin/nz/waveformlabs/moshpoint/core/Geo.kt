package nz.waveformlabs.moshpoint.core

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

data class LatLon(val lat: Double, val lon: Double)

object Geo {
    private const val EARTH_RADIUS_M = 6_371_000.0

    /** Great-circle distance in metres (haversine). */
    fun distanceM(a: LatLon, b: LatLon): Double {
        val dLat = Math.toRadians(b.lat - a.lat)
        val dLon = Math.toRadians(b.lon - a.lon)
        val h = sin(dLat / 2).let { it * it } +
            cos(Math.toRadians(a.lat)) * cos(Math.toRadians(b.lat)) * sin(dLon / 2).let { it * it }
        return 2 * EARTH_RADIUS_M * atan2(sqrt(h), sqrt(1 - h))
    }

    /** Initial bearing from [from] to [to], degrees clockwise from true north, 0..360. */
    fun bearingDeg(from: LatLon, to: LatLon): Double {
        val lat1 = Math.toRadians(from.lat)
        val lat2 = Math.toRadians(to.lat)
        val dLon = Math.toRadians(to.lon - from.lon)
        val y = sin(dLon) * cos(lat2)
        val x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLon)
        return normalize360(Math.toDegrees(atan2(y, x)))
    }

    /**
     * Turns an absolute bearing into the angle the arrow is drawn at, given which way the
     * phone is facing. Result is -180..180: 0 = straight ahead, positive = to the right.
     */
    fun relativeDeg(targetBearingDeg: Double, headingDeg: Double): Double =
        normalize180(targetBearingDeg - headingDeg)

    fun normalize360(deg: Double): Double = ((deg % 360) + 360) % 360

    fun normalize180(deg: Double): Double {
        val d = normalize360(deg)
        return if (d > 180) d - 360 else d
    }
}
