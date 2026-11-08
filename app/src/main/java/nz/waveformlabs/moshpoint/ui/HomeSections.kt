package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.core.GigGroup

// The home screen's building blocks (people first, like Snap Map / Life360 / Find My:
// your crew and what they're up to at the top, setup tucked away).

/** Compact "you're live" switch for the header: the one thing that must be on at a gig. */
@Composable
internal fun LivePill(live: Boolean, ghost: Boolean, onToggle: () -> Unit) {
    val (src, sc) = rememberPress()
    val colour = when {
        !live -> Mosh.TextFaint
        ghost -> Mosh.Violet
        else -> Mosh.Lime
    }
    Row(
        Modifier.pressScale(sc).heightIn(min = 40.dp)
            .background(if (live) colour.copy(alpha = 0.16f) else Mosh.Surface, RoundedCornerShape(22.dp))
            .border(1.dp, if (live) colour.copy(alpha = 0.7f) else Mosh.Line, RoundedCornerShape(22.dp))
            .clickable(interactionSource = src, indication = androidx.compose.foundation.LocalIndication.current, onClick = onToggle)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(10.dp).background(colour, CircleShape))
        Spacer(Modifier.width(8.dp))
        Text(
            when {
                !live -> "Go live"
                ghost -> "Live · ghost"
                else -> "Live"
            },
            style = Mosh.Label.copy(fontSize = 15.sp, color = if (live) colour else Mosh.Text),
            maxLines = 1, softWrap = false,
        )
    }
}

/** "live · 40 m" / "12 min ago · 8%" under a crew member, from their last shared spot. */
private fun tileStatus(s: LocationBook.Seen?, nowSec: Long, distanceM: Double?): Pair<String, Color> {
    if (s == null) return "not sharing yet" to Mosh.TextFaint
    val age = nowSec - s.timeSec
    val battery = s.batteryPct?.takeIf { it <= 20 }?.let { " · $it%" }.orEmpty() // only worth saying when low
    return when {
        s.lastGasp -> "phone died" to Mosh.Danger
        distanceM != null -> "${distanceLabel(distanceM)}$battery" to (if (age < 180) Mosh.Lime else Mosh.TextDim)
        age < 120 -> "live$battery" to Mosh.Lime
        else -> "${ago(age)}$battery" to Mosh.TextFaint
    }
}

