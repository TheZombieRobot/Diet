package nz.waveformlabs.moshpoint.ui

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
                        InitialsAvatar(myName, 72.dp)
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
            run {
                val context = androidx.compose.ui.platform.LocalContext.current
                val ghost = nz.waveformlabs.moshpoint.GhostMode.on.value
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Ghost mode", style = Mosh.Label)
                        Text(
                            "Hide your spot from the map. Mates can still find you with Bluetooth when they're close.",
                            style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
                        )
                    }
                    Spacer(Modifier.width(12.dp))
                    Switch(ghost, { nz.waveformlabs.moshpoint.GhostMode.set(context, it) }, colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Violet, checkedThumbColor = Color.White, uncheckedTrackColor = Color(0xFF1C1630)))
                }
                if (!ghost) {
                    TextButton(onClick = { nz.waveformlabs.moshpoint.GhostMode.set(context, true, 3_600_000L) }) {
                        Text("Ghost for 1 hour", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Violet))
                    }
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
