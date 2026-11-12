package nz.waveformlabs.moshpoint.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.togetherWith
import androidx.compose.animation.scaleIn
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.wrapContentWidth
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.R
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
    /** We got within a few metres of [friendId] (the celebration showed). */
    onFound: (String) -> Unit = {},
    /** Mates on a floor above or below us (see core Floors): tagged on their face. */
    floors: Map<String, nz.waveformlabs.moshpoint.core.Floor> = emptyMap(),
    /**
     * Mates' standing "I'm here" pins (docs/IM_HERE.md). Where the arrow points at the pin, the
     * face wears the spot's floor (not theirs now) and says how long ago it was pinned.
     */
    pinned: Map<String, PinNote> = emptyMap(),
    /** "Message Sam" for the one mate on screen (docs/PRIVATE_MESSAGES.md); null = not offered. */
    onMessage: ((String) -> Unit)? = null,
    /** Unread private messages per mate, on that button. */
    messageUnread: Map<String, Int> = emptyMap(),
    onBack: () -> Unit,
    /** Only used in debug builds. Null in release. */
    debug: (@Composable (Modifier) -> Unit)? = null,
) {
    var showDebug by remember { mutableStateOf(false) }
    // Arrows pointing at an "I'm here" pin: the floor shown is the pinned spot's.
    val viaPin = arrows.filter { it is ArrowState.Pointing && it.method == Method.HERE_PIN && it.friendId in pinned }.map { it.friendId }.toSet()
    @Suppress("NAME_SHADOWING")
    val floors = floors.filterKeys { it !in viaPin } + viaPin.mapNotNull { id -> pinned[id]?.floor?.let { id to it } }
    val pinNotes = viaPin.associateWith { id -> pinnedAgo(pinned.getValue(id).ageSec) }
    val floorLabels = floors.mapValues { floorLabel(it.value) }
    val floorsSpoken = floors.mapValues { floorSpoken(it.value) }
    // Whole crew: every mate's arrow at once. Tap one (their bubble, or in the strip below) to
    // find just them; back, or "‹ Everyone", returns to the whole crew.
    val everyone = arrows
    val crewView = everyone.size > 1
    var focus by remember { mutableStateOf<String?>(null) }
    if (focus != null && everyone.none { it.friendId == focus }) focus = null
    // Tapped a stack of mates on the radar: the strip shows just them, to pick who.
    var pickFrom by remember { mutableStateOf<List<String>?>(null) }
    if (focus != null) pickFrom = null
    @Suppress("NAME_SHADOWING")
    val arrows = focus?.let { f -> everyone.filter { it.friendId == f } } ?: everyone
    val shownTitle = focus?.let { friendOf(it)?.name } ?: title
    // Back goes to the whole crew (if focused), else the friends list, not out of the app
    // (the debug panel's own handler, added later, wins while it's open).
    val hasBack = androidx.activity.compose.LocalOnBackPressedDispatcherOwner.current != null // false in screenshot tests
    if (hasBack) androidx.activity.compose.BackHandler { if (focus != null) focus = null else onBack() }
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
        // Three metres away but a floor apart isn't found yet: no confetti through the ceiling.
        showing[0] = distances.filter { it.second < FOUND_M && it.first !in dismissed && it.first !in floors }.minByOrNull { it.second }?.first
    }
    val found = showing[0]
    if (!scanning) FindHaptics(arrows)
    LaunchedEffect(found) { if (found != null) onFound(found) }
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
                TextButton(onClick = { if (focus != null) focus = null else onBack() }) {
                    Text(
                        stringResource(if (focus != null) R.string.find_back_everyone else R.string.find_back_friends),
                        style = Mosh.Label.copy(fontWeight = FontWeight.Medium, fontSize = 15.sp),
                    )
                }
                Spacer(Modifier.weight(1f))
                if ((BuildConfig.TEST_BUILD && DebugStatus.showUi) && debug != null) {
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
                        stringResource(R.string.find_look_for_flashing, beaconing.joinToString(stringResource(R.string.find_list_and))),
                        style = Mosh.Body.copy(fontSize = 14.sp, lineHeight = 18.sp, color = Mosh.Lime),
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(if (scanning) stringResource(R.string.find_eyebrow_scanning) else stringResource(R.string.find_eyebrow_finding), style = Mosh.Eyebrow)
            Spacer(Modifier.height(6.dp))
            Text(
                shownTitle,
                style = if (shownTitle.length > 12) Mosh.Title.copy(fontSize = 26.sp) else Mosh.Title,
                maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
            )
            // Finding one mate: write to them privately from here.
            val oneMate = focus ?: everyone.singleOrNull()?.friendId
            val oneName = oneMate?.let { friendOf(it)?.name }
            if (onMessage != null && oneMate != null && oneName != null && !scanning) {
                Row(
                    Modifier.clickable { onMessage(oneMate) }.padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(stringResource(R.string.private_message_name, oneName), style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Violet))
                    messageUnread[oneMate]?.let { n ->
                        Spacer(Modifier.width(8.dp))
                        UnreadBadge(n)
                    }
                }
            }

            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                if (scanning) {
                    ScanProgress(scan!!)
                } else {
                    // Crew ↔ one mate: the other arrows fade away and theirs settles in.
                    AnimatedContent(
                        targetState = focus,
                        transitionSpec = {
                            (fadeIn(tween(280)) + scaleIn(tween(280), initialScale = if (targetState != null) 0.9f else 1.08f))
                                .togetherWith(fadeOut(tween(180)))
                        },
                        label = "focus",
                    ) { f ->
                        val shown = f?.let { id -> everyone.filter { it.friendId == id } } ?: everyone
                        val p = shown.filterIsInstance<ArrowState.Pointing>()
                        val d = shown.filterIsInstance<ArrowState.DistanceOnly>()
                        Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            if (p.isEmpty() && d.isEmpty()) {
                                Searching(f?.let { friendOf(it)?.name } ?: title)
                            } else {
                                // Radar rings around arrows only: behind a big distance number they'd cut through it.
                                if (p.isNotEmpty()) Box(Modifier.fillMaxSize(0.92f)) { RadarPulse({ mood.copy(alpha = 0.7f) }) }
                                if (shown.size > 1) {
                                    // The whole crew as a radar: near mates close in, far ones out, stacks when they overlap.
                                    CrewRadar(p, friendOf, onTap = { id -> focus = id }, onTapGroup = { ids -> pickFrom = ids }, floors = floorLabels, notes = pinNotes)
                                } else {
                                    Arrows(p, friendOf, group = false, floors = floorLabels, floorsSpoken = floorsSpoken)
                                }
                                if (p.isEmpty()) DistanceOnly(d, friendOf, floors)
                            }
                        }
                    }
                }
            }

            if (!scanning && arrows.size == 1 && pointing.size == 1) {
                val a = pointing[0]
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    DistanceReadout(a.distanceM)
                    Spacer(Modifier.height(8.dp))
                    Chip(
                        if (a.unsure) stringResource(R.string.find_chip_rough) else stringResource(R.string.find_chip_locked),
                        if (a.unsure) Mosh.Amber else Mosh.Lime,
                        when {
                            // Pointing at the spot they pinned: say so, and how long ago.
                            a.method == Method.HERE_PIN && a.friendId in pinned -> stringResource(R.string.here_finder_chip, ago(pinned.getValue(a.friendId).ageSec))
                            !a.unsure -> stringResource(R.string.find_head_this_way)
                            a.method == Method.GPS_SERVER || a.method == Method.CROWD_RELAY -> stringResource(R.string.find_from_gps)
                            else -> stringResource(R.string.find_rough_walk)
                        },
                    )
                }
                Spacer(Modifier.height(20.dp))
            }
            // Everyone in the crew, including mates with no direction or no signal yet: tap to focus.
            if (!scanning && crewView && focus == null) {
                CrewStrip(pickFrom?.let { ids -> everyone.filter { it.friendId in ids } } ?: everyone, friendOf, onPick = { focus = it }, floors = floors)
                Spacer(Modifier.height(10.dp))
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
                    Text(stringResource(R.string.find_colour_legend), style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 16.sp, color = Mosh.TextFaint))
                }
            }

            when {
                // Busy venue, interference: you can always start over.
                scanning -> Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    GlassButton(stringResource(R.string.find_cancel), Modifier.weight(1f), onClick = onCancelScan)
                    GlassButton(stringResource(R.string.find_restart_scan), Modifier.weight(1f), icon = true, onClick = onScan)
                }
                scan != null && scan.done -> {
                    Text(
                        scan.outcome.ifBlank { stringResource(R.string.find_scan_finished) },
                        style = Mosh.Body.copy(color = Mosh.Text),
                        textAlign = TextAlign.Center,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        NeonButton(stringResource(R.string.find_ok), Modifier.weight(1f), onClick = onDismissScan)
                        GlassButton(stringResource(R.string.find_scan_again), Modifier.weight(1f), onClick = onScan)
                    }
                }
                // Can't hear anyone yet: explain, but still let them try (signals come and go in a crowd).
                arrows.isNotEmpty() && arrows.all { it is ArrowState.NoSignal } -> {
                    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        GlassButton(stringResource(R.string.find_ask_them), Modifier.weight(1f), onClick = onNudge)
                        GlassButton(stringResource(R.string.find_last_seen_on_map), Modifier.weight(1f), onClick = onOpenMap)
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
                            GlassButton(stringResource(R.string.find_light_me_up), Modifier.weight(1f), onClick = { onBeacon(true) })
                            if (needsDirection) GlassButton(stringResource(R.string.find_spin_scan), Modifier.weight(1f), icon = true, onClick = onScan)
                        }
                        var asked by remember { mutableStateOf(false) }
                        TextButton(onClick = { onAskLight(); asked = true }, enabled = !asked) {
                            Text(
                                if (asked) stringResource(R.string.find_asked_light_up) else stringResource(R.string.find_ask_light_up),
                                style = Mosh.Label.copy(fontSize = 14.sp, color = if (asked) Mosh.TextFaint else Mosh.Lime),
                            )
                        }
                    } else {
                        GlassButton(stringResource(R.string.find_show_on_map), onClick = onOpenMap)
                    }
                }
            }
        }

        if (beaconOn) BeaconOverlay(Color(myBeacon.argb), beaconColourName(myBeacon), onStop = { onBeacon(false) })

        AnimatedVisibility(found != null, enter = fadeIn(tween(250)), exit = fadeOut(tween(300))) {
            val id = found ?: lastFound[0]
            FoundOverlay(
                friend = id?.let(friendOf),
                onDone = onBack,
                onKeep = { id?.let { dismissed = dismissed + it } },
            )
        }

        if ((BuildConfig.TEST_BUILD && DebugStatus.showUi) && debug != null && showDebug) {
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

/**
 * The whole crew in one row: each mate's face in a ring of their arrow colour (pink when far,
 * their own colour up close, grey with no signal) and how far away they are. Tap to find just them.
 */
@Composable
internal fun CrewStrip(
    arrows: List<ArrowState>,
    friendOf: (String) -> Friend?,
    onPick: (String) -> Unit,
    floors: Map<String, nz.waveformlabs.moshpoint.core.Floor> = emptyMap(),
) {
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Row(
            Modifier.horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            arrows.sortedBy { a ->
                when (a) {
                    is ArrowState.Pointing -> a.distanceM ?: 9e6
                    is ArrowState.DistanceOnly -> a.distanceM
                    else -> 1e9
                }
            }.forEach { a ->
                val f = friendOf(a.friendId) ?: return@forEach
                val dist = when (a) {
                    is ArrowState.Pointing -> a.distanceM
                    is ArrowState.DistanceOnly -> a.distanceM
                    else -> null
                }
                // Ring in their own colour (as their name in chat); the distance warms into it.
                val ring = if (a is ArrowState.NoSignal) Color(f.color).copy(alpha = 0.35f) else Color(f.color)
                val warmth by animateColorAsState(
                    if (a is ArrowState.NoSignal) Mosh.TextFaint else Color(ArrowStyle.arrowColor(f.color, dist)),
                    tween(800), label = "warmth",
                )
                val (src, sc) = rememberPress()
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.pressScale(sc).clickable(interactionSource = src, indication = null) { onPick(a.friendId) }
                        .padding(4.dp),
                ) {
                    Box(contentAlignment = Alignment.BottomCenter) {
                        Box(Modifier.size(50.dp).border(2.5.dp, ring, CircleShape).padding(4.dp), contentAlignment = Alignment.Center) {
                            Avatar(f, 42.dp)
                        }
                        // On another floor: the tag sits on the bottom of their face (it may be wider than the face).
                        floors[a.friendId]?.let { FloorTag(it, Modifier.wrapContentWidth(unbounded = true).offset(y = 6.dp)) }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        f.name, style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 14.sp, color = Mosh.Text),
                        maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 72.dp),
                    )
                    Text(
                        if (a is ArrowState.NoSignal) stringResource(R.string.find_strip_no_signal) else finderDistanceLabel(dist),
                        style = Mosh.Body.copy(fontSize = 11.sp, lineHeight = 13.sp, color = warmth), maxLines = 1,
                    )
                }
            }
        }
        Text(stringResource(R.string.find_strip_hint), style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint), modifier = Modifier.padding(top = 2.dp))
    }
}
