package nz.waveformlabs.moshpoint.main

import android.content.ClipboardManager
import android.content.Context
import android.os.Bundle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.Invite
import nz.waveformlabs.moshpoint.core.InviteRelay
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
     * Invites the person chose to act on: scanned, pasted with Paste invite, bumped, or confirmed
     * in a dialog (the clipboard's, or [sharedInvite]'s for one from another app). Groups join
     * straight away; a friend fills in "Add someone". Never called straight from an intent.
     */
    fun handleInvite(text: String?, quietIfNone: Boolean = false): Boolean {
        when (val inv = text?.let { Invite.find(it) }) {
            is Invite.Group -> {
                // A relay the invite names: release builds follow it only to one of their own
                // relays, test builds to any (core InviteRelay, docs/WAVE2_PLAY.md item 4).
                InviteRelay.switchTo(InviteRelay.named(inv.qrText), BuildConfig.TEST_BUILD, RelayClient.serverInUse, RelayClient.ownRelays)
                    ?.let { if (RelayClient.setServer(a, it, fromInvite = true)) DebugStatus.log("Using the crew's relay server") }
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
     * An invite that came from another app (Share → Moshpoint invite, or any app starting the app
     * with one), waiting for the person to confirm it (NightDialogs). Until they tap Join or Add,
     * nothing is joined or added and nobody goes live. docs/WAVE2_PLAY.md, item 4.
     */
    var sharedInvite by mutableStateOf<String?>(null)

    /** Offer [text], shared from another app: always through the confirmation, never straight in. */
    fun offerSharedInvite(text: String) {
        val t = text.take(MAX_SHARED_CHARS)
        when (val inv = Invite.find(t)) {
            null -> a.toast(Txt.s(R.string.main_no_invite_found))
            is Invite.Group ->
                if (GigGroup.parseQr(inv.qrText, System.currentTimeMillis()) == null) a.toast(Txt.s(R.string.main_invite_expired))
                else sharedInvite = t
            is Invite.Friend ->
                if (inv.name.isNotBlank()) sharedInvite = t
                else {
                    // A bare code: it only fills in "Add someone", which asks for a name and an Add tap.
                    scanned = inv.code to ""
                    a.toast(Txt.s(R.string.main_got_code))
                }
        }
    }

    /** Keeps a waiting confirmation if Android closes the app meanwhile. */
    fun save(out: Bundle) {
        sharedInvite?.let { out.putString(SAVED_SHARED, it) }
    }

    fun restore(saved: Bundle?) {
        saved?.getString(SAVED_SHARED)?.let { sharedInvite = it }
    }

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

    /**
     * The crew's relay server travels in the invite, so everyone who joins uses the same one. Only
     * the build's own (or, in a test build, one typed into Settings): never a relay that came in
     * someone else's invite (RelayClient.shareableServer).
     */
    fun withRelay(qr: String): String = InviteRelay.attach(qr, RelayClient.shareableServer)

    fun shareGroup(g: GigGroup) {
        Sharing.send(a, a.getString(R.string.main_group_invite_text, g.name, getTheApp + crewQr(g)), a.getString(R.string.main_group_invite_title))
    }

    private companion object {
        /** A shared text longer than this is cut: an invite is a few hundred characters. */
        const val MAX_SHARED_CHARS = 8_000
        const val SAVED_SHARED = "sharedInvite"
    }
}
