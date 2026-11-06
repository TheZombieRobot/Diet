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
import androidx.compose.runtime.Composable
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

        if (scan != null && !scan.done) {
            Text(
                "Hold your phone flat against your chest and turn slowly in a full circle " +
                    "(${scan.coverageDeg.toInt()}° of 360°)",
                color = Color.White,
                textAlign = TextAlign.Center,
            )
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = onCancelScan) { Text("Cancel scan") }
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

@Composable
private fun Arrows(arrows: List<ArrowState.Pointing>, friendOf: (String) -> Friend?) {
    Canvas(Modifier.fillMaxSize()) {
        val centre = Offset(size.width / 2, size.height / 2)
        val length = size.minDimension * 0.32f
        arrows.forEach { a ->
            val friend = friendOf(a.friendId)
            val colour = Color(ArrowStyle.arrowColor(friend?.color ?: ArrowStyle.RED, a.distanceM))
                .copy(alpha = if (a.unsure) 0.5f else 1f)
            drawArrow(centre, length, a.relativeDeg.toFloat(), colour)

            // Avatar at the tip. TODO: draw the friend's profile photo instead of an initial.
            val rad = Math.toRadians(a.relativeDeg)
            val tip = Offset(
                centre.x + (length + 36f) * sin(rad).toFloat(),
                centre.y - (length + 36f) * cos(rad).toFloat(),
            )
            drawCircle(colour, radius = 34f, center = tip)
            drawLabel(friend?.name?.take(1) ?: "?", tip, 34f, Color.Black)
            drawLabel(ArrowStyle.distanceLabel(a.distanceM), Offset(tip.x, tip.y + 72f), 30f, Color.White)
            if (BuildConfig.DEBUG) {
                // Test builds only: which method is driving this arrow.
                drawLabel(methodLabel(a.method) + if (a.unsure) "?" else "", Offset(tip.x, tip.y + 108f), 24f, Color.Gray)
            }
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

