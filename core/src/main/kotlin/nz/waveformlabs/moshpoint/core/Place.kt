package nz.waveformlabs.moshpoint.core

import kotlin.math.max

/**
 * Finding a place rather than a person (docs/SPOT_LINKS.md): today, a spot a mate texted. The
 * finder's arrow to it comes from this phone's own GPS position and its compass alone, so it
 * works with no data and no signal: GPS needs neither, and the place is already on the phone.
 *
 * A place has one method, [Method.PLACE], and nothing else ever measures it (no radio can hear a
 * place). Its fixes go through the same [MethodArbiter] as a mate's, so its arrow is drawn, aged
 * and marked unsure in the same way as every other arrow.
 */
object PlaceRule {
    /**
     * How far the place itself may be from where it says it is: it's the sender's own GPS fix
     * when they texted it, whose accuracy isn't in the link. About a phone's usual fix outdoors.
     */
    const val SPOT_SLACK_M = 10.0

    /**
     * The finder's reading for [place] from our own position [me] (known to [myAccuracyM]),
     * taken from a GPS fix [fixAgeMs] old: bearing and distance by geometry.
     *
     * The confidence is a GPS fix's: both errors (ours and the place's own [SPOT_SLACK_M])
     * against the distance, so close up, where they're as big as the gap, the arrow is unsure.
     * The reading is stamped with our fix's own time, so it ages with that fix: walking on with
     * a fix that's gone stale (indoors, say) makes the arrow unsure and then takes it away. With
     * no fix newer than [Method.PLACE]'s `maxAgeMs`, or numbers that aren't a place, null.
     */
    fun fix(placeId: String, me: LatLon, myAccuracyM: Double, fixAgeMs: Long, place: LatLon, nowMs: Long): Fix? {
        if (fixAgeMs < 0 || fixAgeMs > Method.PLACE.maxAgeMs) return null
        if (!SpotText.usable(me.lat, me.lon) || !SpotText.usable(place.lat, place.lon)) return null
        val distance = Geo.distanceM(me, place)
        val mine = if (myAccuracyM.isFinite()) myAccuracyM.coerceAtLeast(0.0) else UNKNOWN_ACCURACY_M
        val geometry = (1.0 - (mine + SPOT_SLACK_M) / max(distance, 1.0)).coerceIn(0.1, 1.0)
        return Fix(placeId, Method.PLACE, Geo.bearingDeg(me, place), distance, geometry, nowMs - fixAgeMs)
    }

    /** Our own accuracy when the phone gives none worth using: a poor fix, so nothing claims to be sure. */
    const val UNKNOWN_ACCURACY_M = 50.0
}
