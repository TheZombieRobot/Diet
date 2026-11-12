package nz.waveformlabs.moshpoint.ui

import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.detectTapGestures
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.core.content.res.ResourcesCompat
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.ArrowStyle
import nz.waveformlabs.moshpoint.core.Method
import kotlin.math.cos
import kotlin.math.sin

// The finder's arrows: swivel animation, neon arrow drawing, photo tips and labels.

/**
 * Keeps an arrow's angle continuous (e.g. 350° -> 370° rather than 350° -> 10°) so the
 * spring swivels the short way round instead of spinning backwards through 180°.
 */
@Composable
internal fun animatedAngle(targetDeg: Double): Float {
    // Plain holder (not Compose state): updating it mid-composition mustn't trigger recomposition.
    val last = remember { FloatArray(1) { targetDeg.toFloat() } }
    val delta = (((targetDeg - last[0]) % 360 + 540) % 360 - 180).toFloat()
    last[0] += delta
    val anim by animateFloatAsState(
        last[0],
        animationSpec = spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMedium), // quick, no wobble
        label = "arrow",
    )
    return anim
}

@Composable
internal fun Arrows(
    arrows: List<ArrowState.Pointing>,
    friendOf: (String) -> Friend?,
    group: Boolean,
    onTap: ((String) -> Unit)? = null,
    /** "↑ Upstairs" / "↓ Downstairs" per mate on another floor, drawn on their face. */
    floors: Map<String, String> = emptyMap(),
    /** The same for screen readers ("upstairs"). */
    floorsSpoken: Map<String, String> = emptyMap(),
) {
    // Where each mate's bubble was drawn, so a tap can pick them (not state: drawing only).
    val tips = remember { HashMap<String, Offset>() }
    // Per-friend animated angle and colour (hot pink sliding into their colour).
    val angles = arrows.associate { a -> a.friendId to key(a.friendId) { animatedAngle(a.relativeDeg) } }
    val colours = arrows.associate { a ->
        a.friendId to key(a.friendId, "c") {
            val target = Color(ArrowStyle.arrowColor(friendOf(a.friendId)?.color ?: ArrowStyle.RED, a.distanceM))
            animateColorAsState(target, tween(800), label = "colour").value
        }
    }
    val t = rememberInfiniteTransition(label = "breathe")
    val breathe by t.ambient(0.55f, 1f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "b")
    val spin by t.ambient(0f, 360f, infiniteRepeatable(tween(5000, easing = LinearEasing)), label = "spin")

    val context = LocalContext.current
    val display = remember { runCatching { ResourcesCompat.getFont(context, R.font.unbounded_extrabold) }.getOrNull() }
    val regular = remember { runCatching { ResourcesCompat.getFont(context, R.font.inter_regular) }.getOrNull() }
    // One paint per typeface, reused every frame.
    val displayPaint = remember { textPaint(display) }
    val regularPaint = remember { textPaint(regular) }

    // Screen readers: "Sam, 12 metres, at 2 o'clock".
    val spoken = arrows.joinToString(". ") { a ->
        val name = friendOf(a.friendId)?.name ?: Txt.s(R.string.find_friend_fallback)
        val clock = (((a.relativeDeg + 360) % 360) / 30).let { kotlin.math.round(it).toInt() }.let { if (it == 0) 12 else it }
        val dist = a.distanceM?.let { spokenDistance(it) }
        val where = when {
            dist == null && a.unsure -> Txt.s(R.string.find_arrow_spoken_nodist_rough, name, clock)
            dist == null -> Txt.s(R.string.find_arrow_spoken_nodist, name, clock)
            a.unsure -> Txt.s(R.string.find_arrow_spoken_rough, name, dist, clock)
            else -> Txt.s(R.string.find_arrow_spoken, name, dist, clock)
        }
        floorsSpoken[a.friendId]?.let { Txt.s(R.string.venue_spoken_floor, where, it) } ?: where
    }
    val tapModifier = if (onTap != null) {
        Modifier.pointerInput(onTap) {
            detectTapGestures { p ->
                tips.minByOrNull { (it.value - p).getDistance() }
                    ?.takeIf { (it.value - p).getDistance() < 64.dp.toPx() }
                    ?.let { onTap(it.key) }
            }
        }
    } else Modifier
    Canvas(Modifier.fillMaxSize().then(tapModifier).semantics { contentDescription = spoken }) {
        val centre = Offset(size.width / 2, size.height / 2)
        val avatarR = if (group) 26.dp.toPx() else 32.dp.toPx()
        val chipW = 84.dp.toPx()
        val chipH = 44.dp.toPx()
        // Fit arrow + photo inside the screen at any angle (360dp phones included); in a
        // group the name chip sits beyond the photo, so leave room for half its width too.
        val margin = if (group) 6.dp.toPx() + chipW / 2 else 4.dp.toPx()
        val length = (size.minDimension / 2 - 2 * avatarR - 8.dp.toPx() - margin).coerceAtLeast(40.dp.toPx())
        if (group) {
            haloGlow(centre, 7.dp.toPx(), 10.dp.toPx(), Color.White, 0.8f)
            drawCircle(Mosh.Text, radius = 7.dp.toPx(), center = centre)
        }
        arrows.forEach { a ->
            val friend = friendOf(a.friendId)
            val colour = (colours[a.friendId] ?: Mosh.Pink).copy(alpha = if (a.unsure) 0.6f else 1f)
            // Their bubble is always their own colour (the same as their name in chat); the
            // arrow and distance warm from hot pink into it as you close in.
            val own = friend?.color?.let { Color(it) } ?: colour
            val angle = angles[a.friendId] ?: a.relativeDeg.toFloat()
            val path = arrowPath(centre, length, if (group) 0.24f else 0.34f)

            rotate(angle, pivot = centre) {
                // Breathing neon glow, then a white-hot tip fading into their colour and ultraviolet.
                softGlow(path, colour, 30.dp.toPx(), breathe)
                drawPath(
                    path,
                    Brush.verticalGradient(
                        0f to Color.White, 0.16f to colour, 1f to lerp(colour, Mosh.Violet, 0.6f),
                        startY = centre.y - length, endY = centre.y,
                    ),
                )
            }

            // Their photo (or initial) at the tip, in a spinning neon ring.
            val rad = Math.toRadians(angle.toDouble())
            val reach = length + avatarR + 8.dp.toPx()
            val tip = Offset(centre.x + reach * sin(rad).toFloat(), centre.y - reach * cos(rad).toFloat())
            tips[a.friendId] = tip
            haloGlow(tip, avatarR, 16.dp.toPx(), own, 0.75f * breathe)
            drawCircle(Mosh.Avatar, radius = avatarR, center = tip)
            val photo = Faces.of(a.friendId, friend?.name)
            if (photo != null) {
                clipPath(Path().apply { addOval(Rect(tip, avatarR - 3.dp.toPx())) }) {
                    drawImage(
                        photo,
                        dstOffset = IntOffset((tip.x - avatarR).toInt(), (tip.y - avatarR).toInt()),
                        dstSize = IntSize((avatarR * 2).toInt(), (avatarR * 2).toInt()),
                    )
                }
            } else {
                drawCentred(friend?.name?.take(1)?.uppercase() ?: "?", tip, avatarR * 0.72f, Mosh.Text, displayPaint)
            }
            rotate(spin, pivot = tip) {
                drawCircle(
                    Brush.sweepGradient(listOf(own, Mosh.Violet, own), center = tip),
                    radius = avatarR, center = tip, style = Stroke(3.5f.dp.toPx()),
                )
            }
            // On another floor: say so on their face.
            floors[a.friendId]?.let { drawFloorPill(it, Offset(tip.x, tip.y + avatarR), regularPaint, 11.dp.toPx()) }

            if (group) {
                // Glass chip with distance + name, placed further out along the arrow's
                // direction, so it never covers another arrow.
                val ux = sin(rad).toFloat()
                val uy = -cos(rad).toFloat()
                val extent = kotlin.math.abs(ux) * chipW / 2 + kotlin.math.abs(uy) * chipH / 2
                val cc = Offset(tip.x + ux * (avatarR + 6.dp.toPx() + extent), tip.y + uy * (avatarR + 6.dp.toPx() + extent))
                val top = Offset(cc.x - chipW / 2, cc.y - chipH / 2)
                drawRoundRect(colour.copy(alpha = 0.12f), top, Size(chipW, chipH), CornerRadius(14.dp.toPx()))
                drawRoundRect(colour.copy(alpha = 0.40f), top, Size(chipW, chipH), CornerRadius(14.dp.toPx()), style = Stroke(1.dp.toPx()))
                val inner = chipW - 10.dp.toPx()
                val who = (friend?.name ?: "?") + if ((BuildConfig.TEST_BUILD && DebugStatus.showUi)) " · " + methodLabel(a.method) + (if (a.unsure) "?" else "") else ""
                drawCentred(finderDistanceLabel(a.distanceM), Offset(cc.x, top.y + 15.dp.toPx()), 14.dp.toPx(), colour, displayPaint, inner)
                drawCentred(who, Offset(cc.x, top.y + 31.dp.toPx()), 11.5f.dp.toPx(), Mosh.TextDim, regularPaint, inner)
            }
            if ((BuildConfig.TEST_BUILD && DebugStatus.showUi) && !group) {
                // Test builds only: which method is driving this arrow (in a group it's in the chip).
                drawCentred(methodLabel(a.method) + if (a.unsure) "?" else "", Offset(tip.x, tip.y - avatarR - 10.dp.toPx()), 10.dp.toPx(), Mosh.TextFaint, regularPaint)
            }
        }
    }
}

