package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import nz.waveformlabs.moshpoint.GigArchive
import nz.waveformlabs.moshpoint.R
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource

/**
 * "Add your photos from that night": what's on this phone from the gig's hours, all
 * ticked; untick any you don't want, then add them to the gig.
 */
@Composable
internal fun CameraRollPicker(
    gigName: String,
    found: List<GigArchive.Found>?,
    adding: Boolean,
    onAdd: (List<GigArchive.Found>) -> Unit,
    onClose: () -> Unit,
) {
    var unpicked by remember(found) { mutableStateOf(setOf<android.net.Uri>()) }
    Dialog(onDismissRequest = { if (!adding) onClose() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Column(Modifier.fillMaxSize().background(Mosh.Deep).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.setup_roll_title), style = Mosh.Heading)
                    Text(gigName, style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint))
                }
                TextButton(onClick = onClose, enabled = !adding) { Text("✕", style = Mosh.Label.copy(fontSize = 18.sp)) }
            }
            when {
                found == null -> Text(stringResource(R.string.setup_roll_looking), style = Mosh.Body)
                found.isEmpty() -> Text(
                    stringResource(R.string.setup_roll_nothing),
                    style = Mosh.Body, textAlign = TextAlign.Center, modifier = Modifier.fillMaxWidth().padding(top = 40.dp),
                )
                else -> {
                    Text(stringResource(R.string.setup_roll_tap_to_leave_out), style = Mosh.Body.copy(fontSize = 13.sp))
                    LazyVerticalGrid(GridCells.Fixed(3), Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        items(found, key = { it.uri.toString() }) { f ->
                            val on = f.uri !in unpicked
                            Box(
                                Modifier.aspectRatio(1f).clip(RoundedCornerShape(10.dp))
                                    .border(3.dp, if (on) Mosh.Lime else Color.Transparent, RoundedCornerShape(10.dp))
                                    .clickable { unpicked = if (on) unpicked + f.uri else unpicked - f.uri },
                            ) {
                                val bmp = remember(f.uri) { f.thumb?.asImageBitmap() }
                                if (bmp != null) {
                                    Image(bmp, null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize().background(Color(0xFF1C1630)))
                                } else {
                                    Box(Modifier.fillMaxSize().background(Color(0xFF1C1630)))
                                }
                                if (f.video) Text("▶", style = Mosh.Label.copy(color = Color.White), modifier = Modifier.align(Alignment.Center))
                                Box(
                                    Modifier.align(Alignment.TopEnd).padding(6.dp).size(22.dp)
                                        .background(if (on) Mosh.Lime else Color(0x66000000), CircleShape)
                                        .border(1.5.dp, Color.White, CircleShape),
                                    contentAlignment = Alignment.Center,
                                ) { if (on) Text("✓", style = Mosh.Label.copy(fontSize = 13.sp, color = Color(0xFF0B1200))) }
                            }
                        }
                    }
                    val chosen = found.filter { it.uri !in unpicked }
                    NeonButton(if (adding) stringResource(R.string.setup_roll_adding) else pluralStringResource(R.plurals.setup_roll_add_n, chosen.size, chosen.size)) { if (!adding && chosen.isNotEmpty()) onAdd(chosen) }
                }
            }
        }
    }
}
