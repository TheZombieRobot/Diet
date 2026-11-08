package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import nz.waveformlabs.moshpoint.PhotoStore
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.SwitchDefaults
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.foundation.verticalScroll
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

    var manualCode by remember { mutableStateOf(false) }

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

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
    GlowBackground(colours = listOf(Mosh.Pink, Mosh.Violet, Mosh.Cyan))
    LazyColumn(
        Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
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
                val (src, sc) = rememberPress()
                androidx.compose.material3.IconButton(
                    onClick = { settingsOpen = true },
                    interactionSource = src,
                    modifier = Modifier.pressScale(sc).size(44.dp).background(Mosh.Surface, RoundedCornerShape(14.dp)).border(1.dp, Mosh.Line, RoundedCornerShape(14.dp)),
                ) { SlidersIcon() }
            }
            // Which radios this phone has: handy when testing; everyone can still see it in Settings.
            if (BuildConfig.DEBUG && DebugStatus.showUi) Text(phoneSummary, style = Mosh.Eyebrow.copy(fontSize = 12.sp, letterSpacing = 0.sp))
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

        // Visibility card: the one switch that matters when you walk into the gig.
        item {
            // Neon light runs round the card while you're live.
            val (source, scale) = rememberPress()
            val ping = rememberShimmer(1800)
            NeonFrame(RoundedCornerShape(22.dp), Modifier.fillMaxWidth().pressScale(scale), lit = visible) {
                Row(
                    Modifier.fillMaxWidth()
                        .background(Mosh.Deep, RoundedCornerShape(20.dp))
                        .clickable(interactionSource = source, indication = androidx.compose.foundation.LocalIndication.current, role = androidx.compose.ui.semantics.Role.Switch) { onVisible(!visible) }
                        .padding(horizontal = 16.dp, vertical = 18.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    val iconColour by androidx.compose.animation.animateColorAsState(if (visible) Mosh.Lime else Color(0xFF3A3352), label = "icon")
                    Box(
                        Modifier.size(48.dp).drawBehind {
                            if (visible) {
                                // Read the animation here (draw phase) so it never recomposes the card.
                                val pv = ping.value
                                drawCircle(Mosh.Lime.copy(alpha = 0.8f * (1 - pv)), radius = size.minDimension / 2 * (0.8f + 0.6f * pv), style = androidx.compose.ui.graphics.drawscope.Stroke(2.dp.toPx()))
                                haloGlow(center, 20.dp.toPx(), 14.dp.toPx(), Mosh.Lime, 0.8f)
                            }
                            drawCircle(iconColour, radius = 20.dp.toPx())
                        },
                        contentAlignment = Alignment.Center,
                    ) {
                        val mine = PhotoStore.photos[PhotoStore.ME]
                        if (mine != null) {
                            Image(
                                mine, contentDescription = null, contentScale = ContentScale.Crop,
                                modifier = Modifier.size(36.dp).clip(CircleShape).graphicsLayer { alpha = if (visible) 1f else 0.5f },
                            )
                        } else {
                            Text(if (visible) "ON" else "OFF", style = Mosh.Eyebrow.copy(fontSize = 10.sp, letterSpacing = 1.sp, color = if (visible) Color(0xFF0B1200) else Mosh.TextDim, fontWeight = FontWeight.SemiBold))
                        }
                    }
                    Spacer(Modifier.width(14.dp))
                    Column(Modifier.weight(1f)) {
                        Text(if (visible) "You're live" else "Go live", style = Mosh.Button)
                        Spacer(Modifier.height(3.dp))
                        Text(
                            if (visible) "Mates can find you, even with the app shut" else "Tap so your mates can find you tonight",
                            style = Mosh.Body.copy(fontSize = 13.sp, color = if (visible) Mosh.VisibleText else Mosh.TextFaint),
                        )
                    }
                    Switch(
                        visible, onVisible,
                        colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Lime, checkedThumbColor = Color(0xFF0B1200), uncheckedTrackColor = Color(0xFF1C1630)),
                    )
                }
            }
        }

        // Tonight's gig group.
        item {
            Spacer(Modifier.height(8.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    (groupName?.let { "TONIGHT: $it" } ?: "GIG GROUP").uppercase(),
                    style = Mosh.Eyebrow, maxLines = 1, modifier = Modifier.weight(1f),
                )
                if (groupName != null) {
                    TextButton(onClick = onShowGroupQr) { Text("Group QR", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                }
            }
        }
        if (groupName == null && gig.isEmpty()) {
            item {
                Column(
                    Modifier.fillMaxWidth().background(Mosh.SurfaceLow, RoundedCornerShape(16.dp)).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text("One person starts a group, everyone else scans its QR. You'll all find each other tonight.", style = Mosh.Body)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        SurfaceButton("Start a group", Modifier.weight(1f)) { naming = true }
                        SurfaceButton("Join a group", Modifier.weight(1f), onClick = onScanQr)
                    }
                    TextButton(onClick = onPasteInvite) {
                        Text("No camera? Paste an invite", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF)))
                    }
                }
            }
        } else {
            item {
                if (gig.isEmpty()) {
                    Text("Waiting for mates to join. Show them the group QR.", style = Mosh.Body)
                } else {
                    NeonButton("Find the crew") { onFind(gig.map { it.id }.toSet()) }
                    Spacer(Modifier.height(14.dp))
                    // Vertical padding inside the scroller so glows and the bob aren't clipped.
                    Row(Modifier.horizontalScroll(rememberScrollState()).padding(vertical = 12.dp, horizontal = 4.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        gig.forEachIndexed { i, f ->
                            val bob = rememberFloat(i)
                            Column(
                                Modifier.width(64.dp)
                                    .graphicsLayer { translationY = -4.dp.toPx() * bob.value }
                                    .combinedClickable(onClick = { onFind(setOf(f.id)) }, onLongClick = { options = f }),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Avatar(f, 56.dp)
                                Spacer(Modifier.height(6.dp))
                                Text(f.name, style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.Text), maxLines = 1)
                            }
                        }
                    }
                }
                TextButton(onClick = onClearGigGroup) { Text("End the night", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Danger)) }
            }
        }

        // Permanent friends.
        item {
            Spacer(Modifier.height(4.dp))
            Text("FRIENDS", style = Mosh.Eyebrow)
        }
        if (permanent.isEmpty()) item { Text("No friends added yet. Add someone below.", style = Mosh.Body) }
        // Always false in release builds (BuildConfig.DEBUG is a compile-time constant).
        if ((BuildConfig.DEBUG && DebugStatus.showUi) && onAddSimulated != null) {
            item { TextButton(onClick = onAddSimulated) { Text("Debug: add simulated friend", style = Mosh.Eyebrow) } }
        }
        items(permanent, key = { it.id }) { row(it) }

        // Adding people.
        item {
            Spacer(Modifier.height(8.dp))
            Text("ADD SOMEONE", style = Mosh.Eyebrow)
            Spacer(Modifier.height(8.dp))
            // One message with the download link and your invite: Messenger, SMS, anything.
            SurfaceButton("Share Moshpoint with a mate", Modifier.fillMaxWidth(), onClick = onShareApp)
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SurfaceButton("Show my QR", Modifier.weight(1f), onClick = onShowQr)
                SurfaceButton("Scan their QR", Modifier.weight(1f), onClick = onScanQr)
            }
            Row {
                TextButton(onClick = onShareCode) { Text("Send invite", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                TextButton(onClick = onPasteInvite) { Text("Paste invite", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
            }
            Row {
                TextButton(onClick = { manualCode = !manualCode }) {
                    Text(if (manualCode) "Hide code entry" else "Enter a code instead", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF)))
                }
            }
            if (manualCode || code.isNotBlank()) {
                OutlinedTextField(name, { name = it }, label = { Text("Their name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(code, { code = it }, label = { Text("Their code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                error?.let { Text(it, style = Mosh.Body.copy(color = Mosh.Danger)) }
                Spacer(Modifier.height(8.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SurfaceButton("Add friend", Modifier.weight(1f)) { add(false) }
                    SurfaceButton("Add to gig group", Modifier.weight(1f)) { add(true) }
                }
            }
        }
    }
    }
}

/** A friend's photo, or their initial, ringed in their colour. */
@Composable
private fun Avatar(f: Friend, size: androidx.compose.ui.unit.Dp) {
    val photo = PhotoStore.photos[f.id]
    val ring = Color(f.color)
    if (photo != null) {
        Image(
            photo, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.size(size).clip(CircleShape).border(3.dp, ring, CircleShape),
        )
    } else {
        Box(
            Modifier.size(size)
                .drawBehind { glow(ring, 10.dp.toPx(), 0.55f) { p -> drawContext.canvas.drawCircle(center, this.size.minDimension / 2, p) } }
                .background(Mosh.Avatar, CircleShape).border(3.dp, ring, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(f.name.take(1).uppercase(), style = Mosh.Heading.copy(fontSize = (size.value * 0.34f).sp))
        }
    }
}

@Composable
private fun SurfaceButton(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) =
    GlassButton(text, modifier, onClick = onClick)

/** Settings: your name, always-on, and about/licences. A bottom sheet in deep violet. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun SettingsSheet(
    myName: String,
    onMyName: (String) -> Unit,
    onSelfie: () -> Unit,
    onPickMyPhoto: () -> Unit,
    onRemoveMyPhoto: () -> Unit,
    onFacebook: (() -> Unit)?,
    alwaysOn: Boolean,
    onAlwaysOn: (Boolean) -> Unit,
    phoneSummary: String,
    onClose: () -> Unit,
) {
    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onClose, containerColor = Mosh.Deep) {
        SettingsContent(myName, onMyName, onSelfie, onPickMyPhoto, onRemoveMyPhoto, onFacebook, alwaysOn, onAlwaysOn, phoneSummary)
    }
}

/** The settings sheet's contents (separate so it can be screenshot-tested). */
@Composable
internal fun SettingsContent(
    myName: String,
    onMyName: (String) -> Unit,
    onSelfie: () -> Unit,
    onPickMyPhoto: () -> Unit,
    onRemoveMyPhoto: () -> Unit,
    onFacebook: (() -> Unit)?,
    alwaysOn: Boolean,
    onAlwaysOn: (Boolean) -> Unit,
    phoneSummary: String,
) {
    var showLicences by remember { mutableStateOf(false) }
    run {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                .navigationBarsPadding() // last rows clear the gesture/nav bar
                .padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text("Settings", style = Mosh.Heading, modifier = Modifier.padding(top = 4.dp))
            // Your photo: shown in your friends' arrow circles (shared encrypted, friends only).
            Row(verticalAlignment = Alignment.CenterVertically) {
                val mine = PhotoStore.photos[PhotoStore.ME]
                Box(
                    Modifier.size(72.dp).clip(CircleShape).background(Mosh.Avatar).border(3.dp, Mosh.Pink, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (mine != null) {
                        Image(mine, contentDescription = "Your photo", contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    } else {
                        Text(myName.trim().take(1).uppercase().ifEmpty { "?" }, style = Mosh.Heading)
                    }
                }
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text("Your photo", style = Mosh.Label)
                    Text("Shows in your mates' arrow. Only your friends can see it.", style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
                }
            }
            if (onFacebook != null) FacebookButton(onFacebook)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlassButton("Take a selfie", Modifier.weight(1f), onClick = onSelfie)
                GlassButton("Choose photo", Modifier.weight(1f), onClick = onPickMyPhoto)
            }
            if (PhotoStore.photos.containsKey(PhotoStore.ME)) {
                TextButton(onClick = onRemoveMyPhoto) { Text("Remove my photo", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Danger)) }
            }
            OutlinedTextField(
                myName, onMyName, label = { Text("Your name") }, singleLine = true,
                shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Stay live after a restart", style = Mosh.Label)
                    Text("If you were live when your phone restarted, go live again automatically.", style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
                }
                Spacer(Modifier.width(12.dp))
                Switch(alwaysOn, onAlwaysOn, colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Lime, checkedThumbColor = Color(0xFF0B1200), uncheckedTrackColor = Color(0xFF1C1630)))
            }
            if (BuildConfig.DEBUG) {
                // Test builds only: hide the techie bits, e.g. before sharing the app with mates.
                val context = androidx.compose.ui.platform.LocalContext.current
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Show debug info", style = Mosh.Label)
                        Text("Which tech is finding each mate (UWB, Wi-Fi, Bluetooth, GPS, crowd) and the Debug panel. Test builds only.", style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
                    }
                    Spacer(Modifier.width(12.dp))
                    Switch((BuildConfig.DEBUG && DebugStatus.showUi), { DebugStatus.setShowUi(context, it) }, colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Amber, checkedThumbColor = Color(0xFF1A1000), uncheckedTrackColor = Color(0xFF1C1630)))
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Mosh.Line))
            Text("ABOUT", style = Mosh.Eyebrow)
            Text(
                "Moshpoint ${nz.waveformlabs.moshpoint.BuildConfig.VERSION_NAME}. No account, rotating codes, end-to-end encrypted locations. You're only findable while you're live.",
                style = Mosh.Body,
            )
            Text(phoneSummary, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
            TextButton(onClick = { showLicences = !showLicences }) {
                Text(if (showLicences) "Hide licences" else "Open-source licences", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan))
            }
            if (showLicences) {
                val context = androidx.compose.ui.platform.LocalContext.current
                val text = remember {
                    runCatching {
                        context.assets.list("licenses").orEmpty().sorted().joinToString("\n\n") { f ->
                            "— ${f.removeSuffix(".txt")} —\n" + context.assets.open("licenses/$f").bufferedReader().use { it.readText() }
                        }
                    }.getOrDefault("")
                }
                Text(
                    "Fonts: Unbounded and Inter, under the SIL Open Font License 1.1. QR codes: ZXing (Apache 2.0).\n\n$text",
                    style = Mosh.Body.copy(fontSize = 11.sp, lineHeight = 15.sp, color = Mosh.TextFaint),
                )
            }
        }
    }
}

