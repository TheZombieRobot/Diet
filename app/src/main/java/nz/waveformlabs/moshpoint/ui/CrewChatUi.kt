package nz.waveformlabs.moshpoint.ui

import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.Image
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.CrewChat
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Safety
import nz.waveformlabs.moshpoint.core.GigGroup

/**
 * The crew's chat: the pinned plan on top (Muse-style), short messages, flares with a vibe,
 * and the one-tap pings underneath. Followers at home can read but not post.
 */
@Composable
internal fun CrewChatScreen(
    crewName: String,
    lines: List<CrewChat.Line>,
    plan: CrewChat.Plan?,
    flares: List<CrewChat.Flare>,
    myName: String,
    nowSec: Long,
    meetUp: String?,
    readOnly: Boolean,
    onSend: (String) -> Unit,
    onSetPlan: (String) -> Unit,
    onFlare: (String) -> Unit,
    onEndFlare: () -> Unit,
    onPing: (Int) -> Unit,
    onCheckIn: (Int) -> Unit,
    onSharePlan: () -> Unit,
    onOpenMap: () -> Unit,
    onBack: () -> Unit,
    /** Flares and one-tap pings: only for the crew that's on tonight. */
    nightTools: Boolean = true,
    /** "Sat 6 Dec · in 3 weeks" for a crew that's coming up. */
    subtitle: String? = null,
    /** Show this crew's invite QR. */
    onInvite: (() -> Unit)? = null,
    /** "Not sent · tap to retry". */
    onRetry: (CrewChat.Line) -> Unit = {},
    /** This (waiting) crew's gig is on today: offer to make it the main crew. */
    onMakeMain: (() -> Unit)? = null,
    /** Each sender's face (their photo), or null for an initials bubble. */
    photoOf: (name: String, mine: Boolean) -> androidx.compose.ui.graphics.ImageBitmap? = { _, _ -> null },
    /** Each mate's colour, so their name and ring match the map and tiles. */
    colourOf: (String) -> Int? = { null },
) {
    BackHandler(onBack = onBack)
    var draft by remember { mutableStateOf("") }
    var editingPlan by remember { mutableStateOf(false) }
    var flaring by remember { mutableStateOf(false) }
    val list = rememberLazyListState()
    LaunchedEffect(lines.size) { if (lines.isNotEmpty()) list.animateScrollToItem(lines.size - 1) }
    Column(Modifier.fillMaxSize().background(Mosh.Ground).statusBarsPadding().navigationBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹", style = Mosh.Heading.copy(fontSize = 28.sp)) }
            Column(Modifier.weight(1f)) {
                Text(crewName, style = Mosh.Heading.copy(fontSize = 20.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(subtitle ?: stringResource(R.string.crew_chat_subtitle), style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
            if (onInvite != null && !readOnly) TextButton(onClick = onInvite) { Text(stringResource(R.string.crew_chat_invite), style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Cyan)) }
        }
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (onMakeMain != null) {
                Row(
                    Modifier.fillMaxWidth().background(Mosh.Cyan.copy(alpha = 0.12f), RoundedCornerShape(14.dp))
                        .border(1.dp, Mosh.Cyan.copy(alpha = 0.5f), RoundedCornerShape(14.dp)).padding(start = 14.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(stringResource(R.string.crew_chat_on_today), style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.Text), modifier = Modifier.weight(1f))
                    TextButton(onClick = onMakeMain) { Text(stringResource(R.string.crew_chat_switch), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
                }
            }
            PlanCard(plan, meetUp, readOnly, onEdit = { editingPlan = true }, onShare = onSharePlan, onMap = onOpenMap)
            val mine = flares.firstOrNull { it.from == myName }
            flares.forEach { f -> FlareRow(f, nowSec, mine = f.from == myName, onEnd = onEndFlare, onMap = onOpenMap) }
            if (!readOnly && mine == null && nightTools) {
                Text(
                    pluralStringResource(R.plurals.crew_chat_send_flare_hint, CrewChat.FLARE_MIN, CrewChat.FLARE_MIN),
                    style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber),
                    modifier = Modifier.clickable { flaring = true }.padding(vertical = 4.dp),
                )
            }
        }
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
            state = list,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item { Spacer(Modifier.height(8.dp)) }
            if (lines.isEmpty()) {
                item {
                    Text(
                        stringResource(R.string.crew_chat_empty),
                        style = Mosh.Body.copy(fontSize = 14.sp, color = Mosh.TextFaint), modifier = Modifier.padding(vertical = 24.dp),
                    )
                }
            }
            itemsIndexed(lines, key = { _, it -> it.key }) { i, l ->
                // New messages ease in; the list makes room smoothly.
                Box(Modifier.animateItem()) {
                // Messenger-style runs: name on the first message, face on the last.
                fun same(o: CrewChat.Line?) = o != null && isBubble(o.kind) && o.mine == l.mine &&
                    (if (o.sender != 0L && l.sender != 0L) o.sender == l.sender else o.from == l.from)
                ChatLine(
                    l, nowSec,
                    first = !same(lines.getOrNull(i - 1)),
                    last = !same(lines.getOrNull(i + 1)),
                    face = photoOf(l.from, l.mine),
                    colour = colourOf(l.from)?.let { Color(it) },
                    myName = myName,
                    onRetry = onRetry,
                )
            }
            }
            item { Spacer(Modifier.height(8.dp)) }
        }
        if (!readOnly) {
            Column(Modifier.background(Mosh.Deep).padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (nightTools) PingBar(onPing = onPing, onCheckIn = onCheckIn)
                else Text(
                    stringResource(R.string.crew_chat_night_tools_later),
                    style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint), modifier = Modifier.padding(horizontal = 4.dp),
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        draft, { if (it.length <= 140) draft = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text(stringResource(R.string.crew_chat_message_hint), style = Mosh.Body.copy(color = Mosh.TextFaint)) },
                        textStyle = Mosh.Body.copy(color = Mosh.Text),
                        maxLines = 3,
                        shape = RoundedCornerShape(22.dp),
                        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Mosh.Cyan, unfocusedBorderColor = Mosh.Line),
                    )
                    Spacer(Modifier.size(8.dp))
                    Box(
                        Modifier.size(48.dp).background(if (draft.isBlank()) Mosh.Surface else Mosh.Lime, CircleShape)
                            .clickable(enabled = draft.isNotBlank()) { onSend(draft); draft = "" },
                        contentAlignment = Alignment.Center,
                    ) { Text("➤", style = Mosh.Label.copy(color = if (draft.isBlank()) Mosh.TextFaint else Color(0xFF0B1200))) }
                }
            }
        }
    }
    if (editingPlan) PlanEditor(plan?.text.orEmpty(), onSave = { onSetPlan(it); editingPlan = false }, onClose = { editingPlan = false })
    if (flaring) FlarePicker(onPick = { onFlare(it); flaring = false }, onClose = { flaring = false })
}

