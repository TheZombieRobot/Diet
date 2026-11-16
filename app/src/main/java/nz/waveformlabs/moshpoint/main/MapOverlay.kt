package nz.waveformlabs.moshpoint.main

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.NonRestartableComposable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.produceState
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.map.HerePins
import nz.waveformlabs.moshpoint.map.LocationBook
import nz.waveformlabs.moshpoint.map.Spots
import nz.waveformlabs.moshpoint.moments.Moments
import nz.waveformlabs.moshpoint.ui.ago
import nz.waveformlabs.moshpoint.ui.map.MapMoment
import nz.waveformlabs.moshpoint.ui.map.MapPlace
import nz.waveformlabs.moshpoint.ui.map.MapScreen
import nz.waveformlabs.moshpoint.ui.map.MapStyle
import nz.waveformlabs.moshpoint.ui.map.momentIcon
import nz.waveformlabs.moshpoint.venue.Floors
import nz.waveformlabs.moshpoint.venue.VenueMaps

/** The map, zooming in from the button and out again. @NonRestartableComposable: see [MainScreen]. */
@Composable
@NonRestartableComposable
internal fun MapOverlay(a: MainActivity) {
    // The map zooms in from the button, and out again.
    AnimatedVisibility(
        visible = a.map.showMap,
        enter = scaleIn(tween(320), initialScale = 0.94f) +
            fadeIn(tween(260)),
        exit = scaleOut(tween(220), targetScale = 0.96f) +
            fadeOut(tween(200)),
    ) {
        val now by produceState(System.currentTimeMillis()) {
            while (true) {
                delay(15_000)
                value = System.currentTimeMillis()
            }
        }
        val myLoc = a.map.mapFeed.me.value
        LaunchedEffect(myLoc) { myLoc?.let { a.map.mapFirstFix(it) } }
        // Photo pins: each moment's small icon, made off the main thread from its board image
        // (read from the gig's folder if needed) and kept instead of the image (performance P1-7).
        LaunchedEffect(Moments.items.size, Moments.items.firstOrNull()?.key) { MomentIcons.make(Moments.items.toList()) }
        val mapUwb by a.finder.engine.uwbSpots.collectAsState()
        val mapArrows by a.finder.engine.arrows.collectAsState()
        MapScreen(
            people = FriendsRepository.friends.filterNot { FriendsRepository.isSimulated(it.id) },
            seen = LocationBook.seen,
            me = myLoc?.let { LatLon(it.latitude, it.longitude) },
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
                            Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lon&travelmode=walking"),
                        ),
                    )
                }
            },
            onNudge = { f -> a.finder.nudge(listOf(f.name)) },
            onBack = { a.map.closeMap() },
            places = listOfNotNull(
                GroupSync.rally.value?.let { MapPlace("rally", it.name, it.lat, it.lon, meetUp = true) },
            ) + Spots.spots.map { MapPlace(it.id, it.name, it.lat, it.lon, meetUp = false) },
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
                val icon = MomentIcons.icons[m.key] ?: return@mapNotNull null // on the map once it's made
                MapMoment(m.key, Txt.s(R.string.main_moment_label, if (m.mine) Txt.s(R.string.main_you) else m.from, ago(now / 1000 - m.timeSec)), lat, lon, icon)
            },
            trails = LocationBook.trails,
            // The venue map saved on the phone: at the gig, or when there's no internet.
            savedStyle = { look ->
                VenueMaps.savedChanges.intValue // look again when a saved map appears or goes
                if (a.map.mapVenue == null && VenueMaps.online(a)) null
                else VenueMaps.saved(a, look)?.let { MapStyle(it.key, json = it.json) }
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
            else mapArrows.filterIsInstance<ArrowState.DistanceOnly>().associate { it.friendId to it.distanceM },
            onMomentTapped = { key -> Moments.items.firstOrNull { it.key == key }?.let(a.momentFlow::view) },
            onRide = { lat, lon ->
                runCatching {
                    a.startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse("https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=$lat&dropoff[longitude]=$lon"),
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

/** The map's photo pins, one small icon per moment with a place (Compose state: pins appear as they're made). */
internal object MomentIcons {
    val icons = mutableStateMapOf<String, android.graphics.Bitmap>()

    suspend fun make(items: List<Moments.Item>) {
        val keys = items.mapTo(HashSet()) { it.key }
        (icons.keys - keys).forEach { icons.remove(it) } // moments no longer on the board
        for (m in items) {
            if (m.lat == null || m.lon == null || m.key in icons) continue
            val icon = withContext(Dispatchers.IO) { m.loadImage(keep = false)?.let(::momentIcon) } ?: continue
            icons[m.key] = icon
        }
    }
}
