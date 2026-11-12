package nz.waveformlabs.moshpoint.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.core.content.res.ResourcesCompat
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.ArrowStyle
import kotlin.math.cos
import kotlin.math.ln
import kotlin.math.sin
import kotlin.math.sqrt

/*
 * The whole crew at once, like a little radar centred on you.
 *
 * - Each mate's bubble sits in their direction, nearer the middle when they're near you and
 *   further out when they're far. The scale fits itself to the farthest mate, so a crew of 15
 *   still fits on screen; bubbles get smaller as the crew grows.
 * - Mates whose bubbles would overlap (same direction, similar distance) share one arrow with a
 *   stacked bubble and a count ("Sam +2"). As they move apart it splits, each bubble springing
 *   out on its own arrow; a little stickiness stops it flickering at the edge.
 * - Tap a bubble to find that mate; tap a stack to choose who.
 */

/** Where a mate sits on the radar: direction (degrees) and how far out (0 = you, 1 = the edge). */
internal data class RadarSpot(val id: String, val angleDeg: Float, val frac: Float)

/** Radar distance: log scale, so 5 m and 50 m are both readable with someone 2 km away. */
internal fun radarFrac(distanceM: Double?, maxM: Double): Float {
    val d = distanceM ?: return 1f
    val t = ln(1 + d) / ln(1 + maxM.coerceAtLeast(30.0))
    return (0.32 + 0.68 * t.coerceIn(0.0, 1.0)).toFloat()
}

private fun posOf(s: RadarSpot): Pair<Float, Float> {
    val rad = Math.toRadians(s.angleDeg.toDouble())
    return (s.frac * sin(rad)).toFloat() to (-s.frac * cos(rad)).toFloat()
}

/**
 * Groups spots whose bubbles would overlap. Nearest first, so the nearest mate leads each group.
 * [together] is last time's grouping (mate -> lead): mates already together stay together until
 * they're clearly apart ([split] > [join]), so a group doesn't flicker as people shuffle.
 * Returns lead -> members (lead first).
 */
internal fun clusterSpots(spots: List<RadarSpot>, together: Map<String, String>, join: Float, split: Float): Map<String, List<String>> {
    val out = LinkedHashMap<String, MutableList<String>>()
    val leads = ArrayList<RadarSpot>()
    for (s in spots.sortedBy { it.frac }) {
        val (x, y) = posOf(s)
        val lead = leads.firstOrNull { l ->
            val (lx, ly) = posOf(l)
            val d = sqrt((x - lx) * (x - lx) + (y - ly) * (y - ly))
            d < (if (together[s.id] == l.id) split else join)
        }
        if (lead != null) out.getValue(lead.id) += s.id else {
            leads += s
            out[s.id] = mutableListOf(s.id)
        }
    }
    return out
}

