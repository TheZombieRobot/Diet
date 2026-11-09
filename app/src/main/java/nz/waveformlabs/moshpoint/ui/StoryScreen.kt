package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.draw.rotate
import androidx.compose.animation.core.animateFloat
import kotlinx.coroutines.launch
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import nz.waveformlabs.moshpoint.Moments

// The Story: everyone's photos (and clips) from the night as Polaroids, a row per person.

/** "9:42 pm" in the phone's own format. */
internal fun clockTime(timeSec: Long): String =
    java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(timeSec * 1000))

/** A slight, steady tilt per photo (same every time you look), like Polaroids on a pinboard. */
private fun tilt(key: String) = ((key.hashCode() % 7) - 3) * 1.1f

/** One Polaroid: white frame, the photo, and a handwritten line underneath. */
@Composable
internal fun Polaroid(m: Moments.Item, width: Dp, modifier: Modifier = Modifier, tilted: Boolean = true, tiltScale: Float = 1f) {
    val pad = width * 0.06f
    Column(
        modifier.width(width).rotate(if (tilted) tilt(m.key) * tiltScale else 0f)
            .shadow(10.dp, RoundedCornerShape(3.dp), clip = false)
            .background(Color(0xFFF7F4EC), RoundedCornerShape(3.dp))
            .padding(start = pad, end = pad, top = pad, bottom = pad * 0.6f),
    ) {
        Box {
            Image(
                m.image, contentDescription = "Photo from ${m.from}", contentScale = ContentScale.Crop,
                modifier = Modifier.size(width - pad * 2).background(Color(0xFF222222)),
            )
            if (m.isVideo) {
                Box(
                    Modifier.align(Alignment.Center).size(width * 0.22f).background(Color(0x99000000), RoundedCornerShape(50)),
                    contentAlignment = Alignment.Center,
                ) { Text("▶", style = TextStyle(color = Color.White, fontSize = (width.value * 0.1f).sp)) }
            }
        }
        Spacer(Modifier.height(pad * 0.8f))
        Text(
            m.caption.ifBlank { clockTime(m.timeSec) },
            style = TextStyle(fontFamily = Mosh.Marker, fontSize = (width.value * 0.085f).coerceAtMost(20f).sp, color = Color(0xFF1C1A2E)),
            maxLines = 2, overflow = TextOverflow.Ellipsis,
        )
        if (m.caption.isNotBlank()) {
            Text(clockTime(m.timeSec), style = TextStyle(fontFamily = Mosh.Marker, fontSize = (width.value * 0.065f).coerceAtMost(14f).sp, color = Color(0xFF6B6680)))
        }
    }
}

/**
 * The night as a live pinboard: Polaroids pinned down a glowing timeline, newest at the top,
 * zig-zagging left and right. Each one is pinned with the poster's face (their photo bubble,
 * or initials in their colour); name and time sit across the line. While it's open it checks
 * for new posts every 30 s, new ones drop in at the top, and a "↑ new" pill appears if you've
 * scrolled down. Followers at home can watch the gig unfold.
 */
