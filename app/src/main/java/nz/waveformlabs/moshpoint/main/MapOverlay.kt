package nz.waveformlabs.moshpoint.main

import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.map.HerePins
import nz.waveformlabs.moshpoint.map.LocationBook
import nz.waveformlabs.moshpoint.map.Spots
import nz.waveformlabs.moshpoint.moments.Moments
import nz.waveformlabs.moshpoint.venue.Floors
import nz.waveformlabs.moshpoint.venue.VenueMaps

/** The map, zooming in from the button and out again. @NonRestartableComposable: see [MainScreen]. */
@Composable
@NonRestartableComposable
internal fun MapOverlay(a: MainActivity) {
    // The map zooms in from the button, and out again.
    androidx.compose.animation.AnimatedVisibility(
        visible = a.map.showMap,
        enter = androidx.compose.animation.scaleIn(androidx.compose.animation.core.tween(320), initialScale = 0.94f) +
            androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(260)),
        exit = androidx.compose.animation.scaleOut(androidx.compose.animation.core.tween(220), targetScale = 0.96f) +
            androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(200)),
    ) {
        val now by produceState(System.currentTimeMillis()) {
            while (true) {
                kotlinx.coroutines.delay(15_000)
                value = System.currentTimeMillis()
            }
        }
        val myLoc = a.map.mapFeed.me.value
        androidx.compose.runtime.LaunchedEffect(myLoc) { myLoc?.let { a.map.mapFirstFix(it) } }
        val mapUwb by a.finder.engine.uwbSpots.collectAsState()
        val mapArrows by a.finder.engine.arrows.collectAsState()
        nz.waveformlabs.moshpoint.ui.map.MapScreen(
            people = FriendsRepository.friends.filterNot { FriendsRepository.isSimulated(it.id) },
            seen = LocationBook.seen,
            me = myLoc?.let { nz.waveformlabs.moshpoint.core.LatLon(it.latitude, it.longitude) },
            status = a.map.mapFeed.status.value,
            nowMs = now,
            onFind = { id ->
                a.map.closeMap()
                a.finder.engine.track(setOf(id))
                a.finder.finding = true
                a.finder.pendingStop?.cancel()
                a.finder.engine.start()
            },
            onDirections = { lat, lon ->
                runCatching {
                    a.startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            android.net.Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lon&travelmode=walking"),
                        ),
                    )
                }
            },
            onNudge = { f -> a.finder.nudge(listOf(f.name)) },
            onBack = { a.map.closeMap() },
            places = listOfNotNull(
                GroupSync.rally.value?.let { nz.waveformlabs.moshpoint.ui.map.MapPlace("rally", it.name, it.lat, it.lon, meetUp = true) },
            ) + Spots.spots.map { nz.waveformlabs.moshpoint.ui.map.MapPlace(it.id, it.name, it.lat, it.lon, meetUp = false) },
            inCrew = GroupSync.group.value != null,
            onDropPin = { name, lat, lon, meetUp ->
                if (meetUp) {
                    GroupSync.setRally(a, name, lat, lon)
                    a.toast(Txt.s(R.string.main_meetup_sent))
                } else {
                    Spots.add(name, lat, lon)
                }
            },
            moments = Moments.items.mapNotNull { m ->
                val lat = m.lat ?: return@mapNotNull null
                val lon = m.lon ?: return@mapNotNull null
                nz.waveformlabs.moshpoint.ui.map.MapMoment(m.key, Txt.s(R.string.main_moment_label, if (m.mine) Txt.s(R.string.main_you) else m.from, nz.waveformlabs.moshpoint.ui.ago(now / 1000 - m.timeSec)), lat, lon, m.image)
            },
            trails = LocationBook.trails,
            // The venue map saved on the phone: at the gig, or when there's no internet.
            savedStyle = { look ->
                VenueMaps.savedChanges.intValue // look again when a saved map appears or goes
                if (a.map.mapVenue == null && VenueMaps.online(a)) null
                else VenueMaps.saved(a, look)?.let { nz.waveformlabs.moshpoint.ui.map.MapStyle(it.key, json = it.json) }
            },
            venueView = a.map.mapVenue,
            floors = Floors.tags,
            heights = Floors.heights,
            // "I'm here" (docs/IM_HERE.md): mates' faces on the spots they pinned, ours with ✕.
            pinned = HerePins.pins,
            pinnedFloors = HerePins.floors,
            myPin = HerePins.mine.value,
            onImHere = { lat: Double, lon: Double ->
                if (HerePins.setHere(a, lat, lon)) a.toast(Txt.s(R.string.here_sent))
            }.takeIf { HerePins.canSend() },
            onClearMyPin = { HerePins.clearHere(a) },
            uwb = mapUwb,
            // Only while something is looking: old readings say nothing about now.
            near = if (a.map.mapVenue == null && !a.finder.finding) emptyMap()
            else mapArrows.filterIsInstance<nz.waveformlabs.moshpoint.core.ArrowState.DistanceOnly>().associate { it.friendId to it.distanceM },
            onMomentTapped = { key -> Moments.items.firstOrNull { it.key == key }?.let(a.momentFlow::view) },
            onRide = { lat, lon ->
                runCatching {
                    a.startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            android.net.Uri.parse("https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=$lat&dropoff[longitude]=$lon"),
                        ),
                    )
                }
            },
            onRemovePlace = { p ->
                if (p.meetUp) GroupSync.clearRally(a) else Spots.remove(p.id)
            },
        )
    }
}
