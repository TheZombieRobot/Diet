package nz.waveformlabs.moshpoint

import android.content.Context
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.service.VisibilityPrefs

/**
 * Each crew's chat and pinned plan (one per crew, so you can hype up for next month's gig
 * while tonight's is on), plus flares ("Bar time 🍺, here for 30 min") for the main crew.
 *
 * Chat and the plan go to the crew's chat mailbox, which the relay keeps far longer than
 * pings (12 h public, days on your own server), and every phone keeps its own copy.
 * Sealed with the crew key: the relay never sees a word.
 */
object CrewChat {
    /** One line in the chat. [mine] = we sent it. */
    data class Line(val from: String, val timeSec: Long, val text: String, val mine: Boolean, val kind: Int = GigGroup.Ping.CHAT)

    data class Plan(val text: String, val from: String, val setAtSec: Long)

    data class Flare(val from: String, val vibe: String, val untilSec: Long, val lat: Double?, val lon: Double?)

    /** The crew whose chat is on screen (or would be): the main crew unless you opened another. */
    val viewing = mutableStateOf<GigGroup?>(null)
    private val viewingId get() = viewing.value?.let { GigArchive.idFor(it) }

    /** The viewed crew's lines, oldest first (Compose state). */
    val lines = mutableStateListOf<Line>()
    val plan = mutableStateOf<Plan?>(null)
    /** The main crew's live flares by sender name. */
    val flares = mutableStateMapOf<String, Flare>()
    /** New lines per crew id since its chat was last open. */
    private val unread = mutableStateMapOf<String, Int>()

    /** The chat screen is showing [viewing]. */
    var open = false
        set(v) {
            field = v
            if (v) viewingId?.let { markRead(appCtx ?: return, it) }
        }

    private var appCtx: Context? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    const val FLARE_MIN = 30
    private const val MAX_LINES = 120
    private const val PLAN_REPOST_MS = 6 * 3600_000L

    /** Ready-made flare vibes. */
    val VIBES = listOf("Lost 😅", "Bar time 🍺", "At the rail 🎶", "Food run 🍔", "Toilets 🚻", "Outside for air 🌬️", "Merch stand 👕", "Leaving soon 👋")

    private fun prefs(c: Context, id: String) = c.applicationContext.getSharedPreferences("crewchat_$id", Context.MODE_PRIVATE)
    private fun me(c: Context) = VisibilityPrefs.myName(c.applicationContext).ifBlank { "Mate" }
    private fun today() = Math.floorDiv(System.currentTimeMillis() / 1000, 86_400L)

    fun unreadFor(c: Context, g: GigGroup?): Int {
        g ?: return 0
        val id = GigArchive.idFor(g)
        // No state writes here: this is read while drawing.
        return unread[id] ?: prefs(c, id).getInt("unread", 0)
    }

    private fun markRead(c: Context, id: String) {
        unread[id] = 0
        prefs(c, id).edit().putInt("unread", 0).apply()
    }

    /** Point the chat at [g] (the main crew by default, or one from Up next). */
    fun show(c: Context, g: GigGroup?) {
        appCtx = c.applicationContext
        viewing.value = g
        lines.clear()
        plan.value = null
        g ?: return
        val id = GigArchive.idFor(g)
        lines.addAll(readLines(c, id))
        plan.value = readPlan(c, id)
        if (open) markRead(c, id)
    }

    /** The chat for whichever crew the screen will show; falls back to the main crew. */
    fun load(c: Context) {
        appCtx = c.applicationContext
        if (viewing.value == null) GroupSync.group.value?.let { show(c, it) }
    }

    fun planFor(c: Context, g: GigGroup): Plan? =
        if (GigArchive.idFor(g) == viewingId) plan.value else readPlan(c, GigArchive.idFor(g))

    private fun readLines(c: Context, id: String): List<Line> =
        prefs(c, id).getString("lines", "")!!.split('\n').filter { it.isNotBlank() }.mapNotNull { row ->
            val f = row.split('\t')
            if (f.size >= 5) Line(f[0], f[1].toLongOrNull() ?: 0L, f[3], f[2] == "1", f[4].toIntOrNull() ?: GigGroup.Ping.CHAT) else null
        }

    private fun writeLines(c: Context, id: String, list: List<Line>) {
        val rows = list.takeLast(MAX_LINES).joinToString("\n") { l ->
            listOf(l.from, l.timeSec.toString(), if (l.mine) "1" else "0", l.text, l.kind.toString())
                .joinToString("\t") { it.replace('\t', ' ').replace('\n', ' ') }
        }
        prefs(c, id).edit().putString("lines", rows).apply()
    }

