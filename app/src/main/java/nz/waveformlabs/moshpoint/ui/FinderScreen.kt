package nz.waveformlabs.moshpoint.ui

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.res.ResourcesCompat
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.PhotoStore
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.ArrowStyle
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import kotlin.math.cos
import kotlin.math.sin

/**
 * The main screen (design canvas: "Finding a friend", "No signal", "Finding the whole
 * group", "Spin to scan").
 *
 * - Nobody in range: no arrow, just a no-signal state.
 * - In range: arrow swivels to point the way, red when far, fading into the friend's
 *   colour as you close in, their photo at the tip. One friend gets a big distance
 *   readout; a group gets name + distance beside each photo.
 * - Distance only (no direction yet): warmer/colder and a nudge to Scan.
 */
@Composable
fun FinderScreen(
    title: String,
    visible: Boolean,
    arrows: List<ArrowState>,
    friendOf: (String) -> Friend?,
    scan: LocatorEngine.ScanUi?,
    onScan: () -> Unit,
    onCancelScan: () -> Unit,
    onDismissScan: () -> Unit,
    onBack: () -> Unit,
    /** Only used in debug builds. Null in release. */
    debug: (@Composable (Modifier) -> Unit)? = null,
) {
    var showDebug by remember { mutableStateOf(false) }
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(scan?.done) {
        if (scan?.done == true) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
    }
    val pointing = arrows.filterIsInstance<ArrowState.Pointing>()
    val distanceOnly = arrows.filterIsInstance<ArrowState.DistanceOnly>()
    val scanning = scan != null && !scan.done

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
        Column(Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = 12.dp, bottom = 24.dp)) {
            // Top bar: back to friends, visibility status (and Debug in test builds).
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack, contentPadding = ButtonDefaults.TextButtonContentPadding) {
                    Text("‹  Friends", style = Mosh.Label.copy(fontWeight = FontWeight.Medium, fontSize = 15.sp))
                }
                Spacer(Modifier.weight(1f))
                if (BuildConfig.DEBUG && debug != null) {
                    TextButton(onClick = { showDebug = !showDebug }) {
                        Text(if (showDebug) "Hide debug" else "Debug", style = Mosh.Eyebrow)
                    }
                }
                StatusPill(visible)
            }

            Spacer(Modifier.height(16.dp))
            Text(if (scanning) "SCANNING FOR" else "FINDING", style = Mosh.Eyebrow)
            Text(title, style = Mosh.Title, maxLines = 1)

            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                when {
                    scanning -> ScanProgress(scan!!)
                    pointing.isEmpty() && distanceOnly.isEmpty() -> NoSignal(title)
                    else -> {
                        GuideRings()
                        Arrows(pointing, friendOf, group = arrows.size > 1)
                        if (pointing.isEmpty()) DistanceOnly(distanceOnly, friendOf)
                    }
                }
            }

            // Big readout for a single friend with an arrow.
            if (!scanning && arrows.size == 1 && pointing.size == 1) {
                val a = pointing[0]
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(ArrowStyle.distanceLabel(a.distanceM), style = Mosh.Distance)
                    Text(
                        if (a.unsure) "Rough direction. Scan to sharpen it" else "Head this way",
                        style = Mosh.Body,
                    )
                }
                Spacer(Modifier.height(20.dp))
            }
            if (!scanning && arrows.size > 1 && pointing.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 14.dp)) {
                    Box(
                        Modifier.width(44.dp).height(6.dp).background(
                            Brush.horizontalGradient(listOf(Mosh.Red, Color(Mosh.FriendColours[0]))),
                            RoundedCornerShape(3.dp),
                        ),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text("Red is far. Arrows turn your mate's colour as you get close.", style = Mosh.Eyebrow.copy(fontSize = 12.sp, letterSpacing = 0.sp))
                }
            }

            when {
                scanning -> BigButton("Cancel scan", outlined = true, onClick = onCancelScan)
                scan != null && scan.done -> {
                    Text(
                        scan.outcome.ifBlank { "Scan finished" },
                        style = Mosh.Body.copy(color = Mosh.Text),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        BigButton("OK", modifier = Modifier.weight(1f), onClick = onDismissScan)
                        BigButton("Scan again", modifier = Modifier.weight(1f), outlined = true, onClick = onScan)
                    }
                }
                else -> {
                    val unsure = arrows.any { it is ArrowState.DistanceOnly || (it is ArrowState.Pointing && it.unsure) }
                    BigButton(if (unsure) "Scan to find which way" else "Scan", icon = true, onClick = onScan)
                }
            }
        }
        if (BuildConfig.DEBUG && debug != null && showDebug) {
            debug(Modifier.align(Alignment.TopCenter).fillMaxWidth().fillMaxHeight(0.62f))
        }
    }
}

