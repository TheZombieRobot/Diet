package nz.waveformlabs.moshpoint.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.ui.Mosh

/*
 * Dialogs for Play Store readiness (docs/WAVE2_PLAY.md): the location disclosure before Android's
 * permission prompt, and confirming an invite that came from another app. Each one's content is
 * its own composable, drawn on [PlayDialogCard], so screenshot tests show exactly what the
 * dialog shows (Paparazzi can't draw a dialog's own window).
 */

/** The look of the app's dialogs (Material 3's: Deep, 28 dp corners), as a plain box. */
@Composable
internal fun PlayDialogCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.widthIn(min = 280.dp, max = 560.dp).background(Mosh.Deep, RoundedCornerShape(28.dp)).padding(start = 24.dp, end = 24.dp, top = 24.dp, bottom = 12.dp),
        content = content,
    )
}

/** Opens the privacy policy (the build's PRIVACY_POLICY_URL, see app/build.gradle.kts) in the browser. */
@Composable
internal fun rememberOpenPrivacyPolicy(): () -> Unit {
    val uri = LocalUriHandler.current
    return { runCatching { uri.openUri(BuildConfig.PRIVACY_POLICY_URL) } }
}

/** The privacy policy link, as the app draws its other text links. */
@Composable
internal fun PrivacyPolicyLink(onClick: () -> Unit, modifier: Modifier = Modifier) {
    TextButton(onClick = onClick, modifier = modifier) {
        Text(
            stringResource(R.string.play_privacy_policy),
            style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan, textDecoration = TextDecoration.Underline),
        )
    }
}

/**
 * Play's prominent disclosure, shown right before Android asks for location (and nearby
 * devices): what's shared, with whom, how, that it keeps going with the app closed, and the
 * Bluetooth relaying. [onContinue] goes on to Android's prompt; [onNotNow] asks nothing.
 */
@Composable
internal fun ColumnScope.LocationDisclosureContent(onPrivacy: () -> Unit, onContinue: () -> Unit, onNotNow: () -> Unit) {
    Text(stringResource(R.string.play_disclosure_title), style = Mosh.Heading)
    Spacer(Modifier.height(16.dp))
    // Scrolls when the font is large or the phone small; the buttons stay put.
    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Point(Mosh.Lime, stringResource(R.string.play_disclosure_live))
        Point(Mosh.Cyan, stringResource(R.string.play_disclosure_relay))
        Point(Mosh.Pink, stringResource(R.string.play_disclosure_background))
        Point(Mosh.Violet, stringResource(R.string.play_disclosure_bluetooth))
        PrivacyPolicyLink(onPrivacy, Modifier.padding(start = 10.dp))
    }
    Buttons(
        confirm = stringResource(R.string.play_disclosure_continue), confirmColour = Mosh.Lime, onConfirm = onContinue,
        dismiss = stringResource(R.string.main_not_now), onDismiss = onNotNow,
    )
}

@Composable
private fun Point(colour: Color, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 7.dp).size(8.dp).background(colour, CircleShape))
        Spacer(Modifier.width(12.dp))
        Text(text, style = Mosh.Body)
    }
}

@Composable
private fun ColumnScope.Buttons(confirm: String, confirmColour: Color, onConfirm: () -> Unit, dismiss: String, onDismiss: () -> Unit) {
    Spacer(Modifier.height(8.dp))
    Row(Modifier.align(Alignment.End), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TextButton(onClick = onDismiss) { Text(dismiss, style = Mosh.Label) }
        TextButton(onClick = onConfirm) { Text(confirm, style = Mosh.Label.copy(color = confirmColour)) }
    }
}

@Composable
internal fun LocationDisclosureDialog(onContinue: () -> Unit, onNotNow: () -> Unit) {
    val privacy = rememberOpenPrivacyPolicy()
    Dialog(onDismissRequest = onNotNow) {
        PlayDialogCard(Modifier.fillMaxWidth()) { LocationDisclosureContent(privacy, onContinue, onNotNow) }
    }
}

/**
 * Confirming an invite that came from another app: nothing is joined or added, and nobody goes
 * live, until [onConfirm]. [note] is an extra line (test builds: the relay server it switches to).
 */
@Composable
internal fun ColumnScope.InviteConfirmContent(title: String, body: String, note: String?, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    Text(title, style = Mosh.Heading)
    Spacer(Modifier.height(16.dp))
    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
        Text(body, style = Mosh.Body)
        if (note != null) {
            Spacer(Modifier.height(10.dp))
            Text(note, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.Amber))
        }
    }
    Buttons(confirm = confirm, confirmColour = Mosh.Lime, onConfirm = onConfirm, dismiss = stringResource(R.string.main_not_now), onDismiss = onDismiss)
}

@Composable
internal fun InviteConfirmDialog(title: String, body: String, note: String?, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    Dialog(onDismissRequest = onDismiss) {
        PlayDialogCard(Modifier.fillMaxWidth()) { InviteConfirmContent(title, body, note, confirm, onConfirm, onDismiss) }
    }
}