@Composable
internal fun CrewRadar(
    arrows: List<ArrowState.Pointing>,
    friendOf: (String) -> Friend?,
    onTap: (String) -> Unit,
    onTapGroup: (List<String>) -> Unit,
    /** "↑ Upstairs" / "↓ Downstairs" per mate on another floor, drawn on their face. */
    floors: Map<String, String> = emptyMap(),
) {
    val maxM = arrows.mapNotNull { it.distanceM }.maxOrNull() ?: 50.0
    val spots = arrows.map { RadarSpot(it.friendId, it.relativeDeg.toFloat(), radarFrac(it.distanceM, maxM)) }
    // Bubble size by crew size; the grouping distance follows it (in radar units).
    val crowd = arrows.size
    val avatarDp = when {
        crowd <= 4 -> 26f
        crowd <= 8 -> 21f
        else -> 17f
    }
    val join = avatarDp / 75f
    val split = join * 1.35f
    val lastTogether = remember { HashMap<String, String>() }
    val groups = clusterSpots(spots, lastTogether, join, split)
    lastTogether.clear()
    groups.forEach { (lead, members) -> members.forEach { lastTogether[it] = lead } }
    val leadOf = lastTogether.toMap()
    val byId = arrows.associateBy { it.friendId }
    val spotById = spots.associateBy { it.id }

    // Each mate springs towards their group's spot (or their own): that's the split/merge motion.
    val angles = spots.associate { s ->
        s.id to key(s.id, "a") { animatedAngle((spotById[leadOf[s.id] ?: s.id] ?: s).angleDeg.toDouble()) }
    }
    val fracs = spots.associate { s ->
        s.id to key(s.id, "f") {
            animateFloatAsState(
                (spotById[leadOf[s.id] ?: s.id] ?: s).frac,
                spring(dampingRatio = 0.62f, stiffness = Spring.StiffnessMediumLow), label = "frac",
            ).value
        }
    }
    val colours = arrows.associate { a ->
        a.friendId to key(a.friendId, "c") {
            animateColorAsState(Color(ArrowStyle.arrowColor(friendOf(a.friendId)?.color ?: ArrowStyle.RED, a.distanceM)), tween(800), label = "c").value
        }
    }
    // Bubbles wear each mate's own colour, the same as their name in chat; arrows and
    // distances warm from hot pink into it as you close in.
    val own = arrows.associate { a -> a.friendId to (friendOf(a.friendId)?.color?.let { Color(it) } ?: Mosh.Pink) }
    val t = rememberInfiniteTransition(label = "radar")
    val breathe by t.ambient(0.55f, 1f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "b")
    val spin by t.ambient(0f, 360f, infiniteRepeatable(tween(5000, easing = LinearEasing)), label = "s")

    val context = LocalContext.current
    val display = remember { runCatching { ResourcesCompat.getFont(context, R.font.unbounded_extrabold) }.getOrNull() }
    val regular = remember { runCatching { ResourcesCompat.getFont(context, R.font.inter_regular) }.getOrNull() }
    val displayPaint = remember { textPaint(display) }
    val regularPaint = remember { textPaint(regular) }
    val spoken = arrows.joinToString(". ") { a ->
        val name = friendOf(a.friendId)?.name ?: "?"
        val clock = (((a.relativeDeg + 360) % 360) / 30).let { kotlin.math.round(it).toInt() }.let { if (it == 0) 12 else it }
        "$name, ${finderDistanceLabel(a.distanceM)}, $clock"
    }
    val showChips = groups.size <= 6
    // Where each group's bubble was drawn, for taps (not state: drawing only).
    val hit = remember { HashMap<String, Offset>() }

    Canvas(
        Modifier.fillMaxSize()
            .pointerInput(groups.keys.toList()) {
                detectTapGestures { p ->
                    val best = hit.minByOrNull { (it.value - p).getDistance() }?.takeIf { (it.value - p).getDistance() < 56.dp.toPx() } ?: return@detectTapGestures
                    val members = groups[best.key] ?: return@detectTapGestures
                    if (members.size == 1) onTap(best.key) else onTapGroup(members)
                }
            }
            .semantics { contentDescription = spoken },
    ) {
        hit.clear()
        val centre = Offset(size.width / 2, size.height / 2)
        val avatarR = avatarDp.dp.toPx()
        val chipW = 84.dp.toPx()
        val chipH = 40.dp.toPx()
        // Room outside the bubbles for chips, or for the distance labels of a big crew.
        val outer = size.minDimension / 2 - avatarR - (if (showChips) chipH else 26.dp.toPx()) - 6.dp.toPx()
        // Arrow heads a fixed width (not growing with length, which made far arrows fat), and
        // slimmer as the crew grows so a big crew reads as spokes, not a pile-up in the middle.
        val headW = when {
            groups.size > 6 -> 9.dp.toPx()
            groups.size > 3 -> 14.dp.toPx()
            else -> 22.dp.toPx()
        }
        // Chips and labels go on last, so no arrow ever covers them.
        val labels = ArrayList<() -> Unit>()
        // You, in the middle.
        haloGlow(centre, 7.dp.toPx(), 10.dp.toPx(), Color.White, 0.8f)
        drawCircle(Mosh.Text, radius = 7.dp.toPx(), center = centre)

        fun spot(id: String): Offset {
            val rad = Math.toRadians((angles[id] ?: 0f).toDouble())
            val r = (fracs[id] ?: 1f) * outer
            return Offset(centre.x + r * sin(rad).toFloat(), centre.y - r * cos(rad).toFloat())
        }

        // Draw far groups first, so nearer bubbles sit on top.
        groups.entries.sortedByDescending { spotById[it.key]?.frac ?: 1f }.forEach { (lead, members) ->
            // Members still travelling into the group are drawn on their own until they arrive.
            val leadAt = spot(lead)
            val arrived = members.filter { it == lead || (spot(it) - leadAt).getDistance() < avatarR * 0.35f }
            val travelling = members - arrived.toSet()
            (travelling + lead).forEach { id ->
                val at = spot(id)
                val colour = (colours[id] ?: Mosh.Pink).copy(alpha = if (byId[id]?.unsure == true) 0.6f else 1f)
                val angle = angles[id] ?: 0f
                val len = ((at - centre).getDistance() - avatarR - 6.dp.toPx()).coerceAtLeast(12.dp.toPx())
                val path = arrowPath(centre, len, (headW / len).coerceAtMost(0.28f))
                rotate(angle, pivot = centre) {
                    softGlow(path, colour, (headW * 1.8f).coerceAtMost(22.dp.toPx()), breathe)
                    drawPath(path, Brush.verticalGradient(0f to Color.White, 0.18f to colour, 1f to lerp(colour, Mosh.Violet, 0.6f), startY = centre.y - len, endY = centre.y))
                }
            }
            travelling.forEach { id -> bubble(spot(id), avatarR, listOf(id), own, friendOf, spin, breathe, displayPaint) }
            bubble(leadAt, avatarR, arrived, own, friendOf, spin, breathe, displayPaint)
            hit[lead] = leadAt
            // On another floor: say so on their face (last, so no arrow or bubble covers it).
            floors[lead]?.takeIf { arrived.size == 1 }?.let { tag ->
                labels += { drawFloorPill(tag, Offset(leadAt.x, leadAt.y + avatarR), regularPaint, 10.dp.toPx()) }
            }

            val colour = colours[lead] ?: Mosh.Pink
            val name = friendOf(lead)?.name ?: "?"
            val label = if (arrived.size > 1) "$name +${arrived.size - 1}" else name
            val dist = finderDistanceLabel(byId[lead]?.distanceM)
            val (ux, uy) = (leadAt - centre).let { v -> val d = v.getDistance().coerceAtLeast(1f); v.x / d to v.y / d }
            if (showChips) labels += {
                val extent = kotlin.math.abs(ux) * chipW / 2 + kotlin.math.abs(uy) * chipH / 2
                val cc = Offset(leadAt.x + ux * (avatarR + 6.dp.toPx() + extent), leadAt.y + uy * (avatarR + 6.dp.toPx() + extent))
                val top = Offset(cc.x - chipW / 2, cc.y - chipH / 2)
                drawRoundRect(colour.copy(alpha = 0.12f), top, Size(chipW, chipH), CornerRadius(13.dp.toPx()))
                drawRoundRect(colour.copy(alpha = 0.40f), top, Size(chipW, chipH), CornerRadius(13.dp.toPx()), style = Stroke(1.dp.toPx()))
                val inner = chipW - 10.dp.toPx()
                drawCentred(dist, Offset(cc.x, top.y + 14.dp.toPx()), 13.dp.toPx(), colour, displayPaint, inner)
                drawCentred(label, Offset(cc.x, top.y + 29.dp.toPx()), 11f.dp.toPx(), Mosh.TextDim, regularPaint, inner)
            } else labels += {
                // Big crew: just the distance, on the far side of the bubble from you, where no
                // arrow runs (names are in the strip below).
                val textPx = 10.5f.dp.toPx()
                displayPaint.textSize = textPx
                val extent = kotlin.math.abs(ux) * displayPaint.measureText(dist) / 2 + kotlin.math.abs(uy) * textPx * 0.6f
                val at = Offset(leadAt.x + ux * (avatarR + 5.dp.toPx() + extent), leadAt.y + uy * (avatarR + 5.dp.toPx() + extent))
                drawCentred(dist, at, textPx, colour, displayPaint, chipW)
            }
        }
        labels.forEach { it() }
    }
}

