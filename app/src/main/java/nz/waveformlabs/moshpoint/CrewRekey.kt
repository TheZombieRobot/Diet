package nz.waveformlabs.moshpoint

import android.content.Context
import android.util.Base64
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.CrewKeys
import nz.waveformlabs.moshpoint.core.GigGroup
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
 */
object CrewRekey {
    const val REKEY = 3
    private const val RESEND_FOR_MS = 72 * 3600_000L
    private const val RESEND_EVERY_MS = 6 * 3600_000L
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
        val recipients = members(app, g).filterKeys { it != me && it != removedTag }.values.toList()
        val payload = fresh.key + (removedName ?: "").take(40).toByteArray(Charsets.UTF_8)
        // Remember to re-send for a few days, from the old crew's mailbox (where they'll look).
        val pending = JSONObject().put("old", b64(g.key)).put("name", g.name).put("payload", b64(payload))
            .put("to", JSONArray(recipients.map { b64(it) })).put("since", System.currentTimeMillis()).put("sent", 0L)
            .put("signer", GigArchive.idFor(g))
        migrate(app, g, fresh, removedPub)
        addPending(app, pending)
        resend(app)
        CrewChat.note(app, fresh, if (removedName != null) Txt.s(R.string.crew_note_you_removed, removedName) else Txt.s(R.string.crew_note_you_reset))
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
    private fun migrate(c: Context, old: GigGroup, fresh: GigGroup, removedPub: ByteArray?) {
        Identity.migrate(c, old, fresh)
        CrewChat.migrate(c, old, fresh)
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
    }

    /** From each chat check: send (or re-send) any new keys still within their few days. */
    fun resend(c: Context) {
        val app = c.applicationContext
        val arr = pending(app)
        val keep = JSONArray()
        val now = System.currentTimeMillis()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (now - o.optLong("since") > RESEND_FOR_MS) continue
            keep.put(o)
            if (now - o.optLong("sent") < RESEND_EVERY_MS) continue
            val old = GigGroup(unb64(o.getString("old")), o.optString("name"), 0L)
            val signer = Identity.signerById(app, o.getString("signer")) ?: continue
            val payload = unb64(o.getString("payload"))
            val to = o.getJSONArray("to")
            o.put("sent", now)
            scope.launch {
                for (j in 0 until to.length()) {
                    val blob = old.sealDirect(signer, unb64(to.getString(j)), REKEY, payload, now / 1000) ?: continue
                    ChatSync.markSeen(blob)
                    RelayClient.putHeld(old.chatIdForDay(today()), blob)
                }
            }
        }
        prefs(app).edit().putString("pending", keep.toString()).apply()
    }

    // ---- Receiving ----

    /** Someone in crew [g] moved it to a new key and sent it to us. */
    fun onDirect(c: Context, g: GigGroup, d: GigGroup.Direct) {
        val app = c.applicationContext
        if (d.payload.size < 32) return
        // Only from someone we know is in the crew: a stranger can't steer us anywhere.
        if (CrewKeys.tagOf(d.fromPub) !in members(app, g)) return
        val newKey = d.payload.copyOfRange(0, 32)
        if (ChatSync.allCrews(app).any { it.key.contentEquals(newKey) }) return // already moved
        val removed = String(d.payload, 32, d.payload.size - 32, Charsets.UTF_8).ifBlank { null }
        val fresh = GigGroup(newKey, g.name, g.createdAtMs, g.startsAtSec, g.venue, g.venueLat, g.venueLon)
        val by = CrewChat.nameOf(app, g, CrewKeys.tagOf(d.fromPub)) ?: Txt.s(R.string.crew_someone)
        migrate(app, g, fresh, null)
        val text = if (removed != null) Txt.s(R.string.crew_note_removed, by, removed) else Txt.s(R.string.crew_note_reset, by)
        CrewChat.note(app, fresh, text)
        CrewNotifications.post(app, title = g.name, text = text, openMap = false, openChat = true, crewId = GigArchive.idFor(fresh))
    }
}
