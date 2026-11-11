package nz.waveformlabs.moshpoint.ui

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.R
import androidx.compose.foundation.clickable
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.ArrowStyle
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.locate.LocatorEngine

// The finder's other states: searching, warmer/colder, spin-scan progress, found, Light me up.

@Composable
fun LivePill(live: Boolean) {
    val t = rememberInfiniteTransition(label = "live")
    val ping by t.ambient(0f, 1f, infiniteRepeatable(tween(1800, easing = FastOutSlowInEasing)), label = "ping")
    Row(
        Modifier.background(Mosh.Surface, CircleShape).border(1.dp, Mosh.Line, CircleShape).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).drawBehind {
            if (live) drawCircle(Mosh.Lime.copy(alpha = 0.7f * (1 - ping)), radius = size.minDimension / 2 + 8.dp.toPx() * ping)
            drawCircle(if (live) Mosh.Lime else Color(0xFF6E6886))
        })
        Spacer(Modifier.width(8.dp))
        Text(if (live) stringResource(R.string.find_pill_live) else stringResource(R.string.find_pill_hidden), style = Mosh.Body.copy(fontSize = 13.sp))
    }
}

@Composable
internal fun Chip(label: String, colour: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(
            label, style = Mosh.Label.copy(fontSize = 13.sp, color = colour),
            modifier = Modifier.background(colour.copy(alpha = 0.14f), CircleShape).padding(horizontal = 10.dp, vertical = 4.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(text, style = Mosh.Body)
    }
}

@Composable
internal fun DistanceReadout(distanceM: Double?) {
    val d = finderDistance(distanceM)
    if (d == null || d.number.startsWith("<")) {
        Text(if (d == null) "?" else "${d.number} ${d.unit}", style = Mosh.Distance.copy(fontSize = 44.sp, lineHeight = 48.sp))
        return
    }
    val num = d.number
    val unit = d.unit
    Row(verticalAlignment = Alignment.Bottom) {
        RollingText(num, Mosh.Distance)
        if (unit.isNotEmpty()) {
            Spacer(Modifier.width(6.dp))
            Text(unit, style = Mosh.Heading.copy(fontSize = 28.sp, color = Mosh.TextFaint), modifier = Modifier.padding(bottom = 6.dp))
        }
    }
}

@Composable
internal fun Searching(name: String) {
    val searchingCd = stringResource(R.string.find_searching_cd)
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(30.dp)) {
        Box(Modifier.size(240.dp).semantics { contentDescription = searchingCd }, contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize()) {
                val r = size.minDimension / 2
                drawCircle(Mosh.Violet.copy(alpha = 0.35f), r, style = Stroke(1.dp.toPx()))
                drawCircle(Mosh.Violet.copy(alpha = 0.25f), r * 0.66f, style = Stroke(1.dp.toPx()))
                drawCircle(Mosh.Violet.copy(alpha = 0.20f), r * 0.33f, style = Stroke(1.dp.toPx()))
            }
            RadarSweep(Mosh.Violet)
            RadarPulse(Mosh.Violet, rings = 1, periodMs = 3000)
            Box(Modifier.size(14.dp).drawBehind {
                glow(Color.White, 10.dp.toPx(), 0.8f) { p -> drawContext.canvas.drawCircle(center, size.minDimension / 2, p) }
                drawCircle(Mosh.Text)
            })
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(max = 290.dp)) {
            Text(stringResource(R.string.find_looking_for, name), style = Mosh.Heading, textAlign = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            Text(
                stringResource(R.string.find_searching_help),
                style = Mosh.Body, textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
internal fun DistanceOnly(
    list: List<ArrowState.DistanceOnly>,
    friendOf: (String) -> Friend?,
    /** Who is on another floor: the best clue there is when Bluetooth says "close" and you can't see them. */
    floors: Map<String, nz.waveformlabs.moshpoint.core.Floor> = emptyMap(),
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        list.forEach { d ->
            val f = friendOf(d.friendId)
            val colour by animateColorAsState(Color(ArrowStyle.arrowColor(f?.color ?: ArrowStyle.RED, d.distanceM)), tween(700), label = "c")
            Box(Modifier.size(if (list.size > 1) 12.dp else 18.dp).drawBehind {
                glow(colour, 12.dp.toPx(), 0.9f) { p -> drawContext.canvas.drawCircle(center, size.minDimension / 2, p) }
                drawCircle(colour)
            })
            if (d.method == nz.waveformlabs.moshpoint.core.Method.BLE_RSSI) {
                // Signal strength in a crowd can't honestly say "7 m": show a band instead.
                FitText(
                    bandLabel(d.distanceM),
                    style = Mosh.Distance.copy(fontSize = if (list.size > 1) 32.sp else 52.sp, lineHeight = if (list.size > 1) 34.sp else 56.sp),
                )
                Text(bandHint(d.distanceM), style = Mosh.Body.copy(color = Mosh.TextFaint))
            } else if (list.size > 1) {
                RollingText(finderDistanceLabel(d.distanceM), Mosh.Distance.copy(fontSize = 32.sp, lineHeight = 34.sp))
            } else {
                DistanceReadout(d.distanceM)
            }
            floors[d.friendId]?.let { FloorTag(it) }
            val (label, c, hint) = when (d.trend) {
                Trend.WARMER -> Triple(stringResource(R.string.find_trend_warmer), Mosh.Lime, stringResource(R.string.find_trend_warmer_hint))
                Trend.COLDER -> Triple(stringResource(R.string.find_trend_colder), Mosh.Pink, stringResource(R.string.find_trend_colder_hint))
                Trend.STEADY -> Triple(stringResource(R.string.find_trend_steady), Mosh.Cyan, stringResource(R.string.find_trend_steady_hint))
            }
            val whoHint = if (list.size > 1) stringResource(R.string.find_trend_hint_who, f?.name ?: "?", hint) else hint
            val via = if ((BuildConfig.TEST_BUILD && DebugStatus.showUi)) "  (${methodLabel(d.method)})" else ""
            Chip(label, c, "$whoHint$via")
        }
        Spacer(Modifier.height(4.dp))
        Text(
            stringResource(R.string.find_warmer_help),
            style = Mosh.Body, textAlign = TextAlign.Center,
        )
    }
}

/** App-side, translated twin of ArrowStyle.bandLabel (same thresholds). */
@Composable
internal fun bandLabel(distanceM: Double?): String = when {
    distanceM == null -> "?"
    distanceM < 3 -> stringResource(R.string.find_band_right_here)
    distanceM < 10 -> stringResource(R.string.find_band_close)
    distanceM < 30 -> stringResource(R.string.find_band_nearby)
    else -> stringResource(R.string.find_band_in_range)
}

/** App-side, translated twin of ArrowStyle.bandHint (same thresholds). */
@Composable
internal fun bandHint(distanceM: Double?): String = when {
    distanceM == null -> ""
    distanceM < 3 -> stringResource(R.string.find_band_hint_right_here)
    distanceM < 10 -> stringResource(R.string.find_band_hint_close)
    distanceM < 30 -> stringResource(R.string.find_band_hint_nearby)
    else -> stringResource(R.string.find_band_hint_in_range)
}

/**
 * Spin-to-scan: a lime arc fills as you cover the circle (a light sweeps round inside),
 * drawn relative to the phone so the white dot is the way you're facing.
 */
@Composable
internal fun ScanProgress(scan: LocatorEngine.ScanUi) {
    val pct = (scan.coverageDeg / 360.0 * 100).toInt().coerceIn(0, 100)
    val coveredCd = stringResource(R.string.find_scan_covered_cd, pct)
    val t = rememberInfiniteTransition(label = "scan")
    val pulse by t.ambient(1f, 1.06f, infiniteRepeatable(tween(1000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "p")
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(36.dp)) {
        Box(Modifier.size(260.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.size(236.dp).clip(CircleShape)) { RadarSweep(Mosh.Lime, periodMs = 2400) }
            Canvas(Modifier.fillMaxSize().semantics { contentDescription = coveredCd }) {
                val stroke = 16.dp.toPx()
                val r = size.minDimension / 2 - stroke
                val n = scan.sectors.size
                drawCircle(Color.White.copy(alpha = 0.08f), radius = r, style = Stroke(stroke))
                for (i in 0 until n) {
                    if (!scan.sectors[i]) continue
                    val absCentre = (i + 0.5) * 360.0 / n
                    // Compose arcs start at 3 o'clock; -90 puts "straight ahead" at the top.
                    val start = (absCentre - scan.headingDeg - 90 - 180.0 / n).toFloat()
                    val sweep = 360f / n + 0.6f
                    // Cheap glow: a wide, faint arc under the lit one.
                    drawArc(
                        Mosh.Lime.copy(alpha = 0.18f), startAngle = start, sweepAngle = sweep, useCenter = false,
                        topLeft = Offset(center.x - r, center.y - r), size = Size(r * 2, r * 2), style = Stroke(stroke * 2f),
                    )
                    drawArc(
                        Mosh.Lime, startAngle = start, sweepAngle = sweep, useCenter = false,
                        topLeft = Offset(center.x - r, center.y - r), size = Size(r * 2, r * 2), style = Stroke(stroke, cap = StrokeCap.Butt),
                    )
                }
                drawCircle(Color.White, radius = 10.dp.toPx(), center = Offset(center.x, center.y - r))
            }
            Column(
                Modifier.size(150.dp).graphicsLayer { scaleX = pulse; scaleY = pulse }
                    .background(Mosh.Deep, CircleShape).border(1.dp, Mosh.Line, CircleShape),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    stringResource(R.string.find_scan_percent, pct),
                    style = Mosh.Distance.copy(fontSize = 40.sp, lineHeight = 44.sp, color = Mosh.Lime, shadow = Shadow(Mosh.Lime.copy(alpha = 0.7f), blurRadius = 24f)),
                )
                Text(
                    if (scan.heard == 0) stringResource(R.string.find_scan_listening) else pluralStringResource(R.plurals.find_scan_heard, scan.heard, scan.heard),
                    style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint),
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(max = 300.dp)) {
            Text(stringResource(R.string.find_spin_slowly), style = Mosh.Heading)
            Spacer(Modifier.height(10.dp))
            Text(
                stringResource(R.string.find_spin_help),
                style = Mosh.Body, textAlign = TextAlign.Center,
            )
        }
    }
}

/** "You found them!": confetti, their photo bursting in on a spinning neon ring. */
@Composable
internal fun FoundOverlay(friend: Friend?, onDone: () -> Unit, onKeep: () -> Unit) {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    val pop by animateFloatAsState(if (shown) 1f else 0.4f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessLow), label = "pop")
    val rise by animateFloatAsState(if (shown) 0f else 1f, tween(600, delayMillis = 250, easing = FastOutSlowInEasing), label = "rise")
    val t = rememberInfiniteTransition(label = "found")
    val spin by t.ambient(0f, 360f, infiniteRepeatable(tween(3000, easing = LinearEasing)), label = "spin")
    val halo by t.ambient(0.6f, 1f, infiniteRepeatable(tween(1200, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "halo")
    val colour = Color(friend?.color ?: Mosh.Cyan.toArgb())

    Box(
        Modifier.fillMaxSize().background(Mosh.Ground.copy(alpha = 0.94f))
            // Swallow taps so they don't reach the buttons underneath.
            .pointerInput(Unit) { awaitPointerEventScope { while (true) awaitPointerEvent() } },
    ) {
        GlowBackground(colours = listOf(colour, Mosh.Violet, Mosh.Pink))
        Confetti(playing = shown)
        Column(
            Modifier.fillMaxSize().padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
        ) {
            Box(Modifier.size(200.dp).graphicsLayer { scaleX = pop; scaleY = pop }, contentAlignment = Alignment.Center) {
                RadarPulse(colour, rings = 2, periodMs = 1800)
                Canvas(Modifier.size(156.dp)) {
                    val r = size.minDimension / 2
                    haloGlow(center, r, 34.dp.toPx(), colour, halo)
                    rotate(spin) { drawCircle(Brush.sweepGradient(Mosh.Spectrum), radius = r) }
                    drawCircle(Mosh.Avatar, radius = r - 5.dp.toPx())
                }
                val photo = friend?.let { Faces.of(it.id, it.name) }
                if (photo != null) {
                    androidx.compose.foundation.Image(
                        photo, contentDescription = null,
                        contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                        modifier = Modifier.size(146.dp).clip(CircleShape),
                    )
                } else {
                    Text(friend?.name?.take(1)?.uppercase() ?: "?", style = Mosh.Title.copy(fontSize = 56.sp))
                }
            }
            Spacer(Modifier.height(32.dp))
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.graphicsLayer { translationY = rise * 40f; alpha = 1f - rise },
            ) {
                Text(
                    stringResource(R.string.find_under_3_metres),
                    style = Mosh.Eyebrow.copy(color = Mosh.Lime, letterSpacing = 3.sp, shadow = Shadow(Mosh.Lime.copy(alpha = 0.8f), blurRadius = 18f)),
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    friend?.name?.let { stringResource(R.string.find_you_found, it) } ?: stringResource(R.string.find_you_found_them),
                    style = Mosh.Title.copy(fontSize = 38.sp, lineHeight = 42.sp),
                    textAlign = TextAlign.Center,
                    // Neon gradient text: draw the text, then paint the gradient over it.
                    modifier = Modifier
                        .graphicsLayer { compositingStrategy = androidx.compose.ui.graphics.CompositingStrategy.Offscreen }
                        .drawWithContent {
                            drawContent()
                            drawRect(
                                Brush.linearGradient(listOf(Mosh.Cyan, Color(0xFFC86BFF), Mosh.Pink)),
                                blendMode = androidx.compose.ui.graphics.BlendMode.SrcAtop,
                            )
                        },
                )
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.find_look_up_wave), style = Mosh.Body)
                Spacer(Modifier.height(36.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    NeonButton(stringResource(R.string.find_done), Modifier.weight(1f), onClick = onDone)
                    GlassButton(stringResource(R.string.find_keep_arrow), Modifier.weight(1f), onClick = onKeep)
                }
            }
        }
    }
}

/**
 * "Light me up": the whole screen strobes bright colours so a mate can pick you out of a
 * crowd from a distance (hold the phone up high). Tap anywhere to stop.
 */
@Composable
internal fun BeaconOverlay(colour: Color, colourName: String, onStop: () -> Unit) {
    var i by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(180)
            i++
        }
    }
    val on = i % 2 == 0
    Box(
        Modifier.fillMaxSize()
            .background(if (on) colour else Color.Black)
            .clickable(onClick = onStop),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Text(
            stringResource(R.string.find_beacon_help, colourName.uppercase()),
            style = Mosh.Body.copy(color = if (on) Color.Black else Color.White, fontSize = 15.sp),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(bottom = 48.dp),
        )
    }
}

/**
 * Feel the find (like Precision Finding): a soft tick that speeds up as you close in, and a
 * click each time the signal says "warmer". Silent when far away or once found.
 */
@Composable
internal fun FindHaptics(arrows: List<ArrowState>) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val vibrator = remember {
        runCatching {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
                context.getSystemService(android.os.VibratorManager::class.java)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(android.os.Vibrator::class.java)
            }
        }.getOrNull()
    }
    val closest = arrows.mapNotNull {
        when (it) {
            is ArrowState.DistanceOnly -> it.distanceM
            is ArrowState.Pointing -> it.distanceM
            else -> null
        }
    }.minOrNull()
    val warmer = arrows.any { it is ArrowState.DistanceOnly && it.trend == Trend.WARMER }
    val d = androidx.compose.runtime.rememberUpdatedState(closest)
    fun buzz(effect: Int) {
        runCatching { vibrator?.vibrate(android.os.VibrationEffect.createPredefined(effect)) }
    }
    LaunchedEffect(warmer) { if (warmer) buzz(android.os.VibrationEffect.EFFECT_CLICK) }
    LaunchedEffect(vibrator) {
        if (vibrator == null) return@LaunchedEffect
        while (true) {
            val m = d.value
            val gap = when {
                m == null || m < 3.0 || m > 60.0 -> null
                m < 10.0 -> 500L
                m < 25.0 -> 1_100L
                else -> 2_400L
            }
            if (gap == null) {
                kotlinx.coroutines.delay(1_000)
            } else {
                buzz(android.os.VibrationEffect.EFFECT_TICK)
                kotlinx.coroutines.delay(gap)
            }
        }
    }
}


/**
 * One line that shrinks to fit the width instead of wrapping or clipping ("Right here" is short in
 * English, "In de buurt" or "Ganz in der Nähe" aren't). Never smaller than 60% of [style].
 */
@Composable
internal fun FitText(text: String, style: androidx.compose.ui.text.TextStyle, modifier: Modifier = Modifier) {
    var scale by remember(text) { mutableStateOf(1f) }
    Text(
        text,
        style = style.copy(fontSize = style.fontSize * scale, lineHeight = style.lineHeight * scale),
        maxLines = 1,
        softWrap = false,
        modifier = modifier,
        onTextLayout = { r -> if (r.didOverflowWidth && scale > 0.6f) scale = (scale - 0.08f).coerceAtLeast(0.6f) },
    )
}
