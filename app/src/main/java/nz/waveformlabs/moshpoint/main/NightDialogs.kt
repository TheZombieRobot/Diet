package nz.waveformlabs.moshpoint.main

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.Invite
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.crew.Bump
import nz.waveformlabs.moshpoint.crew.CrewRekey
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.gigs.GigSearch
import nz.waveformlabs.moshpoint.gigs.NightStats
import nz.waveformlabs.moshpoint.sharing.Sharing
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.home.BumpDialog
import nz.waveformlabs.moshpoint.ui.home.PlanGigSheet
import nz.waveformlabs.moshpoint.venue.VenueLookup

/**
 * The night's dialogs over the home and finder: plan a gig, bump to join, an invite that
 * arrived by bump or is on the clipboard, and the "Your night" recap.
 * @NonRestartableComposable: see [MainScreen].
 */
@Composable
@NonRestartableComposable
internal fun NightDialogs(a: MainActivity) {
    if (a.home.planGig) {
        PlanGigSheet(
            search = if (GigSearch.available) ({ q -> GigSearch.search(q) }) else null,
            onPick = { name, at, venue, lat, lon ->
                if (at < System.currentTimeMillis() / 1000 - 3600) {
                    a.toast(Txt.s(R.string.main_time_passed))
                    return@PlanGigSheet
                }
                a.home.planGig = false
                val made = GroupSync.startNew(a, name, at, venue, lat, lon)
                val isMain = GroupSync.group.value?.key?.contentEquals(made.key) == true
                if (isMain && !GroupSync.sleeping) a.home.setVisibility(true)
                if (!isMain) a.toast(Txt.s(R.string.main_added_up_next, made.name))
                a.invites.qrCrew = made
                a.invites.showGroupQr = true
            },
            onClose = { a.home.planGig = false },
            lookupVenue = { text ->
                val near = a.lastKnownLocation()?.let { LatLon(it.latitude, it.longitude) }
                (VenueLookup.find(a, text, near) as? VenueLookup.Result.Found)?.at?.let { it.lat to it.lon }
            },
        )
    }
    if (a.invites.bumping) {
        BumpDialog(sharing = GroupSync.group.value != null) {
            a.invites.bumping = false
            Bump.stop(a)
        }
    }
    Bump.received.value?.let { text ->
        val name = Invite.find(text)
            ?.let { it as? Invite.Group }
            ?.let { GigGroup.parseQr(it.qrText, System.currentTimeMillis())?.name } ?: stringResource(R.string.main_the_crew)
        AlertDialog(
            onDismissRequest = { Bump.received.value = null },
            containerColor = Mosh.Deep,
            title = { Text(stringResource(R.string.main_join_name, name), style = Mosh.Heading) },
            text = { Text(stringResource(R.string.main_bumped_text), style = Mosh.Body) },
            confirmButton = {
                TextButton(onClick = {
                    Bump.received.value = null
                    a.invites.bumping = false
                    Bump.stop(a)
                    a.invites.handleInvite(text)
                }) { Text(stringResource(R.string.main_join), style = Mosh.Label.copy(color = Mosh.Lime)) }
            },
            dismissButton = {
                TextButton(onClick = { Bump.received.value = null }) {
                    Text(stringResource(R.string.main_no), style = Mosh.Label)
                }
            },
        )
    }
    a.invites.clipInvite?.let { (text, name) ->
        val follow = GigGroup.isFollowInvite(text)
        AlertDialog(
            onDismissRequest = { a.invites.clipInvite = null },
            containerColor = Mosh.Deep,
            title = { Text(if (follow) stringResource(R.string.main_follow_name, name) else stringResource(R.string.main_join_name, name), style = Mosh.Heading) },
            text = {
                Text(
                    if (follow) stringResource(R.string.main_clip_follow_text)
                    else stringResource(R.string.main_clip_join_text),
                    style = Mosh.Body,
                )
            },
            confirmButton = {
                TextButton(onClick = { a.invites.clipInvite = null; a.invites.handleInvite(text) }) {
                    Text(stringResource(R.string.main_join), style = Mosh.Label.copy(color = Mosh.Lime))
                }
            },
            dismissButton = {
                TextButton(onClick = { a.invites.clipInvite = null }) {
                    Text(stringResource(R.string.main_not_now), style = Mosh.Label)
                }
            },
        )
    }
    a.home.recap?.let { s ->
        AlertDialog(
            onDismissRequest = { a.home.recap = null },
            containerColor = Mosh.Deep,
            title = { Text(stringResource(R.string.main_your_night), style = Mosh.Heading) },
            text = {
                Text(
                    stringResource(R.string.main_recap_text, NightStats.summary(s, System.currentTimeMillis())),
                    style = Mosh.Body,
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    a.home.recap = null
                    val g = GroupSync.group.value
                    if (g != null && !GroupSync.following && CrewRekey.isOwner(a, g) && CrewRekey.handoverCandidates(a, g).isNotEmpty()) {
                        // As on the QR screen: an owner leaving a crew others are still in hands it
                        // over first. The night ends (stats, toast) only if they then leave.
                        a.home.handoverEndsNight = true
                        a.home.handover = g to null
                    } else {
                        GroupSync.clear(a)
                        a.lifecycleScope.launch { GigArchive.refreshList(a) }
                        a.home.nightEnded()
                    }
                }) { Text(stringResource(R.string.main_end_the_night), style = Mosh.Label.copy(color = Mosh.Danger)) }
            },
            dismissButton = {
                TextButton(onClick = {
                    Sharing.send(a, Txt.s(R.string.main_share_night_text, NightStats.summary(s, System.currentTimeMillis())), Txt.s(R.string.main_share_night_title))
                }) { Text(stringResource(R.string.main_share), style = Mosh.Label.copy(color = Mosh.Cyan)) }
            },
        )
    }
}
