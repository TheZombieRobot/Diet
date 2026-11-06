package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.key
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.PhotoStore
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.ArrowStyle
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import kotlin.math.cos
import kotlin.math.sin

/**
 * The main screen: one arrow per friend being looked for.
 *
 * - Nobody in range: no arrow, just a no-signal state.
 * - In range: arrow swivels to point the way, red when far, fading into the friend's
 *   colour as you close in. Friend's avatar at the tip, distance under it.
 * - Distance only (no direction yet): warmer/colder readout and a nudge to Scan.
 */
@Composable
fun FinderScreen(
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
    Box(Modifier.fillMaxSize()) {
    Column(
        Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
            val pointing = arrows.filterIsInstance<ArrowState.Pointing>()
            val distanceOnly = arrows.filterIsInstance<ArrowState.DistanceOnly>()
            if (pointing.isEmpty() && distanceOnly.isEmpty()) {
                NoSignal()
            } else {
                Arrows(pointing, friendOf)
                if (pointing.isEmpty()) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        distanceOnly.forEach { d ->
                            val name = friendOf(d.friendId)?.name ?: "?"
                            val trend = when (d.trend) {
                                Trend.WARMER -> "warmer"
                                Trend.COLDER -> "colder"
                                Trend.STEADY -> ""
                            }
                            val via = if (BuildConfig.DEBUG) "  (${methodLabel(d.method)})" else ""
                            Text(
                                "$name  ${ArrowStyle.distanceLabel(d.distanceM)}  $trend$via",
                                color = Color(ArrowStyle.arrowColor(friendOf(d.friendId)?.color ?: ArrowStyle.RED, d.distanceM)),
                                fontSize = 22.sp,
                            )
                        }
                        Spacer(Modifier.height(8.dp))
                        Text("Close by. Tap Scan to find which way.", color = Color.Gray)
                    }
                }
            }
        }

        val haptics = LocalHapticFeedback.current
        LaunchedEffect(scan?.done) {
            if (scan?.done == true) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        }
        if (scan != null && !scan.done) {
            ScanRing(scan)
            Spacer(Modifier.height(8.dp))
            Text(
                "Hold your phone flat against your chest and turn slowly in a full circle " +
                    "(${scan.coverageDeg.toInt()}° of 360°)",
                color = Color.White,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onCancelScan) { Text("Cancel scan") }
        } else if (scan != null && scan.done) {
            Text(scan.outcome.ifBlank { "Scan finished" }, color = Color.White, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onDismissScan) { Text("OK") }
                OutlinedButton(onClick = onScan) { Text("Scan again") }
            }
        } else {
            val unsure = arrows.any { it is ArrowState.DistanceOnly || (it is ArrowState.Pointing && it.unsure) }
            Button(onClick = onScan) { Text(if (unsure) "Scan (arrow unsure)" else "Scan") }
        }
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onBack) { Text("Friends") }
            if (BuildConfig.DEBUG && debug != null) {
                OutlinedButton(onClick = { showDebug = !showDebug }) { Text(if (showDebug) "Hide debug" else "Debug") }
            }
        }
    }
    if (BuildConfig.DEBUG && debug != null && showDebug) {
        debug(Modifier.align(Alignment.TopCenter).fillMaxWidth().fillMaxHeight(0.62f))
    }
    }
}

