package nz.waveformlabs.moshpoint.locate

import android.content.Context
import android.hardware.GeomagneticField
import android.location.Location
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.FieldRecorder
import nz.waveformlabs.moshpoint.core.RecordLine
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.LocationBox
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.SharedLocation
import kotlin.math.max

/**
 * GPS + compass mode, for when you're far apart.
 *
 * Every few seconds, for each tracked friend (current and previous rotating id):
 *  - fetch their sealed boxes from the relay server, if we have data, and
 *  - check what the crowd relay has heard over Bluetooth,
 * open them with the friend's secret, and turn "their GPS vs my GPS" into a bearing and
 * distance.
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
        if (jobs.isNotEmpty()) return
        jobs = listOf(
            scope.launch {
                DebugStatus.set("GPS", "waiting for a fix")
                myLocation.updates(intervalMs = 3_000, minDistanceM = 0f).collect {
                    me = it
                    DebugStatus.set("GPS", "±%.0f m via %s".format(it.accuracy, it.provider))
                    FieldRecorder.line(
                        RecordLine.of(
                            System.currentTimeMillis(), "my_gps", lat = it.latitude, lon = it.longitude,
                            accuracyM = it.accuracy.toDouble(), note = it.provider,
                        ),
                    )
                    declinationDeg = GeomagneticField(
                        it.latitude.toFloat(), it.longitude.toFloat(), it.altitude.toFloat(), it.time,
                    ).declination.toDouble()
                }
            },
            scope.launch {
                while (true) {
                    poll()
                    delay(RelayClient.pollMs)
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
        val best = mutableMapOf<String, Pair<SharedLocation, Method>>()
        fun consider(friend: Friend, id: ByteArray, sealed: ByteArray, method: Method) {
            val loc = LocationBox.open(friend.secret, id, sealed) ?: return
            nz.waveformlabs.moshpoint.LocationBook.update(friend.id, loc)
            val prev = best[friend.id]
            if (prev == null || loc.timeSec > prev.first.timeSec) best[friend.id] = loc to method
        }
        // Bluetooth crowd relay: works with no signal at all.
        asks.forEach { (friend, id) ->
            CrowdRelayRadio.cache.lookup(id, now / 1000)?.let { consider(friend, id, it.sealed, Method.CROWD_RELAY) }
        }
        // Relay server: needs mobile data.
        val results = RelayClient.lookup(asks.map { it.second })
        DebugStatus.set(
            "Server",
            when {
                false -> ""
                results == null -> "lookup FAILED (no data?)"
                else -> "${RelayClient.label}: ${results.sumOf { it.size }} box(es) for ${list.size} friend(s)"
            },
        )
        results?.let { results ->
            asks.forEachIndexed { i, (friend, id) -> results[i].forEach { consider(friend, id, it, Method.GPS_SERVER) } }
        }
        val myLatLon = LatLon(here.latitude, here.longitude)
        for ((friendId, pair) in best) {
            val (loc, method) = pair
            FieldRecorder.line(
                RecordLine.of(
                    now, "friend_gps", list.firstOrNull { it.id == friendId }?.name, method.name,
                    lat = loc.lat, lon = loc.lon, accuracyM = loc.accuracyM.toDouble(), note = "age ${(now / 1000 - loc.timeSec)}s",
                ),
            )
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
                    method = method,
                    bearingDeg = Geo.bearingDeg(myLatLon, loc.latLon),
                    distanceM = distance,
                    confidence = confidence,
                    timestampMs = now,
                ),
            )
        }
    }

    private companion object {
        // Public relay posts every ~75 s (more when moving), so allow a few minutes.
        const val MAX_AGE_MS = 240_000L
    }
}