@Composable
private fun PlanCard(plan: CrewChat.Plan?, meetUp: String?, readOnly: Boolean, onEdit: () -> Unit, onShare: () -> Unit, onMap: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(Mosh.Lime.copy(alpha = 0.10f), RoundedCornerShape(16.dp))
            .border(1.dp, Mosh.Lime.copy(alpha = 0.45f), RoundedCornerShape(16.dp))
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(stringResource(R.string.crew_plan_eyebrow), style = Mosh.Eyebrow.copy(color = Mosh.Lime))
        Text(
            plan?.text ?: if (readOnly) stringResource(R.string.crew_plan_none) else stringResource(R.string.crew_plan_prompt),
            // Typed by a mate: laid out in its own writing direction (English in an Arabic UI and vice versa).
            style = (if (plan != null) Mosh.Label.copy(fontSize = 17.sp) else Mosh.Body.copy(fontSize = 14.sp))
                .copy(textDirection = androidx.compose.ui.text.style.TextDirection.Content),
            modifier = Modifier.padding(top = 2.dp),
        )
        if (plan != null) Text(stringResource(R.string.crew_plan_by, plan.from), style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint))
        if (meetUp != null) {
            Text(stringResource(R.string.crew_plan_meet_up, meetUp), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Pink), modifier = Modifier.clickable(onClick = onMap).padding(top = 4.dp))
        }
        Row {
            if (!readOnly) TextButton(onClick = onEdit) { Text(if (plan == null) stringResource(R.string.crew_plan_pin) else stringResource(R.string.crew_plan_change), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Lime)) }
            if (plan != null || meetUp != null) TextButton(onClick = onShare) { Text(stringResource(R.string.crew_plan_share), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
        }
    }
}