    private fun readPlan(c: Context, id: String): Plan? {
        val p = prefs(c, id)
        val t = p.getString("plan", null)
        return if (t.isNullOrBlank()) null else Plan(t, p.getString("planFrom", "") ?: "", p.getLong("planAt", 0L))
    }

    private fun writePlan(c: Context, g: GigGroup, pl: Plan?, mine: Boolean) {
        val id = GigArchive.idFor(g)
        prefs(c, id).edit().putString("plan", pl?.text).putString("planFrom", pl?.from).putLong("planAt", pl?.setAtSec ?: 0L)
            .putBoolean("planMine", mine).putLong("planPosted", if (mine) System.currentTimeMillis() else 0L).apply()
        if (id == viewingId) plan.value = pl
    }

    /** A crew has ended or you left it: its chat goes too. */
    fun forget(c: Context, g: GigGroup) {
        val id = GigArchive.idFor(g)
        prefs(c, id).edit().clear().apply()
        unread.remove(id)
        if (id == viewingId) show(c, null)
        if (GroupSync.group.value?.key?.contentEquals(g.key) == true) flares.clear()
    }

    // ---- Sending ----

    private fun post(c: Context, g: GigGroup, p: GigGroup.Ping) {
        val blob = g.sealPing(p)
        ChatSync.markSeen(blob)
        scope.launch {
            val ok = RelayClient.putHeld(g.chatIdForDay(today()), blob)
            if (!ok) DebugStatus.log("Chat not sent (no internet?)")
        }
    }

    /** A message to the crew on screen. */
    fun send(c: Context, text: String) {
        val g = viewing.value ?: return
        val t = text.trim().take(140)
        if (t.isEmpty()) return
        val now = System.currentTimeMillis() / 1000
        add(c, g, Line(me(c), now, t, mine = true))
        post(c, g, GigGroup.Ping(GigGroup.Ping.CHAT, me(c), now, text = t))
    }

    /** Pin (or clear, with blank) the plan for the crew on screen. */
    fun setPlan(c: Context, text: String) {
        val g = viewing.value ?: return
        val t = text.trim().take(140)
        val now = System.currentTimeMillis() / 1000
        writePlan(c, g, if (t.isEmpty()) null else Plan(t, me(c), now), mine = true)
        add(c, g, Line(me(c), now, if (t.isEmpty()) "cleared the plan" else "pinned: $t", mine = true, kind = GigGroup.Ping.PLAN))
        post(c, g, GigGroup.Ping(GigGroup.Ping.PLAN, me(c), now, text = t))
    }

    /**
     * Our pinned plans are re-posted every few hours so they stay on the relay for mates who
     * join later. [GigGroup.Ping.minutes] carries how long ago it was set, so a re-post never
     * beats a newer plan.
     */
    fun repostPlans(c: Context, crews: List<GigGroup>) {
        val now = System.currentTimeMillis()
        crews.forEach { g ->
            val p = prefs(c, GigArchive.idFor(g))
            if (!p.getBoolean("planMine", false) || now - p.getLong("planPosted", 0L) < PLAN_REPOST_MS) return@forEach
            val pl = readPlan(c, GigArchive.idFor(g)) ?: return@forEach
            p.edit().putLong("planPosted", now).apply()
            val ageMin = ((now / 1000 - pl.setAtSec) / 60).toInt().coerceIn(0, 32767)
            post(c, g, GigGroup.Ping(GigGroup.Ping.PLAN, me(c), now / 1000, minutes = ageMin, text = pl.text))
        }
    }

    /** "I'm here for the next half hour: Bar time 🍺", with where we are (main crew only). */
    fun flare(c: Context, vibe: String, lat: Double?, lon: Double?) {
        val g = GroupSync.group.value ?: return
        val now = System.currentTimeMillis() / 1000
        flares[me(c)] = Flare(me(c), vibe, now + FLARE_MIN * 60L, lat, lon)
        add(c, g, Line(me(c), now, "sent a flare: $vibe", mine = true, kind = GigGroup.Ping.FLARE))
        GroupSync.sendPing(c, GigGroup.Ping.FLARE, lat, lon, FLARE_MIN, vibe)
    }

    fun endFlare(c: Context) {
        flares.remove(me(c))
    }

