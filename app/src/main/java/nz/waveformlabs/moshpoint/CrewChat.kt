package nz.waveformlabs.moshpoint

import android.content.Context
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.service.VisibilityPrefs

/**
 * The crew's short text chat, the pinned plan, and flares ("Bar time 🍺, here for 30 min").
 *
 * All three ride on crew pings (sealed with the crew key, through the relay), so nothing new
 * is needed on the server. Kept small on purpose: this is "where are we meeting", not a
 * group chat app.
 */
object CrewChat {
    /** One line in the chat. [mine] = we sent it. */
    data class Line(val from: String, val timeSec: Long, val text: String, val mine: Boolean, val kind: Int = GigGroup.Ping.CHAT)

    data class Plan(val text: String, val from: String, val setAtSec: Long)

    data class Flare(val from: String, val vibe: String, val untilSec: Long, val lat: Double?, val lon: Double?)

    /** Oldest first (Compose state). */
    val lines = mutableStateListOf<Line>()
    val plan = mutableStateOf<Plan?>(null)
    /** Live flares by sender name. */
    val flares = mutableStateMapOf<String, Flare>()
    /** Chat lines that arrived since the chat was last opened. */
    val unread = mutableStateOf(0)
    var open = false
        set(v) {
            field = v
            if (v) unread.value = 0
        }

    private var planMine = false
    private var planPostedAt = 0L
    private var loaded = false
    const val FLARE_MIN = 30
    private const val MAX_LINES = 80

    /** Ready-made flare vibes. */
    val VIBES = listOf("Lost 😅", "Bar time 🍺", "At the rail 🎶", "Food run 🍔", "Toilets 🚻", "Outside for air 🌬️", "Merch stand 👕", "Leaving soon 👋")

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("crewchat", Context.MODE_PRIVATE)

    fun load(c: Context) {
        if (loaded) return
        loaded = true
        val p = prefs(c)
        lines.clear()
        p.getString("lines", "")!!.split('\n').filter { it.isNotBlank() }.forEach { row ->
            val f = row.split('\t')
            if (f.size >= 5) lines += Line(f[0], f[1].toLongOrNull() ?: 0L, f[3], f[2] == "1", f[4].toIntOrNull() ?: GigGroup.Ping.CHAT)
        }
        val pt = p.getString("plan", null)
        plan.value = if (pt.isNullOrBlank()) null else Plan(pt, p.getString("planFrom", "") ?: "", p.getLong("planAt", 0L))
        planMine = p.getBoolean("planMine", false)
    }

    private fun save(c: Context) {
        val rows = lines.takeLast(MAX_LINES).joinToString("\n") { l ->
            listOf(l.from, l.timeSec.toString(), if (l.mine) "1" else "0", l.text, l.kind.toString())
                .joinToString("\t") { it.replace('\t', ' ').replace('\n', ' ') }
        }
        val pl = plan.value
        prefs(c).edit().putString("lines", rows).putString("plan", pl?.text).putString("planFrom", pl?.from)
            .putLong("planAt", pl?.setAtSec ?: 0L).putBoolean("planMine", planMine).apply()
    }

    fun clear(c: Context) {
        lines.clear()
        plan.value = null
        flares.clear()
        unread.value = 0
        planMine = false
        prefs(c).edit().clear().apply()
    }

    private fun me(c: Context) = VisibilityPrefs.myName(c.applicationContext).ifBlank { "Mate" }

    fun send(c: Context, text: String) {
        val t = text.trim().take(140)
        if (t.isEmpty()) return
        val now = System.currentTimeMillis() / 1000
        add(c, Line(me(c), now, t, mine = true))
        GroupSync.sendPing(c, GigGroup.Ping.CHAT, text = t)
    }