/** The crew as big tappable tiles, each with how they're doing. Tap = find them. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun CrewTiles(
    crew: List<Friend>,
    seen: Map<String, LocationBook.Seen>,
    nowSec: Long,
    onFind: (String) -> Unit,
    onOptions: (Friend) -> Unit,
    distances: Map<String, Double> = emptyMap(),
) {
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 10.dp, horizontal = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        crew.forEachIndexed { i, f ->
            val bob = rememberFloat(i)
            val (status, colour) = tileStatus(seen[f.id], nowSec, distances[f.id])
            Column(
                Modifier.width(78.dp)
                    .graphicsLayer { translationY = -3.dp.toPx() * bob.value }
                    .combinedClickable(onClick = { onFind(f.id) }, onLongClick = { onOptions(f) }),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Avatar(f, 62.dp)
                Spacer(Modifier.height(6.dp))
                Text(f.name, style = Mosh.Body.copy(fontSize = 14.sp, color = Mosh.Text), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(status, style = Mosh.Body.copy(fontSize = 11.sp, lineHeight = 13.sp, color = colour), maxLines = 2, textAlign = TextAlign.Center)
            }
        }
    }
}

/** One-tap messages to the whole crew. "Need help" asks first. */
@Composable
internal fun PingBar(onPing: (Int) -> Unit, onCheckIn: (Int) -> Unit = {}) {
    var confirmHelp by remember { mutableStateOf(false) }
    var goingHome by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf<Int?>(null) }
    val items = listOf(
        GigGroup.Ping.COMING to "On my way",
        GigGroup.Ping.WHERE_ARE_YOU to "Where are you?",
        GigGroup.Ping.STAY_PUT to "Stay put",
        GigGroup.Ping.MEET_AT_PIN to "Meet at the pin",
        GigGroup.Ping.ALL_GOOD to "All good",
    )
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { (kind, label) ->
            PingChip(if (sent == kind) "Sent ✓" else label, if (sent == kind) Mosh.Lime else Mosh.Cyan) {
                onPing(kind)
                sent = kind
            }
        }
        PingChip("Heading home", Mosh.Violet) { goingHome = true }
        PingChip("Need help", Mosh.Danger) { confirmHelp = true }
    }
    if (goingHome) {
        AlertDialog(
            onDismissRequest = { goingHome = false },
            containerColor = Mosh.Deep,
            title = { Text("Heading home?", style = Mosh.Heading) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Check in when you get there. If you don't, your crew gets an alert with your last spot (even if your phone dies).", style = Mosh.Body)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(30, 45, 60, 90).forEach { m ->
                            PingChip("$m min", Mosh.Violet) { onCheckIn(m); sent = GigGroup.Ping.CHECK_IN; goingHome = false }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { onPing(GigGroup.Ping.GOING_HOME); sent = GigGroup.Ping.GOING_HOME; goingHome = false }) {
                    Text("Just tell them", style = Mosh.Label.copy(color = Mosh.Cyan))
                }
            },
            dismissButton = { TextButton(onClick = { goingHome = false }) { Text("Cancel", style = Mosh.Label) } },
        )
    }
    if (confirmHelp) {
        AlertDialog(
            onDismissRequest = { confirmHelp = false },
            containerColor = Mosh.Deep,
            title = { Text("Ask the crew for help?", style = Mosh.Heading) },
            text = {
                Text(
                    "Everyone in your crew gets an urgent alert with where you are. If you're in danger, call emergency services or find festival security.",
                    style = Mosh.Body,
                )
            },
            confirmButton = {
                TextButton(onClick = { onPing(GigGroup.Ping.NEED_HELP); sent = GigGroup.Ping.NEED_HELP; confirmHelp = false }) {
                    Text("Send help alert", style = Mosh.Label.copy(color = Mosh.Danger))
                }
            },
            dismissButton = { TextButton(onClick = { confirmHelp = false }) { Text("Cancel", style = Mosh.Label) } },
        )
    }
}

@Composable
private fun PingChip(text: String, colour: Color, onClick: () -> Unit) {
    val (src, sc) = rememberPress()
    Box(
        Modifier.pressScale(sc).heightIn(min = 40.dp)
            .background(colour.copy(alpha = 0.12f), RoundedCornerShape(20.dp))
            .border(1.dp, colour.copy(alpha = 0.5f), RoundedCornerShape(20.dp))
            .clickable(interactionSource = src, indication = androidx.compose.foundation.LocalIndication.current, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = Mosh.Label.copy(fontSize = 14.sp, color = colour)) }
}

/** The last few crew pings ("Bevan is on their way · 2 min ago"). */
@Composable
internal fun PingFeed(pings: List<GigGroup.Ping>, nowSec: Long, describe: (Int) -> String) {
    if (pings.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        pings.take(3).forEach { p ->
            val help = p.kind == GigGroup.Ping.NEED_HELP
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(8.dp).background(if (help) Mosh.Danger else Mosh.Cyan, CircleShape))
                Spacer(Modifier.width(10.dp))
                Text(
                    "${p.from} ${describe(p.kind)}",
                    style = Mosh.Body.copy(fontSize = 14.sp, color = if (help) Mosh.Danger else Mosh.Text),
                    modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
                Text(ago(nowSec - p.timeSec), style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint))
            }
        }
    }
}