internal fun lerp(a: Color, b: Color, t: Float) = Color(
    red = a.red + (b.red - a.red) * t, green = a.green + (b.green - a.green) * t,
    blue = a.blue + (b.blue - a.blue) * t, alpha = a.alpha + (b.alpha - a.alpha) * t,
)

/** The Moshpoint arrow, pointing up from [centre]: broad head, rounded shaft. */
internal fun arrowPath(centre: Offset, length: Float, headRatio: Float): Path {
    val w = length * headRatio
    val headH = w * 1.35f
    val shaft = w * 0.32f
    val r = shaft * 0.9f
    return Path().apply {
        moveTo(centre.x, centre.y - length)
        lineTo(centre.x + w, centre.y - length + headH)
        lineTo(centre.x + shaft, centre.y - length + headH)
        lineTo(centre.x + shaft, centre.y - r)
        quadraticTo(centre.x + shaft, centre.y, centre.x, centre.y)
        quadraticTo(centre.x - shaft, centre.y, centre.x - shaft, centre.y - r)
        lineTo(centre.x - shaft, centre.y - length + headH)
        lineTo(centre.x - w, centre.y - length + headH)
        close()
    }
}

internal fun textPaint(face: android.graphics.Typeface?) = android.graphics.Paint().apply {
    isAntiAlias = true
    textAlign = android.graphics.Paint.Align.CENTER
    if (face != null) typeface = face
}

