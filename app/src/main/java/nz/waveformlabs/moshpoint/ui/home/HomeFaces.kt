package nz.waveformlabs.moshpoint.ui.home

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.map.LocationBook
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.ui.Faces
import nz.waveformlabs.moshpoint.ui.InitialsAvatar
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.chat.UnreadBadge
import nz.waveformlabs.moshpoint.ui.ago
import nz.waveformlabs.moshpoint.ui.finderDistanceLabel
import nz.waveformlabs.moshpoint.ui.glow

// Faces on the home (docs/design/home-redesign): who's live, what to say under each face, the
// order they sit in, the crew's tiles and the friends strip.

/** A closing emoji (with its variation selector or joiner), kept with the word before it. */
private val ClosingEmoji = Regex(" ([\\p{So}\\uFE0F\\u200D]+)$")

/** Shared a spot in the last 3 minutes (the old tile went lime at the same point), and not a dying phone's last one. */
private const val LIVE_SEC = 180L

internal fun isLive(s: LocationBook.Seen?, nowSec: Long) = s != null && !s.lastGasp && nowSec - s.timeSec < LIVE_SEC

/** What to say under a face. [distance] = [text] is a distance (big and lime). [battery] = low battery %, else null. */
internal class FaceStatus(val live: Boolean, val text: String, val colour: Color, val distance: Boolean, val battery: Int?)

internal fun faceStatus(s: LocationBook.Seen?, nowSec: Long, distanceM: Double?): FaceStatus {
    if (s == null) return FaceStatus(false, Txt.s(R.string.home_tile_not_sharing), Mosh.TextFaint, false, null)
    val age = nowSec - s.timeSec
    val battery = s.batteryPct?.takeIf { it <= 20 } // only worth saying when low
    return when {
        s.lastGasp -> FaceStatus(false, Txt.s(R.string.home_tile_phone_died), Mosh.Danger, false, null)
        // The finder's own label: "8 m", not the map's tens ("0 m"), and the same number the finder shows.
        age < LIVE_SEC && distanceM != null -> FaceStatus(true, finderDistanceLabel(distanceM), Mosh.Lime, true, battery)
        age < LIVE_SEC -> FaceStatus(true, Txt.s(R.string.home_tile_live), Mosh.Lime, false, battery)
        else -> FaceStatus(false, ago(age), Mosh.TextFaint, false, battery)
    }
}

/** Live first, nearest first; then the most recently seen; never seen last. */
internal fun liveFirst(crew: List<Friend>, seen: Map<String, LocationBook.Seen>, nowSec: Long, distances: Map<String, Double>): List<Friend> =
    crew.sortedWith(
        compareBy<Friend>(
            { if (isLive(seen[it.id], nowSec)) 0 else 1 },
            { if (isLive(seen[it.id], nowSec)) distances[it.id] ?: Double.MAX_VALUE else 0.0 },
            { seen[it.id]?.let { s -> -s.timeSec } ?: Long.MAX_VALUE },
        ),
    )

/** A distance's band: the faces re-sort only when someone moves to another band. */
internal fun distanceBand(m: Double): Int = when {
    m < 10 -> 0
    m < 25 -> 1
    m < 50 -> 2
    m < 100 -> 3
    m < 250 -> 4
    m < 500 -> 5
    m < 1000 -> 6
    else -> 7
}

/** What the faces' order depends on: who's in, who's live, and each live face's distance band. */
internal fun faceOrderKey(crew: List<Friend>, seen: Map<String, LocationBook.Seen>, nowSec: Long, distances: Map<String, Double>): Triple<Set<String>, Set<String>, Map<String, Int>> {
    val live = crew.filter { isLive(seen[it.id], nowSec) }.map { it.id }.toSet()
    return Triple(crew.map { it.id }.toSet(), live, distances.filterKeys { it in live }.mapValues { (_, d) -> distanceBand(d) })
}

/** Saturation 50%, brightness 75%: a face that isn't live. */
private val Dimmed = ColorFilter.colorMatrix(
    ColorMatrix(
        floatArrayOf(
            0.455f, 0.268f, 0.027f, 0f, 0f,
            0.080f, 0.643f, 0.027f, 0f, 0f,
            0.080f, 0.268f, 0.402f, 0f, 0f,
            0f, 0f, 0f, 1f, 0f,
        ),
    ),
)

