package nz.waveformlabs.moshpoint.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
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
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.res.ResourcesCompat
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.PhotoStore
import nz.waveformlabs.moshpoint.R
import androidx.compose.foundation.clickable
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.ArrowStyle
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import kotlin.math.cos
import kotlin.math.sin

/** Closer than this counts as "found": confetti time. */
private const val FOUND_M = 3.0

/** After "keep the arrow", celebrate again only once they've moved this far away. */
private const val REARM_M = 8.0

/** Once showing, keep the celebration up until they're further than this. */
private const val FOUND_HIDE_M = 4.5

/**
 * The main screen (design canvas: Finding, Searching, Whole crew, Spin to scan, Found them).
 *
 * - Nobody in range: a radar sweeps while we look.
 * - In range: glowing arrows swivel on a spring, hot pink when far, sliding into the
 *   friend's colour as you close in, their photo at the tip; the distance rolls down.
 * - Distance only (no direction yet): warmer/colder and a nudge to Scan.
 * - Under 3 m: confetti.
 */
@Composable
fun FinderScreen(
    title: String,
    visible: Boolean,
    arrows: List<ArrowState>,
    friendOf: (String) -> Friend?,
    scan: LocatorEngine.ScanUi?,
    onScan: () -> Unit,
    onCancelScan: () -> Unit,
    onDismissScan: () -> Unit,
    /** A phone switch that's off (e.g. Bluetooth): shown at the top with its fix button. */
    warning: SetupIssue? = null,
    /** "Light me up" is on: our screen flashes so a mate can spot us. */
    beaconOn: Boolean = false,
    onBeacon: (Boolean) -> Unit = {},
    /** Mates flashing their screens for us right now. */
    beaconing: List<String> = emptyList(),
    /** Can't reach them at all: send them a message asking them to go live. */
    onNudge: () -> Unit = {},
    /** Far away: see everyone on the map instead. */
    onOpenMap: () -> Unit = {},
    onBack: () -> Unit,
    /** Only used in debug builds. Null in release. */
    debug: (@Composable (Modifier) -> Unit)? = null,
) {
    var showDebug by remember { mutableStateOf(false) }
    // Back goes to the friends list, not out of the app (the debug panel's own handler, added later, wins while it's open).
    val hasBack = androidx.activity.compose.LocalOnBackPressedDispatcherOwner.current != null // false in screenshot tests
    if (hasBack) androidx.activity.compose.BackHandler(onBack = onBack)
    val haptics = LocalHapticFeedback.current
    LaunchedEffect(scan?.done) {
        if (scan?.done == true) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
    }
    val pointing = arrows.filterIsInstance<ArrowState.Pointing>()
    val distanceOnly = arrows.filterIsInstance<ArrowState.DistanceOnly>()
    val scanning = scan != null && !scan.done

    // Found-them celebration: the closest friend under 3 m, unless you chose to keep the arrow.
    var dismissed by remember { mutableStateOf(setOf<String>()) }
    val distances = arrows.mapNotNull { a ->
        when (a) {
            is ArrowState.Pointing -> a.distanceM?.let { a.friendId to it }
            is ArrowState.DistanceOnly -> a.friendId to a.distanceM
            else -> null
        }
    }
    LaunchedEffect(distances) {
        val far = distances.filter { it.second > REARM_M }.map { it.first }.toSet()
        if (dismissed.any { it in far }) dismissed = dismissed - far
    }
    // Show under 3 m, keep showing until they're past 4.5 m, so a noisy reading at ~3 m
    // doesn't make it flicker on and off.
    // Plain holder (not state): it's recomputed whenever the distances change anyway.
    val showing = remember { arrayOfNulls<String>(1) }
    val showingDist = distances.firstOrNull { it.first == showing[0] }?.second
    if (showing[0] != null && (showingDist == null || showingDist > FOUND_HIDE_M || showing[0] in dismissed)) showing[0] = null
    if (showing[0] == null) {
        showing[0] = distances.filter { it.second < FOUND_M && it.first !in dismissed }.minByOrNull { it.second }?.first
    }
    val found = showing[0]
    LaunchedEffect(found) {
        if (found != null) haptics.performHapticFeedback(HapticFeedbackType.LongPress)
    }
    // Keep the last friend during the fade-out, so the overlay doesn't flash "them" / "?".
    val lastFound = remember { arrayOfNulls<String>(1) }
    if (found != null) lastFound[0] = found

    // Keep the screen awake while finding: it mustn't lock in the middle of the crowd.
    val view = androidx.compose.ui.platform.LocalView.current
    androidx.compose.runtime.DisposableEffect(Unit) {
        view.keepScreenOn = true
        onDispose { view.keepScreenOn = false }
    }

    // A light buzz each time you cross 50 / 20 / 10 / 5 m towards someone: feel it closing in.
    val nearest = distances.minOfOrNull { it.second }
    val bucket = when {
        nearest == null -> 0
        nearest < 5 -> 4
        nearest < 10 -> 3
        nearest < 20 -> 2
        nearest < 50 -> 1
        else -> 0
    }
    val lastBucket = remember { intArrayOf(bucket) }
    LaunchedEffect(bucket) {
        if (bucket > lastBucket[0]) haptics.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        lastBucket[0] = bucket
    }

    // The screen's mood colour: the closest friend's arrow colour, or ultraviolet while searching.
    val closest = pointing.minByOrNull { it.distanceM ?: Double.MAX_VALUE }
    val mood by animateColorAsState(
        when {
            scanning -> Mosh.Lime
            closest != null -> Color(ArrowStyle.arrowColor(friendOf(closest.friendId)?.color ?: ArrowStyle.RED, closest.distanceM))
            else -> Mosh.Violet
        },
        tween(900), label = "mood",
    )

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
        GlowBackground { listOf(Mosh.Violet, mood, Mosh.Pink) }
        Column(Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = 12.dp, bottom = 24.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) {
                    Text("‹  Friends", style = Mosh.Label.copy(fontWeight = FontWeight.Medium, fontSize = 15.sp))
                }
                Spacer(Modifier.weight(1f))
                if ((BuildConfig.DEBUG && DebugStatus.showUi) && debug != null) {
                    TextButton(onClick = { showDebug = !showDebug }) {
                        Text(if (showDebug) "Hide debug" else "Debug", style = Mosh.Eyebrow)
                    }
                }
                LivePill(visible)
            }

            if (warning != null) {
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp).background(Color(0xFF3A2A12), RoundedCornerShape(14.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(warning.text, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.Amber), modifier = Modifier.weight(1f))
                    TextButton(onClick = warning.onFix) { Text(warning.button, style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber)) }
                }
            }
            if (beaconing.isNotEmpty()) {
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp).background(Color(0xFF123A2A), RoundedCornerShape(14.dp))
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "${beaconing.joinToString(" & ")} ${if (beaconing.size == 1) "is" else "are"} flashing their screen. Look around for it!",
                        style = Mosh.Body.copy(fontSize = 14.sp, lineHeight = 18.sp, color = Mosh.Lime),
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(if (scanning) "SCANNING FOR" else "FINDING", style = Mosh.Eyebrow)
            Spacer(Modifier.height(6.dp))
            Text(
                title,
                style = if (title.length > 12) Mosh.Title.copy(fontSize = 26.sp) else Mosh.Title,
                maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )

            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                when {
                    scanning -> ScanProgress(scan!!)
                    pointing.isEmpty() && distanceOnly.isEmpty() -> Searching(title)
                    else -> {
                        // Radar rings around arrows only: behind a big distance number they'd cut through it.
                        if (pointing.isNotEmpty()) Box(Modifier.fillMaxSize(0.92f)) { RadarPulse({ mood.copy(alpha = 0.7f) }) }
                        Arrows(pointing, friendOf, group = arrows.size > 1)
                        if (pointing.isEmpty()) DistanceOnly(distanceOnly, friendOf)
                    }
                }
            }

            if (!scanning && arrows.size == 1 && pointing.size == 1) {
                val a = pointing[0]
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    DistanceReadout(a.distanceM)
                    Spacer(Modifier.height(8.dp))
                    Chip(
                        if (a.unsure) "Rough" else "Locked",
                        if (a.unsure) Mosh.Amber else Mosh.Lime,
                        when {
                            !a.unsure -> "Head this way"
                            a.method == Method.GPS_SERVER || a.method == Method.CROWD_RELAY -> "From GPS: firms up as you walk"
                            else -> "Rough: walk that way and watch the distance"
                        },
                    )
                }
                Spacer(Modifier.height(20.dp))
            }
            if (!scanning && arrows.size > 1 && pointing.isNotEmpty()) {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 14.dp)) {
                    Box(
                        Modifier.width(54.dp).height(6.dp).background(
                            Brush.horizontalGradient(listOf(Mosh.Pink, Color(0xFFC86BFF), Mosh.Cyan)),
                            RoundedCornerShape(3.dp),
                        ),
                    )
                    Spacer(Modifier.width(10.dp))
                    Text("Hot pink is far. Arrows glow your mate's colour as you get close.", style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 16.sp, color = Mosh.TextFaint))
                }
            }

            when {
                // Busy venue, interference: you can always start over.
                scanning -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    GlassButton("Cancel", Modifier.weight(1f), onClick = onCancelScan)
                    GlassButton("Restart scan", Modifier.weight(1f), icon = true, onClick = onScan)
                }
                scan != null && scan.done -> {
                    Text(
                        scan.outcome.ifBlank { "Scan finished" },
                        style = Mosh.Body.copy(color = Mosh.Text),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        NeonButton("OK", Modifier.weight(1f), onClick = onDismissScan)
                        GlassButton("Scan again", Modifier.weight(1f), onClick = onScan)
                    }
                }
                // Can't hear anyone yet: explain, but still let them try (signals come and go in a crowd).
                arrows.isNotEmpty() && arrows.all { it is ArrowState.NoSignal } -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        GlassButton("Ask them", Modifier.weight(1f), onClick = onNudge)
                        GlassButton("Last seen on map", Modifier.weight(1f), onClick = onOpenMap)
                    }
                }
                // Only offer the close-up tools when they're actually close: the app picks the
                // method by itself (GPS far away, Bluetooth up close).
                else -> {
                    val near = arrows.any {
                        it is ArrowState.DistanceOnly || (it is ArrowState.Pointing && (it.distanceM ?: 0.0) < 60.0)
                    }
                    val needsDirection = arrows.any {
                        it is ArrowState.DistanceOnly || (it is ArrowState.Pointing && it.unsure && (it.distanceM ?: 0.0) < 40.0)
                    }
                    if (near) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            GlassButton("Light me up", Modifier.weight(1f), onClick = { onBeacon(true) })
                            if (needsDirection) GlassButton("Spin scan", Modifier.weight(1f), icon = true, onClick = onScan)
                        }
                    } else {
                        GlassButton("Show on map", onClick = onOpenMap)
                    }
                }
            }
        }

        if (beaconOn) BeaconOverlay(onStop = { onBeacon(false) })

        AnimatedVisibility(found != null, enter = fadeIn(tween(250)), exit = fadeOut(tween(300))) {
            val id = found ?: lastFound[0]
            FoundOverlay(
                friend = id?.let(friendOf),
                onDone = onBack,
                onKeep = { id?.let { dismissed = dismissed + it } },
            )
        }

        if ((BuildConfig.DEBUG && DebugStatus.showUi) && debug != null && showDebug) {
            Box(Modifier.align(Alignment.TopCenter).fillMaxWidth().fillMaxHeight(0.62f)) {
                debug(Modifier.fillMaxSize())
                // The panel covers the top bar (and its "Hide debug" button), so it needs its own close.
                TextButton(
                    onClick = { showDebug = false },
                    modifier = Modifier.align(Alignment.TopEnd).padding(4.dp)
                        .background(Color(0xFF2A2140), RoundedCornerShape(12.dp)),
                ) { Text("✕  Close", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber)) }
            }
            // Back closes the panel first, before leaving the finder.
            if (hasBack) androidx.activity.compose.BackHandler { showDebug = false }
        }
    }
}

