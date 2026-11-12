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
import nz.waveformlabs.moshpoint.core.MessageClock
import nz.waveformlabs.moshpoint.core.OutboxState
import nz.waveformlabs.moshpoint.core.RelayUse
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.service.VisibilityPrefs

/**
 * Each crew's chat and pinned plan (one per crew, so you can hype up for next month's gig
 * while tonight's is on), plus flares ("Bar time 🍺, here for 30 min") for the main crew.
 *
 * How messages don't get lost:
 *  - They go to the crew's chat mailbox, which the relay keeps far longer than pings
 *    (12 h public, 3 days on our own server). Every phone keeps its own copy.
 *  - Every few hours each phone shares a sealed copy of the recent chat, so a mate whose
 *    phone was off for a day still catches up from whoever was around.
 *  - Your own messages wait in an outbox and go by themselves when there's signal again; with
 *    no signal they're passed to crew phones nearby over Bluetooth (see [OfflineMessages]).
 *    Each shows how it went: "Waiting for signal", "Sent nearby", "Sent".
 * Every message carries a sender tag, so two people both called "Mate" are never mixed up.
 * Sealed with the crew key: the relay never sees a word.
 */
object CrewChat {
    /** A line from the app itself ("You removed Jo…"), not from anyone in the crew. */
    const val NOTE = 99
    // How one of your own lines is doing (see core OutboxState: it only moves forward).
    const val SENT = OutboxState.SENT
    const val SENDING = OutboxState.SENDING
    const val FAILED = OutboxState.FAILED
    const val NEARBY = OutboxState.NEARBY
    const val WAITING = OutboxState.WAITING

    /** One line in the chat. [mine] = we sent it. [state] is only used for our own messages. */
    data class Line(
        val from: String,
        val timeSec: Long,
        val text: String,
        val mine: Boolean,
        val kind: Int = GigGroup.Ping.CHAT,
        val sender: Long = 0L,
        val state: Int = SENT,
        /** What lets others re-check this line in a history copy (see [proofOf]); blank if none. */
        val proof: String = "",
        /**
         * The message's id (core GigGroup.messageId, as hex): the same for every copy, whichever
         * way it came and however it was sealed. Blank for lines from before ids, and for the
         * app's own notes.
         */
        val id: String = "",
    ) {
        /**
         * What lines without an id are matched on: sender, time and text. The text is compared
         * the way it's saved (a line break or tab becomes a space), so a message with a line
         * break still matches its own saved row after a restart.
         */
        val legacyKey: String get() = "${if (sender != 0L) sender.toString() else from}|$timeSec|${flat(text)}"

        /** Same message, however it reached us (live, a re-send, or someone's history copy). */
        val key: String get() = id.ifEmpty { legacyKey }
    }

