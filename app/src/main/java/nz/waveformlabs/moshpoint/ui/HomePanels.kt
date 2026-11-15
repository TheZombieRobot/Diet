package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.LocalIndication
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.map.LocationBook
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.GigGroup

// The home's pop-up panels (docs/design/home-redesign): friends, the crew menu, Add, and the
// message panel with its one-tap pings.

/** A panel's title. */
@Composable
internal fun PanelTitle(text: String) {
    Text(
        text, style = HomeType.Heading.copy(fontSize = 22.sp),
        modifier = Modifier.padding(start = HomeSide, end = HomeSide, top = 4.dp, bottom = 8.dp).semantics { heading() },
    )
}

/**
 * "See all" friends: everyone kept for every gig, each with a ⋯ that's always there (photo,
 * remove…), as asked: removing a friend shouldn't depend on knowing about long-press.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun FriendsListContent(
    friends: List<Friend>,
    seen: Map<String, LocationBook.Seen>,
    nowSec: Long,
    onFind: (String) -> Unit,
    onOptions: (Friend) -> Unit,
) {
    val optionsLabel = stringResource(R.string.home_face_options)
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 24.dp)) {
        PanelTitle(stringResource(R.string.home_section_friends))
        friends.forEach { f ->
            val status = faceStatus(seen[f.id], nowSec, null)
            val optionsFor = stringResource(R.string.home_friend_options, f.name)
            Row(
                Modifier.fillMaxWidth()
                    .heightIn(min = 72.dp)
                    .combinedClickable(
                        onClickLabel = stringResource(R.string.home_find_name, f.name),
                        role = Role.Button,
                        onLongClickLabel = optionsLabel,
                        onLongClick = { onOptions(f) },
                        onClick = { onFind(f.id) },
                    )
                    .padding(start = HomeSide, end = 12.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FaceImage(f, 46.dp, status.live, dim = false, glow = 10.dp)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(f.name, style = HomeType.RowTitle.copy(fontSize = 16.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(status.text, style = HomeType.Small.copy(color = status.colour), maxLines = 2)
                }
                Spacer(Modifier.width(4.dp))
                Box(
                    Modifier.size(48.dp).clip(CircleShape)
                        .clickable(role = Role.Button, onClick = { onOptions(f) })
                        .semantics { contentDescription = optionsFor },
                    contentAlignment = Alignment.Center,
                ) { HomeIcon(HomeIcons.More, Mosh.TextDim, 20.dp) }
            }
        }
    }
}

/**
 * The crew menu (⋯): once-a-night crew actions. Invite more mates (the crew QR, or a link),
 * share the night with family, reset the invite (owner only), then end the night, cancel a
 * crew that's coming up, or stop following.
 */
@Composable
internal fun CrewMenuContent(
    name: String,
    subtitle: String,
    onInvite: (() -> Unit)?,
    onFamily: (() -> Unit)?,
    onReset: (() -> Unit)?,
    endTitle: String,
    endSub: String,
    onEnd: () -> Unit,
) {
    var confirmReset by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding()
            .padding(start = HomeSide, end = HomeSide, top = 4.dp, bottom = 28.dp),
    ) {
        Text(name, style = HomeType.Heading.copy(fontSize = 22.sp), maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(4.dp))
        Text(subtitle, style = HomeType.Small)
        Spacer(Modifier.height(12.dp))
        if (onInvite != null) {
            MenuRow(
                HomeIcons.UserPlus, Mosh.Cyan.copy(alpha = 0.13f), Mosh.Cyan,
                stringResource(R.string.home_menu_invite), stringResource(R.string.home_menu_invite_sub), onInvite,
            )
        }
        if (onFamily != null) {
            MenuRow(
                HomeIcons.House, Mosh.Violet.copy(alpha = 0.16f), Mosh.Lilac,
                stringResource(R.string.home_menu_family), stringResource(R.string.home_menu_family_sub), onFamily,
            )
        }
        if (onReset != null) {
            MenuRow(
                HomeIcons.Reset, Mosh.GlassFill, Mosh.TextDim,
                stringResource(R.string.setup_qr_reset_invite), stringResource(R.string.home_menu_reset_sub), { confirmReset = true },
            )
        }
        if (onInvite != null || onFamily != null || onReset != null) {
            Box(Modifier.padding(vertical = 8.dp).fillMaxWidth().height(1.dp).background(Mosh.Hairline))
        }
        MenuRow(HomeIcons.Power, Mosh.Pink.copy(alpha = 0.12f), Mosh.Danger, endTitle, endSub, onEnd, danger = true)
    }
    if (confirmReset && onReset != null) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            containerColor = Mosh.Deep,
            title = { Text(stringResource(R.string.setup_qr_reset_title), style = HomeType.Heading) },
            text = { Text(stringResource(R.string.setup_qr_reset_text), style = HomeType.Body) },
            confirmButton = { TextButton(onClick = { confirmReset = false; onReset() }) { Text(stringResource(R.string.setup_qr_reset), style = HomeType.Label.copy(color = Mosh.Cyan)) } },
            dismissButton = { TextButton(onClick = { confirmReset = false }) { Text(stringResource(R.string.setup_cancel), style = HomeType.Label) } },
        )
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
            title = { Text(stringResource(R.string.home_heading_home_title), style = HomeType.Heading) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stringResource(R.string.home_heading_home_text), style = HomeType.Body)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(30, 45, 60, 90).forEach { m ->
                            PingChip(pluralStringResource(R.plurals.home_checkin_minutes, m, m), Mosh.Violet) { onCheckIn(m); sent = GigGroup.Ping.CHECK_IN; goingHome = false }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { onPing(GigGroup.Ping.GOING_HOME); sent = GigGroup.Ping.GOING_HOME; goingHome = false }) {
                    Text(stringResource(R.string.home_just_tell_them), style = HomeType.Label.copy(color = Mosh.Cyan))
                }
            },
            dismissButton = { TextButton(onClick = { goingHome = false }) { Text(stringResource(R.string.home_cancel), style = HomeType.Label) } },
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
            .clickable(interactionSource = src, indication = LocalIndication.current, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = HomeType.Label.copy(fontSize = 14.sp, color = colour)) }
}