// ---------------------------------------------------------------------------------------
// Pieces

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
        Text(if (live) "Live" else "Hidden", style = Mosh.Body.copy(fontSize = 13.sp))
    }
}

@Composable
private fun Chip(label: String, colour: Color, text: String) {
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
private fun DistanceReadout(distanceM: Double?) {
    val label = ArrowStyle.distanceLabel(distanceM)
    if (label.startsWith("<") || label == "?") {
        Text(if (label == "?") "?" else "< 1 m", style = Mosh.Distance.copy(fontSize = 44.sp, lineHeight = 48.sp))
        return
    }
    val num = label.substringBefore(' ')
    val unit = label.substringAfter(' ', "")
    Row(verticalAlignment = Alignment.Bottom) {
        RollingText(num, Mosh.Distance)
        if (unit.isNotEmpty()) {
            Spacer(Modifier.width(6.dp))
            Text(unit, style = Mosh.Heading.copy(fontSize = 28.sp, color = Mosh.TextFaint), modifier = Modifier.padding(bottom = 6.dp))
        }
    }
}

/** Glass button with a bouncy press. */
@Composable
fun GlassButton(text: String, modifier: Modifier = Modifier.fillMaxWidth(), icon: Boolean = false, onClick: () -> Unit) {
    val (source, scale) = rememberPress()
    OutlinedButton(
        onClick, modifier.heightIn(min = 58.dp).pressScale(scale),
        shape = RoundedCornerShape(18.dp),
        border = BorderStroke(1.dp, Mosh.Line),
        colors = ButtonDefaults.outlinedButtonColors(containerColor = Mosh.Surface, contentColor = Mosh.Text),
        // Narrower than Material's 24dp so two buttons side by side fit on small phones.
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 10.dp),
        interactionSource = source,
    ) {
        if (icon) {
            Canvas(Modifier.size(18.dp)) { drawRefreshIcon(Mosh.Text) }
            Spacer(Modifier.width(10.dp))
        }
        Text(text, style = Mosh.Label, textAlign = androidx.compose.ui.text.style.TextAlign.Center)
    }
}