@Composable
private fun FlareRow(f: CrewChat.Flare, nowSec: Long, mine: Boolean, onEnd: () -> Unit, onMap: () -> Unit) {
    val left = ((f.untilSec - nowSec) / 60).coerceAtLeast(0)
    Row(
        Modifier.fillMaxWidth().background(Mosh.Amber.copy(alpha = 0.12f), RoundedCornerShape(14.dp))
            .border(1.dp, Mosh.Amber.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
            .clickable(onClick = onMap).padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text("🔥", fontSize = 18.sp)
        Spacer(Modifier.size(8.dp))
        Column(Modifier.weight(1f)) {
            Text(if (mine) stringResource(R.string.crew_flare_mine, f.vibe) else stringResource(R.string.crew_flare_theirs, f.from, f.vibe), style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Amber), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                if (f.lat != null) pluralStringResource(R.plurals.crew_flare_left_on_map, left.toInt(), left.toInt()) else pluralStringResource(R.plurals.crew_flare_left, left.toInt(), left.toInt()),
                style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint))
        }
        if (mine) TextButton(onClick = onEnd) { Text(stringResource(R.string.crew_flare_end), style = Mosh.Label.copy(fontSize = 14.sp)) }
    }
}

@Composable
private fun ChatLine(
    l: CrewChat.Line,
    nowSec: Long,
    first: Boolean = true,
    last: Boolean = true,
    face: androidx.compose.ui.graphics.ImageBitmap? = null,
    colour: Color? = null,
    myName: String = "",
    onRetry: (CrewChat.Line) -> Unit = {},
) {
    if (!isBubble(l.kind)) {
        // "Jo pinned: …" / "Jo sent a flare: …" as a quiet centred note.
        Text(
            stringResource(R.string.crew_chat_line_with_time, systemLine(l), ago(nowSec - l.timeSec)),
            style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint),
            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        return
    }
    // Their colour everywhere: name, face ring and bubble edge here, the bubble on the finder.
    // Crew members who aren't friends get a steady colour from their name, never all cyan.
    val ring = colour ?: Color(Mosh.FriendColours[Math.floorMod(l.from.trim().lowercase().hashCode(), Mosh.FriendColours.size)])
    Row(
        Modifier.fillMaxWidth().padding(top = if (first) 6.dp else 0.dp),
        horizontalArrangement = if (l.mine) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Bottom,
    ) {
        if (!l.mine) {
            if (last) ChatHead(l.from, face, ring) else Spacer(Modifier.size(34.dp))
            Spacer(Modifier.size(8.dp))
        }
        Column(horizontalAlignment = if (l.mine) Alignment.End else Alignment.Start) {
            // Always the name, not just the face: photos can be hard to make out, or change mid-gig.
            if (first) Text(
                if (l.mine) stringResource(R.string.crew_you) else l.from,
                style = Mosh.Label.copy(fontSize = 13.sp, color = if (l.mine) Mosh.Lime else ring),
                modifier = Modifier.padding(horizontal = 10.dp),
            )
            Text(
                if (l.kind == GigGroup.Ping.CHAT) l.text else quickLine(l),
                // A message reads in its own direction, whatever language the app is in.
                style = Mosh.Body.copy(color = if (l.mine) Color(0xFF0B1200) else Mosh.Text, textDirection = androidx.compose.ui.text.style.TextDirection.Content),
                modifier = Modifier.widthIn(max = 260.dp)
                    .background(if (l.mine) Mosh.Lime.copy(alpha = if (l.state == CrewChat.SENT) 1f else 0.55f) else Mosh.Surface, RoundedCornerShape(18.dp))
                    .border(1.dp, if (l.mine) Color.Transparent else ring.copy(alpha = 0.35f), RoundedCornerShape(18.dp))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            )
            when {
                l.mine && l.state == CrewChat.FAILED -> Text(
                    stringResource(R.string.crew_chat_not_sent),
                    style = Mosh.Label.copy(fontSize = 12.sp, color = Mosh.Danger),
                    modifier = Modifier.clickable { onRetry(l) }.padding(horizontal = 10.dp, vertical = 2.dp),
                )
                l.mine && l.state == CrewChat.SENDING -> Text(stringResource(R.string.crew_chat_sending), style = Mosh.Body.copy(fontSize = 11.sp, color = Mosh.TextFaint), modifier = Modifier.padding(horizontal = 10.dp))
                last -> Text(stringResource(R.string.crew_chat_line_with_time, if (l.mine) stringResource(R.string.crew_you) else l.from, ago(nowSec - l.timeSec)), style = Mosh.Body.copy(fontSize = 11.sp, color = Mosh.TextFaint), modifier = Modifier.padding(horizontal = 10.dp))
            }
        }
        if (l.mine) {
            Spacer(Modifier.size(8.dp))
            if (last) ChatHead(myName, face, Mosh.Lime) else Spacer(Modifier.size(34.dp))
        }
    }
}

