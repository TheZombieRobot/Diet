package nz.waveformlabs.moshpoint.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/*
 * Moshpoint's motion kit: the neon, party feel lives here so screens stay simple.
 * Everything is ambient and cheap (a few Canvas draws), and nothing animates when it
 * isn't on screen.
 */

/**
 * An endlessly repeating ambient animation that holds still at [still] in calm motion
 * (battery saver / animations off). Drop-in for InfiniteTransition.animateFloat.
 */
@Composable
fun androidx.compose.animation.core.InfiniteTransition.ambient(
    initialValue: Float,
    targetValue: Float,
    animationSpec: androidx.compose.animation.core.InfiniteRepeatableSpec<Float>,
    label: String,
    still: Float = targetValue,
): State<Float> {
    if (LocalCalmMotion.current) return remember(still) { mutableStateOf(still) }
    return animateFloat(initialValue, targetValue, animationSpec, label)
}

/** Soft neon light blobs that drift slowly behind a screen. */
@Composable
fun GlowBackground(modifier: Modifier = Modifier, colours: List<Color> = listOf(Mosh.Violet, Mosh.Cyan, Mosh.Pink)) =
    GlowBackground(modifier) { colours }

/** [colours] is read at draw time, so an animating colour redraws without recomposing the screen. */
@Composable
fun GlowBackground(modifier: Modifier = Modifier, colours: () -> List<Color>) {
    val t = rememberInfiniteTransition(label = "glow")
    val drift by t.ambient(0f, 1f, infiniteRepeatable(tween(14_000, easing = LinearEasing)), label = "drift")
    Canvas(modifier.fillMaxSize()) {
        val colours = colours()
        val w = size.width
        val h = size.height
        val a = drift * 2 * Math.PI
        val spots = listOf(
            Offset(w * (0.85f + 0.08f * cos(a).toFloat()), h * (0.05f + 0.05f * sin(a).toFloat())) to colours[0],
            Offset(w * (0.05f + 0.10f * sin(a).toFloat()), h * (0.45f + 0.06f * cos(a).toFloat())) to colours[1 % colours.size],
            Offset(w * (0.70f + 0.10f * cos(a + 2).toFloat()), h * (0.90f + 0.04f * sin(a + 2).toFloat())) to colours[2 % colours.size],
        )
        for ((c, col) in spots) {
            val r = w * 0.75f
            drawCircle(
                Brush.radialGradient(listOf(col.copy(alpha = 0.20f), col.copy(alpha = 0f)), center = c, radius = r),
                radius = r, center = c,
            )
        }
    }
}

/** Rings that pulse outward from the centre, like a radar ping. */
@Composable
fun RadarPulse(colour: Color, modifier: Modifier = Modifier, rings: Int = 2, periodMs: Int = 2600) =
    RadarPulse({ colour }, modifier, rings, periodMs)

@Composable
fun RadarPulse(colour: () -> Color, modifier: Modifier = Modifier, rings: Int = 2, periodMs: Int = 2600) {
    val t = rememberInfiniteTransition(label = "radar")
    val p by t.ambient(0f, 1f, infiniteRepeatable(tween(periodMs, easing = FastOutSlowInEasing)), label = "p")
    Canvas(modifier.fillMaxSize()) {
        val colour = colour()
        val maxR = size.minDimension / 2
        for (i in 0 until rings) {
            val f = (p + i.toFloat() / rings) % 1f
            drawCircle(
                colour.copy(alpha = (1f - f) * 0.8f),
                radius = maxR * (0.35f + 0.9f * f),
                style = Stroke(width = 2.dp.toPx()),
            )
        }
    }
}

/** A rotating radar sweep (searching). */
@Composable
fun RadarSweep(colour: Color, modifier: Modifier = Modifier, periodMs: Int = 3000) {
    val t = rememberInfiniteTransition(label = "sweep")
    val angle by t.ambient(0f, 360f, infiniteRepeatable(tween(periodMs, easing = LinearEasing)), label = "a")
    Canvas(modifier.fillMaxSize()) {
        rotate(angle) {
            drawCircle(
                Brush.sweepGradient(
                    0f to colour.copy(alpha = 0f), 0.80f to colour.copy(alpha = 0f), 1f to colour.copy(alpha = 0.55f),
                ),
                radius = size.minDimension / 2,
            )
        }
    }
}

