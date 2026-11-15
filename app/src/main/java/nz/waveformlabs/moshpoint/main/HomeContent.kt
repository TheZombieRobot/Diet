package nz.waveformlabs.moshpoint.main

import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
import androidx.lifecycle.lifecycleScope
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.chat.CrewChat
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.crew.Bump
import nz.waveformlabs.moshpoint.crew.CrewRekey
import nz.waveformlabs.moshpoint.crew.CrewStatus
import nz.waveformlabs.moshpoint.crew.Crews
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.friends.Friendship
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.gigs.NightStats
import nz.waveformlabs.moshpoint.map.LocationBook
import nz.waveformlabs.moshpoint.moments.Moments
import nz.waveformlabs.moshpoint.privatemsg.PrivateMessages
import nz.waveformlabs.moshpoint.profile.AvatarSync
import nz.waveformlabs.moshpoint.profile.FacebookLogin
import nz.waveformlabs.moshpoint.profile.PhotoStore
import nz.waveformlabs.moshpoint.safety.GhostMode
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.sharing.Sharing
import nz.waveformlabs.moshpoint.ui.FriendsScreen
import nz.waveformlabs.moshpoint.venue.VenueMaps

/** The home screen, wired to the app. @NonRestartableComposable: see [MainScreen]. */
@Composable
@NonRestartableComposable
internal fun HomeContent(a: MainActivity) {
    FriendsScreen(
        friends = FriendsRepository.friends,
        crewKeys = GroupSync.members.toSet(),
        visible = a.home.visibleToMates,
        alwaysOn = a.home.alwaysOn,
        phoneSummary = a.home.phoneSummary,
        missingPermissions = a.permissions.missing,
        setupIssues = a.permissions.setupIssues,
        myName = a.home.myName,
        onMyName = {
            a.home.myName = it
            VisibilityPrefs.setMyName(a, it)
        },
        onFixPermissions = a.permissions::fixPermissions,
        onVisible = a.home::setVisibility,
        onAlwaysOn = {
            a.home.alwaysOn = it
            VisibilityPrefs.setAlwaysOn(a, it)
        },
        onFind = { ids ->
            a.finder.pendingStop?.cancel()
            a.finder.engine.track(ids)
            a.finder.engine.start()
            a.finder.finding = true
        },
        onShareCode = { a.invites.shareCode(a.home.myCode) },
        onPasteInvite = a.invites::pasteInvite,
        onShareApp = { a.invites.shareApp(a.home.myCode) },
        onShowQr = { a.invites.ensureCrew(); a.invites.showGroupQr = true },
        onScanQr = {
            a.launchers.scanQr.launch(
                ScanOptions()
                    .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                    .setPrompt(Txt.s(R.string.main_scan_prompt))
                    .setBeepEnabled(false)
                    .setOrientationLocked(true),
            )
        },
        scanned = a.invites.scanned,
        onScannedUsed = { a.invites.scanned = null },
        onAdd = { name, code, gig ->
            FriendsRepository.add(name, code, gig, a.home.mySecret).also { if (it == null) a.toast(Txt.s(R.string.main_friend_added, name.trim())) }
        },
        onRemove = { id ->
            val f = FriendsRepository.friends.firstOrNull { it.id == id }
            val g = GroupSync.group.value
            if (f != null && f.gigGroupOnly && g != null && !GroupSync.following) {
                // Really out: the crew moves to a new key they don't get. (Only the owner, in an owned crew.)
                if (CrewRekey.mayRemove(a, g)) {
                    CrewRekey.rekey(a, g, GroupSync.pubOf(f.secret), f.name)
                    FriendsRepository.remove(id)
                    a.toast(Txt.s(R.string.main_out_of_crew, f.name))
                }
            } else {
                FriendsRepository.remove(id)
            }
        },
        onSetPhoto = { id ->
            a.camera.photoFor = id
            a.launchers.pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        },
        onRemovePhoto = PhotoStore::remove,
        onClearGigGroup = { a.home.recap = NightStats.get(a) },
        groupName = GroupSync.group.value?.name,
        canRemoveCrewMates = GroupSync.group.value?.let { CrewRekey.mayRemove(a, it) } ?: true,
        onStartGroup = { name ->
            a.invites.qrCrew = GroupSync.startNew(a, name)
            a.home.setVisibility(true)
            a.invites.showGroupQr = true
        },
        onKeepFriend = { id -> a.toast(Friendship.request(a, id)) },
        // "Message Sam" in a crew mate's options, and a count on their face (docs/PRIVATE_MESSAGES.md).
        onMessage = if (GroupSync.group.value != null && !GroupSync.following) ({ id -> a.chat.messageMate(id) }) else null,
        canMessage = a.chat::canMessageMate,
        privateUnread = PrivateMessages.unreadByFriend(a),
        onShowGroupQr = { a.invites.showGroupQr = true },
        onShowCrewQr = {
            a.invites.ensureCrew()
            a.invites.showGroupQr = true
        },
        seen = LocationBook.seen,
        nowSec = a.home.homeNow / 1000,
        pings = GroupSync.pings,
        onPing = { kind ->
            val loc = a.lastKnownLocation()
            GroupSync.sendPing(a, kind, loc?.latitude, loc?.longitude)
        },
        describePing = GroupSync::pingText,
        moments = Moments.items,
        onShareMoment = a.momentFlow::start,
        onCheckIn = { minutes ->
            val loc = a.lastKnownLocation()
            GroupSync.startCheckIn(a, minutes, loc?.latitude, loc?.longitude)
        },
        checkInBy = GroupSync.myCheckInBy.value.takeIf { it > 0 }?.let {
            java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(it * 1000))
        },
        onHomeSafe = { GroupSync.homeSafe(a) },
        distances = CrewStatus.distances,
        crewQrPayload = GroupSync.group.value?.let { a.invites.crewQr(it) },
        onQuickCrew = { a.invites.ensureCrew() },
        onPlanGig = { a.home.planGig = true },
        onOpenStory = { a.story.showStory = true },
        onOpenChat = { a.chat.openChat(null) },
        chatUnread = CrewChat.unreadFor(a, GroupSync.group.value),
        pinnedPlan = GroupSync.group.value?.let { CrewChat.planFor(a, it)?.text },
        upNext = Crews.others.map { e ->
            nz.waveformlabs.moshpoint.ui.UpNextCard(
                id = e.id, name = e.group.name,
                whenText = e.group.startsAtSec.takeIf { it > 0 }?.let { nz.waveformlabs.moshpoint.ui.gigWhen(it) },
                countdown = nz.waveformlabs.moshpoint.ui.countdown(e.group.startsAtSec, a.home.homeNow / 1000),
                venue = e.group.venue, mates = maxOf(e.mates.size, CrewChat.peopleCount(a, e.group)),
                unread = CrewChat.unreadFor(a, e.group),
                plan = CrewChat.planFor(a, e.group)?.text,
                following = e.following,
                startsAtSec = e.group.startsAtSec,
            )
        },
        onOpenUpNext = { id -> a.chat.openChat(id) },
        flareNotes = CrewChat.flares.values.filter { it.untilSec > a.home.homeNow / 1000 }.mapNotNull { fl ->
            FriendsRepository.friends.firstOrNull { it.name.equals(fl.from, true) }?.let { it.id to "🔥 ${fl.vibe}" }
        }.toMap(),
        following = GroupSync.following,
        tileNotes = CrewStatus.venueNotes,
        followers = GroupSync.followers,
        pastGigs = GigArchive.gigs,
        currentGigId = GroupSync.group.value?.let(GigArchive::idFor),
        onOpenGig = { g ->
            a.story.archiveGig = g
            a.story.archiveItems = emptyList()
            a.lifecycleScope.launch { a.story.archiveItems = GigArchive.load(a, g.id) }
        },
        onLetFamilyFollow = {
            GroupSync.group.value?.let { g ->
                Sharing.send(
                    a,
                    Txt.s(R.string.main_follow_share_text, g.name, a.invites.getTheApp + a.invites.withRelay(GigGroup.qr(g, null, follower = true))),
                    Txt.s(R.string.main_follow_share_title),
                )
            }
        },
        crewWhen = GroupSync.group.value?.takeIf { it.startsAtSec > 0 }?.let { g ->
            nz.waveformlabs.moshpoint.ui.gigWhen(g.startsAtSec).let { w -> if (g.venue.isNotBlank()) Txt.s(R.string.main_when_venue, w, g.venue) else w }
        },
        crewSleeping = a.home.homeNow > 0 && GroupSync.sleeping,
        onBump = {
            a.invites.bumping = true
            Bump.start(a, GroupSync.group.value?.let { a.invites.crewQr(it) })
        },
        onOpenMoment = a.momentFlow::view,
        ghost = GhostMode.on.value,
        onAddSimulated = if (DebugStatus.enabled) ({ FriendsRepository.addSimulated() }) else null,
        onSelfie = a.camera::selfie,
        onPickMyPhoto = {
            a.camera.photoFor = PhotoStore.ME
            a.launchers.pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
        },
        onFacebook = if (FacebookLogin.available) a.home.facebook::login else null,
        onRemoveMyPhoto = {
            PhotoStore.remove(PhotoStore.ME)
            AvatarSync.publishMine(a, force = true)
        },
        onOpenMap = { a.map.openMap() },
        meetUp = GroupSync.rally.value?.name,
        venueMap = VenueMaps.status.value,
        // The crew menu's "Reset the invite": as on the QR screen, only the owner resets an owned crew.
        onResetInvite = GroupSync.group.value?.takeIf { !GroupSync.following && CrewRekey.mayRemove(a, it) }?.let { g ->
            {
                CrewRekey.rekey(a, g, null, null)
                a.toast(Txt.s(R.string.main_invite_reset))
            }
        },
    )
}