/** A soft halo from the edge of a circle of [r] outwards by [spread] (drawn once, no blur). */
internal fun DrawScope.ringGlow(r: Float, spread: Float, colour: Color) {
    val outer = r + spread
    drawCircle(
        Brush.radialGradient(
            0f to colour.copy(alpha = 0.45f),
            (r / outer) to colour.copy(alpha = 0.45f),
            ((r + spread * 0.35f) / outer) to colour.copy(alpha = 0.18f),
            1f to colour.copy(alpha = 0f),
            center = center, radius = outer,
        ),
        radius = outer, center = center,
    )
}

/**
 * A face in a ring: lime with a glow when [live]; otherwise a faint ring (dimmed when [dim]).
 * The glow reaches [glow] beyond the ring: whoever places this leaves that much room.
 */
@Composable
internal fun FaceImage(f: Friend, size: Dp, live: Boolean, dim: Boolean = !live, glow: Dp = 18.dp, ringColour: Color = Mosh.Lime) {
    val ring = if (live) 3.dp else 2.dp
    val radius = size / 2 + ring
    Box(
        // Always room for the thicker ring, so live and other faces (and their names) line up.
        Modifier.size(size + 3.dp * 2).drawBehind {
            val r = radius.toPx()
            if (live) ringGlow(r, glow.toPx(), ringColour)
            drawCircle(if (live) ringColour else Mosh.GlassLineStrong, radius = r)
        },
        contentAlignment = Alignment.Center,
    ) {
        val photo = Faces.of(f.id, f.name)
        if (photo != null) {
            Image(
                photo, contentDescription = null, contentScale = ContentScale.Crop,
                colorFilter = if (dim) Dimmed else null,
                modifier = Modifier.size(size).clip(CircleShape),
            )
        } else {
            Box(Modifier.size(size).drawWithContent { drawContent(); if (dim) drawCircle(Color.Black.copy(alpha = 0.35f)) }) {
                InitialsAvatar(f.name, size, Color(f.color))
            }
        }
    }
}

/** One crew face: the face, name, then distance (live) or when they were last seen. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FaceTile(f: Friend, status: FaceStatus, note: String?, badge: Int, onFind: (() -> Unit)?, onOptions: (() -> Unit)?) {
    val findLabel = stringResource(R.string.home_find_name, f.name)
    val optionsLabel = stringResource(R.string.home_face_options)
    val battery = status.battery?.let { stringResource(R.string.home_face_battery, it) }
    Column(
        // No clip here: it would cut off the glow.
        Modifier.width(76.dp)
            .combinedClickable(
                enabled = onFind != null || onOptions != null,
                onClickLabel = if (onFind != null) findLabel else null,
                role = Role.Button,
                onLongClickLabel = if (onOptions != null) optionsLabel else null,
                onLongClick = onOptions,
                onClick = { onFind?.invoke() },
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box {
            FaceImage(f, 70.dp, status.live)
            UnreadBadge(badge, Modifier.align(Alignment.TopEnd))
        }
        Spacer(Modifier.height(8.dp))
        Text(
            f.name,
            style = HomeType.Label.copy(fontSize = 14.sp.capScale(), color = if (status.live) Mosh.Text else Mosh.TextDim),
            maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(2.dp))
        // Captions of several words as wide as the face (the design's 70 dp), so neighbours never
        // run together; one long word ("paylaşmıyor") may use the tile's width rather than break.
        fun caption(t: String) = if (t.trim().contains(' ')) Modifier.padding(horizontal = 3.dp) else Modifier
        if (status.distance) {
            // Fitted in one pass (measured, not shrunk frame by frame): "120 m" in the tile.
            val measurer = rememberTextMeasurer()
            val density = LocalDensity.current
            val base = HomeType.Button.copy(fontSize = 15.sp.capScale(), color = Mosh.Lime)
            val fitted = remember(status.text, density, base.fontSize) {
                val room = with(density) { 74.dp.roundToPx() }
                var size = base.fontSize.value
                while (size > 9f && measurer.measure(status.text, base.copy(fontSize = size.sp), maxLines = 1, softWrap = false).size.width > room) size -= 0.5f
                size
            }
            Text(status.text, style = base.copy(fontSize = fitted.sp), maxLines = 1, softWrap = false)
        } else {
            Text(
                keepNumbers(status.text),
                style = HomeType.Body.copy(fontSize = 12.5.sp.capScale(), lineHeight = 16.sp.capScale(), color = status.colour, lineBreak = HomeBreakEven),
                maxLines = 3, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = caption(status.text),
            )
        }
        if (battery != null) {
            Text(
                battery, style = HomeType.Body.copy(fontSize = 11.5.sp.capScale(), lineHeight = 15.sp.capScale(), color = Mosh.Danger, lineBreak = HomeBreakEven),
                maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = caption(battery),
            )
        }
        if (note != null) {
            // Balanced lines, a closing emoji kept with its word: "🔥 Bar / time 🍺", "🔥 / Bardags 🍺".
            Text(
                note.replace(ClosingEmoji, "\u00A0$1"), style = HomeType.Body.copy(fontSize = 11.5.sp.capScale(), lineHeight = 15.sp.capScale(), color = Mosh.Amber, lineBreak = HomeBreakEven),
                maxLines = 3, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = caption(note),
            )
        }
    }
}

/**
 * The crew as a strip of faces that runs off the screen's edge: live first, nearest first.
 * Tap = find them, long-press = their options (either can be off). [notes] replace the
 * status line ("at the venue", for followers); [flares] go under it ("🔥 Bar time 🍺");
 * [badges] are unread private messages, worn on the face.
 */
