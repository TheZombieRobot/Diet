package nz.waveformlabs.moshpoint.ui

import kotlinx.coroutines.launch

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import nz.waveformlabs.moshpoint.PhotoStore
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.SwitchDefaults
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
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
import nz.waveformlabs.moshpoint.R
import androidx.compose.ui.res.stringResource

// Settings (the Me tab): your photo and name, ghost mode, staying live, debug, about.

/** Settings: your name, always-on, and about/licences. A bottom sheet in deep violet. */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun SettingsSheet(
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
            Text(stringResource(R.string.setup_settings_title), style = Mosh.Heading, modifier = Modifier.padding(top = 4.dp))
            // Your photo: shown in your friends' arrow circles (shared encrypted, friends only).
            Row(verticalAlignment = Alignment.CenterVertically) {
                val mine = PhotoStore.photos[PhotoStore.ME]
                Box(
                    Modifier.size(72.dp).clip(CircleShape).background(Mosh.Avatar).border(3.dp, Mosh.Pink, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    if (mine != null) {
                        Image(mine, contentDescription = stringResource(R.string.setup_your_photo), contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    } else {
                        InitialsAvatar(myName, 72.dp)
                    }
                }
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.setup_your_photo), style = Mosh.Label)
                    Text(stringResource(R.string.setup_your_photo_desc), style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
                }
            }
            if (onFacebook != null) FacebookButton(onFacebook)
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlassButton(stringResource(R.string.setup_take_selfie), Modifier.weight(1f), onClick = onSelfie)
                GlassButton(stringResource(R.string.setup_choose_photo), Modifier.weight(1f), onClick = onPickMyPhoto)
            }
            if (PhotoStore.photos.containsKey(PhotoStore.ME)) {
                TextButton(onClick = onRemoveMyPhoto) { Text(stringResource(R.string.setup_remove_my_photo), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Danger)) }
            }
            OutlinedTextField(
                myName, onMyName, label = { Text(stringResource(R.string.setup_your_name)) }, singleLine = true,
                shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(stringResource(R.string.setup_stay_live), style = Mosh.Label)
                    Text(stringResource(R.string.setup_stay_live_desc), style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
                }
                Spacer(Modifier.width(12.dp))
                Switch(alwaysOn, onAlwaysOn, colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Lime, checkedThumbColor = Color(0xFF0B1200), uncheckedTrackColor = Color(0xFF1C1630)))
            }
            run {
                val context = androidx.compose.ui.platform.LocalContext.current
                val ghost = nz.waveformlabs.moshpoint.GhostMode.on.value
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.setup_ghost_mode), style = Mosh.Label)
                        Text(
                            stringResource(R.string.setup_ghost_mode_desc),
                            style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Switch(ghost, { nz.waveformlabs.moshpoint.GhostMode.set(context, it) }, colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Violet, checkedThumbColor = Color.White, uncheckedTrackColor = Color(0xFF1C1630)))
                }
                if (!ghost) {
                    TextButton(onClick = { nz.waveformlabs.moshpoint.GhostMode.set(context, true, 3_600_000L) }) {
                        Text(stringResource(R.string.setup_ghost_one_hour), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Violet))
                    }
                }
            }
            run {
                val context = androidx.compose.ui.platform.LocalContext.current
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.setup_data_saver), style = Mosh.Label)
                        Text(
                            stringResource(R.string.setup_data_saver_desc),
                            style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Switch(nz.waveformlabs.moshpoint.ShareQuality.dataSaver.value, { nz.waveformlabs.moshpoint.ShareQuality.setDataSaver(context, it) }, colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Cyan, checkedThumbColor = Color(0xFF07050F), uncheckedTrackColor = Color(0xFF1C1630)))
                }
            }
            run {
                // Who "Need help" can text, outside the crew.
                val context = androidx.compose.ui.platform.LocalContext.current
                val saved = remember { nz.waveformlabs.moshpoint.Safety.contact(context) }
                var name by remember { mutableStateOf(saved?.name.orEmpty()) }
                var number by remember { mutableStateOf(saved?.number.orEmpty()) }
                var note by remember { mutableStateOf<String?>(null) }
                val savedText = stringResource(R.string.setup_contact_saved)
                val needNumberText = stringResource(R.string.setup_contact_need_number)
                val removedText = stringResource(R.string.setup_contact_removed)
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(stringResource(R.string.setup_emergency_contact), style = Mosh.Label)
                    Text(
                        stringResource(R.string.setup_emergency_contact_desc),
                        style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(name, { name = it; note = null }, singleLine = true, placeholder = { Text(stringResource(R.string.setup_contact_name)) }, shape = RoundedCornerShape(16.dp), modifier = Modifier.weight(1f))
                        OutlinedTextField(
                            number, { number = it; note = null }, singleLine = true, placeholder = { Text(stringResource(R.string.setup_contact_mobile)) }, shape = RoundedCornerShape(16.dp), modifier = Modifier.weight(1.2f),
                            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Phone),
                        )
                    }
                    Row {
                        TextButton(onClick = {
                            note = if (number.count { it.isDigit() } >= 6) {
                                nz.waveformlabs.moshpoint.Safety.setContact(context, name, number); savedText
                            } else needNumberText
                        }) { Text(stringResource(R.string.setup_save), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
                        if (saved != null || number.isNotEmpty()) TextButton(onClick = {
                            nz.waveformlabs.moshpoint.Safety.clearContact(context); name = ""; number = ""; note = removedText
                        }) { Text(stringResource(R.string.setup_remove), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.TextDim)) }
                    }
                    note?.let { Text(it, style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.Lime)) }
                }
            }
            // Test builds only: everyone else uses the app's own server, built in. Nothing to set up.
            if (BuildConfig.TEST_BUILD) run {
                // Your own relay server (Render etc.): faster updates and no daily message cap.
                val context = androidx.compose.ui.platform.LocalContext.current
                var url by remember { mutableStateOf(nz.waveformlabs.moshpoint.locate.RelayClient.serverUrl) }
                var note by remember { mutableStateOf<String?>(null) }
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text("Relay server", style = Mosh.Label)
                    Text(
                        if (nz.waveformlabs.moshpoint.locate.RelayClient.ownServer) "Using your own server. Crews you invite use it too."
                        else "Using the free public relay (fine for testing; it can run out late in a big night). Paste your own server's address to switch.",
                        style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
                    )
                    OutlinedTextField(
                        url, { url = it; note = null }, singleLine = true, placeholder = { Text("https://moshpoint-relay.onrender.com") },
                        shape = RoundedCornerShape(16.dp), modifier = Modifier.fillMaxWidth(),
                    )
                    Row {
                        TextButton(onClick = {
                            note = if (nz.waveformlabs.moshpoint.locate.RelayClient.setServer(context, url)) "Saved" else "That doesn't look like an https:// address"
                        }) { Text("Save", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
                        TextButton(onClick = {
                            url = ""
                            nz.waveformlabs.moshpoint.locate.RelayClient.setServer(context, "")
                            note = "Back on the public relay"
                        }) { Text("Use public relay", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.TextDim)) }
                    }
                    note?.let { Text(it, style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.Lime)) }
                }
            }
            if (BuildConfig.TEST_BUILD) {
                // Test builds only: hide the techie bits, e.g. before sharing the app with mates.
                val context = androidx.compose.ui.platform.LocalContext.current
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Show debug info", style = Mosh.Label)
                        Text("Which tech is finding each mate (UWB, Wi-Fi, Bluetooth, GPS, crowd) and the Debug panel. Test builds only.", style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
                    }
                    Spacer(Modifier.width(12.dp))
                    Switch((BuildConfig.TEST_BUILD && DebugStatus.showUi), { DebugStatus.setShowUi(context, it) }, colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Amber, checkedThumbColor = Color(0xFF1A1000), uncheckedTrackColor = Color(0xFF1C1630)))
                }
                if (BuildConfig.TEST_BUILD && nz.waveformlabs.moshpoint.DebugStatus.showUi) {
                    val scope = androidx.compose.runtime.rememberCoroutineScope()
                    Text("TESTING", style = Mosh.Eyebrow)
                    Column {
                        // The crew finder with several mates at once (arrows, strip, tap to focus) on one phone.
                        TextButton(onClick = {
                            if (nz.waveformlabs.moshpoint.GroupSync.group.value == null) nz.waveformlabs.moshpoint.GroupSync.startNew(context, "Test crew")
                            repeat(3) { nz.waveformlabs.moshpoint.FriendsRepository.addSimulated(toCrew = true) }
                        }) {
                            Text("Add 3 simulated mates to the crew", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
                        }
                        TextButton(onClick = { nz.waveformlabs.moshpoint.FriendsRepository.removeSimulated() }) {
                            Text("Remove simulated friends", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
                        }
                        TextButton(onClick = { scope.launch { nz.waveformlabs.moshpoint.GigArchive.addSample(context) } }) {
                            Text("Add a sample past gig (memories)", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
                        }
                        TextButton(onClick = { nz.waveformlabs.moshpoint.Memories.notifyNow(context) }) {
                            Text("Show memory notification", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
                        }
                        TextButton(onClick = { scope.launch { nz.waveformlabs.moshpoint.GigArchive.removeSamples(context) } }) {
                            Text("Remove sample gigs", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
                        }
                        // Chat on your own: fake mates write in, 10 s later so you can leave the app and see the notification.
                        var note by remember { mutableStateOf<String?>(null) }
                        fun fake(next: Boolean, missed: Boolean) {
                            val g = if (next) nz.waveformlabs.moshpoint.Crews.others.firstOrNull()?.group else nz.waveformlabs.moshpoint.GroupSync.group.value
                            if (g == null) {
                                note = if (next) "Plan a second gig first (it goes in Up next)" else "Start or plan a crew first"
                                return
                            }
                            note = "Messages arrive in ${g.name} in 10 s. Leave the app to see the notification."
                            scope.launch {
                                kotlinx.coroutines.delay(10_000)
                                nz.waveformlabs.moshpoint.ChatSync.debugFakeChat(context, g, missed)
                            }
                        }
                        TextButton(onClick = { fake(next = false, missed = false) }) {
                            Text("Fake mates chatting (main crew)", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
                        }
                        TextButton(onClick = { fake(next = true, missed = false) }) {
                            Text("Fake mates chatting (Up next crew)", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
                        }
                        TextButton(onClick = { fake(next = false, missed = true) }) {
                            Text("Fake catching up on missed messages", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
                        }
                        note?.let { Text(it, style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.Lime)) }
                    }
                }
            }
            Box(Modifier.fillMaxWidth().height(1.dp).background(Mosh.Line))
            Text(stringResource(R.string.setup_about), style = Mosh.Eyebrow)
            Text(
                stringResource(R.string.setup_about_text, nz.waveformlabs.moshpoint.BuildConfig.VERSION_NAME),
                style = Mosh.Body,
            )
            Text(phoneSummary, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
            TextButton(onClick = { showLicences = !showLicences }) {
                Text(if (showLicences) stringResource(R.string.setup_hide_licences) else stringResource(R.string.setup_open_source_licences), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan))
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
                    stringResource(R.string.setup_licences_fonts) + "\n\n" + text,
                    style = Mosh.Body.copy(fontSize = 11.sp, lineHeight = 15.sp, color = Mosh.TextFaint),
                )
            }
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
        Text(stringResource(R.string.setup_continue_facebook), style = Mosh.Label.copy(color = Color.White))
    }
}
