package nz.waveformlabs.moshpoint.main

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
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
            )
        }
    }
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
