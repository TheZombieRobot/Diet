package nz.waveformlabs.moshpoint

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.CrewKeys
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.RekeyPolicy
import nz.waveformlabs.moshpoint.locate.RelayClient
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Removing someone for real. A crew is its key: whoever has it can see where everyone is, the
 * chat and the Story. So "Remove Jo" moves the crew to a fresh key and sends it privately to
 * everyone else (sealed to each person, see [GigGroup.sealDirect]); Jo keeps only the old
 * one, which nobody uses any more. "Reset invite" does the same with nobody removed, so a
 * leaked QR or screenshot stops working.
 *
 * Mates whose phones are off when it happens still get the new key: it's re-sent for 3 days.
 *
 * Who may do this, and which rekey a phone follows when there are several, is decided by core
 * [RekeyPolicy]. In short: only a rekey that came from the relay (never Bluetooth), from
 * someone already known in the crew, the first one to reach the relay; and the notice now
 * says whose key was removed, so every phone drops it.
 */
object CrewRekey {
    const val REKEY = GigGroup.DIRECT_REKEY
    private const val RESEND_FOR_MS = 72 * 3600_000L
    private const val RESEND_EVERY_MS = 6 * 3600_000L
    private const val MAX_GRACE = 8
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("rekeys", Context.MODE_PRIVATE)
    private fun b64(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)
    private fun unb64(s: String) = Base64.decode(s, Base64.NO_WRAP)
    private fun today() = Math.floorDiv(System.currentTimeMillis() / 1000, 86_400L)

    /**
     * Move crew [g] to a new key, leaving out whoever signs with [removedPub] (null = nobody,
     * a reset). Returns the crew under its new key.
     */
    fun rekey(c: Context, g: GigGroup, removedPub: ByteArray?, removedName: String?): GigGroup {
        val app = c.applicationContext
        val fresh = GigGroup(
            ByteArray(32).also { java.security.SecureRandom().nextBytes(it) },
            g.name, g.createdAtMs, g.startsAtSec, g.venue, g.venueLat, g.venueLon,
        )
        val removedTag = removedPub?.let { CrewKeys.tagOf(it) }
        val me = Identity.tag(app, g)
        val known = members(app, g)
        val recipients = known.filterKeys { it != me && it != removedTag }.values.toList()
        // The same notice in two forms: the fuller one names the removed key; the older one is
        // for phones that haven't updated (with a mark telling newer ones to wait for the fuller).
        val pending = JSONObject().put("old", b64(g.key)).put("name", g.name)
            // (The mark is only for a removal: on a reset an older build would show it as a removed person with no name.)
            .put("payload", b64(RekeyPolicy.payloadOld(fresh.key, removedName, twin = removedPub != null && !removedName.isNullOrBlank())))
            .put("payload2", b64(RekeyPolicy.payload(fresh.key, listOfNotNull(removedPub), removedName)))
            .put("to", JSONArray(recipients.map { b64(it) })).put("since", System.currentTimeMillis()).put("sent", 0L)
            .put("signer", GigArchive.idFor(g)).put("now", b64(fresh.key))
        rememberGrace(app, g, fresh, known.keys - setOfNotNull(removedTag) - me)
        migrate(app, g, fresh, removedPub)
        addPending(app, pending)
        resend(app)
        CrewChat.note(app, fresh, if (removedName != null) Txt.s(R.string.crew_note_you_removed, removedName) else Txt.s(R.string.crew_note_you_reset))
        // The new key only travels by the relay, so with no signal the crew can't follow yet.
        if (RelayClient.offline) CrewChat.note(app, fresh, Txt.s(R.string.offline_note_rekey_offline))
        return fresh
    }

    /** Everyone we know in crew [g]: their signing tag -> public key. */
    private fun members(c: Context, g: GigGroup): Map<Long, ByteArray> {
        val out = HashMap<Long, ByteArray>()
        CrewChat.knownKeys(c, g).forEach { out[CrewKeys.tagOf(it)] = it }
        if (GroupSync.group.value?.key?.contentEquals(g.key) == true) {
            FriendsRepository.friends.forEach { f -> GroupSync.pubOf(f.secret)?.let { out[CrewKeys.tagOf(it)] = it } }
        }
        return out
    }

