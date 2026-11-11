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
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
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
                !live -> stringResource(R.string.home_go_live)
                ghost -> stringResource(R.string.home_live_ghost)
                else -> stringResource(R.string.home_live)
            },
            style = Mosh.Label.copy(fontSize = 15.sp, color = if (live) colour else Mosh.Text),
            maxLines = 1, softWrap = false,
        )
    }
}

/** "live · 40 m" / "12 min ago · 8%" under a crew member, from their last shared spot. */
private fun tileStatus(s: LocationBook.Seen?, nowSec: Long, distanceM: Double?): Pair<String, Color> {
    if (s == null) return Txt.s(R.string.home_tile_not_sharing) to Mosh.TextFaint
    val age = nowSec - s.timeSec
    val lowBattery = s.batteryPct?.takeIf { it <= 20 } // only worth saying when low
    fun withBattery(text: String) = if (lowBattery != null) Txt.s(R.string.home_tile_with_battery, text, lowBattery) else text
    return when {
        s.lastGasp -> Txt.s(R.string.home_tile_phone_died) to Mosh.Danger
        distanceM != null -> withBattery(distanceLabel(distanceM)) to (if (age < 180) Mosh.Lime else Mosh.TextDim)
        age < 120 -> withBattery(Txt.s(R.string.home_tile_live)) to Mosh.Lime
        else -> withBattery(ago(age)) to Mosh.TextFaint
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
    /** Overrides the status under a tile, e.g. "at the venue" for followers. */
    notes: Map<String, String> = emptyMap(),
) {
    Row(
        Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 10.dp, horizontal = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        crew.forEachIndexed { i, f ->
            val bob = rememberFloat(i)
            val (status, colour) = notes[f.id]?.let { it to (if (it == nz.waveformlabs.moshpoint.Txt.s(R.string.crew_at_venue)) Mosh.Lime else Mosh.TextDim) }
                ?: tileStatus(seen[f.id], nowSec, distances[f.id])
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
        GigGroup.Ping.COMING to stringResource(R.string.home_ping_on_my_way),
        GigGroup.Ping.WHERE_ARE_YOU to stringResource(R.string.home_ping_where_are_you),
        GigGroup.Ping.STAY_PUT to stringResource(R.string.home_ping_stay_put),
        GigGroup.Ping.MEET_AT_PIN to stringResource(R.string.home_ping_meet_at_pin),
        GigGroup.Ping.ALL_GOOD to stringResource(R.string.home_ping_all_good),
    )
    val sentLabel = stringResource(R.string.home_ping_sent)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { (kind, label) ->
            PingChip(if (sent == kind) sentLabel else label, if (sent == kind) Mosh.Lime else Mosh.Cyan) {
                onPing(kind)
                sent = kind
            }
        }
        PingChip(stringResource(R.string.home_ping_heading_home), Mosh.Violet) { goingHome = true }
        PingChip(stringResource(R.string.home_ping_need_help), Mosh.Danger) { confirmHelp = true }
    }
    if (goingHome) {
        AlertDialog(
            onDismissRequest = { goingHome = false },
            containerColor = Mosh.Deep,
            title = { Text(stringResource(R.string.home_heading_home_title), style = Mosh.Heading) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stringResource(R.string.home_heading_home_text), style = Mosh.Body)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(30, 45, 60, 90).forEach { m ->
                            PingChip(pluralStringResource(R.plurals.home_checkin_minutes, m, m), Mosh.Violet) { onCheckIn(m); sent = GigGroup.Ping.CHECK_IN; goingHome = false }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { onPing(GigGroup.Ping.GOING_HOME); sent = GigGroup.Ping.GOING_HOME; goingHome = false }) {
                    Text(stringResource(R.string.home_just_tell_them), style = Mosh.Label.copy(color = Mosh.Cyan))
                }
            },
            dismissButton = { TextButton(onClick = { goingHome = false }) { Text(stringResource(R.string.home_cancel), style = Mosh.Label) } },
        )
    }
    if (confirmHelp) {
        HelpDialog(onAlertCrew = { onPing(GigGroup.Ping.NEED_HELP); sent = GigGroup.Ping.NEED_HELP }, onClose = { confirmHelp = false })
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
                    stringResource(R.string.home_ping_line, p.from, describe(p.kind)),
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
internal fun HomeBar(onMap: () -> Unit, onAdd: () -> Unit, onMe: () -> Unit, myName: String = "", onStory: () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().background(Mosh.Deep.copy(alpha = 0.96f))
            .border(1.dp, Mosh.Line, RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp))
            .navigationBarsPadding().padding(horizontal = 12.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceEvenly,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BarItem(stringResource(R.string.home_bar_crew), selected = true, icon = { c -> CrewIcon(c) }) {}
        BarItem(stringResource(R.string.home_bar_map), selected = false, icon = { c -> PinIcon(c) }, onClick = onMap)
        BarItem(stringResource(R.string.home_bar_add), selected = false, accent = true, icon = { c -> PlusIcon(c) }, onClick = onAdd)
        BarItem(stringResource(R.string.home_bar_story), selected = false, icon = { c -> PolaroidIcon(c) }, onClick = onStory)
        BarItem(stringResource(R.string.home_bar_me), selected = false, icon = { _ ->
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
        Modifier.pressScale(sc).width(64.dp)
            .clickable(interactionSource = src, indication = null, onClickLabel = label, role = androidx.compose.ui.semantics.Role.Tab, onClick = onClick)
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
    onBump: () -> Unit = {},
    onPlanGig: (() -> Unit)? = null,
) {
    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onClose, containerColor = Mosh.Deep) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.home_add_mates), style = Mosh.Heading)
            Text(
                stringResource(R.string.home_add_mates_text),
                style = Mosh.Body,
            )
            NeonButton(if (inCrew) stringResource(R.string.home_show_crew_qr) else stringResource(R.string.home_start_crew_show_qr)) { onClose(); onShowCrewQr() }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlassButton(stringResource(R.string.home_scan_qr), Modifier.weight(1f)) { onClose(); onScanQr() }
                GlassButton(stringResource(R.string.home_paste_invite), Modifier.weight(1f)) { onClose(); onPasteInvite() }
            }
            GlassButton(stringResource(R.string.home_bump_phones)) { onClose(); onBump() }
            if (onPlanGig != null) GlassButton(stringResource(R.string.home_plan_gig)) { onClose(); onPlanGig() }
            GlassButton(stringResource(R.string.home_send_app_invite)) { onClose(); onShareApp() }
            Spacer(Modifier.height(4.dp))
            Text(stringResource(R.string.home_friends_every_gig), style = Mosh.Eyebrow)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TextButton(onClick = { onClose(); onShowMyQr() }) { Text(stringResource(R.string.home_my_friend_qr), style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                TextButton(onClick = { onClose(); onEnterCode() }) { Text(stringResource(R.string.home_enter_code), style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
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
        Text(stringResource(R.string.home_check_in_by, byClock), style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Violet), modifier = Modifier.weight(1f))
        TextButton(onClick = onHomeSafe) { Text(stringResource(R.string.home_home_safe), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Lime)) }
    }
}

/** Two calm secondary actions under "Find everyone". */
@Composable
internal fun CrewActions(onMessage: () -> Unit, onMoment: () -> Unit, unread: Int = 0) {
    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        GlassButton(if (unread > 0) stringResource(R.string.home_chat_unread, unread) else stringResource(R.string.home_chat), Modifier.weight(1f), onClick = onMessage)
        GlassButton(stringResource(R.string.home_camera), Modifier.weight(1f), onClick = onMoment)
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
            Text(stringResource(R.string.home_message_crew), style = Mosh.Heading)
            Text(stringResource(R.string.home_message_crew_text), style = Mosh.Body)
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
            bmp, contentDescription = stringResource(R.string.home_crew_qr_desc),
            modifier = Modifier.size(200.dp).background(Color.White, RoundedCornerShape(18.dp)).padding(10.dp),
        )
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.home_inline_qr_text), style = Mosh.Body.copy(fontSize = 14.sp), textAlign = TextAlign.Center)
        TextButton(onClick = onShare) { Text(stringResource(R.string.home_no_camera_send_invite), style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
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

@Composable
private fun PolaroidIcon(c: Color) = androidx.compose.foundation.Canvas(Modifier.size(24.dp)) {
    val w = size.width
    val stroke = androidx.compose.ui.graphics.drawscope.Stroke(width = w * 0.09f, join = androidx.compose.ui.graphics.StrokeJoin.Round)
    rotate(-8f) {
        drawRoundRect(c, androidx.compose.ui.geometry.Offset(w * 0.16f, w * 0.1f), androidx.compose.ui.geometry.Size(w * 0.68f, w * 0.8f), androidx.compose.ui.geometry.CornerRadius(w * 0.06f), style = stroke)
        drawRect(c.copy(alpha = 0.45f), androidx.compose.ui.geometry.Offset(w * 0.27f, w * 0.21f), androidx.compose.ui.geometry.Size(w * 0.46f, w * 0.42f))
    }
}

/** "Your gigs": past nights kept on this phone, to relive and save. */
@Composable
internal fun PastGigs(gigs: List<nz.waveformlabs.moshpoint.GigArchive.Summary>, onOpen: (nz.waveformlabs.moshpoint.GigArchive.Summary) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        gigs.forEach { g ->
            val cover = remember(g.cover) { g.cover?.let { nz.waveformlabs.moshpoint.GigArchive.thumbnail(it) }?.asImageBitmap() }
            Row(
                Modifier.fillMaxWidth().background(Mosh.SurfaceLow, RoundedCornerShape(18.dp))
                    .border(1.dp, Color(0x12FFFFFF), RoundedCornerShape(18.dp))
                    .clickable { onOpen(g) }.padding(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(64.dp).graphicsLayer { rotationZ = -4f }
                        .background(Color(0xFFF7F4EC), RoundedCornerShape(3.dp)).padding(start = 4.dp, end = 4.dp, top = 4.dp, bottom = 10.dp),
                ) {
                    if (cover != null) {
                        androidx.compose.foundation.Image(cover, null, contentScale = androidx.compose.ui.layout.ContentScale.Crop, modifier = Modifier.fillMaxWidth().height(50.dp))
                    }
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(g.name, style = Mosh.Label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val day = java.text.SimpleDateFormat("EEE d MMM yyyy", java.util.Locale.getDefault()).format(java.util.Date(g.whenSec * 1000))
                    Text(listOf(day, g.venue).filter { it.isNotBlank() }.joinToString(" · "), style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    val names = g.people.take(3).joinToString(", ")
                    val counts = listOfNotNull(
                        pluralStringResource(R.plurals.home_gig_photos, g.photos, g.photos).takeIf { g.photos > 0 },
                        pluralStringResource(R.plurals.home_gig_clips, g.clips, g.clips).takeIf { g.clips > 0 },
                        if (g.people.size > 3) stringResource(R.string.home_people_more, names, g.people.size - 3) else names,
                    )
                    Text(counts.joinToString(" · "), style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 15.sp, color = Mosh.TextFaint), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                Text("›", style = Mosh.Heading.copy(color = Mosh.TextFaint))
            }
        }
    }
}


/** The crew chat bar on the crew card, always there while you're in a crew: the pinned plan (if any) and new messages. */
@Composable
internal fun ChatPill(unread: Int, plan: String?, onClick: () -> Unit) {
    val (src, sc) = rememberPress()
    Row(
        Modifier.fillMaxWidth().pressScale(sc).background(Mosh.Lime.copy(alpha = 0.12f), RoundedCornerShape(14.dp))
            .border(1.dp, Mosh.Lime.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
            .clickable(interactionSource = src, indication = androidx.compose.foundation.LocalIndication.current, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("💬", fontSize = 18.sp)
        Spacer(Modifier.width(10.dp))
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.home_crew_chat), style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Lime))
            Text(
                if (plan != null) stringResource(R.string.home_pinned_plan, plan) else stringResource(R.string.home_chat_subtitle),
                style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim), maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (unread > 0) {
            Box(Modifier.background(Mosh.Pink, CircleShape).padding(horizontal = 8.dp, vertical = 2.dp)) {
                Text(if (unread > 9) stringResource(R.string.home_unread_many) else pluralStringResource(R.plurals.home_unread_new, unread, unread), style = Mosh.Label.copy(fontSize = 12.sp, color = Color.White))
            }
            Spacer(Modifier.width(8.dp))
        }
        Text("›", style = Mosh.Label.copy(fontSize = 20.sp, color = Mosh.Lime))
    }
}

/** A crew that's coming up, for the "Up next" list under the main crew card. */
data class UpNextCard(
    val id: String,
    val name: String,
    /** "Sat 6 Dec, 8:00 pm" */
    val whenText: String?,
    /** "in 3 weeks", "tomorrow" */
    val countdown: String?,
    val venue: String,
    val mates: Int,
    val unread: Int,
    val plan: String?,
    val following: Boolean,
)

/** "Up next": tap for its chat (hype it up), invite and plan. */
@Composable
internal fun UpNextRow(card: UpNextCard, onClick: () -> Unit) {
    val (src, sc) = rememberPress()
    Row(
        Modifier.fillMaxWidth().pressScale(sc).background(Mosh.Surface, RoundedCornerShape(18.dp))
            .border(1.dp, Mosh.Line, RoundedCornerShape(18.dp))
            .clickable(interactionSource = src, indication = androidx.compose.foundation.LocalIndication.current, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(card.name, style = Mosh.Label.copy(fontSize = 17.sp), maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (card.countdown != null) {
                    Spacer(Modifier.width(8.dp))
                    Text(
                        card.countdown, style = Mosh.Label.copy(fontSize = 12.sp, color = Mosh.Violet),
                        modifier = Modifier.background(Mosh.Violet.copy(alpha = 0.16f), RoundedCornerShape(10.dp)).padding(horizontal = 8.dp, vertical = 2.dp),
                    )
                }
            }
            val sub = listOfNotNull(card.whenText, card.venue.takeIf { it.isNotBlank() }).joinToString(" · ")
            if (sub.isNotEmpty()) Text(sub, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                when {
                    card.plan != null -> stringResource(R.string.home_pinned_plan, card.plan)
                    card.following -> stringResource(R.string.home_following_from_home)
                    card.mates == 0 -> stringResource(R.string.home_upnext_invite)
                    else -> pluralStringResource(R.plurals.home_upnext_mates, card.mates, card.mates)
                },
                style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.Lime), maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
        }
        if (card.unread > 0) {
            Spacer(Modifier.width(8.dp))
            Box(Modifier.background(Mosh.Pink, CircleShape).padding(horizontal = 8.dp, vertical = 2.dp)) {
                Text(if (card.unread > 9) stringResource(R.string.home_unread_many) else "${card.unread}", style = Mosh.Label.copy(fontSize = 12.sp, color = Color.White))
            }
        }
        Spacer(Modifier.width(6.dp))
        Text("›", style = Mosh.Label.copy(fontSize = 22.sp, color = Mosh.TextFaint))
    }
}

