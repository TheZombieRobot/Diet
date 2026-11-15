package nz.waveformlabs.moshpoint.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.chat.OfflineMessages
import nz.waveformlabs.moshpoint.core.HelpRules
import nz.waveformlabs.moshpoint.core.watch.PingOutcome
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.safety.EmergencyNumbers
import nz.waveformlabs.moshpoint.safety.Safety
import nz.waveformlabs.moshpoint.ui.Mosh

/**
 * "Need help": the crew alert, plus help beyond the crew: a text to your emergency contact
 * with where you are (plain SMS, works without data), and the local emergency number. Nothing
 * is sent until a choice here is tapped. [onAlertCrew] null = no crew to alert (no crew
 * tonight, a crew asleep until gig day, or following from home): the rest is still offered.
 *
 * The crew alert says what the outbox knows about it and nothing kinder (launch blocker 1, core
 * [HelpRules]): Sending…, Not sent yet (with Go live when not being live is why), Sent nearby,
 * Sent to your crew, or Not sent. It used to say "Crew alerted ✓" as soon as it was tapped.
 * [onGoLive]: switches Live on (asking for permissions if it must).
 */
@Composable
internal fun HelpDialog(onAlertCrew: (() -> Unit)?, onGoLive: (() -> Unit)? = null, onClose: () -> Unit) {
    val c = LocalContext.current
    var contact by remember { mutableStateOf(Safety.contact(c)) }
    // The alert shown: one sent a little while ago (opening Need help again shows how that one
    // is doing, rather than inviting a second), or the one sent from here.
    var alert by remember {
        mutableStateOf(GroupSync.lastHelp.value?.takeIf { HelpRules.showsLast(it.atMs, System.currentTimeMillis()) })
    }
    // Tapped, but nothing reached the outbox (no crew after all): that's "Not sent".
    var nothingSent by remember { mutableStateOf(false) }
    val outcome: PingOutcome? = alert?.let { HelpRules.outcomeOf(OfflineMessages.followedState(it.id)) }
        ?: if (nothingSent) PingOutcome.FAILED else null
    val wait = if (outcome == PingOutcome.WAITING) OfflineMessages.waitReason() else null
    var textFailed by remember { mutableStateOf(false) }
    var callFailed by remember { mutableStateOf<String?>(null) }
    // The emergency number(s) where you are now (abroad at a festival too).
    val numbers = remember { EmergencyNumbers.here(c) }
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = Mosh.Deep,
        title = { Text(stringResource(R.string.crew_help_title), style = Mosh.Heading) },
        text = {
            HelpBody(
                crewAlert = if (onAlertCrew != null) CrewAlertUi(outcome, wait) else null,
                onAlertCrew = {
                    if (onAlertCrew != null && HelpRules.maySend(outcome)) {
                        val before = GroupSync.lastHelp.value
                        onAlertCrew()
                        val sent = GroupSync.lastHelp.value
                        if (sent != null && sent !== before) {
                            alert = sent
                            nothingSent = false
                        } else {
                            alert = null
                            nothingSent = true
                        }
                    }
                },
                onGoLive = onGoLive,
                contact = contact,
                onText = { textFailed = !Safety.textContact(c) },
                textFailed = textFailed,
                onSaveContact = { name, number ->
                    Safety.setContact(c, name, number)
                    contact = Safety.contact(c)
                },
                numbers = numbers,
                onCall = { n -> callFailed = if (Safety.callEmergency(c, n)) null else n },
                callFailed = callFailed,
            )
        },
        confirmButton = { TextButton(onClick = onClose) { Text(stringResource(R.string.crew_close), style = Mosh.Label) } },
    )
}

/** The crew alert's row: [outcome] null = not sent from here yet; [wait] = why it's "Not sent yet". */
internal class CrewAlertUi(val outcome: PingOutcome?, val wait: HelpRules.Wait?)

/**
 * Need help's contents, drawn from plain state (so every state can be screenshot-tested; a
 * dialog window can't be drawn there). [crewAlert] null = no crew to alert.
 */