@Composable
internal fun CrewTiles(
    crew: List<Friend>,
    seen: Map<String, LocationBook.Seen>,
    nowSec: Long,
    onFind: ((String) -> Unit)?,
    onOptions: ((Friend) -> Unit)?,
    distances: Map<String, Double> = emptyMap(),
    notes: Map<String, String> = emptyMap(),
    badges: Map<String, Int> = emptyMap(),
    flares: Map<String, String> = emptyMap(),
    modifier: Modifier = Modifier,
) {
    val atVenue = stringResource(R.string.crew_at_venue)
    // A steady order: re-sorted when someone joins or leaves, goes live or not, or moves to
    // another distance band, never on every sync, and never while a finger is on the strip
    // (a face mustn't jump away as it's tapped). Newcomers wait at the end until then.
    var fingerDown by remember { mutableStateOf(false) }
    val wanted = faceOrderKey(crew, seen, nowSec, distances)
    var key by remember { mutableStateOf(wanted) }
    LaunchedEffect(wanted, fingerDown) { if (!fingerDown) key = wanted }
    val order = remember(key) { liveFirst(crew, seen, nowSec, distances).map { it.id } }
    val byId = crew.associateBy { it.id }
    val sorted = order.mapNotNull { byId[it] } + crew.filter { it.id !in order }
    LazyRow(
        modifier.fillMaxWidth()
            .pointerInput(Unit) {
                awaitEachGesture {
                    awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
                    fingerDown = true
                    try {
                        do { val e = awaitPointerEvent(PointerEventPass.Initial) } while (e.changes.any { it.pressed })
                    } finally {
                        fingerDown = false
                    }
                }
            },
        // Room above and to the side for the glow: rings and glows are never cut off.
        contentPadding = PaddingValues(start = HomeSide, end = HomeSide, top = 20.dp, bottom = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(sorted, key = { it.id }) { f ->
            val note = notes[f.id]
            val status = if (note != null) {
                FaceStatus(note == atVenue, note, if (note == atVenue) Mosh.Lime else Mosh.TextDim, false, null)
            } else {
                faceStatus(seen[f.id], nowSec, distances[f.id])
            }
            FaceTile(
                f, status, flares[f.id], badges[f.id] ?: 0,
                onFind = onFind?.let { find -> { find(f.id) } },
                onOptions = onOptions?.let { options -> { options(f) } },
            )
        }
    }
}

/** Friends kept for every gig, as a strip of faces with names. Tap = find, long-press = options. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun FriendsStrip(friends: List<Friend>, seen: Map<String, LocationBook.Seen>, nowSec: Long, onFind: (String) -> Unit, onOptions: (Friend) -> Unit) {
    val optionsLabel = stringResource(R.string.home_face_options)
    LazyRow(
        Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(start = HomeSide, end = HomeSide, top = 12.dp, bottom = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(friends, key = { it.id }) { f ->
            Column(
                Modifier.width(68.dp)
                    .combinedClickable(
                        onClickLabel = stringResource(R.string.home_find_name, f.name),
                        role = Role.Button,
                        onLongClickLabel = optionsLabel,
                        onLongClick = { onOptions(f) },
                        onClick = { onFind(f.id) },
                    ),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                FaceImage(f, 60.dp, isLive(seen[f.id], nowSec), dim = false, glow = 12.dp)
                Spacer(Modifier.height(8.dp))
                Text(f.name, style = HomeType.Label.copy(fontSize = 13.sp), maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
            }
        }
    }
}
