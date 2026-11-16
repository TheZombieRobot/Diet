package nz.waveformlabs.moshpoint.ui.moderation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.RadioButtonDefaults
import androidx.compose.ui.semantics.Role
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.Blocked
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.settings.DialogButtons
import nz.waveformlabs.moshpoint.ui.settings.PlayDialogCard
import nz.waveformlabs.moshpoint.ui.settings.PrivacyPolicyLink

/*
 * Block (and, later, report) for what people post: Google Play's User Generated Content policy
 * (docs/REPORT_BLOCK.md). Each dialog's content is its own composable on [PlayDialogCard], as the
 * Play dialogs are, so screenshot tests show exactly what the dialog shows.
 */

/** One of these dialogs, over whatever is open. */
@Composable
internal fun ModerationDialog(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    Dialog(onDismissRequest = onDismiss) { PlayDialogCard(Modifier.fillMaxWidth(), content) }
}

/**
 * What you can do about someone's message, photo or clip, or about them: [reportLabel] (null
 * until reporting is offered), then Block or Unblock.
 */
@Composable
internal fun ColumnScope.PersonMenuContent(
    name: String,
    blocked: Boolean,
    onBlock: () -> Unit,
    onUnblock: () -> Unit,
    onClose: () -> Unit,
    reportLabel: String? = null,
    onReport: () -> Unit = {},
) {
    Text(name, style = Mosh.Heading, maxLines = 2, overflow = TextOverflow.Ellipsis)
    Spacer(Modifier.height(8.dp))
    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
        if (reportLabel != null) {
            TextButton(onClick = onReport) { Text(reportLabel, style = Mosh.Label) }
        }
        if (blocked) {
            TextButton(onClick = onUnblock) { Text(stringResource(R.string.mod_unblock_name, name), style = Mosh.Label) }
        } else {
            TextButton(onClick = onBlock) { Text(stringResource(R.string.mod_block_name, name), style = Mosh.Label.copy(color = Mosh.Danger)) }
        }
    }
    Spacer(Modifier.height(4.dp))
    TextButton(onClick = onClose, modifier = Modifier.align(Alignment.End)) { Text(stringResource(R.string.home_close), style = Mosh.Label) }
}

/**
 * "Block Jo?": what it does (hidden on this phone, private messages dropped, they aren't told and
 * stay in the crew). [canRemove]: you made this crew, so removing them is offered too, through
 * the usual confirmation ([onRemove]).
 */
@Composable
internal fun ColumnScope.BlockConfirmContent(name: String, canRemove: Boolean, onBlock: () -> Unit, onRemove: () -> Unit, onCancel: () -> Unit) {
    Text(stringResource(R.string.mod_block_title, name), style = Mosh.Heading)
    Spacer(Modifier.height(16.dp))
    // Scrolls when the font is large or the phone small; the buttons stay put.
    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(stringResource(R.string.mod_block_text), style = Mosh.Body)
        if (canRemove) {
            Text(stringResource(R.string.mod_block_owner, name), style = Mosh.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.TextDim))
            TextButton(onClick = onRemove) {
                Text(stringResource(R.string.mod_remove_name, name), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Alarm))
            }
        }
    }
    DialogButtons(
        confirm = stringResource(R.string.mod_block), confirmColour = Mosh.Danger, onConfirm = onBlock,
        dismiss = stringResource(R.string.home_cancel), onDismiss = onCancel,
    )
}

/** Settings → Blocked people: who, in which crew, and Unblock for each. */
@Composable
internal fun ColumnScope.BlockedPeopleContent(people: List<Blocked>, onUnblock: (Blocked) -> Unit, onClose: () -> Unit) {
    Text(stringResource(R.string.mod_blocked_people), style = Mosh.Heading)
    Spacer(Modifier.height(12.dp))
    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState())) {
        Text(
            stringResource(if (people.isEmpty()) R.string.mod_blocked_none else R.string.mod_blocked_about),
            style = Mosh.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.TextDim),
        )
        Spacer(Modifier.height(8.dp))
        people.forEach { b ->
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(b.name, style = Mosh.Label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (b.crewName.isNotBlank()) {
                        Text(b.crewName, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextFaint), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                Spacer(Modifier.width(8.dp))
                TextButton(onClick = { onUnblock(b) }) { Text(stringResource(R.string.mod_unblock), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Cyan)) }
            }
        }
    }
    Spacer(Modifier.height(4.dp))
    TextButton(onClick = onClose, modifier = Modifier.align(Alignment.End)) { Text(stringResource(R.string.home_close), style = Mosh.Label) }
}

/**
 * "Before you post": the community rules, once, before the first crew chat message, photo, clip
 * or private message. Says that reported posts may be reviewed, with the privacy policy.
 */