@Composable
fun StoryScreen(
    items: List<Moments.Item>,
    nowSec: Long,
    /** Colour per name (crew colours), for pins without a photo. */
    colourOf: (String) -> Int?,
    onShare: (() -> Unit)?,
    onMap: (Moments.Item) -> Unit,
    onBack: () -> Unit,
    /** Followers can't post; they see a note instead of the camera. */
    following: Boolean = false,
    /** The poster's profile photo (by name; mine = yours), if they have one. */
    photoOf: (name: String, mine: Boolean) -> androidx.compose.ui.graphics.ImageBitmap? = { _, _ -> null },
    myName: String = "You",
    /** Fetch new posts now (called every 30 s while the board is open). */
    onRefresh: suspend () -> Unit = {},
    /** The crew is awake tonight: show the LIVE tag. */
    live: Boolean = true,
    /** "The story", or a past gig's name. */
    title: String = "The story",
    /** Save one photo/clip to the phone's gallery. */
    onSaveOne: ((Moments.Item) -> Unit)? = null,
    /** Save the whole gig to the phone's gallery. */
    onSaveAll: (() -> Unit)? = null,
    /** Delete this (past) gig from this phone. */
    onDelete: (() -> Unit)? = null,
    /** Add photos/videos from this phone's camera roll taken during the gig. */
    onAddFromPhone: (() -> Unit)? = null,
) {
    val hasBack = androidx.activity.compose.LocalOnBackPressedDispatcherOwner.current != null
    if (hasBack) androidx.activity.compose.BackHandler(onBack = onBack)
    var open by remember { mutableStateOf<Int?>(null) }
    val timeline = items.sortedByDescending { it.timeSec }
    val people = items.map { if (it.mine) "You" else it.from }.toSet().size
    val list = androidx.compose.foundation.lazy.rememberLazyListState()
    // Only posts that arrive while you're watching get the drop-in pop.
    val alreadyThere = remember { timeline.map { it.key }.toSet() }
    val scope = androidx.compose.runtime.rememberCoroutineScope()

    // Live: look for new posts every 30 s while the board is open.
    androidx.compose.runtime.LaunchedEffect(Unit) {
        while (true) {
            runCatching { onRefresh() }
            kotlinx.coroutines.delay(30_000)
        }
    }
    // "↑ N new" when posts arrive while you're scrolled down.
    var seenTop by remember { mutableStateOf(timeline.firstOrNull()?.key) }
    val newCount = timeline.indexOfFirst { it.key == seenTop }.let { if (it < 0) timeline.size.takeIf { seenTop != null } ?: 0 else it }
    val atTop = list.firstVisibleItemIndex <= 1
    androidx.compose.runtime.LaunchedEffect(atTop, timeline.firstOrNull()?.key) {
        if (atTop) seenTop = timeline.firstOrNull()?.key
    }

    Box(Modifier.fillMaxSize().background(Color(0xFF0B0816))) {
        BoardBackground()
        androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
            val half = maxWidth / 2
            val photoW = (half + 34.dp).coerceAtMost(260.dp)
            LazyColumn(
                Modifier.fillMaxSize(),
                state = list,
                contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 8.dp, bottom = 130.dp),
            ) {
                item(key = "header") {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = onBack) { Text("‹ Back", style = Mosh.Label.copy(fontSize = 15.sp)) }
                        Column(Modifier.weight(1f)) {
                            Text(title, style = Mosh.Heading, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(
                                if (items.isEmpty()) "Nothing pinned yet" else "${items.size} from $people ${if (people == 1) "person" else "people"}",
                                style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint),
                            )
                        }
                        if (live) LiveTag()
                        else if (onSaveAll != null && items.isNotEmpty()) {
                            TextButton(onClick = onSaveAll) { Text("Save all", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
                        }
                    }
                    Row(Modifier.padding(start = 12.dp)) {
                        if (onAddFromPhone != null) {
                            TextButton(onClick = onAddFromPhone) { Text("＋ Add your photos", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Lime)) }
                        }
                        if (live && onSaveAll != null && items.isNotEmpty()) {
                            TextButton(onClick = onSaveAll) { Text("Save all to phone", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
                        }
                    }
                }
                if (items.isEmpty()) {
                    item(key = "empty") {
                        Text(
                            if (following) "Photos and clips from the crew get pinned here as they share them. Keep this open to follow along live."
                            else "Snap the stage, the bar, your mates. Everything the crew shares gets pinned here, newest at the top.",
                            style = Mosh.Body, textAlign = TextAlign.Center,
                            modifier = Modifier.fillMaxWidth().padding(horizontal = 36.dp, vertical = 48.dp),
                        )
                    }
                }
                items(timeline.size, key = { timeline[it].key }) { i ->
                    val m = timeline[i]
                    val left = i % 2 == 0
                    val pinColour = colourOf(m.from)?.let { Color(it) } ?: if (m.mine) Mosh.Pink else Mosh.Cyan
                    Box(
                        Modifier.fillMaxWidth().height(photoW + 104.dp)
                            .then(Modifier.animateItem()),
                    ) {
                        // The timeline line and a glowing node where this post sits.
                        androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
                            val x = size.width / 2
                            drawLine(Mosh.Violet.copy(alpha = 0.35f), Offset(x, 0f), Offset(x, size.height), strokeWidth = 3.dp.toPx())
                            drawCircle(pinColour.copy(alpha = 0.35f), radius = 9.dp.toPx(), center = Offset(x, 34.dp.toPx()))
                            drawCircle(pinColour, radius = 4.5f.dp.toPx(), center = Offset(x, 34.dp.toPx()))
                        }
                        // Who and when, across the line from the photo.
                        Column(
                            Modifier.align(if (left) Alignment.TopEnd else Alignment.TopStart)
                                .padding(top = 22.dp, start = if (left) 0.dp else 20.dp, end = if (left) 20.dp else 0.dp)
                                .width(half - 30.dp),
                            horizontalAlignment = if (left) Alignment.End else Alignment.Start,
                        ) {
                            Text(if (m.mine) "You" else m.from, style = Mosh.Label.copy(fontSize = 15.sp, color = pinColour), maxLines = 1)
                            Text(clockTime(m.timeSec), style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 16.sp, color = Mosh.TextDim))
                            Text(ago(nowSec - m.timeSec), style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 15.sp, color = Mosh.TextFaint))
                        }
                        // The Polaroid, pinned with the poster's face.
                        Box(
                            Modifier.align(if (left) Alignment.TopStart else Alignment.TopEnd)
                                .padding(top = 20.dp, start = if (left) 14.dp else 0.dp, end = if (left) 0.dp else 14.dp),
                        ) {
                            PopIn(m.key, enabled = m.key !in alreadyThere) {
                                Box {
                                    Polaroid(m, photoW, Modifier.padding(top = 12.dp).clickable { open = i }, tiltScale = 1.4f)
                                    Box(Modifier.align(Alignment.TopCenter)) { FacePin(photoOf(m.from, m.mine), if (m.mine) myName else m.from, pinColour) }
                                }
                            }
                        }
                    }
                }
                if (onDelete != null) {
                    item(key = "delete") {
                        Box(Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
                            TextButton(onClick = onDelete) { Text("Delete this gig from this phone", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Danger)) }
                        }
                    }
                }
            }
        }

        // "↑ 2 new" when posts arrive while you're further down.
        if (!atTop && newCount > 0) {
            Text(
                "↑  $newCount new",
                style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF07050F)),
                modifier = Modifier.align(Alignment.TopCenter).padding(top = 72.dp)
                    .shadow(10.dp, androidx.compose.foundation.shape.RoundedCornerShape(50), clip = false)
                    .background(androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(Mosh.Pink, Mosh.Cyan)), androidx.compose.foundation.shape.RoundedCornerShape(50))
                    .clickable { scope.launch { list.animateScrollToItem(0) } }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
            )
        }

        // The camera, always one tap away (not for followers).
        if (onShare != null) {
            CameraFab(onShare, Modifier.align(Alignment.BottomEnd).padding(end = 22.dp, bottom = 26.dp))
        }
    }

    open?.let { start ->
        Dialog(onDismissRequest = { open = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            val pager = rememberPagerState(initialPage = start) { timeline.size }
            Box(Modifier.fillMaxSize().background(Color(0xF007050F))) {
                HorizontalPager(pager, Modifier.fillMaxSize()) { page ->
                    val m = timeline[page]
                    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        if (m.isVideo && m.videoFile != null) VideoPolaroid(m) else Polaroid(m, 300.dp, tilted = false)
                        Spacer(Modifier.height(18.dp))
                        Text("${if (m.mine) "You" else m.from} · ${clockTime(m.timeSec)} · ${ago(nowSec - m.timeSec)}", style = Mosh.Body.copy(color = Mosh.TextDim))
                        Row {
                            if (onSaveOne != null) {
                                TextButton(onClick = { onSaveOne(m) }) { Text("Save to phone", style = Mosh.Label.copy(color = Mosh.Lime)) }
                            }
                            if (m.lat != null) {
                                TextButton(onClick = { open = null; onMap(m) }) { Text("On the map", style = Mosh.Label.copy(color = Mosh.Cyan)) }
                            }
                        }
                    }
                }
                Row(Modifier.align(Alignment.TopCenter).padding(top = 16.dp)) { Text("${pager.currentPage + 1} / ${timeline.size}", style = Mosh.Eyebrow) }
                TextButton(onClick = { open = null }, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) { Text("✕", style = Mosh.Label.copy(fontSize = 18.sp)) }
            }
        }
    }
}

