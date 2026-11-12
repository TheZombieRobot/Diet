package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.Floor

/*
 * "I'm here" (docs/IM_HERE.md): the few bits of screen it adds. A pinned mate's face sits on
 * their spot with "pinned 3 min ago"; your own pin is listed on the map with ✕.
 */

/** A mate's standing pin as the finder shows it: how old (by their clock), and the spot's floor relative to us. */
data class PinNote(val ageSec: Long, val floor: Floor?)

/** "pinned 3 min ago" (under a name, after a distance). */
@Composable
internal fun pinnedAgo(ageSec: Long): String = stringResource(R.string.here_pinned_ago, ago(ageSec))

/**
 * The "I'm here" choice at the top of the drop-a-pin dialog: one tap, nothing to type, and a
 * line saying what it does.
 */
@Composable
internal fun ImHereChoice(onClick: () -> Unit) {
    Column(Modifier.fillMaxWidth()) {
        Text(
            stringResource(R.string.here_button),
            style = Mosh.Label.copy(fontSize = 16.sp, color = Mosh.Ground),
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth()
                .background(Mosh.Pink, RoundedCornerShape(14.dp))
                .border(1.dp, Mosh.Pink, RoundedCornerShape(14.dp))
                .clickable(onClick = onClick)
                .padding(vertical = 11.dp),
        )
        Spacer(Modifier.height(6.dp))
        Text(stringResource(R.string.here_button_help), style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim))
        Spacer(Modifier.height(14.dp))
    }
}

/** A small hot-pink pill ("pinned 3 min ago") under a pinned mate's face on the radar. */
internal fun DrawScope.drawPinPill(text: String, centre: Offset, paint: android.graphics.Paint, textPx: Float) {
    paint.textSize = textPx
    val w = paint.measureText(text) + 12.dp.toPx()
    val h = textPx + 7.dp.toPx()
    drawRoundRect(Mosh.Ground, Offset(centre.x - w / 2 - 1.5f.dp.toPx(), centre.y - h / 2 - 1.5f.dp.toPx()), Size(w + 3.dp.toPx(), h + 3.dp.toPx()), CornerRadius(h / 2 + 1.5f.dp.toPx()))
    drawRoundRect(Mosh.Pink, Offset(centre.x - w / 2, centre.y - h / 2), Size(w, h), CornerRadius(h / 2))
    drawCentred(text, centre, textPx, Mosh.Ground, paint)
}