/** Shown as a speech bubble: typed messages, and the one-tap pings ("On my way"). */
private fun isBubble(kind: Int) = kind == GigGroup.Ping.CHAT || CrewChat.isQuick(kind)

/** A one-tap ping's words, in the current language ([CrewChat.Line.text] holds a check-in's minutes). */
@Composable
private fun quickLine(l: CrewChat.Line): String = when (l.kind) {
    GigGroup.Ping.COMING -> stringResource(R.string.crew_quick_coming)
    GigGroup.Ping.WHERE_ARE_YOU -> stringResource(R.string.crew_quick_where)
    GigGroup.Ping.STAY_PUT -> stringResource(R.string.crew_quick_stay_put)
    GigGroup.Ping.MEET_AT_PIN -> stringResource(R.string.crew_quick_meet_pin)
    GigGroup.Ping.ALL_GOOD -> stringResource(R.string.crew_quick_all_good)
    GigGroup.Ping.GOING_HOME -> stringResource(R.string.crew_quick_going_home)
    GigGroup.Ping.NEED_HELP -> stringResource(R.string.crew_quick_need_help)
    GigGroup.Ping.CHECK_IN -> (l.text.toIntOrNull() ?: 0).let { pluralStringResource(R.plurals.crew_quick_check_in, it, it) }
    GigGroup.Ping.HOME_SAFE -> stringResource(R.string.crew_quick_home_safe)
    else -> l.text
}

/**
 * A system line's sentence ("Jo pinned: …"), worded now from the stored payload so it follows
 * the phone's language. Older builds stored the English sentence itself ("pinned: …"): those
 * prefixes are stripped so the line still reads right.
 */
@Composable
private fun systemLine(l: CrewChat.Line): String {
    val you = l.mine
    return when (l.kind) {
        CrewChat.NOTE -> l.text
        GigGroup.Ping.JOIN ->
            if (you) stringResource(R.string.crew_chat_you_joined) else stringResource(R.string.crew_chat_joined, l.from)
        GigGroup.Ping.PLAN -> {
            val plan = if (l.text == "cleared the plan") "" else l.text.removePrefix("pinned: ").trim()
            when {
                plan.isEmpty() && you -> stringResource(R.string.crew_chat_you_cleared_plan)
                plan.isEmpty() -> stringResource(R.string.crew_chat_cleared_plan, l.from)
                you -> stringResource(R.string.crew_chat_you_pinned, plan)
                else -> stringResource(R.string.crew_chat_pinned, l.from, plan)
            }
        }
        GigGroup.Ping.FLARE -> {
            val vibe = l.text.removePrefix("sent a flare: ")
            if (you) stringResource(R.string.crew_chat_you_flare, vibe) else stringResource(R.string.crew_chat_flare, l.from, vibe)
        }
        else -> stringResource(R.string.crew_chat_line_other, if (you) stringResource(R.string.crew_you) else l.from, l.text)
    }
}