@Composable
private fun StatusPill(visible: Boolean) {
    Row(
        Modifier.background(Mosh.Surface, CircleShape).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).background(if (visible) Mosh.Green else Color(0xFF6B6B78), CircleShape))
        Spacer(Modifier.width(8.dp))
        Text(if (visible) "You're visible" else "You're hidden", style = Mosh.Body.copy(fontSize = 13.sp))
    }
}

@Composable
private fun BigButton(
    text: String,
    modifier: Modifier = Modifier.fillMaxWidth(),
    outlined: Boolean = false,
    icon: Boolean = false,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(16.dp)
    val content: @Composable () -> Unit = {
        if (icon) {
            Canvas(Modifier.size(18.dp)) { drawRefreshIcon(Mosh.Text) }
            Spacer(Modifier.width(10.dp))
        }
        Text(text, style = Mosh.Label)
    }
    if (outlined) {
        OutlinedButton(onClick, modifier.heightIn(min = 56.dp), shape = shape, border = BorderStroke(1.dp, Mosh.Line)) { content() }
    } else {
        Button(
            onClick, modifier.heightIn(min = 56.dp), shape = shape,
            colors = ButtonDefaults.buttonColors(containerColor = Mosh.Surface, contentColor = Mosh.Text),
            border = BorderStroke(1.dp, Mosh.Line),
        ) { content() }
    }
}

@Composable
private fun GuideRings() {
    Canvas(Modifier.fillMaxSize()) {
        val c = Offset(size.width / 2, size.height / 2)
        val r = size.minDimension
        drawCircle(Mosh.Ring, radius = r * 0.46f, center = c, style = Stroke(1.5f))
        drawCircle(Mosh.Ring, radius = r * 0.30f, center = c, style = Stroke(1.5f))
    }
}

