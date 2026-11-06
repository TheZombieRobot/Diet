package nz.waveformlabs.moshpoint.locate

import android.content.Context
import android.location.GeomagneticField
import android.location.Location
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.LocationBox
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.SharedLocation
import kotlin.math.max

/**
 * GPS + compass mode, for when you're far apart and have mobile data.
 *
 * Every few seconds: fetch each tracked friend's sealed boxes from the relay server
 * (under their current and previous rotating id), open them with the friend's secret,
 * and turn "their GPS vs my GPS" into a bearing and distance.
 */
class GpsFinder(
    context: Context,
    private val scope: CoroutineScope,
    private val friends: () -> List<Friend>,
    private val onFix: (Fix) -> Unit,
) {
    private val myLocation = MyLocation(context)
    private var me: Location? = null
    private var jobs = listOf<Job>()

    /** Magnetic declination at our position: add to a compass heading to get true north. */
    var declinationDeg = 0.0
        private set

    fun start() {
        if (jobs.isNotEmpty() || !RelayClient.enabled) return
        jobs = listOf(
            scope.launch {
                myLocation.updates(intervalMs = 3_000, minDistanceM = 0f).collect {
                    me = it
                    declinationDeg = GeomagneticField(
                        it.latitude.toFloat(), it.longitude.toFloat(), it.altitude.toFloat(), it.time,
                    ).declination.toDouble()
                }
            },
            scope.launch {
                while (true) {
                    poll()
                    delay(POLL_MS)
                }
            },
        )
    }

    fun stop() {
        jobs.forEach { it.cancel() }
        jobs = emptyList()
    }

    private suspend fun poll() {
        val here = me ?: return
        val list = friends()
        if (list.isEmpty()) return
        val now = System.currentTimeMillis()
        // Current + previous rotation for each friend, so we don't miss the hand-over.
        val asks = list.flatMap { f ->
            val e = f.ephemeralId.epochAt(now)
            listOf(f to f.ephemeralId.idForEpoch(e), f to f.ephemeralId.idForEpoch(e - 1))
        }
        val results = RelayClient.lookup(asks.map { it.second }) ?: return
        val best = mutableMapOf<String, SharedLocation>()
        asks.forEachIndexed { i, (friend, id) ->
            results[i].forEach { sealed ->
                val loc = LocationBox.open(friend.secret, id, sealed) ?: return@forEach
                val prev = best[friend.id]
                if (prev == null || loc.timeSec > prev.timeSec) best[friend.id] = loc
            }
        }
        val myLatLon = LatLon(here.latitude, here.longitude)
        for ((friendId, loc) in best) {
            val ageMs = now - loc.timeSec * 1000
            if (ageMs > MAX_AGE_MS) continue
            val distance = Geo.distanceM(myLatLon, loc.latLon)
            val uncertainty = here.accuracy + loc.accuracyM
            // GPS is useless for direction when the error circle is as big as the gap.
            val confidence = (1.0 - uncertainty / max(distance, 1.0)).coerceIn(0.1, 1.0) *
                (1.0 - ageMs.toDouble() / MAX_AGE_MS).coerceIn(0.2, 1.0)
            onFix(
                Fix(
                    friendId = friendId,
                    method = Method.GPS_SERVER,
                    bearingDeg = Geo.bearingDeg(myLatLon, loc.latLon),
                    distanceM = distance,
                    confidence = confidence,
                    timestampMs = now,
                ),
            )
        }
    }

    private companion object {
        const val POLL_MS = 4_000L
        const val MAX_AGE_MS = 120_000L
    }
}