/** A neon light that runs round a card's border (used when you're live). */
@Composable
fun NeonFrame(
    shape: Shape,
    modifier: Modifier = Modifier,
    width: Dp = 2.dp,
    lit: Boolean = true,
    content: @Composable BoxScope.() -> Unit,
) {
    val t = rememberInfiniteTransition(label = "frame")
    val angle by t.ambient(0f, 360f, infiniteRepeatable(tween(4000, easing = LinearEasing)), label = "a")
    val alpha by animateFloatAsState(if (lit) 1f else 0f, tween(600), label = "lit")
    Box(
        modifier
            .clip(shape)
            .drawWithContent {
                if (alpha > 0f) {
                    rotate(angle) {
                        // Big enough to cover the card at any rotation.
                        val r = size.maxDimension
                        drawCircle(Brush.sweepGradient(Mosh.Spectrum), radius = r, alpha = alpha)
                    }
                } else {
                    drawRect(Mosh.Line)
                }
                drawContent()
            }
            .padding(width),
    ) { content() }
}

/** A soft highlight that sweeps across (premium shimmer on the main button). */
fun Modifier.shimmer(progress: () -> Float): Modifier = drawWithContent {
    drawContent()
    val w = size.width
    val x = -w * 0.5f + progress() * w * 2f
    drawRect(
        Brush.linearGradient(
            listOf(Color.White.copy(alpha = 0f), Color.White.copy(alpha = 0.32f), Color.White.copy(alpha = 0f)),
            start = Offset(x - w * 0.25f, 0f), end = Offset(x + w * 0.25f, size.height),
        ),
    )
}

/** Read the returned State inside draw/graphicsLayer only, so it never recomposes the caller. */
@Composable
fun rememberShimmer(periodMs: Int = 3200): State<Float> {
    val t = rememberInfiniteTransition(label = "shimmer")
    return t.ambient(
        0f, 1f,
        infiniteRepeatable(tween(periodMs, easing = FastOutSlowInEasing), repeatMode = RepeatMode.Restart),
        label = "p",
    )
}

/** Gentle bob for floating avatars. [phase] staggers neighbours. */
@Composable
fun rememberFloat(phase: Int = 0): State<Float> {
    val t = rememberInfiniteTransition(label = "float")
    return t.ambient(
        0f, 1f,
        infiniteRepeatable(tween(3000, delayMillis = 0, easing = FastOutSlowInEasing), RepeatMode.Reverse,
            initialStartOffset = androidx.compose.animation.core.StartOffset(phase * 400)),
        label = "y",
    )
}

/** Bouncy press: buttons squish a little under your thumb. Pass the source to the clickable. */
@Composable
fun rememberPress(): Pair<MutableInteractionSource, Float> {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(
        if (pressed) 0.95f else 1f,
        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "press",
    )
    return source to scale
}

fun Modifier.pressScale(scale: Float) = graphicsLayer { scaleX = scale; scaleY = scale }

/** Numbers that roll up/down when they change (distance readouts). */
@Composable
fun RollingText(text: String, style: TextStyle, modifier: Modifier = Modifier, decreasing: Boolean = true) {
    AnimatedContent(
        targetState = text,
        transitionSpec = {
            val dir = if (decreasing) 1 else -1
            (slideInVertically(spring(stiffness = Spring.StiffnessMediumLow)) { it * dir / 2 } + fadeIn(tween(220)))
                .togetherWith(slideOutVertically(tween(200)) { -it * dir / 2 } + fadeOut(tween(160)))
        },
        modifier = modifier,
        label = "roll",
    ) { Text(it, style = style) }
}

/**
 * Cheap neon glow for anything that animates: layered wide strokes, no blur. Use this
 * instead of [glow] on every-frame drawing (a blur re-renders on the CPU each frame).
 */
fun androidx.compose.ui.graphics.drawscope.DrawScope.softGlow(path: androidx.compose.ui.graphics.Path, colour: Color, widthPx: Float, alpha: Float = 1f) {
    val join = androidx.compose.ui.graphics.StrokeJoin.Round
    drawPath(path, colour.copy(alpha = 0.10f * alpha), style = Stroke(widthPx, join = join))
    drawPath(path, colour.copy(alpha = 0.16f * alpha), style = Stroke(widthPx * 0.55f, join = join))
    drawPath(path, colour.copy(alpha = 0.22f * alpha), style = Stroke(widthPx * 0.25f, join = join))
}