/** A dark board with a faint dot grid, like felt under the Polaroids. */
@Composable
private fun BoardBackground() = androidx.compose.foundation.Canvas(Modifier.fillMaxSize()) {
    val step = 22.dp.toPx()
    val dot = Color(0x14FFFFFF)
    var y = step / 2
    while (y < size.height) {
        var x = step / 2
        while (x < size.width) {
            drawCircle(dot, radius = 1.2f, center = Offset(x, y))
            x += step
        }
        y += step
    }
    drawRect(androidx.compose.ui.graphics.Brush.verticalGradient(listOf(Mosh.Violet.copy(alpha = 0.10f), Color.Transparent, Mosh.Pink.copy(alpha = 0.06f))))
}

/** The poster's face as the pushpin: photo bubble (or initials) with a shine and a shadow. */
@Composable
private fun FacePin(photo: androidx.compose.ui.graphics.ImageBitmap?, name: String, colour: Color) {
    Box(Modifier.shadow(8.dp, androidx.compose.foundation.shape.CircleShape, clip = false)) {
        if (photo != null) {
            Image(
                photo, contentDescription = name, contentScale = ContentScale.Crop,
                modifier = Modifier.size(34.dp).clip(androidx.compose.foundation.shape.CircleShape)
                    .border(2.5.dp, colour, androidx.compose.foundation.shape.CircleShape),
            )
        } else {
            InitialsAvatar(name, 34.dp, colour)
        }
        // A little highlight so it reads as a round pin head.
        androidx.compose.foundation.Canvas(Modifier.size(34.dp)) {
            drawCircle(Color.White.copy(alpha = 0.35f), radius = size.minDimension * 0.12f, center = Offset(size.width * 0.34f, size.height * 0.3f))
        }
    }
}

