package nz.waveformlabs.moshpoint.main

import android.content.Intent
import android.provider.Settings
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.core.QrPayload
import nz.waveformlabs.moshpoint.crew.CrewRekey
import nz.waveformlabs.moshpoint.crew.Crews
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.friends.Friendship
import nz.waveformlabs.moshpoint.ui.MyQrDialog
import nz.waveformlabs.moshpoint.ui.countdown

/**
 * The dialogs over everything, welcome included: the crew's invite QR, handing the crew over,
 * your own QR, "Sam wants to stay friends" and the battery-saving question.
 * @NonRestartableComposable: see [MainScreen].
 */
@Composable
@NonRestartableComposable
internal fun CrewDialogs(a: MainActivity) {
    if (a.invites.showGroupQr) {
        (a.invites.qrCrew ?: GroupSync.group.value)?.let { g ->
            val waiting = Crews.find(g.key)
            MyQrDialog(
                a.invites.crewQr(g),
                onDismiss = { a.invites.showGroupQr = false; a.invites.qrCrew = null },
                onShare = { a.invites.shareGroup(g) },
                // In a crew with an owner, only the owner resets the invite (as with removing people).
                onResetInvite = if (CrewRekey.mayRemove(a, g)) {
                    {
                        val fresh = CrewRekey.rekey(a, g, null, null)
                        if (a.invites.qrCrew != null) a.invites.qrCrew = fresh
                        a.toast(Txt.s(R.string.main_invite_reset))
                    }
                } else null,
                eyebrow = when {
                    waiting != null -> countdown(g.startsAtSec, System.currentTimeMillis() / 1000)
                        ?.let { stringResource(R.string.main_eyebrow_up_next_countdown, it.uppercase()) }
                        ?: stringResource(R.string.main_eyebrow_up_next)
                    g.dormant(System.currentTimeMillis()) -> stringResource(R.string.main_eyebrow_coming_up)
                    else -> stringResource(R.string.main_eyebrow_tonight)
                },
                title = g.name,
                hint = if (waiting != null || g.dormant(System.currentTimeMillis())) {
                    stringResource(R.string.main_qr_hint_planned)
                } else stringResource(R.string.main_qr_hint_tonight),
                members = if (waiting != null) {
                    waiting.mates.map { (secret, name) -> Friend(FriendRecord("next-" + secret.take(6).joinToString("") { "%02x".format(it) }, name, 0xFF9D5CFF.toInt(), secret, true, 0L)) }
                } else FriendsRepository.friends.filter { it.gigGroupOnly || it.key in GroupSync.members },
                onEndNight = {
                    a.invites.showGroupQr = false
                    a.invites.qrCrew = null
                    // The owner leaving a crew others are still in hands it over first, so
                    // someone can still remove people. Anyone else just leaves.
                    if (CrewRekey.isOwner(a, g) && CrewRekey.handoverCandidates(a, g).isNotEmpty()) {
                        a.home.handover = g to waiting
                    } else a.home.leaveCrew(g, waiting)
                },
            )
        }
    }
    a.home.handover?.let { (g, waiting) ->
        val candidates = remember(g) { CrewRekey.handoverCandidates(a, g) }
        AlertDialog(
            onDismissRequest = { a.home.handover = null; a.home.handoverEndsNight = false },
            title = { Text(stringResource(R.string.crew_handover_title)) },
            text = {
                Column {
                    Text(stringResource(R.string.crew_handover_body))
                    candidates.forEach { (name, pub) ->
                        TextButton(onClick = {
                            a.home.handover = null
                            val fresh = CrewRekey.handOver(a, g, pub, a.home.myName.ifBlank { null })
                            a.home.leaveCrew(fresh, waiting)
                            if (a.home.handoverEndsNight) a.home.nightEnded()
                            a.home.handoverEndsNight = false
                        }) { Text(name) }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    a.home.handover = null
                    a.home.leaveCrew(g, waiting)
                    if (a.home.handoverEndsNight) a.home.nightEnded()
                    a.home.handoverEndsNight = false
                }) { Text(stringResource(R.string.crew_handover_nobody)) }
            },
            // Cancel: still in the crew, and the night's stats are kept.
            dismissButton = { TextButton(onClick = { a.home.handover = null; a.home.handoverEndsNight = false }) { Text(stringResource(R.string.home_cancel)) } },
        )
    }
    if (a.invites.showQr) {
        MyQrDialog(
            QrPayload.of(a.home.myCode, a.home.myName),
            onDismiss = { a.invites.showQr = false },
            onShare = { a.invites.shareCode() },
            title = if (a.home.myName.isBlank()) stringResource(R.string.main_scan_to_add_me) else stringResource(R.string.main_scan_to_add_name, a.home.myName),
        )
    }
    // "Sam wants to stay friends": one at a time, until answered.
    Friendship.incoming.firstOrNull()?.let { req ->
        AlertDialog(
            onDismissRequest = {},
            title = { Text(stringResource(R.string.main_wants_to_stay_friends, req.name)) },
            text = {
                Text(stringResource(R.string.main_stay_friends_text, req.crewName, req.name))
            },
            confirmButton = {
                TextButton(onClick = {
                    Friendship.accept(a, req)
                    a.toast(Txt.s(R.string.main_friends_now, req.name))
                }) { Text(stringResource(R.string.main_yes_stay_friends)) }
            },
            dismissButton = { TextButton(onClick = { Friendship.decline(a, req) }) { Text(stringResource(R.string.main_not_now)) } },
        )
    }
    if (a.permissions.askBattery) {
        AlertDialog(
            onDismissRequest = { a.permissions.askBattery = false },
            title = { Text(stringResource(R.string.main_battery_title)) },
            text = {
                Text(stringResource(R.string.main_battery_text))
            },
            confirmButton = {
                TextButton(onClick = {
                    a.permissions.askBattery = false
                    runCatching { a.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
                }) { Text(stringResource(R.string.main_open_settings)) }
            },
            dismissButton = { TextButton(onClick = { a.permissions.askBattery = false }) { Text(stringResource(R.string.main_not_now)) } },
        )
    }
}