@Composable
private fun NoSignal(name: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(24.dp)) {
        Canvas(Modifier.size(200.dp).semantics { contentDescription = "No signal" }) {
            val dash = PathEffect.dashPathEffect(floatArrayOf(10f, 10f))
            drawCircle(Mosh.Line, radius = size.minDimension / 2 - 2, style = Stroke(2f, pathEffect = dash))
            drawCircle(Mosh.Line, radius = size.minDimension * 0.33f, style = Stroke(2f, pathEffect = dash))
            drawCircle(Mosh.Surface, radius = size.minDimension * 0.16f)
            drawNoSignalIcon(Mosh.TextFaint)
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(max = 290.dp)) {
            Text("No signal yet", style = Mosh.Heading)
            Spacer(Modifier.height(8.dp))
            Text(
                "$name isn't in range, or hasn't turned on visibility. The arrow appears as soon as they're found.",
                style = Mosh.Body,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun DistanceOnly(list: List<ArrowState.DistanceOnly>, friendOf: (String) -> Friend?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        list.forEach { d ->
            val f = friendOf(d.friendId)
            val colour = Color(ArrowStyle.arrowColor(f?.color ?: ArrowStyle.RED, d.distanceM))
            val trend = when (d.trend) {
                Trend.WARMER -> "Getting warmer"
                Trend.COLDER -> "Getting colder"
                Trend.STEADY -> "Close by"
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(14.dp).background(colour, CircleShape))
                Spacer(Modifier.width(10.dp))
                Text(ArrowStyle.distanceLabel(d.distanceM), style = Mosh.Distance.copy(fontSize = if (list.size > 1) 32.sp else 56.sp))
            }
            val who = if (list.size > 1) "${f?.name ?: "?"} · " else ""
            val via = if (BuildConfig.DEBUG) "  (${methodLabel(d.method)})" else ""
            Text("$who$trend$via", style = Mosh.Body)
        }
        Spacer(Modifier.height(4.dp))
        Text("Close, but no direction yet. Tap Scan to find which way.", style = Mosh.Body, textAlign = TextAlign.Center)
    }
}

/**
 * Keeps an arrow's angle continuous (e.g. 350° -> 370° rather than 350° -> 10°) so the
 * animation swivels the short way round instead of spinning backwards through 180°.
 */
@Composable
private fun animatedAngle(targetDeg: Double): Float {
    // Plain holder (not Compose state): updating it mid-composition mustn't trigger recomposition.
    val last = remember { FloatArray(1) { targetDeg.toFloat() } }
    val delta = (((targetDeg - last[0]) % 360 + 540) % 360 - 180).toFloat()
    last[0] += delta
    val anim by animateFloatAsState(last[0], animationSpec = spring(stiffness = Spring.StiffnessMediumLow), label = "arrow")
    return anim
}

@Composable
private fun Arrows(arrows: List<ArrowState.Pointing>, friendOf: (String) -> Friend?, group: Boolean) {
    val angles = arrows.associate { a -> a.friendId to key(a.friendId) { animatedAngle(a.relativeDeg) } }
    val context = LocalContext.current
    val bold = remember { runCatching { ResourcesCompat.getFont(context, R.font.space_grotesk_bold) }.getOrNull() }
    val regular = remember { runCatching { ResourcesCompat.getFont(context, R.font.inter_regular) }.getOrNull() }
    Canvas(Modifier.fillMaxSize()) {
        val centre = Offset(size.width / 2, size.height / 2)
        val length = size.minDimension * (if (group) 0.30f else 0.36f)
        val avatarR = if (group) 30.dp.toPx() else 38.dp.toPx()
        if (group) drawCircle(Mosh.Text, radius = 6.dp.toPx(), center = centre)
        arrows.forEach { a ->
            val friend = friendOf(a.friendId)
            val colour = Color(ArrowStyle.arrowColor(friend?.color ?: ArrowStyle.RED, a.distanceM))
                .copy(alpha = if (a.unsure) 0.55f else 1f)
            val angle = angles[a.friendId] ?: a.relativeDeg.toFloat()
            drawArrow(centre, length, angle, colour, if (group) 0.20f else 0.30f)

            // Friend's photo (or initial) at the tip.
            val rad = Math.toRadians(angle.toDouble())
            val reach = length + avatarR + 6.dp.toPx()
            val tip = Offset(centre.x + reach * sin(rad).toFloat(), centre.y - reach * cos(rad).toFloat())
            val photo = PhotoStore.photos[a.friendId]
            if (photo != null) {
                clipPath(Path().apply { addOval(Rect(tip, avatarR)) }) {
                    drawImage(
                        photo,
                        dstOffset = IntOffset((tip.x - avatarR).toInt(), (tip.y - avatarR).toInt()),
                        dstSize = IntSize((avatarR * 2).toInt(), (avatarR * 2).toInt()),
                    )
                }
            } else {
                drawCircle(colour.copy(alpha = 0.22f).compositeOver(Mosh.Ground), radius = avatarR, center = tip)
                drawText(friend?.name?.take(1)?.uppercase() ?: "?", tip, avatarR * 0.8f, Mosh.Text, bold)
            }
            drawCircle(colour, radius = avatarR, center = tip, style = Stroke(4.dp.toPx()))

            if (group) {
                // Name + distance beside the photo, on the outer side.
                val right = sin(rad) >= 0
                val lx = tip.x + (if (right) -1 else 1) * 0f
                val ly = tip.y + avatarR + 24.dp.toPx()
                drawText(ArrowStyle.distanceLabel(a.distanceM), Offset(lx, ly), 20.sp.toPx(), Mosh.Text, bold)
                drawText(friend?.name ?: "?", Offset(lx, ly + 18.sp.toPx()), 13.sp.toPx(), Mosh.TextDim, regular)
            }
            if (BuildConfig.DEBUG) {
                // Test builds only: which method is driving this arrow.
                val y = tip.y - avatarR - 10.dp.toPx()
                drawText(methodLabel(a.method) + if (a.unsure) "?" else "", Offset(tip.x, y), 11.sp.toPx(), Mosh.TextFaint, regular)
            }
        }
    }
}

private fun Color.compositeOver(bg: Color) = Color(
    red = red * alpha + bg.red * (1 - alpha),
    green = green * alpha + bg.green * (1 - alpha),
    blue = blue * alpha + bg.blue * (1 - alpha),
)

/**
 * Spin-to-scan progress: a ring of 36 slices, lit as each direction gets covered, drawn
 * relative to the phone so the white dot (top) is the way you're facing now.
 */
@Composable
private fun ScanProgress(scan: LocatorEngine.ScanUi) {
    val pct = (scan.coverageDeg / 360.0 * 100).toInt().coerceIn(0, 100)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(28.dp)) {
        Box(contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(240.dp).semantics { contentDescription = "$pct percent of the circle covered" }) {
                val stroke = 18.dp.toPx()
                val r = size.minDimension / 2 - stroke
                val n = scan.sectors.size
                for (i in 0 until n) {
                    val absCentre = (i + 0.5) * 360.0 / n
                    // Compose arcs start at 3 o'clock; -90 puts "straight ahead" at the top.
                    val start = (absCentre - scan.headingDeg - 90 - 180.0 / n + 1.5).toFloat()
                    drawArc(
                        color = if (scan.sectors[i]) Mosh.Green else Color(0xFF24242C),
                        startAngle = start,
                        sweepAngle = (360f / n) - 3f,
                        useCenter = false,
                        topLeft = Offset(center.x - r, center.y - r),
                        size = Size(r * 2, r * 2),
                        style = Stroke(width = stroke),
                    )
                }
                drawCircle(Mosh.Text, radius = 9.dp.toPx(), center = Offset(center.x, center.y - r))
            }
            Text("$pct%", style = Mosh.Distance.copy(fontSize = 40.sp))
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(max = 300.dp)) {
            Text("Turn slowly in a circle", style = Mosh.Heading)
            Spacer(Modifier.height(10.dp))
            Text(
                "Hold your phone flat against your chest, screen facing out. Your body blocks the signal, so the app can tell which way they are.",
                style = Mosh.Body,
                textAlign = TextAlign.Center,
            )
        }
    }
}