/** Something switched off on this phone that stops mates finding each other, with a one-tap fix. */
class SetupIssue(val text: String, val button: String, val onFix: () -> Unit)

/** Little "sliders" icon for the settings button. */
@Composable
private fun SlidersIcon() {
    androidx.compose.foundation.Canvas(Modifier.size(20.dp)) {
        val w = size.width
        val h = size.height
        val st = 2.dp.toPx()
        val c = Mosh.Text
        for ((i, knob) in listOf(0.3f, 0.65f, 0.45f).withIndex()) {
            val x = w * (0.2f + 0.3f * i)
            drawLine(c, androidx.compose.ui.geometry.Offset(x, 0f), androidx.compose.ui.geometry.Offset(x, h), st, cap = androidx.compose.ui.graphics.StrokeCap.Round)
            drawLine(c, androidx.compose.ui.geometry.Offset(x - w * 0.12f, h * knob), androidx.compose.ui.geometry.Offset(x + w * 0.12f, h * knob), st * 1.3f, cap = androidx.compose.ui.graphics.StrokeCap.Round)
        }
    }
}

/** Facebook's own blue, per their brand guidelines. */
@Composable
fun FacebookButton(onClick: () -> Unit, modifier: Modifier = Modifier.fillMaxWidth()) {
    val (source, scale) = rememberPress()
    Button(
        onClick = onClick,
        modifier = modifier.heightIn(min = 54.dp).pressScale(scale),
        shape = RoundedCornerShape(16.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1877F2), contentColor = Color.White),
        interactionSource = source,
    ) {
        Box(Modifier.size(22.dp).background(Color.White, CircleShape), contentAlignment = Alignment.Center) {
            Text("f", style = Mosh.Button.copy(fontSize = 15.sp, color = Color(0xFF1877F2)))
        }
        Spacer(Modifier.width(10.dp))
        Text("Continue with Facebook", style = Mosh.Label.copy(color = Color.White))
    }
}