/** Bottom bar: the four places you go. */
@Composable
internal fun HomeBar(onMap: () -> Unit, onAdd: () -> Unit, onMe: () -> Unit, myName: String = "") {
    Row(
        Modifier.fillMaxWidth().background(Mosh.Deep.copy(alpha = 0.96f))
            .border(1.dp, Mosh.Line, RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
            .navigationBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BarItem("Crew", selected = true, icon = { c -> CrewIcon(c) }) {}
        BarItem("Map", selected = false, icon = { c -> PinIcon(c) }, onClick = onMap)
        BarItem("Add", selected = false, accent = true, icon = { c -> PlusIcon(c) }, onClick = onAdd)
        BarItem("Me", selected = false, icon = { _ ->
            val mine = nz.waveformlabs.moshpoint.PhotoStore.photos[nz.waveformlabs.moshpoint.PhotoStore.ME]
            if (mine != null) {
                androidx.compose.foundation.Image(
                    mine, contentDescription = null, contentScale = androidx.compose.ui.layout.ContentScale.Crop,
                    modifier = Modifier.size(28.dp).clip(CircleShape).border(1.5.dp, Mosh.TextDim, CircleShape),
                )
            } else {
                InitialsAvatar(myName, 28.dp)
            }
        }, onClick = onMe)
    }
}

@Composable
private fun BarItem(label: String, selected: Boolean, accent: Boolean = false, icon: @Composable (Color) -> Unit, onClick: () -> Unit) {
    val (src, sc) = rememberPress()
    val colour = when {
        accent -> Mosh.Pink
        selected -> Mosh.Lime
        else -> Mosh.TextDim
    }
    Column(
        Modifier.pressScale(sc).width(72.dp)
            .clickable(interactionSource = src, indication = null, onClick = onClick)
            .padding(vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            Modifier.size(if (accent) 40.dp else 30.dp)
                .background(if (accent) Mosh.Pink.copy(alpha = 0.18f) else Color.Transparent, CircleShape)
                .border(if (accent) 1.dp else 0.dp, if (accent) Mosh.Pink else Color.Transparent, CircleShape),
            contentAlignment = Alignment.Center,
        ) { icon(colour) }
        Text(label, style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 14.sp, color = colour))
    }
}

/** Every way to add someone, in one sheet instead of always on screen. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun AddSheet(
    inCrew: Boolean,
    onShowCrewQr: () -> Unit,
    onScanQr: () -> Unit,
    onShareApp: () -> Unit,
    onPasteInvite: () -> Unit,
    onShowMyQr: () -> Unit,
    onEnterCode: () -> Unit,
    onClose: () -> Unit,
) {
    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onClose, containerColor = Mosh.Deep) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Add mates", style = Mosh.Heading)
            Text(
                "At the gig: show your crew QR and they scan it. That's it: everyone in the crew can find everyone.",
                style = Mosh.Body,
            )
            NeonButton(if (inCrew) "Show crew QR" else "Start a crew + show QR") { onClose(); onShowCrewQr() }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlassButton("Scan a QR", Modifier.weight(1f)) { onClose(); onScanQr() }
                GlassButton("Paste invite", Modifier.weight(1f)) { onClose(); onPasteInvite() }
            }
            GlassButton("Send the app + invite (WhatsApp, Messenger…)") { onClose(); onShareApp() }
            Spacer(Modifier.height(4.dp))
            Text("FRIENDS FOR EVERY GIG", style = Mosh.Eyebrow)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TextButton(onClick = { onClose(); onShowMyQr() }) { Text("My friend QR", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                TextButton(onClick = { onClose(); onEnterCode() }) { Text("Enter a code", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
            }
        }
    }
}

/** While you're checking in: when you're due, and the "Home safe" button. */
@Composable
internal fun CheckInBanner(byClock: String, onHomeSafe: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().background(Mosh.Violet.copy(alpha = 0.16f), RoundedCornerShape(14.dp))
            .border(1.dp, Mosh.Violet.copy(alpha = 0.6f), RoundedCornerShape(14.dp)).padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("Check in by $byClock", style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Violet), modifier = Modifier.weight(1f))
        TextButton(onClick = onHomeSafe) { Text("I'm home safe", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Lime)) }
    }
}

/** Two calm secondary actions under "Find everyone". */
@Composable
internal fun CrewActions(onMessage: () -> Unit, onMoment: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        GlassButton("Message", Modifier.weight(1f), onClick = onMessage)
        GlassButton("Moment", Modifier.weight(1f), onClick = onMoment)
    }
}

