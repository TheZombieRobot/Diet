package nz.waveformlabs.moshpoint

import android.content.Context
import android.util.Base64
import androidx.compose.runtime.mutableStateListOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.CrewKeys
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import org.json.JSONArray
import org.json.JSONObject

/**
 * "Keep as friend", done privately and both ways (like a friend request).
 *
 * In a crew everyone only knows each other's crew pass, which stops working after the gig.
 * To stay friends, you send your permanent identity to that one person, sealed with a key only
 * the two of you share (see [GigGroup.sealDirect]); the rest of the crew can't read it. They
 * see "Sam wants to stay friends" and, if they say yes, send theirs back. Nobody becomes
 * findable by someone they didn't choose.
 */
object Friendship {
    private const val REQUEST = 1
    private const val ACCEPT = 2

    /** Someone asked to stay friends with us. */
    class Pending(val crewId: String, val crewName: String, val fromPub: ByteArray, val secret: ByteArray, val name: String)

    /** Requests waiting for a yes or no (Compose state). */
    val incoming = mutableStateListOf<Pending>()
    private var loaded = false
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("friendship", Context.MODE_PRIVATE)
    private fun b64(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)
    private fun unb64(s: String) = Base64.decode(s, Base64.NO_WRAP)

    fun load(c: Context) {
        if (loaded) return
        loaded = true
        incoming.clear()
        val arr = runCatching { JSONArray(prefs(c).getString("incoming", "[]")) }.getOrNull() ?: return
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            runCatching {
                incoming += Pending(o.getString("crew"), o.getString("crewName"), unb64(o.getString("pub")), unb64(o.getString("secret")), o.getString("name"))
            }
        }
    }

    private fun save(c: Context) {
        val arr = JSONArray()
        incoming.forEach {
            arr.put(JSONObject().put("crew", it.crewId).put("crewName", it.crewName).put("pub", b64(it.fromPub)).put("secret", b64(it.secret)).put("name", it.name))
        }
        prefs(c).edit().putString("incoming", arr.toString()).apply()
    }

    /** People we've asked: their signing tag -> our entry for them. */
    private fun asked(c: Context) = prefs(c).getStringSet("asked", emptySet())!!.associate { it.substringBefore('=') to it.substringAfter('=') }

    fun hasAsked(c: Context, friendId: String) = friendId in asked(c).values

    private fun payload(c: Context): ByteArray =
        Identity.permanent(c) + VisibilityPrefs.myName(c.applicationContext).ifBlank { "Mate" }.take(40).toByteArray(Charsets.UTF_8)

    private fun send(c: Context, g: GigGroup, toPub: ByteArray, kind: Int): Boolean {
        val blob = g.sealDirect(Identity.signer(c, g), toPub, kind, payload(c), System.currentTimeMillis() / 1000) ?: return false
        ChatSync.markSeen(blob)
        scope.launch {
            val day = Math.floorDiv(System.currentTimeMillis() / 1000, 86_400L)
            RelayClient.putHeld(g.chatIdForDay(day), blob)
        }
        return true
    }

    /** Ask crew mate [friendId] to stay friends. Returns what to tell the user. */
    fun request(c: Context, friendId: String): String {
        val app = c.applicationContext
        val g = GroupSync.group.value ?: return "Keep as friend works while you're in a crew together."
        val f = FriendsRepository.friends.firstOrNull { it.id == friendId } ?: return "They're not in the crew any more."
        val pub = GroupSync.pubOf(f.secret)
            ?: return "Can't reach ${f.name} privately yet. Try again once they've been seen tonight (their app needs updating if this keeps happening)."
        if (!send(app, g, pub, REQUEST)) return "Couldn't ask ${f.name}. Try again."
        val set = prefs(app).getStringSet("asked", emptySet())!!.toMutableSet()
        set.removeAll { it.endsWith("=$friendId") }
        set += "${CrewKeys.tagOf(pub)}=$friendId"
        prefs(app).edit().putStringSet("asked", set).apply()
        return "Asked ${f.name} to stay friends. You'll be friends for every gig when they say yes."
    }

    fun accept(c: Context, p: Pending) {
        val app = c.applicationContext
        val g = ChatSync.allCrews(app).firstOrNull { GigArchive.idFor(it) == p.crewId }
        FriendsRepository.makePermanent(crewEntryFor(app, p.fromPub), p.secret, p.name)
        if (g != null) send(app, g, p.fromPub, ACCEPT)
        incoming.remove(p)
        save(app)
    }

    fun decline(c: Context, p: Pending) {
        incoming.remove(p)
        save(c.applicationContext)
    }

    /** Our crew entry for whoever signs with [pub], if we have one. */
    private fun crewEntryFor(c: Context, pub: ByteArray): String? {
        val secret = GroupSync.secretOfTag(CrewKeys.tagOf(pub)) ?: return null
        return FriendsRepository.friends.firstOrNull { it.secret.contentEquals(secret) }?.id
    }

    /** A direct message for us arrived in crew [g]'s chat. */
    fun onDirect(c: Context, g: GigGroup, d: GigGroup.Direct) {
        val app = c.applicationContext
        if (d.payload.size < 32) return
        val secret = d.payload.copyOfRange(0, 32)
        val name = String(d.payload, 32, d.payload.size - 32, Charsets.UTF_8).take(40)
        if (secret.contentEquals(Identity.permanent(app))) return
        when (d.kind) {
            REQUEST -> {
                load(app)
                // Already friends (or we asked them too): just say yes.
                if (FriendsRepository.friends.any { !it.gigGroupOnly && it.secret.contentEquals(secret) } ||
                    asked(app).containsKey(CrewKeys.tagOf(d.fromPub).toString())
                ) {
                    FriendsRepository.makePermanent(crewEntryFor(app, d.fromPub), secret, name)
                    send(app, g, d.fromPub, ACCEPT)
                    return
                }
                if (incoming.any { it.secret.contentEquals(secret) }) return
                incoming += Pending(GigArchive.idFor(g), g.name, d.fromPub, secret, name)
                save(app)
                CrewNotifications.post(app, title = "$name wants to stay friends", text = "From ${g.name}. Tap to say yes, and you can find each other at any gig.", openMap = false)
            }
            ACCEPT -> {
                val tag = CrewKeys.tagOf(d.fromPub).toString()
                val a = asked(app)
                val entry = a[tag] ?: return // we never asked: ignore
                FriendsRepository.makePermanent(entry, secret, name)
                prefs(app).edit().putStringSet("asked", prefs(app).getStringSet("asked", emptySet())!!.filterNot { it.startsWith("$tag=") }.toSet()).apply()
                CrewNotifications.post(app, title = "$name is a friend now", text = "You can find each other at any gig, not just ${g.name}.", openMap = false)
            }
        }
    }
}
