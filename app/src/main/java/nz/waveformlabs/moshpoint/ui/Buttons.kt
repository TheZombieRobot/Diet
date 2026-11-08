package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

// The app's two button styles: glass (secondary) and neon gradient (primary).

/** Glass button with a bouncy press. */
@Composable
fun GlassButton(text: String, modifier: Modifier = Modifier.fillMaxWidth(), icon: Boolean = false, onClick: () -> Unit) {
    val (source, scale) = rememberPress()
    OutlinedButton(
        onClick, modifier.heightIn(min = 58.dp).pressScale(scale),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, Mosh.Line),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = Mosh.Surface, contentColor = Mosh.Text),
        // Narrower than Material's 24dp so two buttons side by side fit on small phones.
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 10.dp),
        interactionSource = source,
    ) {
        if (icon) {
            Canvas(Modifier.size(18.dp)) { drawRefreshIcon(Mosh.Text) }
            Spacer(Modifier.width(10.dp))
        }
        Text(text, style = Mosh.Label, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

/** The neon gradient button (pink -> violet -> cyan) with a sweeping shimmer. */
@Composable
fun NeonButton(text: String, modifier: Modifier = Modifier.fillMaxWidth(), onClick: () -> Unit) {
    val (source, scale) = rememberPress()
    val shine = rememberShimmer()
    Button(
        onClick,
        modifier.heightIn(min = 58.dp).pressScale(scale)
            // Neon underglow: Android's coloured shadow, drawn by the GPU.
            .shadow(18.dp, RoundedCornerShape(18.dp), ambientColor = Mosh.Pink, spotColor = Mosh.Pink)
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(Mosh.Pink, Mosh.Violet, Mosh.Cyan)))
            .graphicsLayer() // the shimmer redraws only this layer
            .shimmer { shine.value },
        shape = RoundedCornerShape(18.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White),
        interactionSource = source,
    ) { Text(text, style = Mosh.Button.copy(color = Color.White)) }
}

/** Circular "refresh" arrow used on the Scan button. */
internal fun DrawScope.drawRefreshIcon(colour: Color) {
    val s = size.minDimension
    drawArc(colour, startAngle = -60f, sweepAngle = 300f, useCenter = false, style = Stroke(s * 0.11f, cap = StrokeCap.Round))
    val p = Path().apply {
        moveTo(s * 0.98f, s * 0.05f)
        lineTo(s * 0.98f, s * 0.42f)
        lineTo(s * 0.62f, s * 0.42f)
        close()
    }
    drawPath(p, colour)
}
