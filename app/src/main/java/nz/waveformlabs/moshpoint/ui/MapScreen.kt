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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.LatLon
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
    liveMap: Boolean = true,
    moments: List<MapMoment> = emptyList(),
    onMomentTapped: (String) -> Unit = {},
) {
    var dropAt by remember { mutableStateOf<Pair<Double, Double>?>(null) }
    val hasBack = androidx.activity.compose.LocalOnBackPressedDispatcherOwner.current != null
    if (hasBack) androidx.activity.compose.BackHandler(onBack = onBack)

    val located = people.filter { it.id in seen }
    val pins = located.map { f ->
        val s = seen.getValue(f.id)
        val age = nowMs / 1000 - s.timeSec
        MapPin(f.id, f.name, s.lat, s.lon, f.color, statusLine(s, age), stale = age > 15 * 60)
    }
    // Camera requests: (counter, points). Starts by fitting everyone.
    var focusN by remember { mutableIntStateOf(0) }
    var focusPts by remember { mutableStateOf<List<LatLng>>(emptyList()) }
    var fittedOnce by remember { mutableStateOf(false) }
    val everyone = pins.map { LatLng(it.lat, it.lon) } + listOfNotNull(me?.let { LatLng(it.lat, it.lon) })
    if (!fittedOnce && everyone.isNotEmpty()) {
        fittedOnce = true
        focusPts = everyone
        focusN++
    }
    fun focus(pts: List<LatLng>) {
        focusPts = pts
        focusN++
    }

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
        FriendMap(
            pins = pins,
            me = me?.let { LatLng(it.lat, it.lon) },
            focus = focusN to focusPts,
            onPinTapped = { id -> seen[id]?.let { focus(listOf(LatLng(it.lat, it.lon))) } },
            places = places,
            onLongPress = { lat, lon -> dropAt = lat to lon },
            live = liveMap,
            moments = moments,
            onMomentTapped = onMomentTapped,
        )

        // Top bar
        Row(
            Modifier.fillMaxWidth().padding(12.dp).background(Mosh.Deep.copy(alpha = 0.88f), RoundedCornerShape(16.dp))
                .border(1.dp, Mosh.Line, RoundedCornerShape(16.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TextButton(onClick = onBack) { Text("‹ Back", style = Mosh.Label.copy(fontSize = 15.sp)) }
            Column(Modifier.weight(1f)) {
                Text("Mosh map", style = Mosh.Label)
                Text(status, style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 15.sp, color = Mosh.TextFaint), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            TextButton(onClick = { me?.let { dropAt = it.lat to it.lon } }, enabled = me != null) {
                Text("Pin", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Pink))
            }
            TextButton(onClick = { focus(everyone) }) { Text("All", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
            TextButton(onClick = { me?.let { focus(listOf(LatLng(it.lat, it.lon))) } }) {
                Text("Me", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan))
            }
        }

        // People list
        Column(
            Modifier.align(Alignment.BottomCenter).fillMaxWidth().padding(12.dp)
                .background(Mosh.Deep.copy(alpha = 0.94f), RoundedCornerShape(20.dp))
                .border(1.dp, Mosh.Line, RoundedCornerShape(20.dp)).padding(vertical = 8.dp),
        ) {
            if (people.isEmpty()) {
                Text(
                    "No mates yet. Start a crew or add a friend, and they'll show up here once they go live.",
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
                            Text((if (p.meetUp) "Meet: " else "") + p.name, style = Mosh.Label.copy(fontSize = 15.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                listOfNotNull(
                                    me?.let { distanceLabel(Geo.distanceM(it, LatLon(p.lat, p.lon))) },
                                    if (p.meetUp) "crew meet-up" else "only you see this",
                                ).joinToString(" · "),
                                style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 16.sp, color = Mosh.TextFaint),
                            )
                        }
                        TextButton(onClick = { onDirections(p.lat, p.lon) }) { Text("Walk", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                        TextButton(onClick = { onRemovePlace(p) }) { Text("✕", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.TextFaint)) }
                    }
                }
                items(people.sortedBy { f -> seen[f.id]?.let { nowMs / 1000 - it.timeSec } ?: Long.MAX_VALUE }, key = { it.id }) { f ->
                    val s = seen[f.id]
                    Row(
                        Modifier.fillMaxWidth()
                            .clickable(enabled = s != null) { s?.let { focus(listOf(LatLng(it.lat, it.lon))) } }
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Avatar(f, 40.dp)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(f.name, style = Mosh.Label.copy(fontSize = 15.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            val line = if (s == null) {
                                "Not sharing yet"
                            } else {
                                val age = nowMs / 1000 - s.timeSec
                                val dist = me?.let { distanceLabel(Geo.distanceM(it, LatLon(s.lat, s.lon))) }
                                listOfNotNull(dist, statusLine(s, age, liveWord = true)).joinToString(" · ")
                            }
                            Text(
                                line,
                                style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 16.sp, color = if (s != null && nowMs / 1000 - s.timeSec < 120) Mosh.Lime else Mosh.TextFaint),
                            )
                        }
                        if (s != null) {
                            Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                                TextButton(onClick = { onDirections(s.lat, s.lon) }) { Text("Walk", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                                TextButton(onClick = { onFind(f.id) }) { Text("Find", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Pink)) }
                            }
                        } else {
                            TextButton(onClick = { onNudge(f) }) { Text("Ask", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                        }
                    }
                }
            }
        }
    }

    dropAt?.let { (lat, lon) ->
        var name by remember { mutableStateOf("") }
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { dropAt = null },
            containerColor = Mosh.Deep,
            title = { Text("Drop a pin", style = Mosh.Heading) },
            text = {
                Column {
                    Text(
                        if (inCrew) "Save it just for you (tent, car…) or make it the crew's meet-up point: everyone gets it on their map."
                        else "Save it for yourself: the tent, the car, the good toilets. Works with no signal.",
                        style = Mosh.Body,
                    )
                    Spacer(Modifier.width(1.dp).heightIn(min = 10.dp))
                    androidx.compose.material3.OutlinedTextField(
                        name, { name = it.take(24) }, singleLine = true,
                        placeholder = { Text("e.g. Sound desk, Tent, Car") },
                    )
                }
            },
            confirmButton = {
                if (inCrew) {
                    TextButton(onClick = { onDropPin(name.ifBlank { "Meet here" }, lat, lon, true); dropAt = null }) {
                        Text("Crew meet-up", style = Mosh.Label.copy(color = Mosh.Pink))
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { onDropPin(name.ifBlank { "My spot" }, lat, lon, false); dropAt = null }) {
                    Text("Just for me", style = Mosh.Label.copy(color = Mosh.Cyan))
                }
            },
        )
    }
}

/** "live · 64%", "12 min ago · 8%", "phone died here · 40 min ago". */
internal fun statusLine(s: LocationBook.Seen, ageSec: Long, liveWord: Boolean = false): String {
    val time = if (liveWord && ageSec < 120) "live" else ago(ageSec)
    return when {
        s.lastGasp -> "battery died here · $time"
        s.batteryPct != null -> "$time · ${s.batteryPct}%"
        else -> time
    }
}

/** "just now", "4 min ago", "2 h ago". */
internal fun ago(seconds: Long): String = when {
    seconds < 60 -> "just now"
    seconds < 3600 -> "${seconds / 60} min ago"
    seconds < 48 * 3600 -> "${seconds / 3600} h ago"
    else -> "${seconds / 86400} days ago"
}

internal fun distanceLabel(m: Double): String = when {
    m < 1000 -> "${(m / 10).toInt() * 10} m"
    m < 10_000 -> "%.1f km".format(m / 1000)
    else -> "${(m / 1000).toInt()} km"
}
