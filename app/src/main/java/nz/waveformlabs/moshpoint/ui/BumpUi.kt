package nz.waveformlabs.moshpoint.ui

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * "Hold your phones together": two phones drift into each other with a pulse where they
 * meet. Closes itself after a minute.
 */
@Composable
internal fun BumpDialog(sharing: Boolean, onClose: () -> Unit) {
    LaunchedEffect(Unit) {
        kotlinx.coroutines.delay(60_000)
        onClose()
    }
    val t = rememberInfiniteTransition(label = "bump")
    val gap by t.animateFloat(1f, 0f, infiniteRepeatable(tween(1100, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "gap")
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = Mosh.Deep,
        title = { Text("Bump phones", style = Mosh.Heading) },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp), modifier = Modifier.fillMaxWidth()) {
                Canvas(Modifier.size(200.dp, 120.dp)) {
                    val w = size.width
                    val h = size.height
                    val pw = w * 0.22f
                    val ph = h * 0.8f
                    val off = gap * w * 0.12f
                    val left = Offset(w / 2 - pw - 4f - off, (h - ph) / 2)
                    val right = Offset(w / 2 + 4f + off, (h - ph) / 2)
                    drawRoundRect(Mosh.Pink, left, Size(pw, ph), CornerRadius(18f), style = Stroke(5f))
                    drawRoundRect(Mosh.Cyan, right, Size(pw, ph), CornerRadius(18f), style = Stroke(5f))
                    drawCircle(Mosh.Lime.copy(alpha = 1f - gap), radius = 12f + 30f * (1f - gap), center = Offset(w / 2, h / 2), style = Stroke(4f))
                }
                Text(
                    if (sharing) "Hold your phone back to back with your mate's. They'll be asked to join your crew."
                    else "Hold your phone back to back with someone in a crew (they open Bump too). You'll be asked to join.",
                    style = Mosh.Body, textAlign = TextAlign.Center,
                )
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Done", style = Mosh.Label) } },
    )
}
