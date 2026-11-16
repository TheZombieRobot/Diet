package nz.waveformlabs.moshpoint.main

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.Invite
import nz.waveformlabs.moshpoint.core.InviteRelay
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.ShowStart
import nz.waveformlabs.moshpoint.discover.DiscoverClient
import nz.waveformlabs.moshpoint.discover.DiscoverPlanned
import nz.waveformlabs.moshpoint.discover.DiscoverWhere
import nz.waveformlabs.moshpoint.crew.Bump
import nz.waveformlabs.moshpoint.crew.CrewRekey
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.gigs.NightStats
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.sharing.Sharing
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.home.BumpDialog
import nz.waveformlabs.moshpoint.ui.home.PlanGigSheet
import nz.waveformlabs.moshpoint.ui.home.PlanSearch
import nz.waveformlabs.moshpoint.ui.home.PlannedGig
import nz.waveformlabs.moshpoint.watch.Entitlements
import nz.waveformlabs.moshpoint.ui.settings.InviteConfirmDialog
import nz.waveformlabs.moshpoint.venue.VenueLookup

/**
 * The night's dialogs over the home and finder: plan a gig, bump to join, an invite that
 * arrived by bump, is on the clipboard or was shared from another app, and the "Your night" recap.
 * @NonRestartableComposable: see [MainScreen].
 */
@Composable
@NonRestartableComposable
internal fun NightDialogs(a: MainActivity) {
    if (a.home.planGig) {
        // Moshpoint+ members get smart search; free users type it in, with a quiet Moshpoint+ card
        // (docs/DISCOVER_APP.md). Only the country and at most the region go to the relay.
        val member = Entitlements.plus(a)
        val search = if (member && DiscoverClient.available && !DiscoverClient.closedRecently(a)) {
            val country = DiscoverWhere.country(a)
            val region = DiscoverWhere.region(a, country, a.lastKnownLocation()?.let { LatLon(it.latitude, it.longitude) })
            PlanSearch(
                country = country,
                regionName = DiscoverWhere.regionName(a, country, region),
                suggest = { q -> DiscoverClient.suggest(country, q, region).also { if (it === DiscoverClient.Answer.Closed) DiscoverClient.noteClosed(a) } },
                startOf = { show -> ShowStart.of(show, country, java.time.ZoneId.systemDefault()) },
            )
        } else {
            null
        }
        PlanGigSheet(
            member = member,
            search = search,
            onPick = { p -> startPlannedCrew(a, p) },
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
    // An invite that came from another app: nothing happens until Join (or Add) is tapped here.
    a.invites.sharedInvite?.let { text -> SharedInviteDialog(a, text) }
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

/**
 * Confirms an invite shared from another app (docs/WAVE2_PLAY.md, item 4): what it is, that it
 * came from elsewhere, and, in test builds, the relay server it would switch to. Only the
 * confirm button joins (and, for tonight's crew, goes live) or adds the friend.
 */
@Composable
@NonRestartableComposable
private fun SharedInviteDialog(a: MainActivity, text: String) {
    val close = { a.invites.sharedInvite = null }
    val accept = {
        a.invites.sharedInvite = null
        a.invites.handleInvite(text)
        Unit
    }
    when (val inv = Invite.find(text)) {
        is Invite.Group -> {
            val name = GigGroup.parseQr(inv.qrText, System.currentTimeMillis())?.name ?: stringResource(R.string.main_the_crew)
            val follow = GigGroup.isFollowInvite(inv.qrText)
            // Test builds only (release builds never switch relays, so they never say so).
            val relay = if (BuildConfig.TEST_BUILD) InviteRelay.switchTo(InviteRelay.named(inv.qrText), true, RelayClient.serverInUse, RelayClient.ownRelays) else null
            InviteConfirmDialog(
                title = if (follow) stringResource(R.string.main_follow_name, name) else stringResource(R.string.main_join_name, name),
                body = if (follow) stringResource(R.string.play_invite_follow_text) else stringResource(R.string.play_invite_join_text),
                note = relay?.let { "Test build: joining also switches this phone to the crew's relay server, $it." },
                confirm = stringResource(R.string.main_join),
                onConfirm = accept,
                onDismiss = close,
            )
        }
        is Invite.Friend -> InviteConfirmDialog(
            title = stringResource(R.string.play_invite_friend_title, inv.name),
            body = stringResource(R.string.play_invite_friend_text),
            note = null,
            confirm = stringResource(R.string.play_invite_add),
            onConfirm = accept,
            onDismiss = close,
        )
        null -> androidx.compose.runtime.SideEffect { close() } // nothing to confirm after all
    }
}

/**
 * Start the crew for a planned gig (Plan a gig, or Plan it on Coming up): the crew for that
 * night, with the show's ticket link signed by us as its maker, then its invite. A gig more than
 * an hour gone is refused.
 */
internal fun startPlannedCrew(a: MainActivity, p: PlannedGig) {
    if (p.startsAtSec < System.currentTimeMillis() / 1000 - 3600) {
        a.toast(Txt.s(R.string.main_time_passed))
        return
    }
    a.home.planGig = false
    val made = GroupSync.startNew(a, p.name, p.startsAtSec, p.venue, p.lat, p.lon, p.tickets)
    DiscoverPlanned.remember(a, p.showId, nz.waveformlabs.moshpoint.gigs.GigArchive.idFor(made))
    val isMain = GroupSync.group.value?.key?.contentEquals(made.key) == true
    if (isMain && !GroupSync.sleeping) a.home.setVisibility(true)
    if (!isMain) a.toast(Txt.s(R.string.main_added_up_next, made.name))
    a.invites.qrCrew = made
    a.invites.showGroupQr = true
}
