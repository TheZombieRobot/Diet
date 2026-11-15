package nz.waveformlabs.moshpoint.main

import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.chat.CrewChat
import nz.waveformlabs.moshpoint.crew.Crews
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.privatemsg.PrivateMessages
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.sharing.PlanCardImage

/**
 * The crew chat and private messages: opening and closing them, "Message Sam", and the plan as
 * a picture. Owned by [MainActivity].
 */
internal class ChatState(private val a: MainActivity) {
    var showChat by mutableStateOf(false)

    /** Open the chat of crew [crewId] (null = the main crew). */
    fun openChat(crewId: String?) {
        Crews.load(a)
        val g = crewId?.let { id -> Crews.others.firstOrNull { it.id == id }?.group } ?: GroupSync.group.value ?: return
        CrewChat.show(a, g)
        showChat = true
    }

    /** A private message's notification was tapped: open that thread ("crew id:mate tag", docs/PRIVATE_MESSAGES.md). */
    fun openPrivateFrom(intent: Intent?) {
        val thread = intent?.getStringExtra(MainActivity.EXTRA_OPEN_PRIVATE) ?: return
        intent.removeExtra(MainActivity.EXTRA_OPEN_PRIVATE)
        val tag = thread.substringAfterLast(':').toLongOrNull() ?: return
        PrivateMessages.showByTag(a, thread.substringBeforeLast(':'), tag)
    }

    /** "Message Sam": open the private thread with crew mate [friendId]. */
    fun messageMate(friendId: String) {
        val f = FriendsRepository.byId(friendId) ?: return
        if (!PrivateMessages.showFriend(a, f)) a.toast(Txt.s(R.string.crew_friend_unreachable, f.name))
    }

    /**
     * "Message Sam" is offered only once a private message can reach them: their phone has
     * checked in tonight, so we have its key. Never a simulated mate (no phone to check in);
     * before, tapping it only brought up a "can't reach them" toast.
     */
    fun canMessageMate(friendId: String): Boolean =
        FriendsRepository.byId(friendId)?.let { f -> !FriendsRepository.isSimulated(f.id) && PrivateMessages.mateFor(a, f) != null } == true

    fun closeChat() {
        showChat = false
        // After the slide-out, so the closing chat doesn't swap to another crew's messages mid-animation.
        a.lifecycleScope.launch {
            kotlinx.coroutines.delay(300)
            if (!showChat) CrewChat.show(a, GroupSync.group.value)
        }
    }

    /** The night's plan as a picture for the group chat that isn't on Moshpoint yet. */
    fun sharePlanCard() {
        val g = CrewChat.viewing.value ?: GroupSync.group.value ?: return
        val isMain = GroupSync.group.value?.key?.contentEquals(g.key) == true
        val crew = listOf(VisibilityPrefs.myName(a).ifBlank { a.getString(R.string.main_me) }) + if (isMain) {
            FriendsRepository.friends.filter { (it.gigGroupOnly || it.key in GroupSync.members) && !FriendsRepository.isSimulated(it.id) }.map { it.name }
        } else Crews.find(g.key)?.mates?.map { it.second }.orEmpty()
        val whenWhere = listOfNotNull(
            g.startsAtSec.takeIf { it > 0 }?.let { nz.waveformlabs.moshpoint.ui.gigWhen(it) },
            g.venue.takeIf { it.isNotBlank() },
        ).joinToString(" · ").ifBlank { null }
        PlanCardImage.share(a, PlanCardImage.Card(g.name, whenWhere, CrewChat.planFor(a, g)?.text, if (isMain) GroupSync.rally.value?.name else null, crew.distinct()))
    }
}
