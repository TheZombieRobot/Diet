package nz.waveformlabs.moshpoint.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import nz.waveformlabs.moshpoint.R
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/**
 * First run: three short, animated steps. Permissions are asked on step 2, right after
 * saying why, which is when people are most likely to say yes.
 */
@Composable
fun OnboardingScreen(
    name: String,
    onName: (String) -> Unit,
    onAskPermissions: () -> Unit,
    onDone: () -> Unit,
    /** Null when the build has no Meta app configured. */
    onFacebook: (() -> Unit)? = null,
) {
    var step by remember { mutableIntStateOf(0) }
    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
        val glowColour by animateColorAsState(listOf(Mosh.Cyan, Mosh.Lime, Mosh.Pink)[step], tween(800), label = "g")
        GlowBackground(colours = listOf(Mosh.Violet, glowColour, Mosh.Pink))
        Column(Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = 20.dp, bottom = 28.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                // The wordmark reads "moshpoint" in every language, right-to-left ones too.
                androidx.compose.runtime.CompositionLocalProvider(androidx.compose.ui.platform.LocalLayoutDirection provides androidx.compose.ui.unit.LayoutDirection.Ltr) {
                    Row(verticalAlignment = Alignment.Bottom) {
                        Text("mosh", style = Mosh.Title.copy(fontSize = 22.sp))
                        Text("point", style = Mosh.Title.copy(fontSize = 22.sp, color = Mosh.Pink))
                    }
                }
                Spacer(Modifier.weight(1f))
                if (step < 2) TextButton(onClick = { step = 2 }) { Text(stringResource(R.string.setup_onb_skip), style = Mosh.Body.copy(color = Mosh.TextFaint)) }
            }

            AnimatedContent(
                targetState = step,
                transitionSpec = {
                    val dir = if (targetState > initialState) 1 else -1
                    (slideInHorizontally(spring(stiffness = Spring.StiffnessMediumLow)) { it / 3 * dir } + fadeIn(tween(300)))
                        .togetherWith(slideOutHorizontally(tween(250)) { -it / 3 * dir } + fadeOut(tween(200)))
                },
                modifier = Modifier.weight(1f),
                label = "step",
            ) { s ->
                // Scrolls on small phones / big font sizes rather than cutting things off.
                Column(
                    Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 12.dp),
                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                ) {
                    when (s) {
                        0 -> {
                            ArrowDemo(Modifier.fillMaxWidth(0.72f).widthIn(max = 280.dp).aspectRatio(1f))
                            Spacer(Modifier.height(36.dp))
                            Title(stringResource(R.string.setup_onb_title_find))
                            Spacer(Modifier.height(12.dp))
                            Body(stringResource(R.string.setup_onb_body_find))
                        }
                        1 -> {
                            LiveOrb(Modifier.fillMaxWidth(0.5f).widthIn(max = 220.dp).aspectRatio(1f))
                            Spacer(Modifier.height(36.dp))
                            Title(stringResource(R.string.setup_onb_title_live))
                            Spacer(Modifier.height(12.dp))
                            Body(stringResource(R.string.setup_onb_body_live))
                            Spacer(Modifier.height(16.dp))
                            Need(Mosh.Cyan, stringResource(R.string.setup_onb_need_nearby), stringResource(R.string.offline_need_nearby_why))
                            Need(Mosh.Lime, stringResource(R.string.setup_onb_need_location), stringResource(R.string.setup_onb_need_location_why))
                            Need(Mosh.Pink, stringResource(R.string.setup_onb_need_notifications), stringResource(R.string.setup_onb_need_notifications_why))
                        }
                        else -> {
                            NameBadge(name, Modifier.fillMaxWidth(0.45f).widthIn(max = 200.dp).aspectRatio(1f))
                            Spacer(Modifier.height(36.dp))
                            Title(stringResource(R.string.setup_onb_title_name))
                            Spacer(Modifier.height(20.dp))
                            if (onFacebook != null) {
                                FacebookButton(onFacebook)
                                Spacer(Modifier.height(10.dp))
                                Text(stringResource(R.string.setup_onb_or_type_it), style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint))
                                Spacer(Modifier.height(10.dp))
                            }
                            OutlinedTextField(
                                name, onName,
                                placeholder = { Text(stringResource(R.string.setup_your_name), style = Mosh.Body.copy(color = Mosh.TextFaint)) },
                                singleLine = true,
                                textStyle = Mosh.Heading.copy(fontSize = 20.sp),
                                shape = RoundedCornerShape(18.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = Mosh.Pink, unfocusedBorderColor = Mosh.Line, cursorColor = Mosh.Pink,
                                ),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                }
            }

            Dots(step)
            Spacer(Modifier.height(20.dp))
            when (step) {
                0 -> NeonButton(stringResource(R.string.setup_onb_lets_go)) { step = 1 }
                1 -> NeonButton(stringResource(R.string.setup_onb_allow)) {
                    onAskPermissions()
                    step = 2
                }
                else -> NeonButton(if (name.isBlank()) stringResource(R.string.setup_onb_skip_for_now) else stringResource(R.string.setup_onb_im_name, name.trim()), onClick = onDone)
            }
        }
    }
}

@Composable
private fun Title(text: String) = Text(
    text, style = Mosh.Title.copy(fontSize = 28.sp, lineHeight = 34.sp),
    textAlign = androidx.compose.ui.text.style.TextAlign.Center,
)

@Composable
private fun Body(text: String) = Text(
    text, style = Mosh.Body, textAlign = androidx.compose.ui.text.style.TextAlign.Center,
    modifier = Modifier.padding(horizontal = 8.dp),
)