/** A mate's bubble, or a stack of faces with a "+N" badge when several share one spot. */
private fun DrawScope.bubble(
    at: Offset,
    r: Float,
    ids: List<String>,
    colours: Map<String, Color>,
    friendOf: (String) -> Friend?,
    spin: Float,
    breathe: Float,
    paint: android.graphics.Paint,
) {
    val lead = ids.first()
    val colour = colours[lead] ?: Mosh.Pink
    // Faces peeking out behind the lead, so a stack reads as "more than one".
    ids.drop(1).take(2).forEachIndexed { i, id ->
        val o = Offset(at.x + r * (0.55f + 0.35f * i), at.y - r * (0.22f + 0.12f * i))
        face(o, r * 0.82f, id, colours[id] ?: colour, friendOf, paint)
    }
    haloGlow(at, r, 14.dp.toPx(), colour, 0.75f * breathe)
    face(at, r, lead, colour, friendOf, paint)
    rotate(spin, pivot = at) {
        drawCircle(Brush.sweepGradient(listOf(colour, Mosh.Violet, colour), center = at), radius = r, center = at, style = Stroke(3.dp.toPx()))
    }
    if (ids.size > 1) {
        val b = Offset(at.x + r * 0.78f, at.y + r * 0.78f)
        drawCircle(colour, radius = r * 0.5f, center = b)
        drawCircle(Mosh.Ground, radius = r * 0.5f, center = b, style = Stroke(2.dp.toPx()))
        drawCentred("+${ids.size - 1}", b, r * 0.5f, Mosh.Ground, paint)
    }
}

private fun DrawScope.face(at: Offset, r: Float, id: String, ring: Color, friendOf: (String) -> Friend?, paint: android.graphics.Paint) {
    drawCircle(Mosh.Avatar, radius = r, center = at)
    val photo = Faces.of(id, friendOf(id)?.name)
    if (photo != null) {
        clipPath(Path().apply { addOval(Rect(at, r - 2.dp.toPx())) }) {
            drawImage(photo, dstOffset = IntOffset((at.x - r).toInt(), (at.y - r).toInt()), dstSize = IntSize((r * 2).toInt(), (r * 2).toInt()))
        }
    } else {
        drawCentred(friendOf(id)?.name?.take(1)?.uppercase() ?: "?", at, r * 0.72f, Mosh.Text, paint)
    }
    drawCircle(ring, radius = r, center = at, style = Stroke(1.5f.dp.toPx()))
}
