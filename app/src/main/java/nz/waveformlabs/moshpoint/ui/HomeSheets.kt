package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// Rows and the pop-up panel the home's panels are built from, and the background glow
// (docs/design/home-redesign).

/** A row in a panel: icon tile, title, the line under it, and a chevron. [danger] = pink, no chevron. */
@Composable
internal fun MenuRow(
    icon: ImageVector,
    tile: Color,
    tint: Color,
    title: String,
    sub: String?,
    onClick: () -> Unit,
    danger: Boolean = false,
) {
    Row(
        Modifier.fillMaxWidth()
            .heightIn(min = 64.dp)
            .clip(RoundedCornerShape(14.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).background(tile, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
            HomeIcon(icon, tint, 22.dp)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            // Even lines: no single word left on a line of its own ("be found", "working").
            Text(title, style = HomeType.RowTitle.copy(fontSize = 16.sp, color = if (danger) Mosh.Danger else Mosh.Text, lineBreak = HomeBreakEven))
            if (sub != null) Text(sub, style = HomeType.Small.copy(lineBreak = HomeBreakEven))
        }
        if (!danger) {
            Spacer(Modifier.width(8.dp))
            HomeIcon(HomeIcons.Chevron, Mosh.TextFaint, 18.dp)
        }
    }
}

/** A pop-up panel's drag handle. */
@Composable
internal fun SheetHandle() =
    Box(Modifier.padding(top = 12.dp, bottom = 10.dp).size(40.dp, 5.dp).background(Mosh.Handle, RoundedCornerShape(3.dp)))

/** The home's pop-up panel: opens all the way, deep violet, with the design's handle and scrim. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MoshSheet(onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        containerColor = Mosh.Sheet,
        contentColor = Mosh.Text,
        tonalElevation = 0.dp,
        scrimColor = Mosh.Scrim,
        dragHandle = { SheetHandle() },
        content = content,
    )
}

/** The panel's look without the pop-up, for screenshots (a pop-up window doesn't render in a test). */
@Composable
internal fun SheetFrame(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    Column(
        modifier.fillMaxWidth().clip(shape).background(Mosh.Sheet).border(1.dp, Mosh.GlassLine, shape),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SheetHandle()
        Column(Modifier.fillMaxWidth(), content = content)
    }
}

/** The background glows from the design: cyan top left, pink bottom right (fixed, not scrolling). */
@Composable
internal fun HomeGlow(modifier: Modifier = Modifier) = androidx.compose.foundation.Canvas(modifier) {
    val w = size.width
    val h = size.height
    glowSpot(Offset(0f, h * 0.08f), w * 0.7f, h * 0.4f, Mosh.Cyan, 0.10f)
    glowSpot(Offset(w, h), w * 0.7f, h * 0.45f, Mosh.Pink, 0.13f)
}

/** An elliptical glow at [c] with radii [rx] and [ry], gone by 70% of the way out (the design's radial-gradient). */
private fun DrawScope.glowSpot(c: Offset, rx: Float, ry: Float, colour: Color, alpha: Float) {
    if (rx <= 0f || ry <= 0f) return
    scale(1f, ry / rx, c) {
        drawCircle(
            Brush.radialGradient(0f to colour.copy(alpha = alpha), 0.7f to colour.copy(alpha = 0f), center = c, radius = rx),
            radius = rx, center = c,
        )
    }
}