private fun methodLabel(m: Method) = when (m) {
    Method.UWB -> "UWB"
    Method.SPIN_SCAN -> "scan"
    Method.GPS_SERVER -> "GPS"
    Method.CROWD_RELAY -> "crowd"
    Method.WIFI_AWARE -> "Wi-Fi"
    Method.BLE_RSSI -> "BT"
}

/** The Moshpoint arrow: a broad head on a shaft. [headRatio] = head half-width / length. */
private fun DrawScope.drawArrow(centre: Offset, length: Float, angleDeg: Float, colour: Color, headRatio: Float) {
    rotate(angleDeg, pivot = centre) {
        val w = length * headRatio
        val headH = w * 1.35f
        val shaft = w * 0.32f
        val path = Path().apply {
            moveTo(centre.x, centre.y - length)
            lineTo(centre.x + w, centre.y - length + headH)
            lineTo(centre.x + shaft, centre.y - length + headH)
            lineTo(centre.x + shaft, centre.y)
            lineTo(centre.x - shaft, centre.y)
            lineTo(centre.x - shaft, centre.y - length + headH)
            lineTo(centre.x - w, centre.y - length + headH)
            close()
        }
        drawPath(path, colour)
    }
}

private fun DrawScope.drawText(text: String, at: Offset, sizePx: Float, colour: Color, face: android.graphics.Typeface?) {
    val paint = android.graphics.Paint().apply {
        isAntiAlias = true
        textAlign = android.graphics.Paint.Align.CENTER
        textSize = sizePx
        color = colour.toArgb()
        if (face != null) typeface = face
    }
    drawContext.canvas.nativeCanvas.drawText(text, at.x, at.y + sizePx / 3, paint)
}

/** Circular "refresh" arrow used on the Scan button. */
private fun DrawScope.drawRefreshIcon(colour: Color) {
    val s = size.minDimension
    drawArc(colour, startAngle = -60f, sweepAngle = 300f, useCenter = false, style = Stroke(s * 0.11f))
    val p = Path().apply {
        moveTo(s * 0.98f, s * 0.05f)
        lineTo(s * 0.98f, s * 0.42f)
        lineTo(s * 0.62f, s * 0.42f)
        close()
    }
    drawPath(p, colour)
}

/** Signal waves with a strike-through, centred. */
private fun DrawScope.drawNoSignalIcon(colour: Color) {
    val c = center
    val u = size.minDimension * 0.012f
    val st = Stroke(width = 2.2f * u * 2, cap = androidx.compose.ui.graphics.StrokeCap.Round)
    for ((i, r) in listOf(5f, 9f, 13f).withIndex()) {
        drawArc(
            colour, startAngle = 225f, sweepAngle = 90f, useCenter = false,
            topLeft = Offset(c.x - r * u * 2, c.y + 6 * u * 2 - r * u * 2 - i * 0f),
            size = Size(r * u * 4, r * u * 4), style = st,
        )
    }
    drawCircle(colour, radius = 1.6f * u * 2, center = Offset(c.x, c.y + 6 * u * 2))
    drawLine(colour, Offset(c.x - 13 * u * 2, c.y - 13 * u * 2), Offset(c.x + 13 * u * 2, c.y + 13 * u * 2), strokeWidth = 2.2f * u * 2)
}
