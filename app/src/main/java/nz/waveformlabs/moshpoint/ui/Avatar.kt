package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import nz.waveformlabs.moshpoint.PhotoStore
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.ui.draw.drawBehind
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Friend

// Friend avatars: their photo, or their initial, ringed in their colour.

/** A friend's photo, or their initial, ringed in their colour. */
@Composable
internal fun Avatar(f: Friend, size: androidx.compose.ui.unit.Dp) {
    val photo = PhotoStore.photos[f.id]
    val ring = Color(f.color)
    if (photo != null) {
        Image(
            photo, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(size).clip(CircleShape).border(3.dp, ring, CircleShape),
        )
    } else {
        Box(
            Modifier.size(size)
                .drawBehind { glow(ring, 10.dp.toPx(), 0.55f) { p -> drawContext.canvas.drawCircle(center, this.size.minDimension / 2, p) } }
                .background(Mosh.Avatar, CircleShape).border(3.dp, ring, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(f.name.take(1).uppercase(), style = Mosh.Heading.copy(fontSize = (size.value * 0.34f).sp))
        }
    }
}