/** A pulsing "● LIVE" tag. */
@Composable
private fun LiveTag() {
    val pulse by androidx.compose.animation.core.rememberInfiniteTransition(label = "live").animateFloat(
        0.35f, 1f, androidx.compose.animation.core.infiniteRepeatable(androidx.compose.animation.core.tween(900), androidx.compose.animation.core.RepeatMode.Reverse), label = "a",
    )
    Row(
        Modifier.background(Color(0x33FF2E4F), androidx.compose.foundation.shape.RoundedCornerShape(50))
            .border(1.dp, Color(0x99FF2E4F), androidx.compose.foundation.shape.RoundedCornerShape(50))
            .padding(horizontal = 10.dp, vertical = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(8.dp).background(Color(0xFFFF2E4F).copy(alpha = pulse), androidx.compose.foundation.shape.CircleShape))
        Spacer(Modifier.width(6.dp))
        Text("LIVE", style = Mosh.Label.copy(fontSize = 12.sp, color = Color(0xFFFF6A80), letterSpacing = 1.5.sp))
    }
}

/** New posts drop in: a quick scale-and-fade pop the first time each one appears. */
@Composable
private fun PopIn(key: String, enabled: Boolean = true, content: @Composable () -> Unit) {
    val shown = androidx.compose.runtime.saveable.rememberSaveable(key) { mutableStateOf(!enabled) }
    if (shown.value) {
        Box { content() }
        return
    }
    val anim = remember(key) { androidx.compose.animation.core.Animatable(0.6f) }
    androidx.compose.runtime.LaunchedEffect(key) {
        anim.animateTo(1f, androidx.compose.animation.core.spring(dampingRatio = 0.55f, stiffness = 380f))
        shown.value = true
    }
    Box(
        Modifier.graphicsLayer {
            scaleX = anim.value
            scaleY = anim.value
            alpha = ((anim.value - 0.6f) / 0.4f).coerceIn(0f, 1f)
        },
    ) { content() }
}