/** The neon gradient button (pink -> violet -> cyan) with a sweeping shimmer. */
@Composable
fun NeonButton(text: String, modifier: Modifier = Modifier.fillMaxWidth(), onClick: () -> Unit) {
    val (source, scale) = rememberPress()
    val shine = rememberShimmer()
    Button(
        onClick,
        modifier.heightIn(min = 58.dp).pressScale(scale)
            // Neon underglow: Android's coloured shadow, drawn by the GPU.
            .shadow(18.dp, RoundedCornerShape(18.dp), ambientColor = Mosh.Pink, spotColor = Mosh.Pink)
            .clip(RoundedCornerShape(18.dp))
            .background(Brush.linearGradient(listOf(Mosh.Pink, Mosh.Violet, Mosh.Cyan)))
            .graphicsLayer() // the shimmer redraws only this layer
            .shimmer { shine.value },
        shape = RoundedCornerShape(18.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent, contentColor = Color.White),
        interactionSource = source,
    ) { Text(text, style = Mosh.Button.copy(color = Color.White)) }
}

@Composable
private fun Searching(name: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(30.dp)) {
        Box(Modifier.size(240.dp).semantics { contentDescription = "Searching" }, contentAlignment = Alignment.Center) {
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
            Text("Looking for $name…", style = Mosh.Heading, textAlign = TextAlign.Center)
            Spacer(Modifier.height(10.dp))
            Text(
                "No signal from them and no shared location yet. They need Moshpoint open with Go live on, plus location and mobile data. " +
                    "Then their arrow appears, even if they're across town.",
                style = Mosh.Body, textAlign = TextAlign.Center,
            )
        }
    }
}

