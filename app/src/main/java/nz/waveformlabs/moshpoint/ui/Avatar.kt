package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
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

// Faces, in layers: their photo, else their default avatar, else their initials (see Faces).

/** A friend's face, ringed in their colour. */
@Composable
internal fun Avatar(f: Friend, size: androidx.compose.ui.unit.Dp) {
    val photo = Faces.of(f.id, f.name)
    val ring = Color(f.color)
    if (photo != null) {
        Image(
            photo, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(size).clip(CircleShape).border(3.dp, ring, CircleShape),
        )
    } else {
        Box(Modifier.drawBehind { glow(ring, 10.dp.toPx(), 0.55f) { p -> drawContext.canvas.drawCircle(center, this.size.minDimension / 2, p) } }) {
            InitialsAvatar(f.name, size, ring)
        }
    }
}

/** "King Zipper" -> "KZ", "bevan" -> "BE", "" -> "?". */
internal fun initials(name: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        words.isEmpty() -> "?"
        words.size == 1 -> words[0].take(1).uppercase()
        else -> (words[0].take(1) + words[1].take(1)).uppercase()
    }
}

/** Someone without a photo: their default avatar, or their initials if that can't be made. */
@Composable
internal fun DefaultAvatar(name: String, size: androidx.compose.ui.unit.Dp, colour: Color? = null) {
    val art = DefaultAvatars.image(name)
    if (art != null) {
        Image(art, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(size).clip(CircleShape))
    } else {
        InitialsAvatar(name, size, colour)
    }
}

/**
 * The last layer, for anyone without a photo or default avatar: their initials on a glowing gradient in
 * their colour (yours is picked from your name), like Apple's contact monograms.
 */
@Composable
internal fun InitialsAvatar(name: String, size: androidx.compose.ui.unit.Dp, colour: Color? = null) {
    val base = colour ?: Color(Mosh.FriendColours[Math.floorMod(name.trim().lowercase().hashCode(), Mosh.FriendColours.size)])
    Box(
        Modifier.size(size).clip(CircleShape)
            .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(base, lerpColour(base, Mosh.Deep, 0.55f))))
            .border(maxOf(1.5f, size.value / 22f).dp, Color.White.copy(alpha = 0.35f), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials(name),
            style = Mosh.Heading.copy(fontSize = (size.value * 0.36f).sp, lineHeight = (size.value * 0.4f).sp, color = Color.White),
            maxLines = 1,
        )
    }
}

private fun lerpColour(a: Color, b: Color, t: Float) = Color(
    red = a.red + (b.red - a.red) * t, green = a.green + (b.green - a.green) * t,
    blue = a.blue + (b.blue - a.blue) * t, alpha = 1f,
)
