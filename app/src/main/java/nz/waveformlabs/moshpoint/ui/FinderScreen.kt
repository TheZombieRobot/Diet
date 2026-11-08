package nz.waveformlabs.moshpoint.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.ArrowStyle
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.locate.LocatorEngine

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
    /** Our own Light me up colour (from our key), e.g. blue. */
    myBeacon: nz.waveformlabs.moshpoint.core.BeaconColour.Colour = nz.waveformlabs.moshpoint.core.BeaconColour.palette[0],
    /** Can't reach them at all: send them a message asking them to go live. */
    onNudge: () -> Unit = {},
    /** Far away: see everyone on the map instead. */
    onOpenMap: () -> Unit = {},
    /** Close by: ask their phone to strobe. */
    onAskLight: () -> Unit = {},
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
                        "Look for flashing ${beaconing.joinToString(" and ")}!",
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
                        var asked by remember { mutableStateOf(false) }
                        TextButton(onClick = { onAskLight(); asked = true }, enabled = !asked) {
                            Text(
                                if (asked) "Asked: their phone will offer to light up" else "Ask them to light up",
                                style = Mosh.Label.copy(fontSize = 14.sp, color = if (asked) Mosh.TextFaint else Mosh.Lime),
                            )
                        }
                    } else {
                        GlassButton("Show on map", onClick = onOpenMap)
                    }
                }
            }
        }

        if (beaconOn) BeaconOverlay(Color(myBeacon.argb), myBeacon.name, onStop = { onBeacon(false) })

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
