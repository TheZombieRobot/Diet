package nz.waveformlabs.moshpoint.main

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.NonRestartableComposable
import kotlinx.coroutines.delay
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.chat.CrewChat
import nz.waveformlabs.moshpoint.chat.OfflineMessages
import nz.waveformlabs.moshpoint.crew.Crews
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.moderation.Blocks
import nz.waveformlabs.moshpoint.moderation.Moderation
import nz.waveformlabs.moshpoint.moderation.Person
import nz.waveformlabs.moshpoint.privatemsg.PrivateMessages
import nz.waveformlabs.moshpoint.profile.PhotoStore
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.ui.chat.CrewChatScreen
import nz.waveformlabs.moshpoint.ui.chat.PrivateChatScreen
import nz.waveformlabs.moshpoint.ui.countdown
import nz.waveformlabs.moshpoint.ui.gigWhen

/**
 * The crew chat and a private thread, each sliding in from the side over whatever is open.
 * @NonRestartableComposable: see [MainScreen].
 */
@Composable
@NonRestartableComposable
internal fun ChatOverlays(a: MainActivity) {
    val chatCrew = CrewChat.viewing.value
    // Chat slides in from the side (and back out), like opening a conversation.
    AnimatedVisibility(
        visible = a.chat.showChat && chatCrew != null,
        enter = slideInHorizontally(tween(320)) { it / 3 } +
            fadeIn(tween(240)),
        exit = slideOutHorizontally(tween(240)) { it / 3 } +
            fadeOut(tween(200)),
    ) {
        @Suppress("NAME_SHADOWING")
        val chatCrew = chatCrew ?: return@AnimatedVisibility
        val isMain = GroupSync.group.value?.key?.contentEquals(chatCrew.key) == true
        val waiting = if (isMain) null else Crews.find(chatCrew.key)
        DisposableEffect(Unit) {
            CrewChat.open = true
            onDispose { CrewChat.open = false }
        }
        LaunchedEffect(Unit) {
            // Fresh messages while you're looking (and for crews asleep until gig day).
            while (true) {
                runCatching { GroupSync.pollPingsNow(a) }
                delay(if (RelayClient.ownServer) 8_000 else 20_000)
            }
        }
        CrewChatScreen(
            crewName = chatCrew.name,
            // Someone blocked on this phone: their lines and plan are hidden (docs/REPORT_BLOCK.md).
            lines = Blocks.visibleLines(CrewChat.lines),
            plan = CrewChat.plan.value?.takeUnless { Blocks.list.value.blocksTag(it.sender) },
            flares = CrewChat.flares.values.filter { it.untilSec > a.home.homeNow / 1000 }.sortedBy { it.untilSec },
            myName = VisibilityPrefs.myName(a).ifBlank { "Mate" },
            nowSec = a.home.homeNow / 1000,
            meetUp = if (isMain) GroupSync.rally.value?.name else null,
            readOnly = if (isMain) GroupSync.following else waiting?.following == true,
            nightTools = isMain && !GroupSync.sleeping && !GroupSync.following,
            subtitle = if (chatCrew.startsAtSec > 0) {
                listOfNotNull(
                    gigWhen(chatCrew.startsAtSec),
                    countdown(chatCrew.startsAtSec, a.home.homeNow / 1000),
                ).joinToString(" · ")
            } else null,
            onInvite = { a.invites.qrCrew = chatCrew; a.invites.showGroupQr = true },
            onRetry = { CrewChat.retry(a, it) },
            offlineHint = OfflineMessages.chatHint(a, chatCrew),
            onGoLive = { a.home.setVisibility(true) },
            onMakeMain = if (waiting != null && !chatCrew.dormant(a.home.homeNow) && !waiting.following) ({
                GroupSync.makeMain(a, waiting)
                CrewChat.show(a, GroupSync.group.value)
                a.home.setVisibility(true)
                a.toast(Txt.s(R.string.main_now_main_crew, waiting.group.name))
            }) else null,
            // The community rules first, once (docs/REPORT_BLOCK.md).
            onSend = { text -> Moderation.beforePosting(a) { CrewChat.send(a, text) } },
            onSetPlan = { text -> Moderation.beforePosting(a) { CrewChat.setPlan(a, text) } },
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
            onLineOptions = { l ->
                Person.ofLine(a, chatCrew, l)?.let { Moderation.ask(Moderation.Subject(it, Moderation.Message(l.text, l.timeSec, private = false))) }
            },
        )
    }
    // A private thread slides in like the crew chat, over whatever was open (docs/PRIVATE_MESSAGES.md).
    val pm = PrivateMessages.open.value
    AnimatedVisibility(
        visible = pm != null,
        enter = slideInHorizontally(tween(320)) { it / 3 } +
            fadeIn(tween(240)),
        exit = slideOutHorizontally(tween(240)) { it / 3 } +
            fadeOut(tween(200)),
    ) {
        @Suppress("NAME_SHADOWING")
        val pm = pm ?: return@AnimatedVisibility
        DisposableEffect(Unit) {
            PrivateMessages.onScreen = true
            onDispose { PrivateMessages.onScreen = false }
        }
        LaunchedEffect(Unit) {
            // Fresh messages while you're looking: the private mailbox rides with the chat's.
            while (true) {
                runCatching { GroupSync.pollPingsNow(a) }
                delay(if (RelayClient.ownServer) 8_000 else 20_000)
            }
        }
        val pmCrew = PrivateMessages.crewOf(a, pm.crewId)
        val mate = pm.friendId?.let { FriendsRepository.byId(it) }
        PrivateChatScreen(
            name = pm.name,
            lines = PrivateMessages.lines,
            nowSec = a.home.homeNow / 1000,
            myName = VisibilityPrefs.myName(a).ifBlank { Txt.s(R.string.crew_default_name) },
            muted = PrivateMessages.muted.value,
            onSend = { text -> Moderation.beforePosting(a) { PrivateMessages.send(a, text) } },
            onBack = { PrivateMessages.close() },
            onMute = { PrivateMessages.setMuted(a, it) },
            onRetry = { PrivateMessages.retry(a, it) },
            offlineHint = pmCrew?.let { OfflineMessages.chatHint(a, it) },
            face = mate?.let { PhotoStore.photos[it.id] },
            myFace = PhotoStore.photos[PhotoStore.ME],
            colour = mate?.color,
            blocked = PrivateMessages.blocked.value,
            onUnblock = {
                val who = Person(pm.name, pm.mate, null, pm.crewId, pmCrew?.name.orEmpty())
                Blocks.unblockPerson(a, who)
                a.toast(Txt.s(R.string.mod_unblocked_done, pm.name))
            },
            onOptions = { l ->
                val pub = pmCrew?.let { PrivateMessages.mateOf(a, it, pm.mate)?.pub }
                val who = Person(pm.name, pm.mate, pub, pm.crewId, pmCrew?.name.orEmpty())
                Moderation.ask(Moderation.Subject(who, l?.let { Moderation.Message(it.text, it.timeSec, private = true) }))
            },
        )
    }
}