@Composable
private fun Need(colour: Color, what: String, why: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(10.dp).drawBehind {
            glow(colour, 8.dp.toPx(), 0.8f) { p -> drawContext.canvas.drawCircle(center, size.minDimension / 2, p) }
            drawCircle(colour)
        })
        Spacer(Modifier.width(12.dp))
        Text(what, style = Mosh.Label.copy(fontSize = 14.sp))
        Spacer(Modifier.width(6.dp))
        Text(why, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
    }
}

@Composable
private fun Dots(step: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
        repeat(3) { i ->
            val w by animateDpAsState(if (i == step) 28.dp else 8.dp, spring(stiffness = Spring.StiffnessMediumLow), label = "dot")
            val c by animateColorAsState(if (i == step) Mosh.Pink else Mosh.Line, label = "dotc")
            Box(Modifier.padding(horizontal = 4.dp).height(8.dp).width(w).background(c, CircleShape))
        }
    }
}

/** A mate wanders in from the edge; the arrow tracks them and glows pink -> cyan as they near. */
@Composable
private fun ArrowDemo(modifier: Modifier) {
    val t = rememberInfiniteTransition(label = "demo")
    val p by t.animateFloat(0f, 1f, infiniteRepeatable(tween(6000, easing = LinearEasing)), label = "p") // demo: always moves
    val breathe by t.ambient(0.6f, 1f, infiniteRepeatable(tween(1200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "b")
    val arrowDesc = stringResource(R.string.setup_onb_arrow_demo_desc)
    Canvas(modifier.semantics { contentDescription = arrowDesc }) {
        val c = center
        val maxR = size.minDimension / 2
        // Friend path: spiral in, then back out.
        val k = if (p < 0.6f) p / 0.6f else 1f - (p - 0.6f) / 0.4f
        val r = maxR * (0.95f - 0.55f * k)
        val a = p * 2 * Math.PI * 1.3
        val friend = Offset(c.x + (r * cos(a)).toFloat(), c.y + (r * sin(a)).toFloat())
        val closeness = (1f - (hypot(friend.x - c.x, friend.y - c.y) - maxR * 0.4f) / (maxR * 0.55f)).coerceIn(0f, 1f)
        val colour = androidx.compose.ui.graphics.lerp(Mosh.Pink, Mosh.Cyan, closeness)

        drawCircle(Color.White.copy(alpha = 0.06f), maxR * 0.98f, style = Stroke(1.dp.toPx()))
        drawCircle(Color.White.copy(alpha = 0.05f), maxR * 0.62f, style = Stroke(1.dp.toPx()))
        // Friend dot with a ping.
        haloGlow(friend, 10.dp.toPx(), 14.dp.toPx(), colour, breathe)
        drawCircle(colour, 10.dp.toPx(), friend)
        drawCircle(colour.copy(alpha = (1 - breathe) * 1.5f), 10.dp.toPx() + 18.dp.toPx() * (1 - breathe), friend, style = Stroke(2.dp.toPx()))

        val angle = Math.toDegrees(atan2((friend.x - c.x).toDouble(), -(friend.y - c.y).toDouble())).toFloat()
        val len = maxR * 0.42f
        val w = len * 0.3f
        val path = Path().apply {
            moveTo(c.x, c.y - len)
            lineTo(c.x + w, c.y - len + w * 1.35f)
            lineTo(c.x + w * 0.32f, c.y - len + w * 1.35f)
            lineTo(c.x + w * 0.32f, c.y)
            lineTo(c.x - w * 0.32f, c.y)
            lineTo(c.x - w * 0.32f, c.y - len + w * 1.35f)
            lineTo(c.x - w, c.y - len + w * 1.35f)
            close()
        }
        rotate(angle, pivot = c) {
            softGlow(path, colour, 28.dp.toPx(), breathe)
            drawPath(path, Brush.verticalGradient(0f to Color.White, 0.18f to colour, 1f to Mosh.Violet, startY = c.y - len, endY = c.y))
        }
        drawCircle(Mosh.Text, 6.dp.toPx(), c)
    }
}

/** The "go live" orb: lime, breathing, pinging. */
@Composable
private fun LiveOrb(modifier: Modifier) {
    Box(modifier, contentAlignment = Alignment.Center) {
        RadarPulse(Mosh.Lime, rings = 3, periodMs = 2400)
        val t = rememberInfiniteTransition(label = "orb")
        val b by t.ambient(0.7f, 1f, infiniteRepeatable(tween(1300, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "b")
        Canvas(Modifier.fillMaxSize(0.42f)) {
            haloGlow(center, size.minDimension / 2, 34.dp.toPx(), Mosh.Lime, b)
            drawCircle(Brush.radialGradient(listOf(Color.White, Mosh.Lime), center = center.copy(y = center.y - 12.dp.toPx())), radius = size.minDimension / 2)
        }
    }
}

/** Your initial in a spinning neon ring, updating as you type. */
@Composable
private fun NameBadge(name: String, modifier: Modifier) {
    val t = rememberInfiniteTransition(label = "badge")
    val spin by t.ambient(0f, 360f, infiniteRepeatable(tween(4000, easing = LinearEasing)), label = "s")
    Box(modifier, contentAlignment = Alignment.Center) {
        Canvas(Modifier.fillMaxSize(0.75f)) {
            val r = size.minDimension / 2
            haloGlow(center, r, 26.dp.toPx(), Mosh.Pink, 0.6f)
            rotate(spin) { drawCircle(Brush.sweepGradient(Mosh.Spectrum), radius = r) }
            drawCircle(Mosh.Avatar, radius = r - 5.dp.toPx())
        }
        AnimatedContent(name.trim().take(1).uppercase().ifEmpty { "?" }, label = "initial") {
            Text(it, style = Mosh.Title.copy(fontSize = 52.sp))
        }
    }
}
