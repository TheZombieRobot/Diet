package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.AtGig
import nz.waveformlabs.moshpoint.core.Floor
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.VenuePlacement
import org.maplibre.android.geometry.LatLng

/**
 * Snap Map style view for when mates are far away: everyone's last shared spot on a map,
 * with how long ago and how far, plus "Find" (the arrow) and "Walk there" (directions).
 * Only people who are live share their location; others show their last known spot.
 */
@Composable
fun MapScreen(
    people: List<Friend>,
    seen: Map<String, LocationBook.Seen>,
    me: LatLon?,
    status: String,
    nowMs: Long,
    onFind: (String) -> Unit,
    onDirections: (Double, Double) -> Unit,
    onNudge: (Friend) -> Unit,
    onBack: () -> Unit,
    /** Saved spots and the crew meet-up pin. */
    places: List<MapPlace> = emptyList(),
    /** In a crew: pins can be shared as the meet-up point. */
    inCrew: Boolean = false,
    onDropPin: (name: String, lat: Double, lon: Double, meetUp: Boolean) -> Unit = { _, _, _, _ -> },
    onRemovePlace: (MapPlace) -> Unit = {},
    /** Get a ride there (Uber etc.); null hides the button. */
    onRide: ((Double, Double) -> Unit)? = null,
    liveMap: Boolean = true,
    moments: List<MapMoment> = emptyList(),
    onMomentTapped: (String) -> Unit = {},
    trails: Map<String, List<LocationBook.Seen>> = emptyMap(),
    /**
     * The venue map saved on the phone, for map look number [Int] (see VenueMaps), when it
     * should be used instead of the live map: at the gig, or with no internet. Null = live map.
     */
    savedStyle: (Int) -> MapStyle? = { null },
    /** Set when the map is opened at the gig: it opens zoomed into the venue (see core AtGig). */
    venueView: VenueView? = null,
    /** What UWB says about mates right now: they're placed exactly, from our own position. */
    uwb: Map<String, VenuePlacement.UwbReading> = emptyMap(),
    /** Mates we only know the distance to (Bluetooth, or UWB with no direction), in metres: listed, never drawn. */
    near: Map<String, Double> = emptyMap(),
    /** Who is on another floor (see core Floors): shown on their face. */
    floors: Map<String, Floor> = emptyMap(),
    /** How far above us each mate is (m), where known: a UWB mate upstairs is drawn closer along the ground. */
    heights: Map<String, Double> = emptyMap(),
) {
    var dropAt by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    val ctx = androidx.compose.ui.platform.LocalContext.current
    var styleIx by remember {
        mutableIntStateOf(runCatching { ctx.getSharedPreferences("map", android.content.Context.MODE_PRIVATE).getInt("style", 0) }.getOrDefault(0).coerceIn(0, MAP_STYLES.size - 1))
    }
    val hasBack = androidx.activity.compose.LocalOnBackPressedDispatcherOwner.current != null
    if (hasBack) androidx.activity.compose.BackHandler(onBack = onBack)

    val located = people.filter { it.id in seen }
    // Where each mate goes: exactly (UWB, from our own dot), their shared GPS pin, or nowhere.
    // UWB readings arrive already fresh, so each is judged at its own time.
    val spots = people.associate { f ->
        f.id to VenuePlacement.spot(me, uwb[f.id], seen[f.id]?.let { LatLon(it.lat, it.lon) }, heights[f.id], uwb[f.id]?.atMs ?: 0L)
    }
    val floorText = floors.mapValues { (_, fl) -> floorLabel(fl) }
    val exactPins = people.mapNotNull { f ->
        val at = (spots[f.id] as? VenuePlacement.Spot.Exact)?.at ?: return@mapNotNull null
        MapPin(f.id, f.name, at.lat, at.lon, f.color, finderDistanceLabel(uwb[f.id]?.distanceM), stale = false, exact = true, floor = floorText[f.id])
    }
    // GPS pins: mates standing together share a bubble. Exact ones never do.
    val pins = exactPins + crewBubbles(
        located.filter { spots[it.id] !is VenuePlacement.Spot.Exact }.map { f ->
            val s = seen.getValue(f.id)
            val age = nowMs / 1000 - s.timeSec
            MapPin(f.id, f.name, s.lat, s.lon, f.color, statusLine(s, age), stale = age > 15 * 60, floor = floorText[f.id])
        },
    )
    // Placed by UWB: their row says the measured distance, like their pin.
    val measured = people.mapNotNull { f -> uwb[f.id]?.distanceM?.takeIf { spots[f.id] is VenuePlacement.Spot.Exact }?.let { f.id to it } }.toMap()
    // Heard close by, but with no direction and no GPS pin: we say how close, and draw nothing.
    val closeBy = near.filterKeys { it !in measured && it !in seen }
    // The list: mates measured or heard right now first, nearest first; then by how fresh their GPS is.
    val listed = people.sortedWith(
        compareBy<Friend> { f -> measured[f.id] ?: closeBy[f.id] ?: Double.MAX_VALUE }
            .thenBy { f -> seen[f.id]?.let { nowMs / 1000 - it.timeSec } ?: Long.MAX_VALUE },
    )
    // Camera requests. Starts on the venue when you're at the gig, else by fitting everyone.
    var camera by remember { mutableStateOf(MapFocus(0, emptyList())) }
    var fittedOnce by remember { mutableStateOf(false) }
    val everyone = pins.map { LatLng(it.lat, it.lon) } + listOfNotNull(me?.let { LatLng(it.lat, it.lon) })
    if (!fittedOnce && venueView != null) {
        fittedOnce = true
        val there = AtGig.viewPoints(venueView.venue, me ?: venueView.me, pins.map { LatLon(it.lat, it.lon) })
        camera = MapFocus(camera.n + 1, there.map { LatLng(it.lat, it.lon) }, AtGig.VIEW_MIN_ZOOM, AtGig.VIEW_MAX_ZOOM)
    } else if (!fittedOnce && everyone.isNotEmpty()) {
        fittedOnce = true
        camera = MapFocus(camera.n + 1, everyone)
    }
    fun focus(pts: List<LatLng>) {
        camera = MapFocus(camera.n + 1, pts)
    }

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
        FriendMap(
            pins = pins,
            me = me?.let { LatLng(it.lat, it.lon) },
            focus = camera,
            onPinTapped = { id -> pins.firstOrNull { it.id == id }?.let { focus(listOf(LatLng(it.lat, it.lon))) } },
            places = places,
            onLongPress = { lat, lon -> dropAt = lat to lon },
            live = liveMap,
            moments = moments,
            onMomentTapped = onMomentTapped,
            style = savedStyle(styleIx) ?: MapStyle.live(MAP_STYLES[styleIx].second),
            trails = located.mapNotNull { f -> trails[f.id]?.let { t -> MapTrail(f.color, t.map { it.lat to it.lon }) } },
        )

        // Top bar
        Row(
            Modifier.fillMaxWidth().padding(12.dp).background(Mosh.Deep.copy(alpha = 0.88f), RoundedCornerShape(16.dp))
                .border(1.dp, Mosh.Line, RoundedCornerShape(16.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Back as a compact chevron: the title and status get the room (long in some languages).
            val back = stringResource(R.string.find_back)
            TextButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = back }) {
                Text("‹", style = Mosh.Label.copy(fontSize = 24.sp))
            }
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.find_map_title), style = Mosh.Label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(status, style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 15.sp, color = Mosh.TextFaint), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            TextButton(onClick = { me?.let { dropAt = it.lat to it.lon } }, enabled = me != null) {
                Text(stringResource(R.string.find_map_pin), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Pink))
            }
            TextButton(onClick = { focus(everyone) }) { Text(stringResource(R.string.find_map_all), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
            TextButton(onClick = { me?.let { focus(listOf(LatLng(it.lat, it.lon))) } }) {
                Text(stringResource(R.string.find_map_me), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan))
            }
        }

        // Map style: Bright / Night / Dark.
        Box(Modifier.align(Alignment.TopEnd).padding(top = 84.dp, end = 16.dp)) {
            Text(
                stringResource(MAP_STYLES[styleIx].first),
                style = Mosh.Label.copy(fontSize = 13.sp, color = Mosh.Text),
                modifier = Modifier.background(Mosh.Deep.copy(alpha = 0.88f), RoundedCornerShape(14.dp))
                    .border(1.dp, Mosh.Line, RoundedCornerShape(14.dp))
                    .clickable {
                        styleIx = (styleIx + 1) % MAP_STYLES.size
                        runCatching { ctx.getSharedPreferences("map", android.content.Context.MODE_PRIVATE).edit().putInt("style", styleIx).apply() }
                    }
                    .padding(horizontal = 12.dp, vertical = 7.dp),
            )
        }

        // People list
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp)
                .background(Mosh.Deep.copy(alpha = 0.94f), RoundedCornerShape(20.dp))
                .border(1.dp, Mosh.Line, RoundedCornerShape(20.dp)).padding(vertical = 8.dp),
        ) {
            if (people.isEmpty()) {
                Text(
                    stringResource(R.string.find_map_no_mates),
                    style = Mosh.Body, modifier = Modifier.padding(16.dp),
                )
            }
            LazyColumn(Modifier.heightIn(max = 260.dp)) {
                items(places, key = { "place-" + it.id }) { p ->
                    Row(
                        Modifier.fillMaxWidth().clickable { focus(listOf(LatLng(p.lat, p.lon))) }.padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Box(
                            Modifier.width(40.dp).heightIn(min = 40.dp).background(
                                if (p.meetUp) Mosh.Pink.copy(alpha = 0.25f) else Mosh.Cyan.copy(alpha = 0.2f), RoundedCornerShape(12.dp),
                            ),
                            contentAlignment = Alignment.Center,
                        ) { Text(if (p.meetUp) "★" else "●", style = Mosh.Label.copy(color = if (p.meetUp) Mosh.Pink else Mosh.Cyan)) }
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(if (p.meetUp) stringResource(R.string.find_meet_label, p.name) else p.name, style = Mosh.Label.copy(fontSize = 15.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                listOfNotNull(
                                    me?.let { distanceLabel(Geo.distanceM(it, LatLon(p.lat, p.lon))) },
                                    if (p.meetUp) stringResource(R.string.find_place_crew_meetup) else stringResource(R.string.find_place_only_you),
                                ).joinToString(" · "),
                                style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 16.sp, color = Mosh.TextFaint),
                            )
                        }
                        TextButton(onClick = { onDirections(p.lat, p.lon) }) { Text(stringResource(R.string.find_walk), style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                        if (onRide != null && !p.meetUp) TextButton(onClick = { onRide(p.lat, p.lon) }) { Text(stringResource(R.string.find_ride), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Lime)) }
                        TextButton(onClick = { onRemovePlace(p) }) { Text("✕", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.TextFaint)) }
                    }
                }
                items(listed, key = { it.id }) { f ->
                    val s = seen[f.id]
                    val uwbM = measured[f.id]
                    val nearM = closeBy[f.id]
                    val pin = pins.firstOrNull { it.id == f.id }
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable(enabled = s != null || pin != null) {
                                (pin?.let { LatLng(it.lat, it.lon) } ?: s?.let { LatLng(it.lat, it.lon) })?.let { focus(listOf(it)) }
                            }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar(f, 40.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(f.name, style = Mosh.Label.copy(fontSize = 15.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            val line = if (uwbM != null) {
                                listOfNotNull(finderDistanceLabel(uwbM), floorText[f.id]).joinToString(" · ")
                            } else if (nearM != null) {
                                listOfNotNull(bandLabel(nearM), bandHint(nearM), floorText[f.id]).joinToString(" · ")
                            } else if (s == null) {
                                stringResource(R.string.find_not_sharing)
                            } else {
                                val age = nowMs / 1000 - s.timeSec
                                val dist = me?.let { distanceLabel(Geo.distanceM(it, LatLon(s.lat, s.lon))) }
                                listOfNotNull(dist, statusLine(s, age, liveWord = true), floorText[f.id]).joinToString(" · ")
                            }
                            val fresh = uwbM != null || nearM != null || (s != null && nowMs / 1000 - s.timeSec < 120)
                            Text(line, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 16.sp, color = if (fresh) Mosh.Lime else Mosh.TextFaint))
                        }
                        if ((nearM != null || uwbM != null) && s == null) {
                            TextButton(onClick = { onFind(f.id) }) { Text(stringResource(R.string.find_find), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Pink)) }
                        } else if (s != null) {
                            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                TextButton(onClick = { onDirections(s.lat, s.lon) }) { Text(stringResource(R.string.find_walk), style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                                TextButton(onClick = { onFind(f.id) }) { Text(stringResource(R.string.find_find), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Pink)) }
                            }
                        } else {
                            TextButton(onClick = { onNudge(f) }) { Text(stringResource(R.string.find_ask), style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                        }
                    }
                }
            }
        }
    }

    dropAt?.let { (lat, lon) ->
        var name by remember { mutableStateOf("") }
        val meetHere = stringResource(R.string.find_meet_here)
        val mySpot = stringResource(R.string.find_my_spot)
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { dropAt = null },
            containerColor = Mosh.Deep,
            title = { Text(stringResource(R.string.find_drop_pin), style = Mosh.Heading) },
            text = {
                Column {
                    Text(
                        if (inCrew) stringResource(R.string.find_drop_pin_crew_help)
                        else stringResource(R.string.find_drop_pin_solo_help),
                        style = Mosh.Body,
                    )
                    Spacer(Modifier.width(1.dp).heightIn(min = 10.dp))
                    androidx.compose.material3.OutlinedTextField(
                        name, { name = it.take(24) }, singleLine = true,
                        placeholder = { Text(stringResource(R.string.find_drop_pin_hint)) },
                    )
                }
            },
            confirmButton = {
                if (inCrew) {
                    TextButton(onClick = { onDropPin(name.ifBlank { meetHere }, lat, lon, true); dropAt = null }) {
                        Text(stringResource(R.string.find_crew_meetup), style = Mosh.Label.copy(color = Mosh.Pink))
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { onDropPin(name.ifBlank { mySpot }, lat, lon, false); dropAt = null }) {
                    Text(stringResource(R.string.find_just_for_me), style = Mosh.Label.copy(color = Mosh.Cyan))
                }
            },
        )
    }
}

/**
 * Mates standing together (within ~15 m, fresh) merge into one bubble ("Alex, Jo & Sam"),
 * like Zenly: a tidy map, and you can see who's with whom.
 */
internal fun crewBubbles(pins: List<MapPin>): List<MapPin> {
    val out = mutableListOf<MapPin>()
    val left = pins.sortedBy { it.stale }.toMutableList()
    while (left.isNotEmpty()) {
        val first = left.removeAt(0)
        if (first.stale) {
            out += first
            continue
        }
        val group = left.filter { !it.stale && Geo.distanceM(LatLon(first.lat, first.lon), LatLon(it.lat, it.lon)) < 15.0 }
        left.removeAll(group)
        if (group.isEmpty()) {
            out += first
        } else {
            val names = (listOf(first) + group).map { it.name }
            val label = when (names.size) {
                2 -> Txt.s(R.string.find_bubble_two, names[0], names[1])
                3 -> Txt.s(R.string.find_bubble_three, names[0], names[1], names[2])
                else -> Txt.s(R.string.find_bubble_more, names[0], names.size - 1)
            }
            out += first.copy(name = label, caption = Txt.s(R.string.find_bubble_together, first.caption))
        }
    }
    return out
}
