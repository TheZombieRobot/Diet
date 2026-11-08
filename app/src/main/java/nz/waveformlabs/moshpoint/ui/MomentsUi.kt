package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Moments

// Crew moments: photos the crew snapped, shown where and when they were taken.

/** A row of the crew's latest photos, plus a button to share your own. */
@Composable
internal fun MomentStrip(items: List<Moments.Item>, nowSec: Long, onOpen: (Moments.Item) -> Unit, onShare: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("MOMENTS", style = Mosh.Eyebrow, modifier = Modifier.weight(1f))
            TextButton(onClick = onShare) { Text("📷  Share one", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
        }
        if (items.isEmpty()) {
            Text(
                "Snap the stage, the bar, your spot: the crew sees the photo pinned where you took it. Handy when someone's lost.",
                style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
            )
        } else {
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                items.take(12).forEach { m ->
                    Column(Modifier.width(96.dp).clickable { onOpen(m) }) {
                        Image(
                            m.image, contentDescription = "Photo from ${m.from}", contentScale = ContentScale.Crop,
                            modifier = Modifier.size(96.dp).clip(RoundedCornerShape(14.dp)).border(1.dp, Mosh.Line, RoundedCornerShape(14.dp)),
                        )
                        Spacer(Modifier.height(4.dp))
                        Text(if (m.mine) "You" else m.from, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 15.sp, color = Mosh.Text), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text(ago(nowSec - m.timeSec), style = Mosh.Body.copy(fontSize = 11.sp, lineHeight = 13.sp, color = Mosh.TextFaint))
                    }
                }
            }
        }
    }
}

/** One moment, big: who, when, how far, and jump to the map or the finder. */
@Composable
internal fun MomentViewer(
    m: Moments.Item,
    nowSec: Long,
    distanceText: String?,
    onMap: (() -> Unit)?,
    onFind: (() -> Unit)?,
    onClose: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = Mosh.Deep,
        title = {
            Column {
                Text(if (m.mine) "Your moment" else m.from, style = Mosh.Heading)
                Text(
                    listOfNotNull(ago(nowSec - m.timeSec), distanceText?.let { "$it away" }).joinToString(" · "),
                    style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint),
                )
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Image(
                    m.image, contentDescription = null, contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxWidth().heightIn(max = 420.dp).clip(RoundedCornerShape(16.dp)),
                )
                if (m.caption.isNotBlank()) Text(m.caption, style = Mosh.Body.copy(color = Mosh.Text))
            }
        },
        confirmButton = {
            Row {
                if (onMap != null) TextButton(onClick = onMap) { Text("On map", style = Mosh.Label.copy(color = Mosh.Cyan)) }
                if (onFind != null) TextButton(onClick = onFind) { Text("Find ${m.from}", style = Mosh.Label.copy(color = Mosh.Pink)) }
            }
        },
        dismissButton = { TextButton(onClick = onClose) { Text("Close", style = Mosh.Label) } },
    )
}

/** After taking or picking a photo: preview, optional caption, send. */
@Composable
internal fun MomentComposer(photo: ImageBitmap, sending: Boolean, onSend: (String) -> Unit, onCancel: () -> Unit) {
    var caption by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = { if (!sending) onCancel() },
        containerColor = Mosh.Deep,
        title = { Text("Share with the crew", style = Mosh.Heading) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Box {
                    Image(
                        photo, contentDescription = null, contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f).clip(RoundedCornerShape(16.dp)),
                    )
                    Box(
                        Modifier.align(Alignment.BottomStart).fillMaxWidth().height(36.dp)
                            .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0xCC000000))), RoundedCornerShape(bottomStart = 16.dp, bottomEnd = 16.dp)),
                    )
                    Text("📍 pinned where you are now", style = Mosh.Body.copy(fontSize = 12.sp, color = Color.White), modifier = Modifier.align(Alignment.BottomStart).padding(10.dp))
                }
                OutlinedTextField(
                    caption, { caption = it.take(80) }, singleLine = true,
                    placeholder = { Text("Say where (optional): left of the sound desk") },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text("Only your crew can see it. It disappears from the relay after a few hours.", style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 16.sp, color = Mosh.TextFaint))
            }
        },
        confirmButton = {
            TextButton(onClick = { onSend(caption) }, enabled = !sending) {
                Text(if (sending) "Sending…" else "Send", style = Mosh.Label.copy(color = Mosh.Lime))
            }
        },
        dismissButton = { TextButton(onClick = onCancel, enabled = !sending) { Text("Cancel", style = Mosh.Label) } },
    )
}
