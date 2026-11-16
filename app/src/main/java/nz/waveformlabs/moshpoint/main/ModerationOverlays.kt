package nz.waveformlabs.moshpoint.main

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import androidx.compose.ui.res.stringResource
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.CrewKeys
import nz.waveformlabs.moshpoint.crew.CrewRekey
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.moderation.Blocks
import nz.waveformlabs.moshpoint.moderation.Moderation
import nz.waveformlabs.moshpoint.moderation.Person
import nz.waveformlabs.moshpoint.moderation.Reporting
import nz.waveformlabs.moshpoint.ui.moderation.ReportContent
import nz.waveformlabs.moshpoint.ui.moderation.BlockConfirmContent
import nz.waveformlabs.moshpoint.ui.moderation.CommunityRulesContent
import nz.waveformlabs.moshpoint.ui.settings.rememberOpenPrivacyPolicy
import nz.waveformlabs.moshpoint.ui.moderation.ModerationDialog
import nz.waveformlabs.moshpoint.ui.moderation.PersonMenuContent

/**
 * Block (docs/REPORT_BLOCK.md) over everything: the menu for someone's message, photo or clip,
 * "Block Jo?", and, for the crew's maker, the usual "Remove Jo from the crew?".
 * @NonRestartableComposable: see [MainScreen].
 */
@Composable
@NonRestartableComposable
internal fun ModerationOverlays(a: MainActivity) {
    // "Before you post", once: the waiting post goes when they agree.
    Moderation.rules.value?.let {
        val notNow = { Moderation.rules.value = null }
        ModerationDialog(onDismiss = notNow) {
            CommunityRulesContent(onPrivacy = rememberOpenPrivacyPolicy(), onAgree = { Moderation.agree(a) }, onNotNow = notNow)
        }
    }
    Moderation.menu.value?.let { s ->
        val p = s.person
        val close = { Moderation.menu.value = null }
        ModerationDialog(onDismiss = close) {
            PersonMenuContent(
                name = p.name,
                blocked = Blocks.list.value.blocksPerson(p.tag, p.crewId, p.name),
                onBlock = { close(); Moderation.confirmBlock.value = s },
                onUnblock = {
                    close()
                    Blocks.unblockPerson(a, p)
                    a.toast(Txt.s(R.string.mod_unblocked_done, p.name))
                },
                onClose = close,
                reportLabel = reportTitle(s),
                onReport = { close(); Moderation.report.value = s },
            )
        }
    }
    Moderation.report.value?.let { s -> ReportSheet(a, s) }
    Moderation.confirmBlock.value?.let { s ->
        val p = s.person
        val close = { Moderation.confirmBlock.value = null }
        val removable = removableMate(a, p)
        ModerationDialog(onDismiss = close) {
            BlockConfirmContent(
                name = p.name,
                canRemove = removable != null,
                onBlock = {
                    close()
                    Blocks.block(a, p)
                    a.toast(Txt.s(R.string.mod_blocked_done, p.name))
                },
                onRemove = { close(); Moderation.confirmRemove.value = removable },
                onCancel = close,
            )
        }
    }
    Moderation.confirmRemove.value?.let { f ->
        val close = { Moderation.confirmRemove.value = null }
        // The same confirmation and the same removal as a crew mate's options on the home screen.
        AlertDialog(
            onDismissRequest = close,
            title = { Text(stringResource(R.string.home_remove_from_crew_title, f.name)) },
            text = { Text(stringResource(R.string.home_remove_from_crew_text, f.name)) },
            confirmButton = {
                TextButton(onClick = {
                    close()
                    val g = GroupSync.group.value
                    if (g != null && !GroupSync.following && CrewRekey.mayRemove(a, g)) {
                        CrewRekey.rekey(a, g, GroupSync.pubOf(f.secret), f.name)
                        FriendsRepository.remove(f.id)
                        a.toast(Txt.s(R.string.main_out_of_crew, f.name))
                    }
                }) { Text(stringResource(R.string.home_remove)) }
            },
            dismissButton = { TextButton(onClick = close) { Text(stringResource(R.string.home_cancel)) } },
        )
    }
}

/** "Report this message" / "this photo" / "this clip" / "Report Jo". */
@Composable
private fun reportTitle(s: Moderation.Subject): String = when (val c = s.content) {
    is Moderation.Message -> stringResource(R.string.mod_report_message)
    is Moderation.Moment -> stringResource(if (c.item.isVideo) R.string.mod_report_clip else R.string.mod_report_photo)
    null -> stringResource(R.string.mod_report_name, s.person.name)
}

/** The report sheet for [s]: sends, then says how it went; "Also block" blocks once it's sent. */
@Composable
private fun ReportSheet(a: MainActivity, s: Moderation.Subject) {
    val p = s.person
    val close = { Moderation.report.value = null }
    var reason by remember(s) { mutableStateOf<Int?>(null) }
    var note by remember(s) { mutableStateOf("") }
    var blockToo by remember(s) { mutableStateOf(false) }
    var sending by remember(s) { mutableStateOf(false) }
    val already = Blocks.list.value.blocksPerson(p.tag, p.crewId, p.name)
    val scope = rememberCoroutineScope()
    val reasons = Reporting.Reason.values().toList()
    ModerationDialog(onDismiss = { if (!sending) close() }) {
        ReportContent(
            title = reportTitle(s),
            name = p.name,
            sends = when (val c = s.content) {
                is Moderation.Message -> stringResource(R.string.mod_report_sends_message)
                is Moderation.Moment -> stringResource(if (c.item.isVideo) R.string.mod_report_sends_clip else R.string.mod_report_sends_photo)
                null -> null
            },
            reasons = reasons.map { stringResource(it.label) },
            reason = reason,
            onReason = { reason = it },
            note = note,
            onNote = { note = it },
            blockToo = if (already) null else blockToo,
            onBlockToo = { blockToo = it },
            sending = sending,
            onSend = {
                val r = reason
                if (r != null && !sending) {
                    sending = true
                    scope.launch {
                        val outcome = Reporting.send(a, s, reasons[r], note)
                        sending = false
                        when (outcome) {
                            Reporting.Outcome.SENT -> {
                                close()
                                if (blockToo && !already) Blocks.block(a, p)
                                a.toast(Txt.s(R.string.mod_report_sent))
                            }
                            Reporting.Outcome.TOO_MANY -> a.toast(Txt.s(R.string.mod_report_limit))
                            Reporting.Outcome.FAILED -> a.toast(Txt.s(R.string.mod_report_failed))
                        }
                    }
                }
            },
            onCancel = close,
        )
    }
}

/**
 * The crew mate [p] is, if this phone may remove them from tonight's crew (as on the home screen:
 * the crew's maker, in a crew that has one), else null.
 */
private fun removableMate(a: MainActivity, p: Person): Friend? {
    if (p.tag == 0L) return null
    val g = GroupSync.group.value ?: return null
    if (GroupSync.following || GigArchive.idFor(g) != p.crewId || !CrewRekey.mayRemove(a, g)) return null
    return FriendsRepository.friends.firstOrNull { f ->
        f.gigGroupOnly && !FriendsRepository.isSimulated(f.id) && GroupSync.pubOf(f.secret)?.let(CrewKeys::tagOf) == p.tag
    }
}