/** Everything you can tell the crew, in one sheet: pings, heading home, need help. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun MessageSheet(onPing: (Int) -> Unit, onCheckIn: (Int) -> Unit, onClose: () -> Unit) {
    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onClose, containerColor = Mosh.Deep) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Message the crew", style = Mosh.Heading)
            Text("One tap: everyone in the crew gets it, with where you are.", style = Mosh.Body)
            PingBar(onPing = { onPing(it) }, onCheckIn = { onCheckIn(it) })
        }
    }
}

/** No one's in the crew yet: the QR right here, no extra taps. */
@Composable
internal fun InlineCrewQr(payload: String, onShare: () -> Unit) {
    val bmp = remember(payload) { qrBitmap(payload, 480).asImageBitmap() }
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        androidx.compose.foundation.Image(
            bmp, contentDescription = "Crew QR",
            modifier = Modifier.size(200.dp).background(Color.White, RoundedCornerShape(18.dp)).padding(10.dp),
        )
        Spacer(Modifier.height(10.dp))
        Text("Mates scan this with their camera or Moshpoint. That's it.", style = Mosh.Body.copy(fontSize = 14.sp), textAlign = TextAlign.Center)
        TextButton(onClick = onShare) { Text("No camera? Send the invite", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
    }
}

// Bottom-bar icons, drawn (no emoji) so they match the neon line style.

@Composable
private fun CrewIcon(c: Color) = androidx.compose.foundation.Canvas(Modifier.size(24.dp)) {
    val w = size.width
    val stroke = androidx.compose.ui.graphics.drawscope.Stroke(width = w * 0.09f, cap = androidx.compose.ui.graphics.StrokeCap.Round)
    drawCircle(c, radius = w * 0.15f, center = androidx.compose.ui.geometry.Offset(w * 0.36f, w * 0.33f), style = stroke)
    drawCircle(c.copy(alpha = 0.7f), radius = w * 0.12f, center = androidx.compose.ui.geometry.Offset(w * 0.7f, w * 0.38f), style = stroke)
    drawArc(c, 200f, 140f, false, topLeft = androidx.compose.ui.geometry.Offset(w * 0.08f, w * 0.55f), size = androidx.compose.ui.geometry.Size(w * 0.56f, w * 0.5f), style = stroke)
    drawArc(c.copy(alpha = 0.7f), 210f, 120f, false, topLeft = androidx.compose.ui.geometry.Offset(w * 0.5f, w * 0.6f), size = androidx.compose.ui.geometry.Size(w * 0.42f, w * 0.4f), style = stroke)
}

@Composable
private fun PinIcon(c: Color) = androidx.compose.foundation.Canvas(Modifier.size(24.dp)) {
    val w = size.width
    val path = androidx.compose.ui.graphics.Path().apply {
        moveTo(w * 0.5f, w * 0.94f)
        cubicTo(w * 0.2f, w * 0.6f, w * 0.16f, w * 0.48f, w * 0.16f, w * 0.38f)
        cubicTo(w * 0.16f, w * 0.18f, w * 0.32f, w * 0.05f, w * 0.5f, w * 0.05f)
        cubicTo(w * 0.68f, w * 0.05f, w * 0.84f, w * 0.18f, w * 0.84f, w * 0.38f)
        cubicTo(w * 0.84f, w * 0.48f, w * 0.8f, w * 0.6f, w * 0.5f, w * 0.94f)
        close()
    }
    drawPath(path, c, style = androidx.compose.ui.graphics.drawscope.Stroke(width = w * 0.09f, join = androidx.compose.ui.graphics.StrokeJoin.Round))
    drawCircle(c, radius = w * 0.1f, center = androidx.compose.ui.geometry.Offset(w * 0.5f, w * 0.38f))
}

@Composable
private fun PlusIcon(c: Color) = androidx.compose.foundation.Canvas(Modifier.size(20.dp)) {
    val w = size.width
    val sw = w * 0.13f
    drawLine(c, androidx.compose.ui.geometry.Offset(w / 2, w * 0.12f), androidx.compose.ui.geometry.Offset(w / 2, w * 0.88f), sw, androidx.compose.ui.graphics.StrokeCap.Round)
    drawLine(c, androidx.compose.ui.geometry.Offset(w * 0.12f, w / 2), androidx.compose.ui.geometry.Offset(w * 0.88f, w / 2), sw, androidx.compose.ui.graphics.StrokeCap.Round)
}