/** A round face beside a message: their photo, or coloured initials. */
@Composable
private fun ChatHead(name: String, face: androidx.compose.ui.graphics.ImageBitmap?, ring: Color) {
    if (face != null) {
        Image(
            face, contentDescription = name, contentScale = ContentScale.Crop,
            modifier = Modifier.size(34.dp).clip(CircleShape).border(2.dp, ring, CircleShape),
        )
    } else {
        Box(Modifier.size(34.dp).border(2.dp, ring, CircleShape).padding(2.dp)) { InitialsAvatar(name, 30.dp, ring) }
    }
}

@Composable
private fun PlanEditor(start: String, onSave: (String) -> Unit, onClose: () -> Unit) {
    var text by remember { mutableStateOf(start) }
    val ideas = listOf(
        stringResource(R.string.crew_plan_idea_sound_desk), stringResource(R.string.crew_plan_idea_bar),
        stringResource(R.string.crew_plan_idea_car), stringResource(R.string.crew_plan_idea_tent),
    )
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = Mosh.Deep,
        title = { Text(stringResource(R.string.crew_plan_title), style = Mosh.Heading) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(stringResource(R.string.crew_plan_editor_body), style = Mosh.Body.copy(fontSize = 14.sp))
                OutlinedTextField(text, { if (it.length <= 140) text = it }, maxLines = 3, textStyle = Mosh.Body.copy(color = Mosh.Text))
                Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    ideas.forEach { i ->
                        Text(
                            i, style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.Lime),
                            modifier = Modifier.background(Mosh.Lime.copy(alpha = 0.1f), RoundedCornerShape(14.dp)).clickable { text = i }
                                .padding(horizontal = 10.dp, vertical = 6.dp),
                        )
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = { onSave(text) }) { Text(stringResource(R.string.crew_plan_pin_it), style = Mosh.Label.copy(color = Mosh.Lime)) } },
        dismissButton = {
            Row {
                if (start.isNotEmpty()) TextButton(onClick = { onSave("") }) { Text(stringResource(R.string.crew_plan_unpin), style = Mosh.Label.copy(color = Mosh.Danger)) }
                TextButton(onClick = onClose) { Text(stringResource(R.string.crew_cancel), style = Mosh.Label) }
            }
        },
    )
}

@Composable
private fun FlarePicker(onPick: (String) -> Unit, onClose: () -> Unit) {
    var own by remember { mutableStateOf("") }
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = Mosh.Deep,
        title = { Text(stringResource(R.string.crew_flare_title), style = Mosh.Heading) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(pluralStringResource(R.plurals.crew_flare_body, CrewChat.FLARE_MIN, CrewChat.FLARE_MIN), style = Mosh.Body.copy(fontSize = 14.sp))
                CrewChat.VIBES.chunked(2).forEach { row ->
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        row.forEach { v ->
                            Text(
                                v, style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber),
                                modifier = Modifier.weight(1f).background(Mosh.Amber.copy(alpha = 0.12f), RoundedCornerShape(16.dp))
                                    .clickable { onPick(v) }.padding(horizontal = 10.dp, vertical = 10.dp),
                            )
                        }
                    }
                }
                OutlinedTextField(own, { if (it.length <= 40) own = it }, singleLine = true, placeholder = { Text(stringResource(R.string.crew_flare_own_hint)) }, textStyle = Mosh.Body.copy(color = Mosh.Text))
            }
        },
        confirmButton = { TextButton(onClick = { if (own.isNotBlank()) onPick(own.trim()) }, enabled = own.isNotBlank()) { Text(stringResource(R.string.crew_flare_send), style = Mosh.Label.copy(color = Mosh.Amber)) } },
        dismissButton = { TextButton(onClick = onClose) { Text(stringResource(R.string.crew_cancel), style = Mosh.Label) } },
    )
}