/** Cheap round glow: a radial gradient halo of [radius] + [spread]. */
fun androidx.compose.ui.graphics.drawscope.DrawScope.haloGlow(centre: Offset, radius: Float, spread: Float, colour: Color, alpha: Float = 1f) {
    val r = radius + spread
    if (r <= 0f) return
    drawCircle(
        Brush.radialGradient(
            0f to colour.copy(alpha = 0.55f * alpha),
            (radius / r).coerceIn(0f, 0.99f) to colour.copy(alpha = 0.35f * alpha),
            1f to colour.copy(alpha = 0f),
            center = centre, radius = r,
        ),
        radius = r, center = centre,
    )
}

/** Blurred glow behind a shape. Fine for things drawn once; for animation use [softGlow]/[haloGlow]. */
fun androidx.compose.ui.graphics.drawscope.DrawScope.glow(colour: Color, radiusPx: Float, alpha: Float = 1f, draw: (Paint) -> Unit) {
    drawIntoCanvas { canvas ->
        val paint = Paint()
        val fp = paint.asFrameworkPaint()
        fp.isAntiAlias = true
        fp.color = colour.copy(alpha = colour.alpha * alpha).toArgb()
        fp.maskFilter = android.graphics.BlurMaskFilter(radiusPx, android.graphics.BlurMaskFilter.Blur.NORMAL)
        draw(paint)
    }
}

/** Confetti burst with simple physics: launched up and out, then gravity, drift and spin. */
@Composable
fun Confetti(modifier: Modifier = Modifier, playing: Boolean, colours: List<Color> = listOf(Mosh.Cyan, Mosh.Pink, Mosh.Lime, Mosh.Violet, Mosh.Amber, Color.White)) {
    class Bit(var x: Float, var y: Float, var vx: Float, var vy: Float, var rot: Float, val spin: Float, val w: Float, val h: Float, val colour: Color, val round: Boolean)

    val bits = remember { mutableStateListOf<Bit>() }
    var frame by remember { mutableStateOf(0L) }
    var area by remember { mutableStateOf(Size.Zero) }

    val density = androidx.compose.ui.platform.LocalDensity.current.density
    LaunchedEffect(playing, area) {
        if (!playing || area == Size.Zero) return@LaunchedEffect
        val d = density // sizes and speeds are in dp, converted to px here
        val rnd = Random(System.nanoTime())
        bits.clear()
        repeat(140) {
            val angle = Math.toRadians(-90.0 + rnd.nextDouble(-70.0, 70.0))
            val speed = rnd.nextDouble(330.0, 760.0).toFloat() * d
            val w = rnd.nextDouble(3.5, 7.0).toFloat() * d
            bits += Bit(
                x = area.width / 2 + rnd.nextDouble(-12.0, 12.0).toFloat() * d,
                y = area.height * 0.38f,
                vx = (cos(angle) * speed).toFloat(),
                vy = (sin(angle) * speed).toFloat(),
                rot = rnd.nextFloat() * 360f,
                spin = rnd.nextDouble(-540.0, 540.0).toFloat(),
                w = w, h = if (rnd.nextBoolean()) w else w * 2.2f,
                colour = colours[rnd.nextInt(colours.size)],
                round = rnd.nextInt(4) == 0,
            )
        }
        var last = withFrameNanos { it }
        while (bits.any { it.y < area.height + 40 }) {
            val now = withFrameNanos { it }
            val dt = ((now - last) / 1e9f).coerceAtMost(0.05f)
            last = now
            for (b in bits) {
                b.vy += 650f * d * dt       // gravity
                b.vx *= (1f - 1.2f * dt)    // air
                b.vy *= (1f - 0.6f * dt)
                b.x += b.vx * dt
                b.y += b.vy * dt
                b.rot += b.spin * dt
            }
            frame = now
        }
    }

    Canvas(modifier.fillMaxSize().onSizeChanged { area = Size(it.width.toFloat(), it.height.toFloat()) }) {
        if (frame < 0L) return@Canvas // reading frame redraws on every physics step
        for (b in bits) {
            rotate(b.rot, pivot = Offset(b.x, b.y)) {
                if (b.round) {
                    drawCircle(b.colour, radius = b.w / 2, center = Offset(b.x, b.y))
                } else {
                    drawRoundRect(
                        b.colour, topLeft = Offset(b.x - b.w / 2, b.y - b.h / 2), size = Size(b.w, b.h),
                        cornerRadius = CornerRadius(2f, 2f),
                    )
                }
            }
        }
    }
}