    /** Old flares go out. */
    fun tick(@Suppress("UNUSED_PARAMETER") c: Context) {
        val now = System.currentTimeMillis() / 1000
        flares.entries.removeAll { it.value.untilSec < now }
    }

    // ---- Receiving ----

    /** A chat, plan or flare from the main crew's pings (older builds send chat this way). */
    fun received(c: Context, p: GigGroup.Ping): String? = GroupSync.group.value?.let { ingest(c, it, p) }

    /**
     * A chat, plan or flare for crew [g]. Returns the notification text if it's new, or null
     * to stay quiet (our own, a repeat, or an older plan).
     */
    fun ingest(c: Context, g: GigGroup, p: GigGroup.Ping): String? {
        appCtx = c.applicationContext
        if (p.from == me(c)) return null // our own coming back
        return when (p.kind) {
            GigGroup.Ping.CHAT -> if (add(c, g, Line(p.from, p.timeSec, p.text, mine = false))) p.text else null
            GigGroup.Ping.FLARE -> {
                if (GroupSync.group.value?.key?.contentEquals(g.key) != true) return null
                val until = p.timeSec + p.minutes.coerceIn(1, 120) * 60L
                if (until < System.currentTimeMillis() / 1000) return null
                flares[p.from] = Flare(p.from, p.text, until, p.lat, p.lon)
                if (add(c, g, Line(p.from, p.timeSec, "sent a flare: ${p.text}", mine = false, kind = GigGroup.Ping.FLARE))) {
                    "Flare: ${p.text} · here for ${p.minutes} min"
                } else null
            }
            GigGroup.Ping.PLAN -> {
                val setAt = p.timeSec - p.minutes * 60L
                val cur = planFor(c, g)
                if (cur != null && setAt <= cur.setAtSec) return null // a re-post, or older
                if (p.text.isBlank() && cur == null) return null
                writePlan(c, g, if (p.text.isBlank()) null else Plan(p.text, p.from, setAt), mine = false)
                add(c, g, Line(p.from, p.timeSec, if (p.text.isBlank()) "cleared the plan" else "pinned: ${p.text}", mine = false, kind = GigGroup.Ping.PLAN))
                if (p.text.isBlank()) null else "New plan: ${p.text}"
            }
            else -> null
        }
    }

    /** A one-tap ping ("On my way") in the main crew, as a chat bubble. */
    fun pingLine(c: Context, p: GigGroup.Ping, mine: Boolean) {
        val g = GroupSync.group.value ?: return
        val text = quickText(p) ?: return
        add(c, g, Line(if (mine) me(c) else p.from, p.timeSec, text, mine))
    }

    fun quickText(p: GigGroup.Ping): String? = when (p.kind) {
        GigGroup.Ping.COMING -> "On my way 🏃"
        GigGroup.Ping.WHERE_ARE_YOU -> "Where are you? 👀"
        GigGroup.Ping.STAY_PUT -> "Stay put ✋"
        GigGroup.Ping.MEET_AT_PIN -> "Meet at the pin 📍"
        GigGroup.Ping.ALL_GOOD -> "All good 👍"
        GigGroup.Ping.GOING_HOME -> "Heading home 🏠"
        GigGroup.Ping.NEED_HELP -> "🚨 I need help"
        GigGroup.Ping.CHECK_IN -> "Heading home 🏠 Will check in within ${p.minutes} min"
        GigGroup.Ping.HOME_SAFE -> "Home safe ✅"
        else -> null
    }

    /** Adds a line to [g]'s chat. False if it was already there. */
    private fun add(c: Context, g: GigGroup, l: Line): Boolean {
        val id = GigArchive.idFor(g)
        val onScreen = id == viewingId
        val list = if (onScreen) lines.toMutableList() else readLines(c, id).toMutableList()
        if (list.any { it.from == l.from && it.timeSec == l.timeSec && it.text == l.text }) return false
        val at = list.indexOfFirst { it.timeSec > l.timeSec }.let { if (it < 0) list.size else it }
        list.add(at, l)
        while (list.size > MAX_LINES) list.removeAt(0)
        if (onScreen) lines.add(at.coerceAtMost(lines.size), l).also { while (lines.size > MAX_LINES) lines.removeAt(0) }
        writeLines(c, id, list)
        if (!l.mine && !(open && onScreen)) {
            val n = unreadFor(c, g) + 1
            unread[id] = n
            prefs(c, id).edit().putInt("unread", n).apply()
        }
        return true
    }
}