    /** Pin (or clear, with blank) the crew's plan for everyone. */
    fun setPlan(c: Context, text: String) {
        val t = text.trim().take(140)
        val now = System.currentTimeMillis() / 1000
        plan.value = if (t.isEmpty()) null else Plan(t, me(c), now)
        planMine = true
        planPostedAt = System.currentTimeMillis()
        add(c, Line(me(c), now, if (t.isEmpty()) "cleared the plan" else "pinned: $t", mine = true, kind = GigGroup.Ping.PLAN))
        GroupSync.sendPing(c, GigGroup.Ping.PLAN, text = t)
    }

    /** "I'm here for the next half hour: Bar time 🍺", with where we are. */
    fun flare(c: Context, vibe: String, lat: Double?, lon: Double?) {
        val now = System.currentTimeMillis() / 1000
        flares[me(c)] = Flare(me(c), vibe, now + FLARE_MIN * 60L, lat, lon)
        add(c, Line(me(c), now, "sent a flare: $vibe", mine = true, kind = GigGroup.Ping.FLARE))
        GroupSync.sendPing(c, GigGroup.Ping.FLARE, lat, lon, FLARE_MIN, vibe)
    }

    fun endFlare(c: Context) {
        flares.remove(me(c))
    }

    /**
     * From the sync loop: our pinned plan is re-posted every 8 min, because the relay only
     * keeps the last few minutes of pings and late joiners should still see it. [minutes]
     * carries how long ago it was set, so a re-post never beats a newer plan.
     */
    fun tick(c: Context) {
        val now = System.currentTimeMillis()
        flares.entries.removeAll { it.value.untilSec < now / 1000 }
        val p = plan.value ?: return
        if (!planMine || now - planPostedAt < 8 * 60_000L) return
        planPostedAt = now
        val ageMin = ((now / 1000 - p.setAtSec) / 60).toInt().coerceIn(0, 32767)
        if (ageMin > 18 * 60) return // last night's plan
        GroupSync.sendPing(c, GigGroup.Ping.PLAN, minutes = ageMin, text = p.text, quiet = true)
    }

    /** A chat, flare or plan ping from the crew. Returns the notification text, or null to stay quiet. */
    fun received(c: Context, p: GigGroup.Ping): String? {
        load(c)
        if (p.from == me(c)) return null // our own coming back
        return when (p.kind) {
            GigGroup.Ping.CHAT -> {
                add(c, Line(p.from, p.timeSec, p.text, mine = false))
                if (!open) unread.value++
                p.text
            }
            GigGroup.Ping.FLARE -> {
                val until = p.timeSec + p.minutes.coerceIn(1, 120) * 60L
                flares[p.from] = Flare(p.from, p.text, until, p.lat, p.lon)
                add(c, Line(p.from, p.timeSec, "sent a flare: ${p.text}", mine = false, kind = GigGroup.Ping.FLARE))
                "Flare: ${p.text} · here for ${p.minutes} min"
            }
            GigGroup.Ping.PLAN -> {
                val setAt = p.timeSec - p.minutes * 60L
                val cur = plan.value
                if (cur != null && setAt <= cur.setAtSec) return null // a re-post, or older
                if (p.text.isBlank() && cur == null) return null
                plan.value = if (p.text.isBlank()) null else Plan(p.text, p.from, setAt)
                planMine = false
                add(c, Line(p.from, p.timeSec, if (p.text.isBlank()) "cleared the plan" else "pinned: ${p.text}", mine = false, kind = GigGroup.Ping.PLAN))
                if (p.text.isBlank()) null else "New plan: ${p.text}"
            }
            else -> null
        }
    }

    private fun add(c: Context, l: Line) {
        load(c)
        if (lines.any { it.from == l.from && it.timeSec == l.timeSec && it.text == l.text }) return
        val at = lines.indexOfFirst { it.timeSec > l.timeSec }.let { if (it < 0) lines.size else it }
        lines.add(at, l)
        while (lines.size > MAX_LINES) lines.removeAt(0)
        save(c)
    }
}