    /** Everything kept for the crew moves to its new key: settings, chat, our key, photos. */
    private fun migrate(c: Context, old: GigGroup, fresh: GigGroup, removedPub: ByteArray?, removedTags: Set<Long> = setOfNotNull(removedPub?.let { CrewKeys.tagOf(it) })) {
        Identity.migrate(c, old, fresh)
        // While the old crew is still the one on record: our unsent messages are signed again
        // under the new key, and the old key stops being used over Bluetooth.
        OfflineMessages.onRekey(c, old, fresh)
        CrewChat.migrate(c, old, fresh)
        // The removed person's key and name go too. Before, every phone but the remover's kept them as a member.
        CrewChat.dropKeys(c, fresh, removedTags)
        runCatching {
            val root = File(c.filesDir, "gigs")
            File(root, GigArchive.idFor(old)).takeIf { it.exists() }?.renameTo(File(root, GigArchive.idFor(fresh)))
            GigArchive.remember(c, fresh)
        }
        if (GroupSync.group.value?.key?.contentEquals(old.key) == true) GroupSync.adoptKey(c, fresh, removedPub)
        else Crews.replaceKey(c, old.key, fresh)
    }

    // ---- Sending (and re-sending) the new key ----

    private fun pending(c: Context): JSONArray = runCatching { JSONArray(prefs(c).getString("pending", "[]")) }.getOrDefault(JSONArray())

    private fun addPending(c: Context, o: JSONObject) {
        val arr = pending(c).put(o)
        prefs(c).edit().putString("pending", arr.toString()).apply()
        noteUnsent(arr)
    }

    /** Crews (by their new key) that we moved while we had no signal, so nobody else has the key yet. Compose state. */
    private val unsent = androidx.compose.runtime.mutableStateOf<Set<String>>(emptySet())
    private var unsentLoaded = false

    private fun noteUnsent(arr: JSONArray) {
        unsentLoaded = true
        unsent.value = (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
            .filter { it.optLong("sent") == 0L }.mapNotNull { o -> o.optString("now").takeIf { it.isNotEmpty() } }.toSet()
    }

    /**
     * Did this phone move [g] to its new key and not manage to send that key to anyone yet?
     * Until it does, nobody can read what we send there. Read while drawing the chat.
     */
    fun awaitingSignal(c: Context, g: GigGroup): Boolean {
        if (!unsentLoaded) noteUnsent(pending(c.applicationContext))
        return unsent.value.isNotEmpty() && b64(g.key) in unsent.value
    }

    /** Rounds of sending under way (by the entry's start time), so two chat checks don't send the same one at once. */
    private val sending = HashSet<Long>()

    /**
     * From each chat check: send (or re-send) any new keys still within their few days.
     *
     * A round goes to everyone, every six hours. It only counts as sent once the relay has
     * taken every notice: whoever is left over (the relay asked us to slow down, the signal
     * dropped) gets theirs at the next chat check, not six hours later.
     */
    fun resend(c: Context) {
        val app = c.applicationContext
        val arr = pending(app)
        val keep = JSONArray()
        val now = System.currentTimeMillis()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val since = o.optLong("since")
            if (now - since > RESEND_FOR_MS) continue
            keep.put(o)
            val left = o.optJSONArray("left")?.takeIf { it.length() > 0 }
            if (left == null && now - o.optLong("sent") < RESEND_EVERY_MS) continue
            // With no network, leave it unsent so it goes as soon as there is one.
            if (RelayClient.offline || since in sending) continue
            val old = GigGroup(unb64(o.getString("old")), o.optString("name"), 0L)
            val signer = Identity.signerById(app, o.getString("signer")) ?: continue
            val payload = unb64(o.getString("payload"))
            val payload2 = o.optString("payload2").takeIf { it.isNotEmpty() }?.let { unb64(it) }
            val to = left ?: o.getJSONArray("to")
            val recipients = (0 until to.length()).map { to.getString(it) }
            sending += since
            scope.launch {
                var failedFrom = recipients.size
                for ((j, recipient) in recipients.withIndex()) {
                    val toPub = unb64(recipient)
                    var ok = true
                    // The fuller form first, so it reaches the relay first.
                    if (payload2 != null) {
                        old.sealDirect(signer, toPub, GigGroup.DIRECT_REKEY2, payload2, now / 1000)?.let { blob ->
                            ChatSync.markSeen(blob)
                            ok = RelayClient.putHeld(old.chatIdForDay(today()), blob)
                        }
                    }
                    if (ok) {
                        old.sealDirect(signer, toPub, REKEY, payload, now / 1000)?.let { blob ->
                            ChatSync.markSeen(blob)
                            ok = RelayClient.putHeld(old.chatIdForDay(today()), blob)
                        }
                    }
                    if (!ok) {
                        // The relay isn't taking them just now: this one and the rest wait for the next chat check.
                        failedFrom = j
                        break
                    }
                }
                roundEnded(app, since, recipients.subList(failedFrom, recipients.size))
                sending -= since
            }
        }
        prefs(app).edit().putString("pending", keep.toString()).apply()
        noteUnsent(keep)
    }

