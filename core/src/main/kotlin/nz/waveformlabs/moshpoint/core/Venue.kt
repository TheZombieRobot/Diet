package nz.waveformlabs.moshpoint.core

import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/*
 * The venue map's rules that don't need a phone (docs/VENUE_MAP.md, sections 2 and 3):
 * when you count as "at the gig", and where a mate goes on the map.
 */

/**
 * "At the gig": gig day, and this phone is standing at the venue. Only then does the map open
 * zoomed into the venue. It is about you, not the crew: at home with your mates at the gig,
 * the map behaves as it always has.
 */
object AtGig {
    /** "At the venue" means within this of its position (the same distance crew tiles use). */
    const val VENUE_RADIUS_M = 400.0

    /** A vague position gets this much benefit of the doubt, at most. */
    const val MAX_ACCURACY_ALLOWANCE_M = 150.0

    /** A position older than this doesn't say where you are now. */
    const val MAX_FIX_AGE_MS = 5 * 60_000L

    /** The venue view never shows more than about 1 km across, nor closer than a room or two. */
    const val VIEW_MIN_ZOOM = 16.0
    const val VIEW_MAX_ZOOM = 18.5

    /** Gig day: the crew is awake (from a few hours before the start) and hasn't ended. */
    fun gigTime(group: GigGroup, nowMs: Long): Boolean = !group.dormant(nowMs) && nowMs <= group.expiresAtMs

    /** Is [at] (known to within [accuracyM]) at the [venue]? */
    fun nearVenue(at: LatLon, accuracyM: Double, venue: LatLon): Boolean =
        Geo.distanceM(at, venue) <= VENUE_RADIUS_M + accuracyM.coerceIn(0.0, MAX_ACCURACY_ALLOWANCE_M)

    /**
     * The whole rule. [venue] is the crew's venue position if one is known (from the crew, or
     * looked up by name); [me] is this phone's last position, [fixAgeMs] old.
     */
    fun atGig(
        group: GigGroup?,
        following: Boolean,
        venue: LatLon?,
        me: LatLon?,
        accuracyM: Double,
        fixAgeMs: Long,
        nowMs: Long,
    ): Boolean {
        if (group == null || following || venue == null || me == null) return false
        if (!gigTime(group, nowMs)) return false
        if (fixAgeMs < 0 || fixAgeMs > MAX_FIX_AGE_MS) return false
        return nearVenue(me, accuracyM, venue)
    }

    /**
     * What the venue view fits on screen: the venue, you, and the mates who are at the venue.
     * Mates elsewhere (still at home) are left out; "All" shows them.
     */
    fun viewPoints(venue: LatLon, me: LatLon?, mates: List<LatLon>): List<LatLon> =
        listOf(venue) + listOfNotNull(me) + mates.filter { Geo.distanceM(it, venue) <= VENUE_RADIUS_M }
}

/**
 * Where a mate goes on the map: exactly, when UWB has measured them; as their shared GPS pin
 * otherwise; nowhere, when all we have is a distance with no direction.
 */
object VenuePlacement {
    /** A UWB reading older than this no longer says where they are. */
    const val UWB_MAX_AGE_MS = 10_000L

    private const val EARTH_RADIUS_M = 6_371_000.0

    /** What UWB last said about a mate. [bearingDeg] is clockwise from true north (compass heading + UWB angle). */
    data class UwbReading(val bearingDeg: Double?, val distanceM: Double?, val atMs: Long)

    sealed interface Spot {
        /** Measured by UWB from our own position. */
        data class Exact(val at: LatLon) : Spot

        /** Their own shared location. */
        data class Gps(val at: LatLon) : Spot

        /** The spot they pinned as where they are ("I'm here", docs/IM_HERE.md). */
        data class Pinned(val at: LatLon) : Spot

        /** We don't know where they are: draw nothing. */
        data object Unknown : Spot
    }

    /** The point [distanceM] from [from] along [bearingDeg] (degrees clockwise from true north). */
    fun offset(from: LatLon, bearingDeg: Double, distanceM: Double): LatLon {
        val d = distanceM / EARTH_RADIUS_M
        val b = Math.toRadians(bearingDeg)
        val lat1 = Math.toRadians(from.lat)
        val lon1 = Math.toRadians(from.lon)
        val lat2 = asin(sin(lat1) * cos(d) + cos(lat1) * sin(d) * cos(b))
        val lon2 = lon1 + atan2(sin(b) * sin(d) * cos(lat1), cos(d) - sin(lat1) * sin(lat2))
        return LatLon(Math.toDegrees(lat2), Geo.normalize180(Math.toDegrees(lon2)))
    }

    /**
     * UWB measures the straight line between two phones. With a mate [heightM] above or below
     * us, the distance along the ground is shorter. Unknown height: the straight line.
     */
    fun groundDistanceM(straightM: Double, heightM: Double?): Double {
        if (heightM == null) return straightM
        val h = kotlin.math.abs(heightM)
        return if (h >= straightM) 0.0 else sqrt(straightM * straightM - h * h)
    }

    /**
     * A mate's spot. [me] is the same position our own dot is drawn at, so an error in it
     * moves us and every UWB mate together: who is where around us stays right.
     */
    fun spot(me: LatLon?, uwb: UwbReading?, gps: LatLon?, heightM: Double?, nowMs: Long): Spot {
        val bearing = uwb?.bearingDeg
        val distance = uwb?.distanceM
        if (me != null && uwb != null && bearing != null && distance != null && distance >= 0 &&
            nowMs - uwb.atMs in 0..UWB_MAX_AGE_MS
        ) {
            return Spot.Exact(offset(me, bearing, groundDistanceM(distance, heightM)))
        }
        return if (gps != null) Spot.Gps(gps) else Spot.Unknown
    }

    /**
     * The same with their standing "I'm here" pin, [pinned]: UWB measured this second still
     * wins (it's where they are now, and the pin will clear if they've left it); then the spot
     * they told us; then their GPS, which the pin is there to replace.
     */
    fun spot(me: LatLon?, uwb: UwbReading?, pinned: LatLon?, gps: LatLon?, heightM: Double?, nowMs: Long): Spot {
        val measured = spot(me, uwb, null, heightM, nowMs)
        if (measured is Spot.Exact) return measured
        if (pinned != null) return Spot.Pinned(pinned)
        return if (gps != null) Spot.Gps(gps) else Spot.Unknown
    }
}
