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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.CrewChat
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
                Text("Crew chat · only your crew can read it", style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint))
            }
        }
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PlanCard(plan, meetUp, readOnly, onEdit = { editingPlan = true }, onShare = onSharePlan, onMap = onOpenMap)
            val mine = flares.firstOrNull { it.from == myName }
            flares.forEach { f -> FlareRow(f, nowSec, mine = f.from == myName, onEnd = onEndFlare, onMap = onOpenMap) }
            if (!readOnly && mine == null) {
                Text(
                    "🔥  Send a flare: show where you are for 30 min",
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
                        "Nothing yet. Messages reach everyone in the crew within about a minute (faster on your own relay).",
                        style = Mosh.Body.copy(fontSize = 14.sp, color = Mosh.TextFaint), modifier = Modifier.padding(vertical = 24.dp),
                    )
                }
            }
            itemsIndexed(lines, key = { _, it -> "${it.from}|${it.timeSec}|${it.text.hashCode()}" }) { i, l ->
                // Messenger-style runs: name on the first message, face on the last.
                fun same(o: CrewChat.Line?) = o != null && o.kind == GigGroup.Ping.CHAT && o.mine == l.mine && o.from == l.from
                ChatLine(
                    l, nowSec,
                    first = !same(lines.getOrNull(i - 1)),
                    last = !same(lines.getOrNull(i + 1)),
                    face = photoOf(l.from, l.mine),
                    colour = colourOf(l.from)?.let { Color(it) },
                    myName = myName,
                )
            }
            item { Spacer(Modifier.height(8.dp)) }
        }
        if (!readOnly) {
            Column(Modifier.background(Mosh.Deep).padding(horizontal = 12.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                PingBar(onPing = onPing, onCheckIn = onCheckIn)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        draft, { if (it.length <= 140) draft = it },
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("Message the crew", style = Mosh.Body.copy(color = Mosh.TextFaint)) },
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
        Text("📌 THE PLAN", style = Mosh.Eyebrow.copy(color = Mosh.Lime))
        Text(
            plan?.text ?: if (readOnly) "No plan pinned yet." else "Pin the plan so nobody has to scroll: \"Sound desk after the encore\".",
            style = if (plan != null) Mosh.Label.copy(fontSize = 17.sp) else Mosh.Body.copy(fontSize = 14.sp),
            modifier = Modifier.padding(top = 2.dp),
        )
        if (plan != null) Text("by ${plan.from}", style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint))
        if (meetUp != null) {
            Text("★ Meet-up pin: $meetUp", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Pink), modifier = Modifier.clickable(onClick = onMap).padding(top = 4.dp))
        }
        Row {
            if (!readOnly) TextButton(onClick = onEdit) { Text(if (plan == null) "Pin a plan" else "Change", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Lime)) }
            if (plan != null || meetUp != null) TextButton(onClick = onShare) { Text("Share as a card", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
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
            Text("${if (mine) "You" else f.from}: ${f.vibe}", style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Amber), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("$left min left${if (f.lat != null) " · on the map" else ""}", style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint))
        }
        if (mine) TextButton(onClick = onEnd) { Text("End", style = Mosh.Label.copy(fontSize = 14.sp)) }
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
) {
    if (l.kind != GigGroup.Ping.CHAT) {
        // "Jo pinned: …" / "Jo sent a flare: …" as a quiet centred note.
        Text(
            "${if (l.mine) "You" else l.from} ${l.text} · ${ago(nowSec - l.timeSec)}",
            style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint),
            modifier = Modifier.fillMaxWidth().padding(vertical = 2.dp),
            textAlign = androidx.compose.ui.text.style.TextAlign.Center,
        )
        return
    }
    val ring = colour ?: Mosh.Cyan
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
                if (l.mine) "You" else l.from,
                style = Mosh.Label.copy(fontSize = 13.sp, color = if (l.mine) Mosh.Lime else ring),
                modifier = Modifier.padding(horizontal = 10.dp),
            )
            Text(
                l.text,
                style = Mosh.Body.copy(color = if (l.mine) Color(0xFF0B1200) else Mosh.Text),
                modifier = Modifier.widthIn(max = 260.dp)
                    .background(if (l.mine) Mosh.Lime else Mosh.Surface, RoundedCornerShape(18.dp))
                    .border(1.dp, if (l.mine) Color.Transparent else ring.copy(alpha = 0.35f), RoundedCornerShape(18.dp))
                    .padding(horizontal = 14.dp, vertical = 8.dp),
            )
            if (last) Text("${if (l.mine) "You" else l.from} · ${ago(nowSec - l.timeSec)}", style = Mosh.Body.copy(fontSize = 11.sp, color = Mosh.TextFaint), modifier = Modifier.padding(horizontal = 10.dp))
        }
        if (l.mine) {
            Spacer(Modifier.size(8.dp))
            if (last) ChatHead(myName, face, Mosh.Lime) else Spacer(Modifier.size(34.dp))
        }
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
    val ideas = listOf("Meet at the sound desk after the encore", "Left of the main bar at the break", "Back at the car by 11:30", "Tent if we lose each other")
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = Mosh.Deep,
        title = { Text("The plan", style = Mosh.Heading) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Pinned at the top of the chat for everyone, so it never scrolls away.", style = Mosh.Body.copy(fontSize = 14.sp))
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
        confirmButton = { TextButton(onClick = { onSave(text) }) { Text("Pin it", style = Mosh.Label.copy(color = Mosh.Lime)) } },
        dismissButton = {
            Row {
                if (start.isNotEmpty()) TextButton(onClick = { onSave("") }) { Text("Unpin", style = Mosh.Label.copy(color = Mosh.Danger)) }
                TextButton(onClick = onClose) { Text("Cancel", style = Mosh.Label) }
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
        title = { Text("Send a flare", style = Mosh.Heading) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Your spot shows on the crew's map for 30 minutes, with a vibe.", style = Mosh.Body.copy(fontSize = 14.sp))
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
                OutlinedTextField(own, { if (it.length <= 40) own = it }, singleLine = true, placeholder = { Text("Or your own…") }, textStyle = Mosh.Body.copy(color = Mosh.Text))
            }
        },
        confirmButton = { TextButton(onClick = { if (own.isNotBlank()) onPick(own.trim()) }, enabled = own.isNotBlank()) { Text("Send", style = Mosh.Label.copy(color = Mosh.Amber)) } },
        dismissButton = { TextButton(onClick = onClose) { Text("Cancel", style = Mosh.Label) } },
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
        title = { Text("Get help", style = Mosh.Heading) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                HelpAction(if (crewSent) "Crew alerted ✓" else "Alert my crew", "Urgent alert with where you are", Mosh.Danger) {
                    if (!crewSent) { onAlertCrew(); crewSent = true }
                }
                val who = contact
                if (who != null) {
                    HelpAction("Text ${who.name}", "Your messages app opens with your location. Works without data.", Mosh.Amber) { Safety.textContact(c) }
                } else if (!adding) {
                    HelpAction("Add an emergency contact", "Someone outside the crew to text when it matters", Mosh.Amber) { adding = true }
                } else {
                    OutlinedTextField(name, { name = it }, singleLine = true, placeholder = { Text("Name (e.g. Mum)") }, textStyle = Mosh.Body.copy(color = Mosh.Text))
                    OutlinedTextField(
                        number, { number = it }, singleLine = true, placeholder = { Text("Mobile number") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone), textStyle = Mosh.Body.copy(color = Mosh.Text),
                    )
                    TextButton(onClick = {
                        if (number.count { it.isDigit() } >= 6) {
                            Safety.setContact(c, name, number)
                            contact = Safety.contact(c)
                            adding = false
                        }
                    }) { Text("Save contact", style = Mosh.Label.copy(color = Mosh.Amber)) }
                }
                HelpAction("Call ${Safety.EMERGENCY_NUMBER}", "Police, fire, ambulance", Color(0xFFFF4D4D)) { Safety.callEmergency(c) }
                Text(
                    "No signal at all? Many newer phones can reach emergency services by satellite: call ${Safety.EMERGENCY_NUMBER} and follow the prompts. " +
                        "At a festival, security and first aid tents can help fast.",
                    style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
                )
            }
        },
        confirmButton = { TextButton(onClick = onClose) { Text("Close", style = Mosh.Label) } },
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