    data class Plan(val text: String, val from: String, val setAtSec: Long, val sender: Long = 0L)

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
            if (v) viewingId?.let { id -> appCtx?.let { markRead(it, id) } }
        }

    private var appCtx: Context? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    const val FLARE_MIN = 30
    private const val MAX_LINES = 150
    private const val PLAN_REPOST_MS = 6 * 3600_000L
    private const val HISTORY_EVERY_MS = 4 * 3600_000L

    /** Ready-made flare vibes. */
    val VIBES: List<String>
        get() = listOf(
            R.string.crew_vibe_lost, R.string.crew_vibe_bar, R.string.crew_vibe_rail, R.string.crew_vibe_food,
            R.string.crew_vibe_toilets, R.string.crew_vibe_air, R.string.crew_vibe_merch, R.string.crew_vibe_leaving,
        ).map { Txt.s(it) }

    private fun prefs(c: Context, id: String) = c.applicationContext.getSharedPreferences("crewchat_$id", Context.MODE_PRIVATE)
    private fun me(c: Context) = VisibilityPrefs.myName(c.applicationContext).ifBlank { Txt.s(R.string.crew_default_name) }
    private fun today() = Math.floorDiv(System.currentTimeMillis() / 1000, 86_400L)
    private fun isMain(g: GigGroup) = GroupSync.group.value?.key?.contentEquals(g.key) == true

    /** Our sender tag in crew [g] (from our signing key there). */
    fun myTag(c: Context, g: GigGroup): Long = Identity.tag(c, g)

    // ---- Who's who (names aren't unique; signing keys are) ----

    private fun people(c: Context, id: String): org.json.JSONObject =
        runCatching { org.json.JSONObject(prefs(c, id).getString("people", "{}")!!) }.getOrDefault(org.json.JSONObject())

    /**
     * The name to show for whoever signs with [tag]: their own, unless someone else in the crew
     * already goes by it, then "Jo (2)". So nobody can pass themselves off as someone else.
     */
    fun displayName(c: Context, g: GigGroup, tag: Long, name: String): String {
        if (tag == myTag(c, g)) return me(c)
        val id = GigArchive.idFor(g)
        val ppl = people(c, id)
        val base = name.trim().ifBlank { Txt.s(R.string.crew_default_name) }
        // Names already in use by someone else (including you).
        val taken = ppl.keys().asSequence().filter { it != tag.toString() }.map { ppl.optString(it).lowercase() }.toSet() + me(c).lowercase()
        var shown = base
        var n = 2
        while (shown.lowercase() in taken) shown = Txt.s(R.string.crew_name_numbered, base, n++)
        if (ppl.optString(tag.toString()) != shown) prefs(c, id).edit().putString("people", ppl.put(tag.toString(), shown).toString()).apply()
        return shown
    }

    /** Signing keys we've seen in crew [g] (from anyone's checked messages). */
    fun knownKeys(c: Context, g: GigGroup): List<ByteArray> {
        val o = runCatching { org.json.JSONObject(prefs(c, GigArchive.idFor(g)).getString("keys", "{}")!!) }.getOrDefault(org.json.JSONObject())
        return o.keys().asSequence().mapNotNull { runCatching { unb64(o.getString(it)) }.getOrNull() }.toList()
    }

    private fun rememberKey(c: Context, g: GigGroup, pub: ByteArray?) {
        pub ?: return
        val p = prefs(c, GigArchive.idFor(g))
        val o = runCatching { org.json.JSONObject(p.getString("keys", "{}")!!) }.getOrDefault(org.json.JSONObject())
        val tag = nz.waveformlabs.moshpoint.core.CrewKeys.tagOf(pub).toString()
        if (o.has(tag)) return
        p.edit().putString("keys", o.put(tag, b64(pub)).toString()).apply()
    }

    /** The name we show for whoever signs with [tag] in crew [g], if we've seen them. */
    fun nameOf(c: Context, g: GigGroup, tag: Long): String? = people(c, GigArchive.idFor(g)).optString(tag.toString()).ifBlank { null }

    /** A line from the app itself in [g]'s chat ("You removed Jo…"). */
    fun note(c: Context, g: GigGroup, text: String) {
        add(c, g, Line("", System.currentTimeMillis() / 1000, text, mine = true, kind = NOTE))
    }

    /** The crew moved to a new key: its chat, plan and who's-who move with it. */
    fun migrate(c: Context, old: GigGroup, fresh: GigGroup) {
        val from = prefs(c, GigArchive.idFor(old))
        val to = prefs(c, GigArchive.idFor(fresh)).edit().clear()
        from.all.forEach { (k, v) ->
            when (v) {
                is String -> to.putString(k, v)
                is Long -> to.putLong(k, v)
                is Int -> to.putInt(k, v)
                is Boolean -> to.putBoolean(k, v)
            }
        }
        // Say hello again in the new mailbox, so mates who join later learn who we are.
        to.putBoolean("joinPosted", false).putLong("histPosted", 0L).putLong("planPosted", 0L).commit()
        from.edit().clear().apply()
        unread[GigArchive.idFor(fresh)] = unread.remove(GigArchive.idFor(old)) ?: 0
        if (viewing.value?.key?.contentEquals(old.key) == true) show(c, fresh)
    }

    /** How many other people we know are in crew [g] (from their messages and "joined"). */
    fun peopleCount(c: Context, g: GigGroup): Int = people(c, GigArchive.idFor(g)).length()

    // ---- Proofs: a line's original signature, so history copies can be checked ----

    private fun b64(b: ByteArray) = android.util.Base64.encodeToString(b, android.util.Base64.NO_WRAP)
    private fun unb64(s: String) = android.util.Base64.decode(s, android.util.Base64.NO_WRAP)

    /** "kind|time|minutes|pub|sig|name|text" (base64 where needed). Only for messages without a location. */
    private fun proofOf(p: GigGroup.Ping): String {
        val pub = p.pub ?: return ""
        val sig = p.sig ?: return ""
        if (p.lat != null) return ""
        return listOf(p.kind.toString(), p.timeSec.toString(), p.minutes.toString(), b64(pub), b64(sig), b64(p.from.toByteArray()), b64(p.text.toByteArray())).joinToString("|")
    }

    private fun historyLineOf(proof: String): GigGroup.HistoryLine? = runCatching {
        val f = proof.split('|')
        if (f.size != 7) return null
        val pub = unb64(f[3])
        GigGroup.HistoryLine(f[0].toInt(), String(unb64(f[5])), nz.waveformlabs.moshpoint.core.CrewKeys.tagOf(pub), f[1].toLong(), String(unb64(f[6])), f[2].toInt(), 0, 0, pub, unb64(f[4]))
    }.getOrNull()

    private fun proofOf(h: GigGroup.HistoryLine): String {
        val pub = h.pub ?: return ""
        val sig = h.sig ?: return ""
        return listOf(h.kind.toString(), h.timeSec.toString(), h.minutes.toString(), b64(pub), b64(sig), b64(h.from.toByteArray()), b64(h.text.toByteArray())).joinToString("|")
    }

    fun unreadFor(c: Context, g: GigGroup?): Int {
        g ?: return 0
        val id = GigArchive.idFor(g)
        // No state writes here: this is read while drawing.
        return unread[id] ?: prefs(c, id).getInt("unread", 0)
    }

    private fun markRead(c: Context, id: String) {
        unread[id] = 0
        prefs(c, id).edit().putInt("unread", 0).apply()
        ChatSync.clearNotification(c, id)
    }

    /** Point the chat at [g] (the main crew by default, or one from Up next). */
    fun show(c: Context, g: GigGroup?) {
        appCtx = c.applicationContext
        viewing.value = g
        lines.clear()
        plan.value = null
        g ?: return
        val id = GigArchive.idFor(g)
        if (isMain(g)) migrateOldChat(c, id)
        lines.addAll(readLines(c, id))
        plan.value = readPlan(c, id)
        if (open) markRead(c, id)
    }

    /** The chat for whichever crew the screen will show; falls back to the main crew. */
    fun load(c: Context) {
        appCtx = c.applicationContext
        if (viewing.value == null) GroupSync.group.value?.let { show(c, it) }
    }

    /** Builds before several crews kept one chat: it belongs to the main crew. */
    private fun migrateOldChat(c: Context, id: String) {
        val old = c.applicationContext.getSharedPreferences("crewchat", Context.MODE_PRIVATE)
        if (old.all.isEmpty()) return
        val p = prefs(c, id)
        if (p.getString("lines", "").isNullOrEmpty()) {
            val e = p.edit()
            old.getString("lines", null)?.let { e.putString("lines", it) }
            old.getString("plan", null)?.let {
                e.putString("plan", it).putString("planFrom", old.getString("planFrom", "")).putLong("planAt", old.getLong("planAt", 0L))
                    .putBoolean("planMine", old.getBoolean("planMine", false))
            }
            e.apply()
        }
        old.edit().clear().apply()
    }

    fun planFor(c: Context, g: GigGroup): Plan? =
        if (GigArchive.idFor(g) == viewingId) plan.value else readPlan(c, GigArchive.idFor(g))

    // ---- Storage (one small file per crew) ----

    private fun readLines(c: Context, id: String): List<Line> =
        prefs(c, id).getString("lines", "")!!.split('\n').filter { it.isNotBlank() }.mapNotNull { row ->
            val f = row.split('\t')
            if (f.size < 5) return@mapNotNull null
            Line(
                f[0], f[1].toLongOrNull() ?: 0L, f[3], f[2] == "1", f[4].toIntOrNull() ?: GigGroup.Ping.CHAT,
                f.getOrNull(5)?.toLongOrNull() ?: 0L, f.getOrNull(6)?.toIntOrNull() ?: SENT, f.getOrNull(7).orEmpty(),
                f.getOrNull(8).orEmpty(),
            )
        }.distinctBy { it.key } // two rows with one key would crash the chat list; a twin saved by an earlier build is dropped here

    private fun writeLines(c: Context, id: String, list: List<Line>) {
        val rows = list.takeLast(MAX_LINES).joinToString("\n") { l ->
            listOf(l.from, l.timeSec.toString(), if (l.mine) "1" else "0", l.text, l.kind.toString(), l.sender.toString(), l.state.toString(), l.proof, l.id)
                .joinToString("\t") { flat(it) }
        }
        prefs(c, id).edit().putString("lines", rows).apply()
    }

    private fun readPlan(c: Context, id: String): Plan? {
        val p = prefs(c, id)
        val t = p.getString("plan", null)
        return if (t.isNullOrBlank()) null else Plan(t, p.getString("planFrom", "") ?: "", p.getLong("planAt", 0L), p.getLong("planSender", 0L))
    }

    /** [at]: when it was set (or cleared, so an older plan can't come back). */
    private fun writePlan(c: Context, g: GigGroup, pl: Plan?, mine: Boolean, at: Long) {
        val id = GigArchive.idFor(g)
        prefs(c, id).edit().putString("plan", pl?.text).putString("planFrom", pl?.from).putLong("planAt", pl?.setAtSec ?: at)
            .putLong("planSender", pl?.sender ?: 0L)
            .putBoolean("planMine", mine).putLong("planPosted", 0L).apply()
        if (id == viewingId) plan.value = pl
    }

    /** A crew has ended or you left it: its chat goes too. */
    fun forget(c: Context, g: GigGroup) {
        val id = GigArchive.idFor(g)
        prefs(c, id).edit().clear().apply()
        unread.remove(id)
        ChatSync.clearNotification(c, id)
        if (id == viewingId) show(c, null)
        if (isMain(g)) flares.clear()
    }

    // ---- Sending ----

    /** Seal [p] for [g], signed with our key there. Returns the bytes and the message as others will see it. */
    private fun signed(c: Context, g: GigGroup, p: GigGroup.Ping): Pair<ByteArray, GigGroup.Ping> {
        val blob = g.sealPing(p, Identity.signer(c, g))
        ChatSync.markSeen(blob)
        return blob to (g.openPing(blob) ?: p)
    }

    private fun idOf(p: GigGroup.Ping): String = if (p.id != 0L) GigGroup.idText(p.id) else ""

    private fun idNumber(l: Line): Long =
        if (l.id.isEmpty()) 0L else runCatching { java.lang.Long.parseUnsignedLong(l.id, 16) }.getOrDefault(0L)

    /** A message to the crew on screen. Shows straight away, then says how it went (see [OfflineMessages]). */
    fun send(c: Context, text: String) {
        val g = viewing.value ?: return
        val t = text.trim().take(140)
        if (t.isEmpty()) return
        val app = c.applicationContext
        val (blob, op) = signed(app, g, GigGroup.Ping(GigGroup.Ping.CHAT, me(c), OfflineMessages.stamp(app, g), text = t))
        val line = Line(me(c), op.timeSec, op.text, mine = true, sender = op.sender, state = OfflineMessages.firstState(), proof = proofOf(op), id = idOf(op))
        add(app, g, line)
        // Sealed once: these same bytes go by the relay, by Bluetooth, or both.
        OfflineMessages.post(app, g, blob)
    }

    /** "I'm in!": tells the crew we've joined (and who we are), once per crew. */
    fun announceJoin(c: Context, g: GigGroup) {
        val p = prefs(c, GigArchive.idFor(g))
        if (p.getBoolean("joinPosted", false)) return
        val (blob, _) = signed(c, g, GigGroup.Ping(GigGroup.Ping.JOIN, me(c), System.currentTimeMillis() / 1000))
        // Queued is enough: the courier keeps trying until the relay has it.
        if (OfflineMessages.post(c, g, blob) != null) p.edit().putBoolean("joinPosted", true).apply()
    }

    /** "Waiting for signal" or "Not sent", tapped: try again now. */
    fun retry(c: Context, line: Line) {
        val g = viewing.value ?: return
        val app = c.applicationContext
        if (line.kind == GigGroup.Ping.CHAT) {
            resend(app, g, line)
            // "Not sent" becomes "Sending…" (or "Waiting for signal") again; one that's waiting stays as it is.
            // (Matched on sender, time and text: resend() may just have given an old line its id.)
            if (line.state == FAILED) setState(app, g, OfflineMessages.firstState()) { it.legacyKey == line.legacyKey }
        }
        // A quick ping can't be put back together from its line (where you were isn't kept). If
        // the courier still holds it, this tries it again; if not, it stays "Not sent".
        OfflineMessages.retryNow(c)
    }

    /**
     * Make sure [line] is in the courier's queue. Normally it already is, and the bytes it was
     * first sealed as go out again. If not (a line from before this, or a lost queue) it is
     * sealed again: different bytes, the same message id, so nobody sees it twice.
     */
    private fun resend(c: Context, g: GigGroup, line: Line) {
        if (line.kind != GigGroup.Ping.CHAT || OfflineMessages.holds(idNumber(line))) return
        val (blob, op) = signed(c, g, GigGroup.Ping(GigGroup.Ping.CHAT, line.from, line.timeSec, text = line.text))
        // The line takes the id of what is actually being sent. Usually that's the id it had.
        // Not if the saved text differs from what was typed (a line break is saved as a space):
        // then the line must follow the new id, or it would be sealed and uploaded again at every check.
        if (idOf(op) != line.id) relabel(c, g, line, idOf(op))
        OfflineMessages.post(c, g, blob)
    }

    /** Give a line its id (one from before ids), or the id it's now being sent under, so the courier's reports find it. */
    private fun relabel(c: Context, g: GigGroup, line: Line, id: String) {
        if (id.isEmpty()) return
        val crew = GigArchive.idFor(g)
        val list = if (crew == viewingId) lines.toMutableList() else readLines(c, crew).toMutableList()
        val i = list.indexOfFirst { it.key == line.key }
        if (i < 0 || list.any { it.id == id }) return
        list[i] = list[i].copy(id = id)
        if (crew == viewingId) {
            val j = lines.indexOfFirst { it.key == line.key }
            if (j >= 0) lines[j] = lines[j].copy(id = id)
        }
        writeLines(c, crew, list)
    }

    /** The courier says how the message with [id] in [g] is doing. A state never goes backwards. */
    fun setStateById(c: Context, g: GigGroup, id: String, state: Int) {
        if (id.isEmpty()) return
        setState(c, g, state) { it.id == id }
    }

    /** Move our own line picked by [which] to [state], if that's a step the outbox allows (core OutboxState). */
    private fun setState(c: Context, g: GigGroup, state: Int, which: (Line) -> Boolean) {
        val crew = GigArchive.idFor(g)
        val list = if (crew == viewingId) lines.toMutableList() else readLines(c, crew).toMutableList()
        val i = list.indexOfFirst { it.mine && which(it) }
        if (i < 0 || !OutboxState.mayMove(list[i].state, state)) return
        list[i] = list[i].copy(state = state)
        if (crew == viewingId) {
            val j = lines.indexOfFirst { it.mine && which(it) }
            if (j >= 0) lines[j] = lines[j].copy(state = state)
        }
        writeLines(c, crew, list)
    }

    /** From each chat check: anything of ours the courier isn't already looking after goes back in its queue. */
    fun retryOutbox(c: Context, crews: List<GigGroup>) {
        val now = System.currentTimeMillis() / 1000
        crews.forEach { g ->
            val id = GigArchive.idFor(g)
            val list = if (id == viewingId) lines.toList() else readLines(c, id)
            // Everything of ours not yet on the relay ("Sent nearby" too: a crew phone having it
            // never stops our own upload), except one still on its first try.
            val unsent = list.filter { it.mine && it.kind == GigGroup.Ping.CHAT && it.state != SENT && !(it.state == SENDING && now - it.timeSec <= 60) }
            val (live, stale) = unsent.partition { now - it.timeSec <= KEEP_TRYING_SEC }
            // resend() does nothing for a line the courier already holds, which is the usual case.
            live.takeLast(10).forEach { resend(c, g, it) }
            // Past three days the relay wouldn't have kept it anyway: "Not sent", until the person taps it.
            stale.filter { (it.state == SENDING || it.state == WAITING) && !OfflineMessages.holds(idNumber(it)) }
                .forEach { l -> setState(c, g, FAILED) { it.legacyKey == l.legacyKey } }
        }
    }

    /** How long an unsent line is retried by itself: as long as the relay would keep it. */
    private const val KEEP_TRYING_SEC = 72 * 3600L

    /** The newest message time seen in [g] (see core MessageClock: a new message is stamped after it). */
    fun newestSeen(c: Context, g: GigGroup): Long {
        val id = GigArchive.idFor(g)
        return (if (id == viewingId) lines.toList() else readLines(c, id)).filter { it.kind != NOTE }.maxOfOrNull { it.timeSec } ?: 0L
    }

    /** The crew moved to a new key without these people: forget their keys and names there. */
    fun dropKeys(c: Context, g: GigGroup, tags: Set<Long>) {
        if (tags.isEmpty()) return
        val p = prefs(c, GigArchive.idFor(g))
        val keys = runCatching { org.json.JSONObject(p.getString("keys", "{}")!!) }.getOrDefault(org.json.JSONObject())
        val ppl = people(c, GigArchive.idFor(g))
        tags.forEach {
            keys.remove(it.toString())
            ppl.remove(it.toString())
        }
        p.edit().putString("keys", keys.toString()).putString("people", ppl.toString()).apply()
    }

    /** Pin (or clear, with blank) the plan for the crew on screen. */
    fun setPlan(c: Context, text: String) {
        val g = viewing.value ?: return
        val t = text.trim().take(140)
        val now = System.currentTimeMillis() / 1000
        writePlan(c, g, if (t.isEmpty()) null else Plan(t, me(c), now, myTag(c, g)), mine = true, at = now)
        // Stored as the bare plan (blank = cleared); the chat words it at display time, in the current language.
        add(c, g, Line(me(c), now, t, mine = true, kind = GigGroup.Ping.PLAN, sender = myTag(c, g)))
        postPlan(c, g)
    }

    private fun postPlan(c: Context, g: GigGroup) {
        val id = GigArchive.idFor(g)
        val p = prefs(c, id)
        val pl = readPlan(c, id)
        val now = System.currentTimeMillis()
        val setAt = pl?.setAtSec ?: p.getLong("planAt", now / 1000)
        val ageMin = ((now / 1000 - setAt) / 60).toInt().coerceIn(0, 32767)
        val (blob, op) = signed(c, g, GigGroup.Ping(GigGroup.Ping.PLAN, me(c), now / 1000, minutes = ageMin, text = pl?.text.orEmpty()))
        p.edit().putLong("planPosted", now).putString("planProof", proofOf(op)).apply()
        // Queued is enough (the courier keeps trying); only if it couldn't even be queued, try again on the next check.
        if (OfflineMessages.post(c, g, blob) == null) p.edit().putLong("planPosted", 0L).apply()
    }

    /**
     * Our pinned plans are re-posted every few hours (and straight away if a post failed) so
     * they stay on the relay for mates who join later. [GigGroup.Ping.minutes] carries how long
     * ago it was set, so a re-post never beats a newer plan.
     */
    fun repostPlans(c: Context, crews: List<GigGroup>) {
        val now = System.currentTimeMillis()
        crews.forEach { g ->
            val p = prefs(c, GigArchive.idFor(g))
            if (!p.getBoolean("planMine", false) || now - p.getLong("planPosted", 0L) < PLAN_REPOST_MS) return@forEach
            postPlan(c, g)
        }
    }

    /**
     * Every few hours, share a sealed copy of each crew's recent chat, so mates who were away
     * longer than the relay keeps messages still catch up. Staggered per phone so a big crew
     * doesn't all post at once, and only when there's something new to share.
     */
    fun shareHistory(c: Context, crews: List<GigGroup>) {
        val now = System.currentTimeMillis()
        val stagger = Math.floorMod(Identity.permanent(c).fold(7L) { h, b -> h * 31 + b }, 3600_000L) // 0-60 min, different per phone
        crews.forEach { g ->
            val id = GigArchive.idFor(g)
            val p = prefs(c, id)
            if (now - p.getLong("histPosted", 0L) < HISTORY_EVERY_MS + stagger) return@forEach
            val all = (if (id == viewingId) lines.toList() else readLines(c, id)).filter { it.state == SENT && it.proof.isNotEmpty() }
            val newest = all.maxOfOrNull { it.timeSec } ?: 0L
            if (newest <= p.getLong("histNewest", 0L) && readPlan(c, id) == null) return@forEach
            val h = GigGroup.History(
                all.takeLast(60).mapNotNull { historyLineOf(it.proof) },
                p.getString("planProof", null)?.let { historyLineOf(it) },
            )
            val sealed = g.sealHistory(h, now / 1000) ?: return@forEach
            ChatSync.markSeen(sealed)
            p.edit().putLong("histPosted", now).apply()
            scope.launch {
                // A copy of what's already been said: it never takes budget kept for new messages.
                if (RelayClient.putHeld(g.chatIdForDay(today()), sealed, RelayUse.BACKGROUND)) p.edit().putLong("histNewest", newest).apply()
                else p.edit().putLong("histPosted", 0L).apply()
            }
        }
    }

    /** "I'm here for the next half hour: Bar time 🍺", with where we are (main crew only). */
    fun flare(c: Context, vibe: String, lat: Double?, lon: Double?) {
        val g = GroupSync.group.value ?: return
        val now = System.currentTimeMillis() / 1000
        flares[me(c)] = Flare(me(c), vibe, now + FLARE_MIN * 60L, lat, lon)
        add(c, g, Line(me(c), now, vibe, mine = true, kind = GigGroup.Ping.FLARE, sender = myTag(c, g)))
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
     * A chat, plan or flare for crew [g]. Returns the notification text if it's new and from
     * someone else, or null to stay quiet (ours, a repeat, or an older plan).
     */
    fun ingest(c: Context, g: GigGroup, signed: GigGroup.Ping): String? {
        appCtx = c.applicationContext
        if (signed.sender == 0L) return null // unsigned: could be anyone
        val mine = signed.sender == myTag(c, g)
        rememberKey(c, g, signed.pub)
        val p = signed.copy(from = displayName(c, g, signed.sender, signed.from))
        // A time in the future here (their clock is wrong) sorts at when it arrived.
        val at = MessageClock.sortTime(p.timeSec, System.currentTimeMillis() / 1000)
        return when (p.kind) {
            GigGroup.Ping.CHAT -> {
                val added = add(c, g, Line(p.from, at, p.text, mine, sender = p.sender, proof = proofOf(signed), id = idOf(signed)))
                if (added && !mine) p.text else null
            }
            GigGroup.Ping.JOIN -> {
                val added = add(c, g, Line(p.from, at, "", mine, GigGroup.Ping.JOIN, p.sender, id = idOf(signed)))
                if (added && !mine) Txt.s(R.string.crew_notif_joined) else null
            }
            GigGroup.Ping.FLARE -> {
                if (!isMain(g) || mine) return null
                val until = p.timeSec + p.minutes.coerceIn(1, 120) * 60L
                if (until < System.currentTimeMillis() / 1000) return null
                flares[p.from] = Flare(p.from, p.text, until, p.lat, p.lon)
                if (add(c, g, Line(p.from, at, p.text, false, GigGroup.Ping.FLARE, p.sender, id = idOf(signed)))) {
                    Txt.p(R.plurals.crew_notif_flare, p.minutes, p.text, p.minutes)
                } else null
            }
            GigGroup.Ping.PLAN -> {
                val note = takePlan(c, g, p.from, p.sender, p.timeSec - p.minutes * 60L, p.text, p.timeSec, mine, proofOf(signed))
                if (mine) null else note
            }
            else -> null
        }
    }

    private fun takePlan(c: Context, g: GigGroup, from: String, sender: Long, setAt: Long, text: String, postedAt: Long, mine: Boolean, proof: String): String? {
        val cur = planFor(c, g)
        val curAt = maxOf(cur?.setAtSec ?: 0L, prefs(c, GigArchive.idFor(g)).getLong("planAt", 0L))
        if (setAt <= curAt) return null // a re-post, or older
        if (text.isBlank() && cur == null) return null
        writePlan(c, g, if (text.isBlank()) null else Plan(text, from, setAt, sender), mine = mine, at = setAt)
        prefs(c, GigArchive.idFor(g)).edit().putString("planProof", proof).apply()
        add(c, g, Line(from, postedAt, text, mine, GigGroup.Ping.PLAN, sender))
        return if (text.isBlank()) null else Txt.s(R.string.crew_notif_new_plan, text)
    }

    /**
     * Someone's copy of the chat: anything we missed slots in by time. Every line was checked
     * against its original signature on the way in. Returns the new lines from others.
     */
    fun ingestHistory(c: Context, g: GigGroup, h: GigGroup.History): List<Line> {
        val added = mutableListOf<Line>()
        val me = myTag(c, g)
        h.lines.forEach { hl ->
            rememberKey(c, g, hl.pub)
            val mine = hl.sender == me
            val name = displayName(c, g, hl.sender, hl.from)
            val l = Line(
                name, MessageClock.sortTime(hl.timeSec, System.currentTimeMillis() / 1000), hl.text, mine, hl.kind, hl.sender,
                proof = proofOf(hl), id = if (hl.id != 0L) GigGroup.idText(hl.id) else "",
            )
            if (add(c, g, l) && !mine && hl.kind == GigGroup.Ping.CHAT) added += l
        }
        h.plan?.let { pl ->
            takePlan(c, g, displayName(c, g, pl.sender, pl.from), pl.sender, pl.timeSec - pl.minutes * 60L, pl.text, pl.timeSec, pl.sender == me, proofOf(pl))
        }
        return added
    }

    /**
     * A one-tap ping ("On my way") in the main crew, as a chat bubble. Stored with the ping's
     * kind (and the minutes, for a check-in) rather than its words, so the chat shows it in
     * whatever language the phone is in (see [quickText]). Older builds stored the English
     * words as a plain chat line; those still show as they are.
     * [state] is how our own ping is doing (it has the same outbox as a chat message).
     */
    fun pingLine(c: Context, p: GigGroup.Ping, mine: Boolean, state: Int = SENT): Boolean {
        val g = GroupSync.group.value ?: return false
        if (!isQuick(p.kind)) return false
        val payload = when (p.kind) {
            GigGroup.Ping.CHECK_IN -> p.minutes.toString()
            // "Meet at the pin" names the pin it means.
            GigGroup.Ping.MEET_AT_PIN -> p.text
            else -> ""
        }
        val at = MessageClock.sortTime(p.timeSec, System.currentTimeMillis() / 1000)
        // False if we already had it (by message id): the caller then doesn't announce it again.
        return add(c, g, Line(if (mine) me(c) else p.from, at, payload, mine, p.kind, sender = if (mine) myTag(c, g) else p.sender, state = state, id = idOf(p)))
    }

    /** A one-tap ping's kind (shown as a chat bubble, worded by [quickText]). */
    fun isQuick(kind: Int): Boolean = when (kind) {
        GigGroup.Ping.COMING, GigGroup.Ping.WHERE_ARE_YOU, GigGroup.Ping.STAY_PUT, GigGroup.Ping.MEET_AT_PIN, GigGroup.Ping.ALL_GOOD,
        GigGroup.Ping.GOING_HOME, GigGroup.Ping.NEED_HELP, GigGroup.Ping.CHECK_IN, GigGroup.Ping.HOME_SAFE -> true
        else -> false
    }

    fun quickText(p: GigGroup.Ping): String? = quickText(p.kind, p.minutes)

    /** The words for a one-tap ping of [kind]; [minutes] is only used by a check-in. */
    fun quickText(kind: Int, minutes: Int): String? = when (kind) {
        GigGroup.Ping.COMING -> Txt.s(R.string.crew_quick_coming)
        GigGroup.Ping.WHERE_ARE_YOU -> Txt.s(R.string.crew_quick_where)
        GigGroup.Ping.STAY_PUT -> Txt.s(R.string.crew_quick_stay_put)
        GigGroup.Ping.MEET_AT_PIN -> Txt.s(R.string.crew_quick_meet_pin)
        GigGroup.Ping.ALL_GOOD -> Txt.s(R.string.crew_quick_all_good)
        GigGroup.Ping.GOING_HOME -> Txt.s(R.string.crew_quick_going_home)
        GigGroup.Ping.NEED_HELP -> Txt.s(R.string.crew_quick_need_help)
        GigGroup.Ping.CHECK_IN -> Txt.p(R.plurals.crew_quick_check_in, minutes)
        GigGroup.Ping.HOME_SAFE -> Txt.s(R.string.crew_quick_home_safe)
        else -> null
    }

    /** The same message? By id when both have one; otherwise the way lines were matched before ids. */
    private fun same(a: Line, b: Line): Boolean =
        if (a.id.isNotEmpty() && b.id.isNotEmpty()) a.id == b.id
        else a.legacyKey == b.legacyKey || (a.timeSec == b.timeSec && flat(a.text) == flat(b.text) && a.from == b.from)

    /** Text as [writeLines] saves it: one row per line, so line breaks and tabs become spaces. */
    private fun flat(text: String) = text.replace('\t', ' ').replace('\n', ' ')

    /**
     * Adds a line to [g]'s chat, in the order every phone shows (time, then message id).
     * False if it was already there, or is older than everything the chat still keeps.
     */
    private fun add(c: Context, g: GigGroup, l: Line): Boolean {
        val id = GigArchive.idFor(g)
        val onScreen = id == viewingId
        val list = if (onScreen) lines.toMutableList() else readLines(c, id).toMutableList()
        if (list.any { same(it, l) }) return false
        val at = list.indexOfFirst { MessageClock.compare(l.timeSec, idNumber(l), it.timeSec, idNumber(it)) < 0 }.let { if (it < 0) list.size else it }
        list.add(at, l)
        val trimmed = list.takeLast(MAX_LINES)
        // Older than the oldest line kept: it would be dropped again at once, so it isn't new
        // (and mustn't buzz or count as unread).
        if (trimmed.none { it === l }) return false
        if (onScreen) {
            lines.clear()
            lines.addAll(trimmed)
        }
        writeLines(c, id, trimmed)
        if (!l.mine && !(open && onScreen)) {
            val n = unreadFor(c, g) + 1
            unread[id] = n
            prefs(c, id).edit().putInt("unread", n).apply()
        }
        return true
    }
}
