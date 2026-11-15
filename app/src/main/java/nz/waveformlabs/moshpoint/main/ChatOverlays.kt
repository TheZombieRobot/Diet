package nz.waveformlabs.moshpoint.main

import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.chat.CrewChat
import nz.waveformlabs.moshpoint.chat.OfflineMessages
import nz.waveformlabs.moshpoint.crew.Crews
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.privatemsg.PrivateMessages
import nz.waveformlabs.moshpoint.profile.PhotoStore
import nz.waveformlabs.moshpoint.service.VisibilityPrefs

/**
 * The crew chat and a private thread, each sliding in from the side over whatever is open.
 * @NonRestartableComposable: see [MainScreen].
 */
@Composable
@NonRestartableComposable
internal fun ChatOverlays(a: MainActivity) {
    val chatCrew = CrewChat.viewing.value
    // Chat slides in from the side (and back out), like opening a conversation.
    androidx.compose.animation.AnimatedVisibility(
        visible = a.chat.showChat && chatCrew != null,
        enter = androidx.compose.animation.slideInHorizontally(androidx.compose.animation.core.tween(320)) { it / 3 } +
            androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(240)),
        exit = androidx.compose.animation.slideOutHorizontally(androidx.compose.animation.core.tween(240)) { it / 3 } +
            androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(200)),
    ) {
        @Suppress("NAME_SHADOWING")
        val chatCrew = chatCrew ?: return@AnimatedVisibility
        val isMain = GroupSync.group.value?.key?.contentEquals(chatCrew.key) == true
        val waiting = if (isMain) null else Crews.find(chatCrew.key)
        androidx.compose.runtime.DisposableEffect(Unit) {
            CrewChat.open = true
            onDispose { CrewChat.open = false }
        }
        androidx.compose.runtime.LaunchedEffect(Unit) {
            // Fresh messages while you're looking (and for crews asleep until gig day).
            while (true) {
                runCatching { GroupSync.pollPingsNow(a) }
                kotlinx.coroutines.delay(if (nz.waveformlabs.moshpoint.locate.RelayClient.ownServer) 8_000 else 20_000)
            }
        }
        nz.waveformlabs.moshpoint.ui.chat.CrewChatScreen(
            crewName = chatCrew.name,
            lines = CrewChat.lines,
            plan = CrewChat.plan.value,
            flares = CrewChat.flares.values.filter { it.untilSec > a.home.homeNow / 1000 }.sortedBy { it.untilSec },
            myName = VisibilityPrefs.myName(a).ifBlank { "Mate" },
            nowSec = a.home.homeNow / 1000,
            meetUp = if (isMain) GroupSync.rally.value?.name else null,
            readOnly = if (isMain) GroupSync.following else waiting?.following == true,
            nightTools = isMain && !GroupSync.sleeping && !GroupSync.following,
            subtitle = if (chatCrew.startsAtSec > 0) {
                listOfNotNull(
                    nz.waveformlabs.moshpoint.ui.gigWhen(chatCrew.startsAtSec),
                    nz.waveformlabs.moshpoint.ui.countdown(chatCrew.startsAtSec, a.home.homeNow / 1000),
                ).joinToString(" · ")
            } else null,
            onInvite = { a.invites.qrCrew = chatCrew; a.invites.showGroupQr = true },
            onRetry = { CrewChat.retry(a, it) },
            offlineHint = OfflineMessages.chatHint(a, chatCrew),
            onMakeMain = if (waiting != null && !chatCrew.dormant(a.home.homeNow) && !waiting.following) ({
                GroupSync.makeMain(a, waiting)
                CrewChat.show(a, GroupSync.group.value)
                a.home.setVisibility(true)
                a.toast(Txt.s(R.string.main_now_main_crew, waiting.group.name))
            }) else null,
            onSend = { CrewChat.send(a, it) },
            onSetPlan = { CrewChat.setPlan(a, it) },
            onFlare = { vibe ->
                val loc = a.lastKnownLocation()
                CrewChat.flare(a, vibe, loc?.latitude, loc?.longitude)
            },
            onEndFlare = { CrewChat.endFlare(a) },
            onPing = { kind ->
                val loc = a.lastKnownLocation()
                GroupSync.sendPing(a, kind, loc?.latitude, loc?.longitude)
            },
            onCheckIn = { minutes ->
                val loc = a.lastKnownLocation()
                GroupSync.startCheckIn(a, minutes, loc?.latitude, loc?.longitude)
            },
            onSharePlan = { a.chat.sharePlanCard() },
            onOpenMap = { a.chat.closeChat(); a.map.openMap() },
            onBack = { a.chat.closeChat() },
            photoOf = { name, mine ->
                if (mine) PhotoStore.photos[PhotoStore.ME]
                else FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.let { PhotoStore.photos[it.id] }
            },
            colourOf = { name -> FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.color },
        )
    }
    // A private thread slides in like the crew chat, over whatever was open (docs/PRIVATE_MESSAGES.md).
    val pm = PrivateMessages.open.value
    androidx.compose.animation.AnimatedVisibility(
        visible = pm != null,
        enter = androidx.compose.animation.slideInHorizontally(androidx.compose.animation.core.tween(320)) { it / 3 } +
            androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(240)),
        exit = androidx.compose.animation.slideOutHorizontally(androidx.compose.animation.core.tween(240)) { it / 3 } +
            androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(200)),
    ) {
        @Suppress("NAME_SHADOWING")
        val pm = pm ?: return@AnimatedVisibility
        androidx.compose.runtime.DisposableEffect(Unit) {
            PrivateMessages.onScreen = true
            onDispose { PrivateMessages.onScreen = false }
        }
        androidx.compose.runtime.LaunchedEffect(Unit) {
            // Fresh messages while you're looking: the private mailbox rides with the chat's.
            while (true) {
                runCatching { GroupSync.pollPingsNow(a) }
                kotlinx.coroutines.delay(if (nz.waveformlabs.moshpoint.locate.RelayClient.ownServer) 8_000 else 20_000)
            }
        }
        val pmCrew = PrivateMessages.crewOf(a, pm.crewId)
        val mate = pm.friendId?.let { FriendsRepository.byId(it) }
        nz.waveformlabs.moshpoint.ui.chat.PrivateChatScreen(
            name = pm.name,
            lines = PrivateMessages.lines,
            nowSec = a.home.homeNow / 1000,
            myName = VisibilityPrefs.myName(a).ifBlank { Txt.s(R.string.crew_default_name) },
            muted = PrivateMessages.muted.value,
            onSend = { PrivateMessages.send(a, it) },
            onBack = { PrivateMessages.close() },
            onMute = { PrivateMessages.setMuted(a, it) },
            onRetry = { PrivateMessages.retry(a, it) },
            offlineHint = pmCrew?.let { OfflineMessages.chatHint(a, it) },
            face = mate?.let { PhotoStore.photos[it.id] },
            myFace = PhotoStore.photos[PhotoStore.ME],
            colour = mate?.color,
        )
    }
}