@Composable
private fun DistanceOnly(list: List<ArrowState.DistanceOnly>, friendOf: (String) -> Friend?) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        list.forEach { d ->
            val f = friendOf(d.friendId)
            val colour by animateColorAsState(Color(ArrowStyle.arrowColor(f?.color ?: ArrowStyle.RED, d.distanceM)), tween(700), label = "c")
            Box(Modifier.size(if (list.size > 1) 12.dp else 18.dp).drawBehind {
                glow(colour, 12.dp.toPx(), 0.9f) { p -> drawContext.canvas.drawCircle(center, size.minDimension / 2, p) }
                drawCircle(colour)
            })
            if (list.size > 1) {
                RollingText(ArrowStyle.distanceLabel(d.distanceM), Mosh.Distance.copy(fontSize = 32.sp, lineHeight = 34.sp))
            } else {
                DistanceReadout(d.distanceM)
            }
            val (label, c, hint) = when (d.trend) {
                Trend.WARMER -> Triple("Warmer", Mosh.Lime, "Keep going this way")
                Trend.COLDER -> Triple("Colder", Mosh.Pink, "Turn around")
                Trend.STEADY -> Triple("Steady", Mosh.Cyan, "Try another direction")
            }
            val who = if (list.size > 1) "${f?.name ?: "?"}: " else ""
            val via = if ((BuildConfig.DEBUG && DebugStatus.showUi)) "  (${methodLabel(d.method)})" else ""
            Chip(label, c, "$who$hint$via")
        }
        Spacer(Modifier.height(4.dp))
        Text(
            "Walk a few steps one way, then another. Warmer means you're getting closer. The arrow appears once we've worked out which way.",
            style = Mosh.Body, textAlign = TextAlign.Center,
        )
    }
}