/** A round neon camera button: opens the camera (tap = photo, hold = clip). */
@Composable
internal fun CameraFab(onClick: () -> Unit, modifier: Modifier = Modifier, size: Dp = 64.dp) {
    val (src, sc) = rememberPress()
    Box(
        modifier.pressScale(sc).size(size)
            .shadow(14.dp, androidx.compose.foundation.shape.CircleShape, clip = false)
            .background(androidx.compose.ui.graphics.Brush.linearGradient(listOf(Mosh.Pink, Mosh.Cyan)), androidx.compose.foundation.shape.CircleShape)
            .clickable(interactionSource = src, indication = null, onClickLabel = "Camera", onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { CameraGlyph(Color(0xFF07050F), size * 0.46f) }
}

/** A simple drawn camera (body, lens, bump), in the app's line style. */
@Composable
internal fun CameraGlyph(colour: Color, size: Dp) = androidx.compose.foundation.Canvas(Modifier.size(size)) {
    val w = this.size.width
    val stroke = androidx.compose.ui.graphics.drawscope.Stroke(width = w * 0.09f, join = androidx.compose.ui.graphics.StrokeJoin.Round)
    drawRoundRect(colour, androidx.compose.ui.geometry.Offset(w * 0.06f, w * 0.26f), androidx.compose.ui.geometry.Size(w * 0.88f, w * 0.62f), androidx.compose.ui.geometry.CornerRadius(w * 0.14f), style = stroke)
    drawRoundRect(colour, androidx.compose.ui.geometry.Offset(w * 0.32f, w * 0.12f), androidx.compose.ui.geometry.Size(w * 0.36f, w * 0.16f), androidx.compose.ui.geometry.CornerRadius(w * 0.05f))
    drawCircle(colour, radius = w * 0.17f, center = androidx.compose.ui.geometry.Offset(w * 0.5f, w * 0.57f), style = stroke)
}

/** A clip, playing inside a Polaroid frame (loops, starts muted-free: it's a gig). */
@Composable
internal fun VideoPolaroid(m: Moments.Item) {
    val file = m.videoFile ?: return
    Column(
        Modifier.width(300.dp).shadow(10.dp, RoundedCornerShape(3.dp), clip = false)
            .background(Color(0xFFF7F4EC), RoundedCornerShape(3.dp)).padding(18.dp),
    ) {
        androidx.compose.ui.viewinterop.AndroidView(
            factory = { ctx ->
                android.widget.VideoView(ctx).apply {
                    setVideoPath(file.absolutePath)
                    setOnPreparedListener { it.isLooping = true; start() }
                }
            },
            modifier = Modifier.size(264.dp).border(0.dp, Color.Transparent),
        )
        Spacer(Modifier.height(10.dp))
        Text(
            m.caption.ifBlank { clockTime(m.timeSec) },
            style = TextStyle(fontFamily = Mosh.Marker, fontSize = 22.sp, color = Color(0xFF1C1A2E)),
            maxLines = 2, overflow = TextOverflow.Ellipsis,
        )
    }
}
