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
 * The night as one timeline, newest first: who posted it (their photo bubble and name),
 * when, and the Polaroid. Tap any photo to flick through the whole night full screen.
 */
@Composable
fun StoryScreen(
    items: List<Moments.Item>,
    nowSec: Long,
    /** Colour per name (crew colours), for the bubble when there's no photo. */
    colourOf: (String) -> Int?,
    onShare: (() -> Unit)?,
    onMap: (Moments.Item) -> Unit,
    onBack: () -> Unit,
    /** Followers can't post; they see a note instead of the camera. */
    following: Boolean = false,
    /** The poster's profile photo (by name; "You" = yours), if they have one. */
    photoOf: (name: String, mine: Boolean) -> androidx.compose.ui.graphics.ImageBitmap? = { _, _ -> null },
    myName: String = "You",
) {
    val hasBack = androidx.activity.compose.LocalOnBackPressedDispatcherOwner.current != null
    if (hasBack) androidx.activity.compose.BackHandler(onBack = onBack)
    var open by remember { mutableStateOf<Int?>(null) }
    val timeline = items.sortedByDescending { it.timeSec }
    val people = items.map { if (it.mine) "You" else it.from }.toSet().size

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
        GlowBackground(colours = listOf(Mosh.Pink, Mosh.Violet, Mosh.Amber))
        androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
            val photoW = (maxWidth - 64.dp).coerceAtMost(420.dp)
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 12.dp, bottom = 120.dp),
                verticalArrangement = Arrangement.spacedBy(26.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                item {
                    Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                        TextButton(onClick = onBack) { Text("‹ Back", style = Mosh.Label.copy(fontSize = 15.sp)) }
                        Column(Modifier.weight(1f)) {
                            Text("The story", style = Mosh.Heading)
                            Text(
                                if (items.isEmpty()) "Nothing yet tonight" else "${items.size} from $people ${if (people == 1) "person" else "people"}",
                                style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint),
                            )
                        }
                    }
                }
                if (items.isEmpty()) {
                    item {
                        Text(
                            if (following) "Photos and clips from the crew will roll in here as they share them."
                            else "Snap the stage, the bar, your mates. Everything the crew shares lands here, newest first.",
                            style = Mosh.Body, textAlign = TextAlign.Center,
                            modifier = Modifier.padding(horizontal = 36.dp, vertical = 40.dp),
                        )
                    }
                }
                items(timeline.size, key = { timeline[it].key }) { i ->
                    val m = timeline[i]
                    val who = if (m.mine) "You" else m.from
                    Column(horizontalAlignment = Alignment.Start, modifier = Modifier.width(photoW)) {
                        // Who and when.
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(bottom = 10.dp)) {
                            val photo = photoOf(m.from, m.mine)
                            if (photo != null) {
                                Image(
                                    photo, contentDescription = null, contentScale = ContentScale.Crop,
                                    modifier = Modifier.size(34.dp).clip(androidx.compose.foundation.shape.CircleShape)
                                        .border(2.dp, colourOf(m.from)?.let { Color(it) } ?: Mosh.Pink, androidx.compose.foundation.shape.CircleShape),
                                )
                            } else {
                                InitialsAvatar(if (m.mine) myName else m.from, 34.dp, colourOf(m.from)?.let { Color(it) })
                            }
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(who, style = Mosh.Label.copy(fontSize = 15.sp))
                                Text("${clockTime(m.timeSec)} · ${ago(nowSec - m.timeSec)}", style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 15.sp, color = Mosh.TextFaint))
                            }
                        }
                        Polaroid(m, photoW, Modifier.clickable { open = i }, tiltScale = 0.6f)
                    }
                }
            }
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
                        if (m.lat != null) {
                            TextButton(onClick = { open = null; onMap(m) }) { Text("Show where on the map", style = Mosh.Label.copy(color = Mosh.Cyan)) }
                        }
                    }
                }
                Row(Modifier.align(Alignment.TopCenter).padding(top = 16.dp)) { Text("${pager.currentPage + 1} / ${timeline.size}", style = Mosh.Eyebrow) }
                TextButton(onClick = { open = null }, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) { Text("✕", style = Mosh.Label.copy(fontSize = 18.sp)) }
            }
        }
    }
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