@Composable
internal fun HelpBody(
    crewAlert: CrewAlertUi?,
    onAlertCrew: () -> Unit,
    onGoLive: (() -> Unit)?,
    contact: Safety.Contact?,
    onText: () -> Unit,
    textFailed: Boolean,
    onSaveContact: (name: String, number: String) -> Unit,
    numbers: List<EmergencyNumbers.Number>,
    onCall: (String) -> Unit,
    callFailed: String?,
) {
    var adding by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var number by remember { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        if (crewAlert != null) {
            CrewAlertRow(crewAlert, onAlertCrew, onGoLive)
            if (crewAlert.outcome != null && HelpRules.pointToTextOrCall(crewAlert.outcome)) {
                Text(stringResource(R.string.safety_help_text_or_call), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Text))
            }
        }
        if (contact != null) {
            HelpAction(stringResource(R.string.crew_help_text_contact, contact.name), stringResource(R.string.crew_help_text_contact_sub), Mosh.Amber, onClick = onText)
            if (textFailed) Problem(stringResource(R.string.safety_help_no_sms))
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
                    onSaveContact(name, number)
                    adding = false
                }
            }) { Text(stringResource(R.string.crew_help_save_contact), style = Mosh.Label.copy(color = Mosh.Amber)) }
        }
        numbers.forEach { n ->
            val sub = when (n.kind) {
                EmergencyNumbers.Kind.ALL -> stringResource(R.string.crew_help_call_sub)
                EmergencyNumbers.Kind.POLICE -> stringResource(R.string.crew_help_call_police)
                EmergencyNumbers.Kind.AMBULANCE -> stringResource(R.string.crew_help_call_ambulance)
            }
            HelpAction(stringResource(R.string.crew_help_call, n.digits), sub, Mosh.Alarm) { onCall(n.digits) }
            if (callFailed == n.digits) Problem(stringResource(R.string.safety_help_no_dialler, n.digits))
        }
        numbers.firstOrNull()?.let { first ->
            Text(
                stringResource(R.string.crew_help_no_signal, first.digits),
                style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
            )
        }
    }
}

/** "Alert my crew", then what the outbox says about the alert. Read out when it changes. */
@Composable
internal fun CrewAlertRow(a: CrewAlertUi, onAlertCrew: () -> Unit, onGoLive: (() -> Unit)?) {
    val (title, sub, colour) = when (a.outcome) {
        null -> Triple(stringResource(R.string.crew_help_alert), stringResource(R.string.crew_help_alert_sub), Mosh.Danger)
        PingOutcome.UNCONFIRMED -> Triple(stringResource(R.string.safety_help_sending), stringResource(R.string.crew_help_alert_sub), Mosh.Danger)
        PingOutcome.WAITING -> Triple(stringResource(R.string.safety_help_not_yet), waitText(a.wait), Mosh.Danger)
        PingOutcome.SENT_NEARBY -> Triple(stringResource(R.string.safety_help_nearby), stringResource(R.string.safety_help_nearby_sub), Mosh.Amber)
        PingOutcome.SENT -> Triple(stringResource(R.string.safety_help_sent), stringResource(R.string.safety_help_sent_sub), Mosh.Lime)
        // FAILED, and anything else: nobody has it.
        else -> Triple(stringResource(R.string.safety_help_not_sent), stringResource(R.string.safety_help_not_sent_sub), Mosh.Danger)
    }
    val goLive = if (a.outcome == PingOutcome.WAITING && a.wait == HelpRules.Wait.GO_LIVE) onGoLive else null
    Column(
        Modifier.fillMaxWidth().background(colour.copy(alpha = 0.12f), RoundedCornerShape(14.dp))
            .border(1.dp, colour.copy(alpha = 0.55f), RoundedCornerShape(14.dp))
            .clickable(enabled = HelpRules.maySend(a.outcome), onClick = onAlertCrew)
            .semantics { liveRegion = LiveRegionMode.Polite }
            .padding(horizontal = 14.dp, vertical = 10.dp),
    ) {
        Text(title, style = Mosh.Label.copy(fontSize = 16.sp, color = colour))
        Text(sub, style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 16.sp, color = Mosh.TextDim))
        if (goLive != null) {
            Spacer(Modifier.height(8.dp))
            Text(
                stringResource(R.string.safety_go_live),
                style = Mosh.Label.copy(fontSize = 15.sp, color = Color(0xFF0B1200)),
                modifier = Modifier.heightIn(min = 40.dp).background(Mosh.Lime, RoundedCornerShape(20.dp))
                    .clickable(onClick = goLive).padding(horizontal = 18.dp, vertical = 10.dp),
            )
        }
    }
}

@Composable
private fun waitText(w: HelpRules.Wait?): String = stringResource(
    when (w) {
        HelpRules.Wait.GO_LIVE -> R.string.safety_help_wait_go_live
        HelpRules.Wait.BLUETOOTH_OFF -> R.string.safety_help_wait_bluetooth
        HelpRules.Wait.CANT_CARRY -> R.string.safety_help_wait_cant_carry
        HelpRules.Wait.LOOKING_NEARBY -> R.string.safety_help_wait_nearby
        HelpRules.Wait.RETRYING, null -> R.string.safety_help_wait_retrying
    },
)

/** Why a text or call didn't open: said where the button is, and it stays. */
@Composable
private fun Problem(text: String) {
    Text(text, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.Danger), modifier = Modifier.padding(horizontal = 4.dp))
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