/**
 * Keeps an arrow's angle continuous (e.g. 350° -> 370° rather than 350° -> 10°) so the
 * spring swivels the short way round instead of spinning backwards through 180°.
 */
@Composable
private fun animatedAngle(targetDeg: Double): Float {
    // Plain holder (not Compose state): updating it mid-composition mustn't trigger recomposition.
    val last = remember { FloatArray(1) { targetDeg.toFloat() } }
    val delta = (((targetDeg - last[0]) % 360 + 540) % 360 - 180).toFloat()
    last[0] += delta
    val anim by animateFloatAsState(
        last[0],
        animationSpec = spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMedium), // quick, no wobble
        label = "arrow",
    )
    return anim
}

@Composable
private fun Arrows(arrows: List<ArrowState.Pointing>, friendOf: (String) -> Friend?, group: Boolean) {
    // Per-friend animated angle and colour (hot pink sliding into their colour).
    val angles = arrows.associate { a -> a.friendId to key(a.friendId) { animatedAngle(a.relativeDeg) } }
    val colours = arrows.associate { a ->
        a.friendId to key(a.friendId, "c") {
            val target = Color(ArrowStyle.arrowColor(friendOf(a.friendId)?.color ?: ArrowStyle.RED, a.distanceM))
            animateColorAsState(target, tween(800), label = "colour").value
        }
    }
    val t = rememberInfiniteTransition(label = "breathe")
    val breathe by t.ambient(0.55f, 1f, infiniteRepeatable(tween(1400, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "b")
    val spin by t.ambient(0f, 360f, infiniteRepeatable(tween(5000, easing = LinearEasing)), label = "spin")

    val context = LocalContext.current
    val display = remember { runCatching { ResourcesCompat.getFont(context, R.font.unbounded_extrabold) }.getOrNull() }
    val regular = remember { runCatching { ResourcesCompat.getFont(context, R.font.inter_regular) }.getOrNull() }
    // One paint per typeface, reused every frame.
    val displayPaint = remember { textPaint(display) }
    val regularPaint = remember { textPaint(regular) }

    // Screen readers: "Sam, 12 metres, at 2 o'clock".
    val spoken = arrows.joinToString(". ") { a ->
        val name = friendOf(a.friendId)?.name ?: "Friend"
        val clock = (((a.relativeDeg + 360) % 360) / 30).let { kotlin.math.round(it).toInt() }.let { if (it == 0) 12 else it }
        val dist = a.distanceM?.let { "${ArrowStyle.distanceLabel(it).replace(" m", " metres").replace(" km", " kilometres")}, " } ?: ""
        "$name, ${dist}at $clock o'clock" + if (a.unsure) ", rough direction" else ""
    }
    Canvas(Modifier.fillMaxSize().semantics { contentDescription = spoken }) {
        val centre = Offset(size.width / 2, size.height / 2)
        val avatarR = if (group) 26.dp.toPx() else 32.dp.toPx()
        val chipW = 84.dp.toPx()
        val chipH = 44.dp.toPx()
        // Fit arrow + photo inside the screen at any angle (360dp phones included); in a
        // group the name chip sits beyond the photo, so leave room for half its width too.
        val margin = if (group) 6.dp.toPx() + chipW / 2 else 4.dp.toPx()
        val length = (size.minDimension / 2 - 2 * avatarR - 8.dp.toPx() - margin).coerceAtLeast(40.dp.toPx())
        if (group) {
            haloGlow(centre, 7.dp.toPx(), 10.dp.toPx(), Color.White, 0.8f)
            drawCircle(Mosh.Text, radius = 7.dp.toPx(), center = centre)
        }
        arrows.forEach { a ->
            val friend = friendOf(a.friendId)
            val colour = (colours[a.friendId] ?: Mosh.Pink).copy(alpha = if (a.unsure) 0.6f else 1f)
            val angle = angles[a.friendId] ?: a.relativeDeg.toFloat()
            val path = arrowPath(centre, length, if (group) 0.24f else 0.34f)

            rotate(angle, pivot = centre) {
                // Breathing neon glow, then a white-hot tip fading into their colour and ultraviolet.
                softGlow(path, colour, 30.dp.toPx(), breathe)
                drawPath(
                    path,
                    Brush.verticalGradient(
                        0f to Color.White, 0.16f to colour, 1f to lerp(colour, Mosh.Violet, 0.6f),
                        startY = centre.y - length, endY = centre.y,
                    ),
                )
            }

            // Their photo (or initial) at the tip, in a spinning neon ring.
            val rad = Math.toRadians(angle.toDouble())
            val reach = length + avatarR + 8.dp.toPx()
            val tip = Offset(centre.x + reach * sin(rad).toFloat(), centre.y - reach * cos(rad).toFloat())
            haloGlow(tip, avatarR, 16.dp.toPx(), colour, 0.75f * breathe)
            drawCircle(Mosh.Avatar, radius = avatarR, center = tip)
            val photo = PhotoStore.photos[a.friendId]
            if (photo != null) {
                clipPath(Path().apply { addOval(Rect(tip, avatarR - 3.dp.toPx())) }) {
                    drawImage(
                        photo,
                        dstOffset = IntOffset((tip.x - avatarR).toInt(), (tip.y - avatarR).toInt()),
                        dstSize = IntSize((avatarR * 2).toInt(), (avatarR * 2).toInt()),
                    )
                }
            } else {
                drawCentred(friend?.name?.take(1)?.uppercase() ?: "?", tip, avatarR * 0.72f, Mosh.Text, displayPaint)
            }
            rotate(spin, pivot = tip) {
                drawCircle(
                    Brush.sweepGradient(listOf(colour, Mosh.Violet, colour), center = tip),
                    radius = avatarR, center = tip, style = Stroke(3.5f.dp.toPx()),
                )
            }

            if (group) {
                // Glass chip with distance + name, placed further out along the arrow's
                // direction, so it never covers another arrow.
                val ux = sin(rad).toFloat()
                val uy = -cos(rad).toFloat()
                val extent = kotlin.math.abs(ux) * chipW / 2 + kotlin.math.abs(uy) * chipH / 2
                val cc = Offset(tip.x + ux * (avatarR + 6.dp.toPx() + extent), tip.y + uy * (avatarR + 6.dp.toPx() + extent))
                val top = Offset(cc.x - chipW / 2, cc.y - chipH / 2)
                drawRoundRect(colour.copy(alpha = 0.12f), top, Size(chipW, chipH), CornerRadius(14.dp.toPx()))
                drawRoundRect(colour.copy(alpha = 0.40f), top, Size(chipW, chipH), CornerRadius(14.dp.toPx()), style = Stroke(1.dp.toPx()))
                val inner = chipW - 10.dp.toPx()
                val who = (friend?.name ?: "?") + if ((BuildConfig.DEBUG && DebugStatus.showUi)) " · " + methodLabel(a.method) + (if (a.unsure) "?" else "") else ""
                drawCentred(ArrowStyle.distanceLabel(a.distanceM), Offset(cc.x, top.y + 15.dp.toPx()), 14.dp.toPx(), colour, displayPaint, inner)
                drawCentred(who, Offset(cc.x, top.y + 31.dp.toPx()), 11.5f.dp.toPx(), Mosh.TextDim, regularPaint, inner)
            }
            if ((BuildConfig.DEBUG && DebugStatus.showUi) && !group) {
                // Test builds only: which method is driving this arrow (in a group it's in the chip).
                drawCentred(methodLabel(a.method) + if (a.unsure) "?" else "", Offset(tip.x, tip.y - avatarR - 10.dp.toPx()), 10.dp.toPx(), Mosh.TextFaint, regularPaint)
            }
        }
    }
}

private fun lerp(a: Color, b: Color, t: Float) = Color(
    red = a.red + (b.red - a.red) * t, green = a.green + (b.green - a.green) * t,
    blue = a.blue + (b.blue - a.blue) * t, alpha = a.alpha + (b.alpha - a.alpha) * t,
)

/**
 * Spin-to-scan: a lime arc fills as you cover the circle (a light sweeps round inside),
 * drawn relative to the phone so the white dot is the way you're facing.
 */
@Composable
private fun ScanProgress(scan: LocatorEngine.ScanUi) {
    val pct = (scan.coverageDeg / 360.0 * 100).toInt().coerceIn(0, 100)
    val t = rememberInfiniteTransition(label = "scan")
    val pulse by t.ambient(1f, 1.06f, infiniteRepeatable(tween(1000, easing = FastOutSlowInEasing), RepeatMode.Reverse), label = "p")
    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(36.dp)) {
        Box(Modifier.size(260.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.size(236.dp).clip(CircleShape)) { RadarSweep(Mosh.Lime, periodMs = 2400) }
            Canvas(Modifier.fillMaxSize().semantics { contentDescription = "$pct percent of the circle covered" }) {
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
                    "$pct%",
                    style = Mosh.Distance.copy(fontSize = 40.sp, lineHeight = 44.sp, color = Mosh.Lime, shadow = Shadow(Mosh.Lime.copy(alpha = 0.7f), blurRadius = 24f)),
                )
                Text(
                    if (scan.heard == 0) "listening…" else "heard them ${scan.heard}×",
                    style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint),
                )
            }
        }
        Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.widthIn(max = 300.dp)) {
            Text("Spin slowly", style = Mosh.Heading)
            Spacer(Modifier.height(10.dp))
            Text(
                "Hold the phone against your chest, screen facing you, and turn slowly on the spot: about 15 seconds for a full circle. " +
                    "Your body blocks the signal, so we can tell which way they are.",
                style = Mosh.Body, textAlign = TextAlign.Center,
            )
        }
    }
}

