package nz.waveformlabs.moshpoint.locate

import android.content.Context
import android.hardware.GeomagneticField
import android.location.Location
import android.os.SystemClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.DistanceSmoother
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.HeadingFilter
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.MethodArbiter
import nz.waveformlabs.moshpoint.core.PlaceRule

/**
 * Finds a place instead of a person (docs/SPOT_LINKS.md): the arrow and distance to a
 * [FinderPlace] from this phone's own GPS and compass, and nothing else.
 *
 * Kept apart from [LocatorEngine] on purpose: no radio can hear a place, so none is started and
 * nothing is broadcast (mates' phones never hear that someone is looking), and finding mates
 * works exactly as before. It needs no data or signal: GPS works without either, and the place
 * is already on the phone.
 *
 * The arrow is a mate's arrow all the same: core [PlaceRule] makes the readings from each GPS
 * fix, a [MethodArbiter] turns them into an [ArrowState] against the compass (true north, with
 * the declination at our position, as the engine does), and the distance on screen is steadied
 * the same way. [scope] must run on the main thread.
 */
class PlaceFinder(context: Context, private val scope: CoroutineScope) {
    private val myLocation = MyLocation(context)
    private val compass = Compass(context)
    // As snappy as the mate finder's arrow.
    private val headingFilter = HeadingFilter(slowAlpha = 0.18, fastAlpha = 0.75, fastAboveDeg = 15.0)
    private val arbiter = MethodArbiter()
    private val smoother = DistanceSmoother()
    private var heading = 0.0
    private var declinationDeg = 0.0
    private var me: Location? = null

    /** The fix the last reading was made from: each new one makes one more. */
    private var readFrom: Location? = null

    private val _place = MutableStateFlow<FinderPlace?>(null)
    /** The place being found (null: none). */
    val place: StateFlow<FinderPlace?> = _place.asStateFlow()

    private val _arrows = MutableStateFlow<List<ArrowState>>(emptyList())
    /** Its arrow (one, keyed by the place's id), or nothing with no place. */
    val arrows: StateFlow<List<ArrowState>> = _arrows.asStateFlow()

    private var jobs = listOf<Job>()

    /** Find [place] from now on (null: none). */
    fun find(place: FinderPlace?) {
        _place.value?.let { arbiter.forget(it.id) }
        _place.value = place
        readFrom = null
        smoother.reset()
        _arrows.value = place?.let { listOf(ArrowState.NoSignal(it.id)) } ?: emptyList()
    }

    /** GPS and compass on (while the screen shows the place). */
    fun start() {
        if (jobs.isNotEmpty()) return
        jobs = listOf(
            scope.launch {
                myLocation.updates(intervalMs = 3_000, minDistanceM = 0f).collect {
                    me = it
                    declinationDeg = GeomagneticField(
                        it.latitude.toFloat(), it.longitude.toFloat(), it.altitude.toFloat(), it.time,
                    ).declination.toDouble()
                }
            },
            // True-north heading: the compass is magnetic, the bearing to the place is true.
            scope.launch { compass.headings().collect { heading = headingFilter.add(Geo.normalize360(it + declinationDeg)) } },
            scope.launch {
                while (true) {
                    tick()
                    delay(50)
                }
            },
        )
    }

    /** GPS and compass off. The place stays, for [start] again. */
    fun stop() {
        jobs.forEach { it.cancel() }
        jobs = emptyList()
    }

    private fun tick() {
        val p = _place.value ?: return
        val now = System.currentTimeMillis()
        val fix = me
        if (fix != null && fix !== readFrom) {
            readFrom = fix
            val ageMs = ((SystemClock.elapsedRealtimeNanos() - fix.elapsedRealtimeNanos) / 1_000_000L).coerceAtLeast(0L)
            val accuracy = if (fix.hasAccuracy()) fix.accuracy.toDouble() else Double.NaN
            PlaceRule.fix(p.id, LatLon(fix.latitude, fix.longitude), accuracy, ageMs, LatLon(p.lat, p.lon), now)?.let(arbiter::submit)
        }
        _arrows.value = listOf(steady(arbiter.arrowFor(p.id, heading, now)))
    }

    /** The distance rolls when it changes instead of wobbling, as the mate finder's does. */
    private fun steady(a: ArrowState): ArrowState = when (a) {
        is ArrowState.Pointing -> a.distanceM?.let { a.copy(distanceM = DistanceSmoother.roundForDisplay(smoother.update(it))) } ?: a
        is ArrowState.DistanceOnly -> a.copy(distanceM = DistanceSmoother.roundForDisplay(smoother.update(a.distanceM)))
        is ArrowState.NoSignal -> {
            smoother.reset()
            a
        }
    }
}
