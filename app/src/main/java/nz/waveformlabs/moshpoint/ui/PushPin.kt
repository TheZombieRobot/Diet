package nz.waveformlabs.moshpoint.ui

import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.unit.Dp

/**
 * A pushpin through the top of a Polaroid, as if it's pinned to a board: a glossy round head in
 * one of the app's neon colours, its neck going into the board, and a soft shadow on the paper.
 * Drawn in code (no image files). The head pokes a little above the frame's top edge, so whatever
 * holds a pinned Polaroid leaves a few dp of room above it.
 *
 * The Story's timeline pins its Polaroids with the poster's face instead (StoryScreen's FacePin).
 */
internal object PushPin {
    private val colours = listOf(Mosh.Pink, Mosh.Cyan, Mosh.Lime, Mosh.Amber, Mosh.Violet)

    /** The same colour for the same photo or gig every time you look. */
    fun colourFor(key: String): Color = colours[Math.floorMod(key.hashCode(), colours.size)]
}

/**
 * Pins this element: a pushpin [head] across, centred at the top, its centre [inset] below the
 * top edge (in the frame's white border). Put it after any rotate() so the pin tilts with the
 * Polaroid.
 */
internal fun Modifier.pushPin(colour: Color, head: Dp, inset: Dp = head * 0.15f): Modifier = drawWithContent {
    drawContent()
    drawPushPin(Offset(size.width / 2f, inset.toPx()), head.toPx() / 2f, colour)
}

/** A pushpin head of radius [r] at [centre], lit from the top left. */
internal fun DrawScope.drawPushPin(centre: Offset, r: Float, colour: Color) {
    // The shadow it casts on the paper: down and to the right, soft-edged.
    val shadow = centre + Offset(r * 0.55f, r * 0.85f)
    drawOval(
        Brush.radialGradient(listOf(Color.Black.copy(alpha = 0.38f), Color.Black.copy(alpha = 0f)), center = shadow, radius = r * 1.25f),
        topLeft = Offset(shadow.x - r * 1.25f, shadow.y - r * 0.95f),
        size = Size(r * 2.5f, r * 1.9f),
    )
    // The neck, going into the board just below the head.
    drawCircle(lerp(colour, Color.Black, 0.45f), radius = r * 0.55f, center = centre + Offset(r * 0.18f, r * 0.42f))
    // The head: light at the top left, deeper colour at the far edge.
    drawCircle(
        Brush.radialGradient(
            0f to lerp(colour, Color.White, 0.55f),
            0.45f to colour,
            1f to lerp(colour, Color.Black, 0.35f),
            center = centre + Offset(-r * 0.35f, -r * 0.4f),
            radius = r * 1.5f,
        ),
        radius = r,
        center = centre,
    )
    // A glint, so it reads as a shiny round head.
    drawCircle(Color.White.copy(alpha = 0.75f), radius = r * 0.2f, center = centre + Offset(-r * 0.38f, -r * 0.4f))
}