/**
 * "Need help": the crew alert, plus help beyond the crew: a text to your emergency contact
 * with where you are (plain SMS, works without data), and 111.
 */
@Composable
internal fun HelpDialog(onAlertCrew: () -> Unit, onClose: () -> Unit) {
    val c = LocalContext.current
    var contact by remember { mutableStateOf(Safety.contact(c)) }
    var adding by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var number by remember { mutableStateOf("") }
    var crewSent by remember { mutableStateOf(false) }
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = Mosh.Deep,
        title = { Text(stringResource(R.string.crew_help_title), style = Mosh.Heading) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                HelpAction(
                    if (crewSent) stringResource(R.string.crew_help_alerted) else stringResource(R.string.crew_help_alert),
                    stringResource(R.string.crew_help_alert_sub), Mosh.Danger,
                ) {
                    if (!crewSent) { onAlertCrew(); crewSent = true }
                }
                val who = contact
                if (who != null) {
                    HelpAction(stringResource(R.string.crew_help_text_contact, who.name), stringResource(R.string.crew_help_text_contact_sub), Mosh.Amber) { Safety.textContact(c) }
                } else if (!adding) {
                    HelpAction(stringResource(R.string.crew_help_add_contact), stringResource(R.string.crew_help_add_contact_sub), Mosh.Amber) { adding = true }
                } else {
                    OutlinedTextField(name, { name = it }, singleLine = true, placeholder = { Text(stringResource(R.string.crew_help_contact_name)) }, textStyle = Mosh.Body.copy(color = Mosh.Text))
                    OutlinedTextField(
                        number, { number = it }, singleLine = true, placeholder = { Text(stringResource(R.string.crew_help_contact_number)) },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), textStyle = Mosh.Body.copy(color = Mosh.Text),
                    )
                    TextButton(onClick = {
                        if (number.count { it.isDigit() } >= 6) {
                            Safety.setContact(c, name, number)
                            contact = Safety.contact(c)
                            adding = false
                        }
                    }) { Text(stringResource(R.string.crew_help_save_contact), style = Mosh.Label.copy(color = Mosh.Amber)) }
                }
                // The emergency number(s) where you are now (abroad at a festival too).
                val numbers = remember { nz.waveformlabs.moshpoint.EmergencyNumbers.here(c) }
                numbers.forEach { n ->
                    val sub = when (n.kind) {
                        nz.waveformlabs.moshpoint.EmergencyNumbers.Kind.ALL -> stringResource(R.string.crew_help_call_sub)
                        nz.waveformlabs.moshpoint.EmergencyNumbers.Kind.POLICE -> stringResource(R.string.crew_help_call_police)
                        nz.waveformlabs.moshpoint.EmergencyNumbers.Kind.AMBULANCE -> stringResource(R.string.crew_help_call_ambulance)
                    }
                    HelpAction(stringResource(R.string.crew_help_call, n.digits), sub, Color(0xFFFF4D4D)) { Safety.callEmergency(c, n.digits) }
                }
                Text(
                    stringResource(R.string.crew_help_no_signal, numbers.first().digits),
                    style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
                )
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text(stringResource(R.string.crew_close), style = Mosh.Label) } },
    )
}

@Composable
private fun HelpAction(title: String, sub: String, colour: Color, onClick: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().background(colour.copy(alpha = 0.12f), RoundedCornerShape(14.dp))
            .border(1.dp, colour.copy(alpha = 0.55f), RoundedCornerShape(14.dp)).clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(title, style = Mosh.Label.copy(fontSize = 16.sp, color = colour))
        Text(sub, style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 16.sp, color = Mosh.TextDim))
    }
}