@Composable
internal fun ColumnScope.CommunityRulesContent(onPrivacy: () -> Unit, onAgree: () -> Unit, onNotNow: () -> Unit) {
    Text(stringResource(R.string.mod_rules_title), style = Mosh.Heading)
    Spacer(Modifier.height(16.dp))
    // Scrolls when the font is large or the phone small; the buttons stay put.
    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.mod_rules_intro), style = Mosh.Body)
        RulePoint(Mosh.Pink, stringResource(R.string.mod_rules_harassment))
        RulePoint(Mosh.Amber, stringResource(R.string.mod_rules_illegal))
        RulePoint(Mosh.Violet, stringResource(R.string.mod_rules_threats))
        Text(stringResource(R.string.mod_rules_reports), style = Mosh.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.TextDim))
        PrivacyPolicyLink(onPrivacy, Modifier.padding(start = 10.dp))
    }
    DialogButtons(
        confirm = stringResource(R.string.mod_rules_agree), confirmColour = Mosh.Lime, onConfirm = onAgree,
        dismiss = stringResource(R.string.main_not_now), onDismiss = onNotNow,
    )
}

@Composable
private fun RulePoint(colour: Color, text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 7.dp).size(8.dp).background(colour, CircleShape))
        Spacer(Modifier.width(12.dp))
        Text(text, style = Mosh.Body)
    }
}

/** The row in Settings that opens [BlockedPeopleContent]. */
@Composable
internal fun BlockedPeopleRow(count: Int, onOpen: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onOpen).padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.mod_blocked_people), style = Mosh.Label)
            Text(
                pluralStringResource(R.plurals.mod_blocked_count, count, count),
                style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
            )
        }
        Spacer(Modifier.width(12.dp))
        Text("›", style = Mosh.Heading.copy(fontSize = 24.sp, color = Mosh.TextFaint))
    }
}

/**
 * Report a message, photo, clip or person: a reason, an optional note, and, plainly, what the
 * phone sends (the content is end-to-end encrypted, so it sends what you can see) and for how
 * long it's kept. [reason] is an index into [reasons] (null = none picked yet: Send waits).
 * [sends] is the line for the content itself (null for a person). [blockToo] null = they're
 * already blocked, so the box isn't offered.
 */
@Composable
internal fun ColumnScope.ReportContent(
    title: String,
    name: String,
    sends: String?,
    reasons: List<String>,
    reason: Int?,
    onReason: (Int) -> Unit,
    note: String,
    onNote: (String) -> Unit,
    blockToo: Boolean?,
    onBlockToo: (Boolean) -> Unit,
    sending: Boolean,
    onSend: () -> Unit,
    onCancel: () -> Unit,
) {
    Text(title, style = Mosh.Heading, maxLines = 2, overflow = TextOverflow.Ellipsis)
    Spacer(Modifier.height(12.dp))
    // Scrolls when the font is large or the phone small; the buttons stay put.
    Column(Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(stringResource(R.string.mod_report_why), style = Mosh.Label)
        Column {
            reasons.forEachIndexed { i, r ->
                Row(
                    Modifier.fillMaxWidth().selectable(selected = reason == i, onClick = { onReason(i) }, role = Role.RadioButton).padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = reason == i, onClick = null, colors = RadioButtonDefaults.colors(selectedColor = Mosh.Pink, unselectedColor = Mosh.TextFaint))
                    Spacer(Modifier.width(10.dp))
                    Text(r, style = Mosh.Body)
                }
            }
        }
        OutlinedTextField(
            note, { onNote(it.take(300)) },
            placeholder = { Text(stringResource(R.string.mod_report_note), style = Mosh.Body.copy(color = Mosh.TextFaint)) },
            textStyle = Mosh.Body.copy(color = Mosh.Text),
            maxLines = 3,
            shape = RoundedCornerShape(16.dp),
            modifier = Modifier.fillMaxWidth(),
        )
        Text(stringResource(R.string.mod_report_e2e), style = Mosh.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.TextDim))
        if (sends != null) SendsPoint(sends)
        SendsPoint(stringResource(R.string.mod_report_sends_who, name))
        SendsPoint(stringResource(R.string.mod_report_sends_note))
        Text(stringResource(R.string.mod_report_kept, name), style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
        if (blockToo != null) {
            Row(
                Modifier.fillMaxWidth().toggleable(value = blockToo, onValueChange = onBlockToo, role = Role.Checkbox),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Checkbox(checked = blockToo, onCheckedChange = null, colors = CheckboxDefaults.colors(checkedColor = Mosh.Pink, uncheckedColor = Mosh.TextFaint))
                Spacer(Modifier.width(10.dp))
                Text(stringResource(R.string.mod_report_block_too, name), style = Mosh.Body)
            }
        }
    }
    DialogButtons(
        confirm = stringResource(if (sending) R.string.mod_report_sending else R.string.mod_report_send), confirmColour = Mosh.Pink, onConfirm = onSend,
        dismiss = stringResource(R.string.home_cancel), onDismiss = onCancel,
        confirmEnabled = reason != null && !sending,
    )
}

@Composable
private fun SendsPoint(text: String) {
    Row(verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 8.dp).size(6.dp).background(Mosh.Cyan, CircleShape))
        Spacer(Modifier.width(10.dp))
        Text(text, style = Mosh.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.TextDim))
    }
}