/** Every way to add someone, in one panel instead of always on screen. */
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
    MoshSheet(onClose = onClose) {
        AddSheetContent(
            inCrew = inCrew,
            onShowCrewQr = { onClose(); onShowCrewQr() },
            onScanQr = { onClose(); onScanQr() },
            onShareApp = { onClose(); onShareApp() },
            onPasteInvite = { onClose(); onPasteInvite() },
            onShowMyQr = { onClose(); onShowMyQr() },
            onEnterCode = { onClose(); onEnterCode() },
            onBump = { onClose(); onBump() },
            onPlanGig = onPlanGig?.let { plan -> { onClose(); plan() } },
        )
    }
}

/** The Add panel's contents (separate so it can be screenshot-tested). */
@Composable
internal fun AddSheetContent(
    inCrew: Boolean,
    onShowCrewQr: () -> Unit,
    onScanQr: () -> Unit,
    onShareApp: () -> Unit,
    onPasteInvite: () -> Unit,
    onShowMyQr: () -> Unit,
    onEnterCode: () -> Unit,
    onBump: () -> Unit,
    onPlanGig: (() -> Unit)?,
) {
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding()
            .padding(start = HomeSide, end = HomeSide, top = 4.dp, bottom = 28.dp),
    ) {
        Text(stringResource(R.string.home_add_mates), style = HomeType.Heading.copy(fontSize = 22.sp), modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(6.dp))
        Text(stringResource(R.string.home_add_mates_text), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 21.sp))
        Spacer(Modifier.height(20.dp))
        HeroButton(
            if (inCrew) stringResource(R.string.home_show_crew_qr) else stringResource(R.string.home_start_crew_show_qr),
            HomeIcons.Qr, onClick = onShowCrewQr,
        )
        Spacer(Modifier.height(12.dp))
        JoinButtons(onScanQr, onPasteInvite)
        Spacer(Modifier.height(8.dp))
        MenuRow(HomeIcons.Bump, Mosh.Cyan.copy(alpha = 0.13f), Mosh.Cyan, stringResource(R.string.home_bump_phones), null, onBump)
        if (onPlanGig != null) {
            MenuRow(HomeIcons.Calendar, Mosh.Violet.copy(alpha = 0.16f), Mosh.Lilac, stringResource(R.string.home_plan_gig), null, onPlanGig)
        }
        MenuRow(HomeIcons.Share, Mosh.Pink.copy(alpha = 0.12f), Mosh.Danger, stringResource(R.string.home_send_app_invite), null, onShareApp)
        Spacer(Modifier.height(18.dp))
        Kicker(stringResource(R.string.home_friends_every_gig))
        Spacer(Modifier.height(10.dp))
        ButtonPair(
            first = { GlassAction(stringResource(R.string.home_my_friend_qr), HomeIcons.Qr, onClick = onShowMyQr) },
            second = { GlassAction(stringResource(R.string.home_enter_code), HomeIcons.Keypad, onClick = onEnterCode) },
        )
    }
}

/** Everything you can tell the crew, in one panel: pings, heading home, need help. */
@Composable
internal fun MessageSheet(onPing: (Int) -> Unit, onCheckIn: (Int) -> Unit, onClose: () -> Unit) {
    MoshSheet(onClose = onClose) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(start = HomeSide, end = HomeSide, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(stringResource(R.string.home_message_crew), style = HomeType.Heading.copy(fontSize = 22.sp), modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.home_message_crew_text), style = HomeType.Body)
            PingBar(onPing = { onPing(it) }, onCheckIn = { onCheckIn(it) })
        }
    }
}
