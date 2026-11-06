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
    onFixPermissions: () -> Unit,
    onVisible: (Boolean) -> Unit,
    onAlwaysOn: (Boolean) -> Unit,
    onFind: (Set<String>) -> Unit,
    onShareCode: () -> Unit,
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
    onStartGroup: (String) -> Unit,
    onShowGroupQr: () -> Unit,
    /** Debug builds only; null in release. */
    onAddSimulated: (() -> Unit)? = null,
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
        Row(
            Modifier.fillMaxWidth()
                .heightIn(min = 64.dp)
                .combinedClickable(onClick = { onFind(setOf(f.id)) }, onLongClick = { options = f })
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(f, 44.dp)
            Spacer(Modifier.width(14.dp))
            Text(f.name, style = Mosh.Label.copy(fontWeight = FontWeight.Medium), modifier = Modifier.weight(1f))
            Text("Find", style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint))
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(Color(0xFF1A1A21)))
    }

    val gig = friends.filter { it.gigGroupOnly }
    val permanent = friends.filterNot { it.gigGroupOnly }

    LazyColumn(
        Modifier.fillMaxSize().background(Mosh.Ground),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text("Moshpoint", style = Mosh.Title.copy(fontSize = 30.sp))
            Text(phoneSummary, style = Mosh.Eyebrow.copy(fontSize = 12.sp, letterSpacing = 0.sp))
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

        // Visibility card: the one switch that matters when you walk into the gig.
        item {
            Row(
                Modifier.fillMaxWidth()
                    .background(if (visible) Mosh.VisibleBg else Mosh.Surface, RoundedCornerShape(18.dp))
                    .border(1.dp, if (visible) Mosh.VisibleLine else Mosh.Line, RoundedCornerShape(18.dp))
                    .clickable(role = androidx.compose.ui.semantics.Role.Switch) { onVisible(!visible) }
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(44.dp).background(if (visible) Mosh.Green else Mosh.Line, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(if (visible) "ON" else "OFF", style = Mosh.Eyebrow.copy(fontSize = 11.sp, color = if (visible) Color(0xFF08130D) else Mosh.TextDim, fontWeight = FontWeight.SemiBold))
                }
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(if (visible) "You're visible" else "You're hidden", style = Mosh.Label)
                    Text(
                        if (visible) "Mates can find you, even with the app shut" else "Tap to let your mates find you",
                        style = Mosh.Body.copy(fontSize = 13.sp, color = if (visible) Mosh.VisibleText else Mosh.TextFaint),
                    )
                }
                Switch(
                    visible, onVisible,
                    colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Green, checkedThumbColor = Color(0xFF08130D)),
                )
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text("Leave visibility always on", style = Mosh.Body, modifier = Modifier.weight(1f))
                Switch(alwaysOn, onAlwaysOn, colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Green, checkedThumbColor = Color(0xFF08130D)))
            }
            OutlinedTextField(myName, onMyName, label = { Text("Your name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
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
                }
            }
        } else {
            item {
                if (gig.isEmpty()) {
                    Text("Waiting for mates to join. Show them the group QR.", style = Mosh.Body)
                } else {
                    Button(
                        onClick = { onFind(gig.map { it.id }.toSet()) },
                        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp),
                        shape = RoundedCornerShape(16.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Mosh.Red, contentColor = Color.White),
                    ) { Text("Find the whole group", style = Mosh.Label.copy(color = Color.White)) }
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        gig.forEach { f ->
                            Column(
                                Modifier.width(64.dp).combinedClickable(onClick = { onFind(setOf(f.id)) }, onLongClick = { options = f }),
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
        // BuildConfig.DEBUG is a compile-time constant, so release builds drop this entirely.
        if (BuildConfig.DEBUG && onAddSimulated != null) {
            item { TextButton(onClick = onAddSimulated) { Text("Debug: add simulated friend", style = Mosh.Eyebrow) } }
        }
        items(permanent, key = { it.id }) { row(it) }

        // Adding people.
        item {
            Spacer(Modifier.height(8.dp))
            Text("ADD SOMEONE", style = Mosh.Eyebrow)
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                SurfaceButton("Show my QR", Modifier.weight(1f), onClick = onShowQr)
                SurfaceButton("Scan their QR", Modifier.weight(1f), onClick = onScanQr)
            }
            Row {
                TextButton(onClick = onShareCode) { Text("Share my code", style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
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
            Modifier.size(size).background(ring.copy(alpha = 0.22f), CircleShape).border(3.dp, ring, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Text(f.name.take(1).uppercase(), style = Mosh.Heading.copy(fontSize = (size.value * 0.36f).sp))
        }
    }
}

@Composable
private fun SurfaceButton(text: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = modifier.heightIn(min = 52.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Mosh.Surface, contentColor = Mosh.Text),
        border = androidx.compose.foundation.BorderStroke(1.dp, Mosh.Line),
    ) { Text(text, style = Mosh.Label.copy(fontSize = 15.sp)) }
}