    /** A round of sending for the entry begun at [since] ended; [left] still haven't had theirs. */
    private fun roundEnded(c: Context, since: Long, left: List<String>) {
        val arr = pending(c)
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optLong("since") != since) continue
            if (left.isEmpty()) {
                o.put("sent", System.currentTimeMillis())
                o.remove("left")
            } else {
                o.put("left", JSONArray(left))
            }
        }
        prefs(c).edit().putString("pending", arr.toString()).apply()
        noteUnsent(arr)
    }

    // ---- Receiving ----

    /**
     * Rekeys for crew [g] addressed to us, fetched from the relay, **oldest first**. Follows
     * the first acceptable one (see [RekeyPolicy.choose]) and ignores the rest.
     */
    fun onNotices(c: Context, g: GigGroup, directs: List<GigGroup.Direct>) {
        val app = c.applicationContext
        // Who we knew in the crew before any of this: only they may move it.
        val known = members(app, g)
        val me = Identity.tag(app, g)
        val notices = directs.mapNotNull { d ->
            if (d.kind == GigGroup.DIRECT_REKEY2) RekeyPolicy.parse(d.fromPub, d.payload) else RekeyPolicy.parseOld(d.fromPub, d.payload)
        }
        val n = RekeyPolicy.choose(notices, known.keys, me, g.key) ?: return
        if (ChatSync.allCrews(app).any { it.key.contentEquals(n.newKey) }) return // already moved
        val fresh = GigGroup(n.newKey, g.name, g.createdAtMs, g.startsAtSec, g.venue, g.venueLat, g.venueLon)
        val by = CrewChat.nameOf(app, g, n.fromTag) ?: Txt.s(R.string.crew_someone)
        rememberGrace(app, g, fresh, RekeyPolicy.allowlist(known.keys, n) - me)
        migrate(app, g, fresh, n.removedPubs.firstOrNull(), n.removedTags)
        val removed = n.removedName
        val text = if (removed != null) Txt.s(R.string.crew_note_removed, by, removed) else Txt.s(R.string.crew_note_reset, by)
        CrewChat.note(app, fresh, text)
        CrewNotifications.post(app, title = g.name, text = text, openMap = false, openChat = true, crewId = GigArchive.idFor(fresh))
    }

    // ---- Old-key messages, for a day ----

    /**
     * A crew that recently moved to a new key. Its old chat mailbox is still read for a day,
     * so a mate who hadn't got the new key yet isn't cut off mid-sentence: but only messages
     * from [allowed], the people in the crew at the time minus whoever was removed. Nothing
     * is ever written under the old key.
     */
    class Grace(val old: GigGroup, val now: GigGroup, val allowed: Set<Long>)

    private fun rememberGrace(c: Context, old: GigGroup, fresh: GigGroup, allowed: Set<Long>) {
        val arr = runCatching { JSONArray(prefs(c).getString("grace", "[]")) }.getOrDefault(JSONArray())
        val keep = JSONArray()
        // A crew that moves twice in a day: earlier records follow it to the newest key.
        for (i in maxOf(0, arr.length() - (MAX_GRACE - 1)) until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (o.optString("now") == b64(old.key)) o.put("now", b64(fresh.key))
            keep.put(o)
        }
        keep.put(
            JSONObject().put("old", b64(old.key)).put("now", b64(fresh.key))
                .put("allow", JSONArray(allowed.map { it.toString() })).put("until", System.currentTimeMillis() + RekeyPolicy.GRACE_MS),
        )
        prefs(c).edit().putString("grace", keep.toString()).apply()
    }

    fun graceCrews(c: Context): List<Grace> {
        val app = c.applicationContext
        val raw = prefs(app).getString("grace", null)
        if (raw.isNullOrEmpty() || raw == "[]") return emptyList()
        val arr = runCatching { JSONArray(raw) }.getOrNull() ?: return emptyList()
        val nowMs = System.currentTimeMillis()
        val crews = ChatSync.allCrews(app)
        val out = ArrayList<Grace>()
        val keep = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (nowMs > o.optLong("until")) continue
            keep.put(o)
            val oldKey = runCatching { unb64(o.getString("old")) }.getOrNull()?.takeIf { it.size == 32 } ?: continue
            val nowKey = runCatching { unb64(o.getString("now")) }.getOrNull() ?: continue
            val current = crews.firstOrNull { it.key.contentEquals(nowKey) } ?: continue
            val allow = o.optJSONArray("allow") ?: continue
            val tags = (0 until allow.length()).mapNotNull { allow.optString(it).toLongOrNull() }.toSet()
            out += Grace(GigGroup(oldKey, current.name, 0L), current, tags)
        }
        if (keep.length() != arr.length()) prefs(app).edit().putString("grace", keep.toString()).apply()
        return out
    }
}
