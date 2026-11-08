package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import nz.waveformlabs.moshpoint.PhotoStore
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend

/**
 * Friends list (permanent) and gig group (one night), plus the visibility switch.
 * Tap a friend to go straight to their arrow; long-press for photo / remove.
 *
 * Adding people is a stopgap: share your code, paste theirs. Enough to test with two
 * phones. TODO: accounts, usernames, QR codes, gig group create/join via the server.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FriendsScreen(
    friends: List<Friend>,
    visible: Boolean,
    alwaysOn: Boolean,
    phoneSummary: String,
    myName: String,
    onMyName: (String) -> Unit,
    missingPermissions: List<String>,
    setupIssues: List<SetupIssue> = emptyList(),
    onFixPermissions: () -> Unit,
    onVisible: (Boolean) -> Unit,
    onAlwaysOn: (Boolean) -> Unit,
    onFind: (Set<String>) -> Unit,
    onShareCode: () -> Unit,
    onPasteInvite: () -> Unit = {},
    onShareApp: () -> Unit = {},
    onShowQr: () -> Unit,
    onScanQr: () -> Unit,
    /** Filled in after a QR scan so the user only has to confirm. */
    scanned: Pair<String, String>?,
    onScannedUsed: () -> Unit,
    /** Returns an error message to show, or null if added. */
    onAdd: (name: String, code: String, gigGroup: Boolean) -> String?,
    onRemove: (String) -> Unit,
    onSetPhoto: (String) -> Unit,
    onRemovePhoto: (String) -> Unit,
    onClearGigGroup: () -> Unit,
    groupName: String?,
    /** Keys of everyone in tonight's crew, including people already on the friends list. */
    crewKeys: Set<String> = emptySet(),
    onStartGroup: (String) -> Unit,
    onShowGroupQr: () -> Unit,
    onKeepFriend: (String) -> Unit = {},
    /** Snap Map style view of where everyone is. */
    onOpenMap: () -> Unit = {},
    /** The crew's meet-up pin, if someone dropped one ("Sound desk"). */
    meetUp: String? = null,
    /** Last shared spot per friend (for live / battery under each crew tile). */
    seen: Map<String, nz.waveformlabs.moshpoint.LocationBook.Seen> = emptyMap(),
    nowSec: Long = 0L,
    pings: List<nz.waveformlabs.moshpoint.core.GigGroup.Ping> = emptyList(),
    onPing: (Int) -> Unit = {},
    describePing: (Int) -> String = { "pinged the crew" },
    ghost: Boolean = false,
    /** "Show crew QR" from the Add sheet: starts a crew first if needed. */
    onShowCrewQr: (() -> Unit)? = null,
    moments: List<nz.waveformlabs.moshpoint.Moments.Item> = emptyList(),
    onShareMoment: () -> Unit = {},
    onOpenMoment: (nz.waveformlabs.moshpoint.Moments.Item) -> Unit = {},
    /** Debug builds only; null in release. */
    onAddSimulated: (() -> Unit)? = null,
    onSelfie: () -> Unit = {},
    onPickMyPhoto: () -> Unit = {},
    onRemoveMyPhoto: () -> Unit = {},
    /** Null when the build has no Meta app configured. */
    onFacebook: (() -> Unit)? = null,
) {
    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(scanned) {
        if (scanned != null) {
            code = scanned.first
            if (name.isBlank()) name = scanned.second
            error = null
            onScannedUsed()
        }
    }
    var confirmRemove by remember { mutableStateOf<Friend?>(null) }
    var manualCode by remember { mutableStateOf(false) }

    var options by remember { mutableStateOf<Friend?>(null) }
    var settingsOpen by remember { mutableStateOf(false) }
    if (settingsOpen) {
        SettingsSheet(
            myName = myName, onMyName = onMyName,
            onSelfie = onSelfie, onPickMyPhoto = onPickMyPhoto, onRemoveMyPhoto = onRemoveMyPhoto, onFacebook = onFacebook,
            alwaysOn = alwaysOn, onAlwaysOn = onAlwaysOn,
            phoneSummary = phoneSummary,
            onClose = { settingsOpen = false },
        )
    }
    var naming by remember { mutableStateOf(false) }
    var groupNameText by remember { mutableStateOf("") }
    if (naming) {
        AlertDialog(
            onDismissRequest = { naming = false },
            title = { Text("Start a gig group") },
            text = {
                androidx.compose.foundation.layout.Column {
                    Text("Name it (e.g. the band). Then show the QR to your mates.")
                    OutlinedTextField(groupNameText, { groupNameText = it }, singleLine = true)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    onStartGroup(groupNameText)
                    groupNameText = ""
                    naming = false
                }) { Text("Start") }
            },
            dismissButton = { TextButton(onClick = { naming = false }) { Text("Cancel") } },
        )
    }
    options?.let { f ->
        AlertDialog(
            onDismissRequest = { options = null },
            title = { Text(f.name) },
            text = {
                androidx.compose.foundation.layout.Column {
                    if (f.gigGroupOnly) {
                        TextButton(onClick = { onKeepFriend(f.id); options = null }) { Text("Add ${f.name} as a friend (keep after tonight)") }
                    }
                    TextButton(onClick = { onSetPhoto(f.id); options = null }) { Text("Set photo") }
                    if (PhotoStore.photos.containsKey(f.id)) {
                        TextButton(onClick = { onRemovePhoto(f.id); options = null }) { Text("Remove photo") }
                    }
                    TextButton(onClick = { confirmRemove = f; options = null }) { Text("Remove ${f.name}", color = Color(0xFFE53935)) }
                }
            },
            confirmButton = { TextButton(onClick = { options = null }) { Text("Close") } },
        )
    }
    confirmRemove?.let { f ->
        AlertDialog(
            onDismissRequest = { confirmRemove = null },
            title = { Text("Remove ${f.name}?") },
            text = { Text("You won't be able to find them until you add them again.") },
            confirmButton = { TextButton(onClick = { onRemove(f.id); confirmRemove = null }) { Text("Remove") } },
            dismissButton = { TextButton(onClick = { confirmRemove = null }) { Text("Cancel") } },
        )
    }

    fun add(gig: Boolean) {
        error = onAdd(name, code, gig)
        if (error == null) {
            name = ""
            code = ""
        }
    }

    @Composable
    fun row(f: Friend) {
        val (source, scale) = rememberPress()
        Row(
            Modifier.fillMaxWidth()
                .pressScale(scale)
                .heightIn(min = 66.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(Mosh.SurfaceLow)
                .border(1.dp, Color(0x12FFFFFF), RoundedCornerShape(18.dp))
                .combinedClickable(interactionSource = source, indication = androidx.compose.foundation.LocalIndication.current, onClick = { onFind(setOf(f.id)) }, onLongClick = { options = f })
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(f, 44.dp)
            Spacer(Modifier.width(14.dp))
            Text(f.name, style = Mosh.Label, modifier = Modifier.weight(1f))
            Text(
                "Find", style = Mosh.Label.copy(fontSize = 12.sp, color = Color(f.color)),
                modifier = Modifier.background(Color(f.color).copy(alpha = 0.12f), CircleShape).padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
    }

    val gig = friends.filter { it.gigGroupOnly || it.key in crewKeys }
    val permanent = friends.filterNot { it.gigGroupOnly }
    var addOpen by remember { mutableStateOf(false) }
    if (addOpen) {
        AddSheet(
            inCrew = groupName != null,
            onShowCrewQr = onShowCrewQr ?: onShowGroupQr,
            onScanQr = onScanQr,
            onShareApp = onShareApp,
            onPasteInvite = onPasteInvite,
            onShowMyQr = onShowQr,
            onEnterCode = { manualCode = true },
            onClose = { addOpen = false },
        )
    }
    if (manualCode || code.isNotBlank()) {
        AlertDialog(
            onDismissRequest = { manualCode = false; code = ""; name = "" },
            containerColor = Mosh.Deep,
            title = { Text("Add with a code", style = Mosh.Heading) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text("Their name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(code, { code = it }, label = { Text("Their code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    error?.let { Text(it, style = Mosh.Body.copy(color = Mosh.Danger)) }
                }
            },
            confirmButton = { TextButton(onClick = { add(false); if (error == null) manualCode = false }) { Text("Add friend", style = Mosh.Label.copy(color = Mosh.Cyan)) } },
            dismissButton = { TextButton(onClick = { add(true); if (error == null) manualCode = false }) { Text("Tonight only", style = Mosh.Label) } },
        )
    }

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
    GlowBackground(colours = listOf(Mosh.Pink, Mosh.Violet, Mosh.Cyan))
    Column(Modifier.fillMaxSize()) {
    LazyColumn(
        Modifier.weight(1f).fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.Bottom) {
                    Text("mosh", style = Mosh.Title.copy(fontSize = 28.sp))
                    Text(
                        "point",
                        style = Mosh.Title.copy(fontSize = 28.sp, color = Mosh.Pink, shadow = androidx.compose.ui.graphics.Shadow(Mosh.Pink.copy(alpha = 0.8f), blurRadius = 28f)),
                    )
                }
                LivePill(visible, ghost) { onVisible(!visible) }
            }
            // Which radios this phone has: handy when testing; everyone can still see it in Settings.
            if (BuildConfig.DEBUG && DebugStatus.showUi) Text(phoneSummary, style = Mosh.Eyebrow.copy(fontSize = 12.sp, letterSpacing = 0.sp))
            if (!visible) {
                Spacer(Modifier.height(8.dp))
                Text("You're hidden. Tap Go live so your mates can find you tonight.", style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint))
            }
        }
        if (missingPermissions.isNotEmpty()) {
            item {
                Column(
                    Modifier.fillMaxWidth().background(Color(0xFF3A1F1F), RoundedCornerShape(16.dp)).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text("Moshpoint still needs", style = Mosh.Label)
                    missingPermissions.forEach { Text("• $it", style = Mosh.Body.copy(fontSize = 13.sp, color = Color(0xFFFFCDD2))) }
                    Spacer(Modifier.height(6.dp))
                    Button(
                        onClick = onFixPermissions, shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Mosh.Red, contentColor = Color.White),
                    ) { Text("Allow", style = Mosh.Label.copy(color = Color.White)) }
                }
            }
        }

        // Phone switches that must be on (Bluetooth, Location...): the usual "why can't we find each other".
        if (setupIssues.isNotEmpty()) {
            item {
                Column(
                    Modifier.fillMaxWidth().background(Color(0xFF3A2A12), RoundedCornerShape(16.dp))
                        .border(1.dp, Mosh.Amber.copy(alpha = 0.5f), RoundedCornerShape(16.dp)).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text("To find each other, switch these on", style = Mosh.Label.copy(color = Mosh.Amber))
                    setupIssues.forEach { issue ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(issue.text, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp), modifier = Modifier.weight(1f))
                            Spacer(Modifier.width(10.dp))
                            Button(
                                onClick = issue.onFix, shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Mosh.Amber, contentColor = Color(0xFF1A1000)),
                            ) { Text(issue.button, style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF1A1000))) }
                        }
                    }
                }
            }
        }

        // Tonight's crew: the heart of the app.
        item {
            NeonFrame(RoundedCornerShape(24.dp), Modifier.fillMaxWidth(), lit = groupName != null && visible) {
                Column(
                    Modifier.fillMaxWidth().background(Mosh.Deep, RoundedCornerShape(22.dp)).padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (groupName == null && gig.isEmpty()) {
                        Text("TONIGHT", style = Mosh.Eyebrow)
                        Text("Find your mates at the gig", style = Mosh.Heading)
                        Text("Start a crew and get everyone to scan your QR. Then you can all find each other, all night.", style = Mosh.Body)
                        NeonButton("Start a crew") { naming = true }
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            GlassButton("Join (scan QR)", Modifier.weight(1f), onClick = onScanQr)
                            GlassButton("Paste invite", Modifier.weight(1f), onClick = onPasteInvite)
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text("TONIGHT", style = Mosh.Eyebrow)
                                Text(groupName ?: "Your crew", style = Mosh.Heading, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                            }
                            TextButton(onClick = onShowGroupQr) { Text("Crew QR", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                        }
                        if (meetUp != null) {
                            Row(
                                Modifier.fillMaxWidth().background(Mosh.Pink.copy(alpha = 0.14f), RoundedCornerShape(14.dp))
                                    .border(1.dp, Mosh.Pink.copy(alpha = 0.5f), RoundedCornerShape(14.dp)).clickable(onClick = onOpenMap)
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("★  Meet-up: $meetUp", style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Pink), modifier = Modifier.weight(1f))
                                Text("Map ›", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Pink))
                            }
                        }
                        if (gig.isEmpty()) {
                            Text("No one's joined yet. Show them the crew QR: one scan and they're in.", style = Mosh.Body)
                            NeonButton("Show crew QR", onClick = onShowGroupQr)
                        } else {
                            CrewTiles(gig, seen, nowSec, onFind = { onFind(setOf(it)) }, onOptions = { options = it })
                            NeonButton("Find the crew") { onFind(gig.map { it.id }.toSet()) }
                        }
                        if (groupName != null) {
                            PingBar(onPing)
                            PingFeed(pings, nowSec, describePing)
                            MomentStrip(moments, nowSec, onOpenMoment, onShareMoment)
                        }
                        TextButton(onClick = onClearGigGroup) { Text("End the night", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Danger)) }
                    }
                }
            }
        }

        // Permanent friends.
        item {
            Spacer(Modifier.height(4.dp))
            Text("FRIENDS", style = Mosh.Eyebrow)
        }
        if (permanent.isEmpty()) item { Text("Friends you keep for every gig show here. Tap ＋ Add below.", style = Mosh.Body) }
        items(permanent, key = { it.id }) { row(it) }
        // Always false in release builds (BuildConfig.DEBUG is a compile-time constant).
        if ((BuildConfig.DEBUG && DebugStatus.showUi) && onAddSimulated != null) {
            item { TextButton(onClick = onAddSimulated) { Text("Debug: add simulated friend", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber)) } }
        }
    }
    HomeBar(onMap = onOpenMap, onAdd = { addOpen = true }, onMe = { settingsOpen = true })
    }
    }
}

/** Something switched off on this phone that stops mates finding each other, with a one-tap fix. */
class SetupIssue(val text: String, val button: String, val onFix: () -> Unit)
