package nz.waveformlabs.moshpoint.main

import android.content.ClipboardManager
import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import java.net.URLDecoder
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.Invite
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.profile.Identity
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.sharing.Sharing
import nz.waveformlabs.moshpoint.ui.gigWhen

/**
 * Invites and QR codes: your QR and the crew's, joining from a scan, a paste, the clipboard or a
 * bump, and the invite texts you send. Owned by [MainActivity].
 */
internal class InviteState(private val a: MainActivity) {
    /** The crew whose invite QR is showing (null = the main crew). */
    var qrCrew by mutableStateOf<GigGroup?>(null)
    var bumping by mutableStateOf(false)
    var showQr by mutableStateOf(false)
    var scanned by mutableStateOf<Pair<String, String>?>(null)

    var showGroupQr by mutableStateOf(false)

    /**
     * Invites without a camera: a group or friend invite pasted, shared to Moshpoint from
     * Messenger/SMS, or scanned. Groups join straight away; a friend fills in "Add someone".
     */
    fun handleInvite(text: String?, quietIfNone: Boolean = false): Boolean {
        when (val inv = text?.let { Invite.find(it) }) {
            is Invite.Group -> {
                // Use the crew's relay server if the invite names one.
                inv.qrText.substringBefore("&name=").split('&').firstOrNull { it.startsWith("r=") }?.removePrefix("r=")
                    ?.let { runCatching { URLDecoder.decode(it, "UTF-8") }.getOrNull() }
                    ?.takeIf { it != RelayClient.shareableServer }
                    ?.let { if (RelayClient.setServer(a, it)) DebugStatus.log("Using the crew's relay server") }
                if (!GroupSync.join(a, inv.qrText)) {
                    a.toast(Txt.s(R.string.main_invite_expired))
                    return false
                }
                val joined = GroupSync.newest.value
                if (joined != null && GroupSync.group.value?.key?.contentEquals(joined.key) != true) {
                    a.toast(Txt.s(R.string.main_joined_up_next, joined.name))
                    return true
                }
                val g = GroupSync.group.value
                if (GroupSync.following && g != null) {
                    a.toast(Txt.s(R.string.main_joined_following, g.name))
                } else if (GroupSync.sleeping && g != null) {
                    // A planned gig: nothing runs until the day.
                    a.toast(Txt.s(R.string.main_joined_sleeping, g.name, gigWhen(g.startsAtSec)))
                } else {
                    // Scanning the crew QR is the choice to be found tonight: go live straight away.
                    a.home.setVisibility(true)
                    a.toast(Txt.s(R.string.main_joined_live, g?.name ?: Txt.s(R.string.main_the_crew)))
                }
            }
            is Invite.Friend -> {
                if (inv.name.isBlank()) {
                    // No name in it (a bare code): fill in "Add someone" so they can name them.
                    scanned = inv.code to ""
                    a.toast(Txt.s(R.string.main_got_code))
                } else {
                    // Add straight away, then prompt to link back.
                    val err = FriendsRepository.add(inv.name, inv.code, false, VisibilityPrefs.mySecret(a))
                    a.toast(err ?: Txt.s(R.string.main_friend_added, inv.name))
                }
            }
            null -> {
                if (!quietIfNone) a.toast(Txt.s(R.string.main_no_invite_found))
                return false
            }
        }
        return true
    }

    /** An invite found on the clipboard when the app opens: (invite text, "Bevan's crew"). */
    var clipInvite by mutableStateOf<Pair<String, String>?>(null)

    /**
     * Opened the app with a crew invite copied (from WhatsApp, Messenger...)? Offer to join
     * straight away: no Paste button to find. Each invite is only offered once.
     */
    fun offerClipboardInvite(hasFocus: Boolean) {
        if (!hasFocus || !a.home.onboarded || clipInvite != null) return
        val cm = a.getSystemService(ClipboardManager::class.java) ?: return
        if (cm.primaryClipDescription?.hasMimeType("text/*") != true) return
        val text = runCatching { cm.primaryClip?.getItemAt(0)?.coerceToText(a)?.toString() }.getOrNull() ?: return
        val inv = Invite.find(text) as? Invite.Group ?: return
        val g = GigGroup.parseQr(inv.qrText, System.currentTimeMillis()) ?: return
        if (GroupSync.group.value?.key?.contentEquals(g.key) == true) return // already in it
        val seenKey = inv.qrText.hashCode().toString()
        val p = a.getSharedPreferences("clip", Context.MODE_PRIVATE)
        if (p.getString("offered", null) == seenKey) return
        p.edit().putString("offered", seenKey).apply()
        clipInvite = text to g.name
    }

    fun pasteInvite() {
        val cm = a.getSystemService(ClipboardManager::class.java)
        val text = cm?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(a)?.toString()
        handleInvite(text)
    }

    val getTheApp get() = Sharing.getTheApp(a)

    /** One message that does everything: download link + your invite. */
    fun shareApp() {
        Sharing.send(
            a,
            a.getString(R.string.main_share_app_text, getTheApp + crewQr(ensureCrew())),
            a.getString(R.string.main_share_app_title),
        )
    }

    /** Your crew for tonight, starting one (named after you) if there isn't one. Also goes live. */
    fun ensureCrew(): GigGroup {
        GroupSync.group.value?.let { return it }
        val name = if (a.home.myName.isNotBlank()) a.getString(R.string.main_named_crew, a.home.myName.trim()) else a.getString(R.string.main_tonights_crew)
        GroupSync.startNew(a, name)
        a.home.setVisibility(true)
        return GroupSync.group.value!!
    }

    fun shareCode() = shareGroup(ensureCrew())

    /** The crew QR / invite text, with us inside it so whoever joins can find us at once. */
    fun crewQr(g: GigGroup) =
        // Our pass in this crew (never our permanent identity) and signing key ride in the invite.
        withRelay(GigGroup.qr(g, Identity.intro(a, g, a.home.myName.ifBlank { "Mate" })))

    /** The crew's relay server travels in the invite, so everyone who joins uses the same one. */
    fun withRelay(qr: String): String {
        val r = RelayClient.shareableServer.takeIf { it.isNotBlank() } ?: return qr
        return qr.replaceFirst("&name=", "&r=${java.net.URLEncoder.encode(r, "UTF-8")}&name=")
    }

    fun shareGroup(g: GigGroup) {
        Sharing.send(a, a.getString(R.string.main_group_invite_text, g.name, getTheApp + crewQr(g)), a.getString(R.string.main_group_invite_title))
    }
}