@Composable
private fun NoSignal() {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Text("No signal", color = Color.Gray, fontSize = 28.sp)
        Text("Your mate isn't in range yet, or isn't visible.", color = Color.DarkGray)
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
private fun Arrows(arrows: List<ArrowState.Pointing>, friendOf: (String) -> Friend?) {
    val angles = arrows.associate { a -> a.friendId to key(a.friendId) { animatedAngle(a.relativeDeg) } }
    Canvas(Modifier.fillMaxSize()) {
        val centre = Offset(size.width / 2, size.height / 2)
        val length = size.minDimension * 0.32f
        arrows.forEach { a ->
            val friend = friendOf(a.friendId)
            val colour = Color(ArrowStyle.arrowColor(friend?.color ?: ArrowStyle.RED, a.distanceM))
                .copy(alpha = if (a.unsure) 0.5f else 1f)
            val angle = angles[a.friendId] ?: a.relativeDeg.toFloat()
            drawArrow(centre, length, angle, colour)

            // Friend's photo (or initial) at the tip.
            val rad = Math.toRadians(angle.toDouble())
            val tip = Offset(
                centre.x + (length + 36f) * sin(rad).toFloat(),
                centre.y - (length + 36f) * cos(rad).toFloat(),
            )
            val photo = PhotoStore.photos[a.friendId]
            if (photo != null) {
                val r = 36f
                val clip = Path().apply { addOval(androidx.compose.ui.geometry.Rect(tip, r)) }
                clipPath(clip) {
                    drawImage(
                        photo,
                        dstOffset = IntOffset((tip.x - r).toInt(), (tip.y - r).toInt()),
                        dstSize = IntSize((r * 2).toInt(), (r * 2).toInt()),
                    )
                }
                drawCircle(colour, radius = r, center = tip, style = androidx.compose.ui.graphics.drawscope.Stroke(width = 5f))
            } else {
                drawCircle(colour, radius = 34f, center = tip)
                drawLabel(friend?.name?.take(1) ?: "?", tip, 34f, Color.Black)
            }
            drawLabel(ArrowStyle.distanceLabel(a.distanceM), Offset(tip.x, tip.y + 72f), 30f, Color.White)
            if (BuildConfig.DEBUG) {
                // Test builds only: which method is driving this arrow.
                drawLabel(methodLabel(a.method) + if (a.unsure) "?" else "", Offset(tip.x, tip.y + 108f), 24f, Color.Gray)
            }
        }
    }
}

/**
 * Progress ring for spin-to-scan: 36 slices, lit as each direction gets covered. Drawn
 * relative to the phone, so the slice at the top is the way you're facing now.
 */
@Composable
private fun ScanRing(scan: LocatorEngine.ScanUi) {
    Canvas(Modifier.size(120.dp)) {
        val stroke = 14f
        val r = size.minDimension / 2 - stroke
        val n = scan.sectors.size
        for (i in 0 until n) {
            val absCentre = (i + 0.5) * 360.0 / n
            // Compose arcs start at 3 o'clock; -90 puts "straight ahead" at the top.
            val start = (absCentre - scan.headingDeg - 90 - 180.0 / n + 1).toFloat()
            drawArc(
                color = if (scan.sectors[i]) Color(0xFF81C784) else Color(0xFF37474F),
                startAngle = start,
                sweepAngle = (360f / n) - 2f,
                useCenter = false,
                topLeft = Offset(center.x - r, center.y - r),
                size = androidx.compose.ui.geometry.Size(r * 2, r * 2),
                style = androidx.compose.ui.graphics.drawscope.Stroke(width = stroke),
            )
        }
        // "You're facing here" marker.
        drawCircle(Color.White, radius = 8f, center = Offset(center.x, center.y - r))
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

private fun DrawScope.drawArrow(centre: Offset, length: Float, angleDeg: Float, colour: Color) {
    rotate(angleDeg, pivot = centre) {
        val w = length * 0.28f
        val path = Path().apply {
            moveTo(centre.x, centre.y - length)
            lineTo(centre.x + w, centre.y - length + w * 1.6f)
            lineTo(centre.x + w * 0.35f, centre.y - length + w * 1.6f)
            lineTo(centre.x + w * 0.35f, centre.y)
            lineTo(centre.x - w * 0.35f, centre.y)
            lineTo(centre.x - w * 0.35f, centre.y - length + w * 1.6f)
            lineTo(centre.x - w, centre.y - length + w * 1.6f)
            close()
        }
        drawPath(path, colour)
    }
}

private fun DrawScope.drawLabel(text: String, at: Offset, sizePx: Float, colour: Color) {
    val paint = android.graphics.Paint().apply {
        isAntiAlias = true
        textAlign = android.graphics.Paint.Align.CENTER
        textSize = sizePx
        color = android.graphics.Color.argb(
            (colour.alpha * 255).toInt(), (colour.red * 255).toInt(), (colour.green * 255).toInt(), (colour.blue * 255).toInt(),
        )
    }
    drawContext.canvas.nativeCanvas.drawText(text, at.x, at.y + sizePx / 3, paint)
}

