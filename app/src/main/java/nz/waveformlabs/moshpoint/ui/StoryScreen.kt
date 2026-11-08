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
internal fun Polaroid(m: Moments.Item, width: Dp, modifier: Modifier = Modifier, tilted: Boolean = true) {
    val pad = width * 0.06f
    Column(
        modifier.width(width).rotate(if (tilted) tilt(m.key) else 0f)
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
            style = TextStyle(fontFamily = Mosh.Marker, fontSize = (width.value * 0.085f).sp, color = Color(0xFF1C1A2E)),
            maxLines = 2, overflow = TextOverflow.Ellipsis,
        )
        if (m.caption.isNotBlank()) {
            Text(clockTime(m.timeSec), style = TextStyle(fontFamily = Mosh.Marker, fontSize = (width.value * 0.065f).sp, color = Color(0xFF6B6680)))
        }
    }
}

/**
 * Everyone's story: a row of Polaroids per person, newest person first. Tap a Polaroid to
 * flick through that person's night full screen.
 */
@Composable
fun StoryScreen(
    items: List<Moments.Item>,
    nowSec: Long,
    /** Colour per name (crew colours), for the little name badge. */
    colourOf: (String) -> Int?,
    onShare: (() -> Unit)?,
    onMap: (Moments.Item) -> Unit,
    onBack: () -> Unit,
    /** Followers can't post; they see a note instead of the Share button. */
    following: Boolean = false,
) {
    val hasBack = androidx.activity.compose.LocalOnBackPressedDispatcherOwner.current != null
    if (hasBack) androidx.activity.compose.BackHandler(onBack = onBack)
    var open by remember { mutableStateOf<Pair<List<Moments.Item>, Int>?>(null) }
    val people = items.groupBy { if (it.mine) "You" else it.from }.toList().sortedByDescending { (_, list) -> list.maxOf { it.timeSec } }

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
        GlowBackground(colours = listOf(Mosh.Pink, Mosh.Violet, Mosh.Amber))
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(top = 12.dp, bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onBack) { Text("‹ Back", style = Mosh.Label.copy(fontSize = 15.sp)) }
                    Column(Modifier.weight(1f)) {
                        Text("The story", style = Mosh.Heading)
                        Text(
                            if (items.isEmpty()) "Nothing yet tonight" else "${items.size} from ${people.size} ${if (people.size == 1) "person" else "people"}",
                            style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint),
                        )
                    }
                    if (onShare != null) TextButton(onClick = onShare) { Text("＋ Add", style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Cyan)) }
                }
            }
            if (items.isEmpty()) {
                item {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            if (following) "Photos and clips from the crew will roll in here as they share them."
                            else "Snap the stage, the bar, your mates. Each photo lands here as a Polaroid, pinned on the map where you took it.",
                            style = Mosh.Body, textAlign = TextAlign.Center,
                        )
                        if (onShare != null) {
                            Spacer(Modifier.height(16.dp))
                            NeonButton("Share the first one", onClick = onShare)
                        }
                    }
                }
            }
            items(people, key = { it.first }) { (who, list) ->
                val sorted = list.sortedBy { it.timeSec }
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(Modifier.padding(horizontal = 20.dp), verticalAlignment = Alignment.CenterVertically) {
                        InitialsAvatar(who, 30.dp, colourOf(who)?.let { Color(it) })
                        Spacer(Modifier.width(10.dp))
                        Text(who, style = Mosh.Label, modifier = Modifier.weight(1f))
                        Text("${list.size} · latest ${ago(nowSec - list.maxOf { it.timeSec })}", style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint))
                    }
                    Row(
                        Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 10.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        sorted.forEachIndexed { i, m ->
                            Polaroid(m, 150.dp, Modifier.clickable { open = sorted to i })
                        }
                    }
                }
            }
        }
    }

    open?.let { (list, start) ->
        Dialog(onDismissRequest = { open = null }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
            val pager = rememberPagerState(initialPage = start) { list.size }
            Box(Modifier.fillMaxSize().background(Color(0xF007050F))) {
                HorizontalPager(pager, Modifier.fillMaxSize()) { page ->
                    val m = list[page]
                    Column(Modifier.fillMaxSize().padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                        if (m.isVideo && m.videoFile != null) {
                            VideoPolaroid(m)
                        } else {
                            Polaroid(m, 300.dp, tilted = false)
                        }
                        Spacer(Modifier.height(18.dp))
                        Text("${if (m.mine) "You" else m.from} · ${clockTime(m.timeSec)} · ${ago(nowSec - m.timeSec)}", style = Mosh.Body.copy(color = Mosh.TextDim))
                        if (m.lat != null) {
                            TextButton(onClick = { open = null; onMap(m) }) { Text("Show where on the map", style = Mosh.Label.copy(color = Mosh.Cyan)) }
                        }
                    }
                }
                Row(Modifier.align(Alignment.TopCenter).padding(top = 16.dp)) {
                    Text("${pager.currentPage + 1} / ${list.size}", style = Mosh.Eyebrow)
                }
                TextButton(onClick = { open = null }, modifier = Modifier.align(Alignment.TopEnd).padding(8.dp)) {
                    Text("✕", style = Mosh.Label.copy(fontSize = 18.sp))
                }
            }
        }
    }
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