/** "You found them!": confetti, their photo bursting in on a spinning neon ring. */
@Composable
private fun FoundOverlay(friend: Friend?, onDone: () -> Unit, onKeep: () -> Unit) {
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
                val photo = friend?.let { PhotoStore.photos[it.id] }
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
                    "UNDER 3 METRES",
                    style = Mosh.Eyebrow.copy(color = Mosh.Lime, letterSpacing = 3.sp, shadow = Shadow(Mosh.Lime.copy(alpha = 0.8f), blurRadius = 18f)),
                )
                Spacer(Modifier.height(10.dp))
                Text(
                    "You found ${friend?.name ?: "them"}",
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
                Text("Look up and wave.", style = Mosh.Body)
                Spacer(Modifier.height(36.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    NeonButton("Done", Modifier.weight(1f), onClick = onDone)
                    GlassButton("Keep the arrow", Modifier.weight(1f), onClick = onKeep)
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------------------
// Drawing helpers

private fun methodLabel(m: Method) = when (m) {
    Method.UWB -> "UWB"
    Method.SPIN_SCAN -> "scan"
    Method.WALK -> "walk"
    Method.GPS_SERVER -> "GPS"
    Method.CROWD_RELAY -> "crowd"
    Method.WIFI_AWARE -> "Wi-Fi"
    Method.BLE_RSSI -> "BT"
}

/** The Moshpoint arrow, pointing up from [centre]: broad head, rounded shaft. */
private fun arrowPath(centre: Offset, length: Float, headRatio: Float): Path {
    val w = length * headRatio
    val headH = w * 1.35f
    val shaft = w * 0.32f
    val r = shaft * 0.9f
    return Path().apply {
        moveTo(centre.x, centre.y - length)
        lineTo(centre.x + w, centre.y - length + headH)
        lineTo(centre.x + shaft, centre.y - length + headH)
        lineTo(centre.x + shaft, centre.y - r)
        quadraticTo(centre.x + shaft, centre.y, centre.x, centre.y)
        quadraticTo(centre.x - shaft, centre.y, centre.x - shaft, centre.y - r)
        lineTo(centre.x - shaft, centre.y - length + headH)
        lineTo(centre.x - w, centre.y - length + headH)
        close()
    }
}

private fun textPaint(face: android.graphics.Typeface?) = android.graphics.Paint().apply {
    isAntiAlias = true
    textAlign = android.graphics.Paint.Align.CENTER
    if (face != null) typeface = face
}

/**
 * Text centred on [at] (horizontally and by its real ascent/descent, so wide display
 * fonts sit visually centred), shortened with "…" if wider than [maxWidth].
 */
private fun DrawScope.drawCentred(
    text: String, at: Offset, sizePx: Float, colour: Color, paint: android.graphics.Paint, maxWidth: Float = Float.MAX_VALUE,
) {
    paint.textSize = sizePx
    paint.color = colour.toArgb()
    var t = text
    if (paint.measureText(t) > maxWidth) {
        while (t.length > 1 && paint.measureText("$t…") > maxWidth) t = t.dropLast(1)
        t = "$t…"
    }
    val fm = paint.fontMetrics
    drawContext.canvas.nativeCanvas.drawText(t, at.x, at.y - (fm.ascent + fm.descent) / 2, paint)
}

/** Circular "refresh" arrow used on the Scan button. */
private fun DrawScope.drawRefreshIcon(colour: Color) {
    val s = size.minDimension
    drawArc(colour, startAngle = -60f, sweepAngle = 300f, useCenter = false, style = Stroke(s * 0.11f, cap = StrokeCap.Round))
    val p = Path().apply {
        moveTo(s * 0.98f, s * 0.05f)
        lineTo(s * 0.98f, s * 0.42f)
        lineTo(s * 0.62f, s * 0.42f)
        close()
    }
    drawPath(p, colour)
}

/**
 * "Light me up": the whole screen strobes bright colours so a mate can pick you out of a
 * crowd from a distance (hold the phone up high). Tap anywhere to stop.
 */
@Composable
private fun BeaconOverlay(onStop: () -> Unit) {
    val colours = listOf(Mosh.Pink, Mosh.Cyan, Mosh.Lime, Color.White)
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
            .background(if (on) colours[(i / 2) % colours.size] else Color.Black)
            .clickable(onClick = onStop),
        contentAlignment = Alignment.BottomCenter,
    ) {
        Text(
            "Hold your phone up high. Tap to stop.",
            style = Mosh.Body.copy(color = if (on) Color.Black else Color.White, fontSize = 15.sp),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(bottom = 48.dp),
        )
    }
}
