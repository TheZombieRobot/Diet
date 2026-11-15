package nz.waveformlabs.moshpoint

import android.content.Context
import android.util.Base64
import androidx.compose.runtime.mutableStateListOf
import nz.waveformlabs.moshpoint.core.GigGroup
import org.json.JSONArray
import org.json.JSONObject

/**
 * Every crew you're in. The soonest one is "the" crew ([GroupSync.group]: Bluetooth,
 * locations, the big card). The rest wait in [others] ("Up next", asleep, no battery) with
 * their settings and crew mates kept, and step up by themselves when their turn comes.
 * Each crew has its own chat, so you can hype up weeks before the gig.
 */
object Crews {
    class Entry(
        val group: GigGroup,
        val following: Boolean,
        /** The crew's saved settings, restored when it becomes the main crew. */
        val settings: JSONObject,
        /** Crew-only mates (secret, name), so they're still there when it's this crew's turn. */
        val mates: List<Pair<ByteArray, String>>,
    ) {
        val id: String get() = GigArchive.idFor(group)
    }

    /** Crews waiting their turn, soonest first (Compose state). */
    val others = mutableStateListOf<Entry>()
    private var loaded = false

    /** Soonest gig first. A crew with no date is "tonight" (when it was made). */
    fun sortKey(g: GigGroup): Long = if (g.startsAtSec > 0) g.startsAtSec else g.createdAtMs / 1000

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("crews", Context.MODE_PRIVATE)

    fun load(c: Context) {
        if (loaded) return
        loaded = true
        others.clear()
        val arr = runCatching { JSONArray(prefs(c).getString("list", "[]")) }.getOrNull() ?: return
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val settings = o.optJSONObject("settings") ?: continue
            val g = groupFrom(settings) ?: continue
            val mates = o.optJSONArray("mates")?.let { m ->
                (0 until m.length()).mapNotNull { j ->
                    m.optJSONObject(j)?.let { runCatching { Base64.decode(it.getString("s"), Base64.NO_WRAP) to it.getString("n") }.getOrNull() }
                }
            }.orEmpty()
            others += Entry(g, settings.optBoolean("following", false), settings, mates)
        }
        sort()
    }

    private fun save(c: Context) {
        val arr = JSONArray()
        others.forEach { e ->
            arr.put(
                JSONObject().put("settings", e.settings).put(
                    "mates",
                    JSONArray().apply { e.mates.forEach { (s, n) -> put(JSONObject().put("s", Base64.encodeToString(s, Base64.NO_WRAP)).put("n", n)) } },
                ),
            )
        }
        prefs(c).edit().putString("list", arr.toString()).apply()
    }

    private fun sort() {
        val sorted = others.sortedBy { sortKey(it.group) }
        others.clear()
        others.addAll(sorted)
    }

    fun find(key: ByteArray): Entry? = others.firstOrNull { it.group.key.contentEquals(key) }

    fun put(c: Context, e: Entry) {
        load(c)
        others.removeAll { it.group.key.contentEquals(e.group.key) }
        others += e
        sort()
        save(c)
        ChatSync.schedule(c)
    }

    fun remove(c: Context, id: String) {
        load(c)
        others.removeAll { it.id == id }
        save(c)
    }

    fun addMate(c: Context, key: ByteArray, secret: ByteArray, name: String) {
        val e = find(key) ?: return
        if (e.mates.any { it.first.contentEquals(secret) }) return
        put(c, Entry(e.group, e.following, e.settings, e.mates + (secret to name)))
    }

    /** A waiting crew moved to a new key (see CrewRekey). */
    fun replaceKey(c: Context, oldKey: ByteArray, fresh: GigGroup) {
        val e = find(oldKey) ?: return
        put(c, Entry(fresh, e.following, ownerFields(JSONObject(e.settings.toString()).put("key", Base64.encodeToString(fresh.key, Base64.NO_WRAP)), fresh), e.mates))
        others.removeAll { it.group.key.contentEquals(oldKey) }
        save(c)
    }

    /** Finished gigs drop off (their photos stay in Your gigs). */
    fun dropExpired(c: Context) {
        load(c)
        val now = System.currentTimeMillis()
        val ended = others.filter { now > it.group.expiresAtMs }
        if (ended.isEmpty()) return
        others.removeAll { now > it.group.expiresAtMs }
        save(c)
        // Their private threads end with them (docs/PRIVATE_MESSAGES.md).
        ended.forEach { PrivateMessages.forgetId(c, it.id) }
    }

    /** A brand-new crew that isn't the main one yet. */
    fun fresh(g: GigGroup, following: Boolean) = Entry(g, following, settingsOf(g, following), emptyList())

    /** The same keys [GroupSync] keeps for the main crew. */
    fun settingsOf(g: GigGroup, following: Boolean): JSONObject = JSONObject()
        .put("key", Base64.encodeToString(g.key, Base64.NO_WRAP))
        .put("name", g.name)
        .put("created", g.createdAtMs)
        .put("at", g.startsAtSec)
        .put("venue", g.venue)
        .apply { g.venueLat?.let { put("vlat", it.toString()) } }
        .apply { g.venueLon?.let { put("vlon", it.toString()) } }
        .apply { ownerFields(this, g) }
        .put("following", following)

    /** An owned crew's owner and salt, or neither (see GigGroup.owned). */
    private fun ownerFields(o: JSONObject, g: GigGroup): JSONObject {
        val pub = g.ownerPub
        val salt = g.ownerSalt
        if (g.owned && pub != null && salt != null) {
            o.put("owner", Base64.encodeToString(pub, Base64.NO_WRAP)).put("osalt", Base64.encodeToString(salt, Base64.NO_WRAP))
        } else {
            o.remove("owner")
            o.remove("osalt")
        }
        return o
    }

    fun groupFrom(o: JSONObject): GigGroup? = runCatching {
        GigGroup(
            Base64.decode(o.getString("key"), Base64.NO_WRAP), o.optString("name", Txt.s(R.string.crew_default_group_name)), o.optLong("created", 0L),
            o.optLong("at", 0L), o.optString("venue", ""),
            o.optString("vlat", "").toDoubleOrNull(), o.optString("vlon", "").toDoubleOrNull(),
            o.optString("owner", "").takeIf { it.isNotEmpty() }?.let { runCatching { Base64.decode(it, Base64.NO_WRAP) }.getOrNull() },
            o.optString("osalt", "").takeIf { it.isNotEmpty() }?.let { runCatching { Base64.decode(it, Base64.NO_WRAP) }.getOrNull() },
        )
    }.getOrNull()
}