/**
 * Text centred on [at] (horizontally and by its real ascent/descent, so wide display
 * fonts sit visually centred), shortened with "…" if wider than [maxWidth].
 */
internal fun DrawScope.drawCentred(
    text: String, at: Offset, sizePx: Float, colour: Color, paint: android.graphics.Paint, maxWidth: Float = Float.MAX_VALUE,
) {
    paint.textSize = sizePx
    paint.color = colour.toArgb()
    var t = text
    if (paint.measureText(t) > maxWidth) {
        while (t.length > 1 && paint.measureText("$t…") > maxWidth) t = t.dropLast(1)
        t = "$t…"
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(t, at.x, at.y - (fm.ascent + fm.descent) / 2, paint)
}

internal fun methodLabel(m: Method) = when (m) {
    Method.UWB -> "UWB"
    Method.SPIN_SCAN -> "scan"
    Method.WALK -> "walk"
    Method.GPS_SERVER -> "GPS"
    Method.CROWD_RELAY -> "crowd"
    Method.WIFI_AWARE -> "Wi-Fi"
    Method.BLE_RSSI -> "BT"
    Method.HERE_PIN -> "pin"
}

/** A distance for screen readers ("12 metres", "1.2 kilometres"), from the same rounding as the on-screen label. */
private fun spokenDistance(m: Double): String {
    val d = finderDistance(m) ?: return ""
    return when {
        d.number.startsWith("<") -> Txt.s(if (d.unit == Txt.s(R.string.unit_ft)) R.string.find_spoken_under_3_feet else R.string.find_spoken_under_1_metre)
        d.unit == Txt.s(R.string.unit_km) -> Txt.s(R.string.find_spoken_kilometres, d.number)
        d.unit == Txt.s(R.string.unit_ft) -> Txt.s(R.string.find_spoken_feet, d.number)
        d.unit == Txt.s(R.string.unit_mi) -> Txt.s(R.string.find_spoken_miles, d.number)
        else -> Txt.s(R.string.find_spoken_metres, d.number)
    }
}
