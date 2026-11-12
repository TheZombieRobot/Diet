package nz.waveformlabs.moshpoint

import android.content.Context
import android.os.Looper
import android.util.Base64
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.CrewKeys
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.MessageClock
import nz.waveformlabs.moshpoint.core.OutboxState
import nz.waveformlabs.moshpoint.core.PrivateBook
import nz.waveformlabs.moshpoint.core.PrivateRule
import nz.waveformlabs.moshpoint.service.VisibilityPrefs

/**
 * Private messages on the phone (docs/PRIVATE_MESSAGES.md; the rules are in core `Private.kt`,
 * the sealing in `GigGroup.sealPrivate`):
 *  - one [PrivateBook] per crew, saved in the app's private storage and deleted with the crew;
 *  - sending: sealed to the one crew mate here, then the courier gets it out (relay, or crew
 *    phones nearby over Bluetooth), exactly like a crew chat line;
 *  - arrivals: from the crew's private mailbox ([ChatSync.pollAll], through the courier) and by
 *    Bluetooth ([OfflineMessages.deliver]); shown only from crew mates, announced unless muted;
 *  - the thread on screen as crew chat lines, so it's drawn with the crew chat's bubbles.
 *
 * Never for crews followed from home. Everything runs on the main thread.
 */
object PrivateMessages {
    /** A crew mate we can write to privately: their signing tag and key in that crew, and the name we show. */
    class Mate(val tag: Long, val pub: ByteArray, val name: String, val friendId: String?)

    /** The thread on screen: which crew, which mate. */
    class Open(val crewId: String, val mate: Long, val name: String, val friendId: String?)

    /** The open thread (Compose state), or null. The thread screen shows while this is set. */
    val open = mutableStateOf<Open?>(null)

    /** Its messages, oldest first, as crew chat lines (Compose state). */
    val lines = mutableStateListOf<CrewChat.Line>()

    /** Is the open thread's mate muted on this phone (Compose state)? */
    val muted = mutableStateOf(false)

    /** True while the thread screen is showing (set by the screen). */
    var onScreen = false

    /** The thread with [mate] in [crewId] is in front of the person right now: what arrives in it is neither unread nor announced. */
    private fun viewing(crewId: String, mate: Long): Boolean =
        onScreen && GroupSync.appOpen && open.value?.let { it.crewId == crewId && it.mate == mate } == true

    /** Bumped whenever a thread changes, so screens reading unread counts redraw. */
    private val version = mutableStateOf(0)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val books = HashMap<String, PrivateBook>()
    private val lastOwnSec = HashMap<String, Long>()
    /** Recent lines per thread for its notification, until it's opened. */
    private val recent = HashMap<String, MutableList<String>>()

    private fun now() = System.currentTimeMillis()
    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("private_messages", Context.MODE_PRIVATE)
    private fun me(c: Context) = VisibilityPrefs.myName(c.applicationContext).ifBlank { Txt.s(R.string.crew_default_name) }
    private fun onMain() = Looper.myLooper() == Looper.getMainLooper()

    private fun book(c: Context, crewId: String): PrivateBook = books.getOrPut(crewId) {
        PrivateBook().also { b ->
            val saved = prefs(c).getString(crewId, null)
            b.restore(saved?.let { runCatching { Base64.decode(it, Base64.NO_WRAP) }.getOrNull() })
        }
    }

    private fun save(c: Context, crewId: String) {
        val b = books[crewId] ?: return
        if (!b.dirty) return
        b.dirty = false
        prefs(c).edit().putString(crewId, Base64.encodeToString(b.save(), Base64.NO_WRAP)).apply()
        version.value++
    }

    /** The crew with id [crewId] that we're in, if any. */
    fun crewOf(c: Context, crewId: String): GigGroup? = ChatSync.allCrews(c.applicationContext).firstOrNull { GigArchive.idFor(it) == crewId }

    private fun isMain(g: GigGroup) = GroupSync.group.value?.key?.contentEquals(g.key) == true

    /** Do we take part in [g]'s private messages? Not while following it from home. */
    fun takesPart(c: Context, g: GigGroup): Boolean =
        if (isMain(g)) !GroupSync.following else Crews.find(g.key)?.following != true

    // ---- Who ----

    /**
     * Whoever signs with [tag] in crew [g], if they're a crew mate on this phone: in the main crew,
     * someone whose intro we've had (never someone following from home, or removed); in an Up next
     * crew, someone known in its chat. Null for everyone else, whose messages aren't shown.
     */
    fun mateOf(c: Context, g: GigGroup, tag: Long): Mate? {
        val app = c.applicationContext
        if (!takesPart(app, g)) return null
        if (isMain(g)) {
            val f = FriendsRepository.friends.firstOrNull { f ->
                (f.gigGroupOnly || f.key in GroupSync.members) && !FriendsRepository.isSimulated(f.id) &&
                    GroupSync.pubOf(f.secret)?.let { CrewKeys.tagOf(it) } == tag
            } ?: return null
            val pub = GroupSync.pubOf(f.secret) ?: return null
            return Mate(tag, pub, f.name, f.id)
        }
        val pub = CrewChat.knownKeys(app, g).firstOrNull { CrewKeys.tagOf(it) == tag } ?: return null
        return Mate(tag, pub, CrewChat.nameOf(app, g, tag) ?: Txt.s(R.string.crew_default_name), null)
    }

    /** [f] as a crew mate of the main crew we can write to, or null (their phone hasn't introduced itself, or we're following). */
    fun mateFor(c: Context, f: Friend): Mate? {
        val g = GroupSync.group.value ?: return null
        val pub = GroupSync.pubOf(f.secret) ?: return null
        return mateOf(c, g, CrewKeys.tagOf(pub))
    }

    // ---- The thread on screen ----

    /** Open the thread with [f] in the main crew. False if we can't write to them (yet). */
    fun showFriend(c: Context, f: Friend): Boolean {
        val g = GroupSync.group.value ?: return false
        val m = mateFor(c, f) ?: return false
        show(c, g, m)
        return true
    }

    /** Open the thread with whoever signs with [tag] in the crew [crewId] (from a notification). */
    fun showByTag(c: Context, crewId: String, tag: Long): Boolean {
        val app = c.applicationContext
        val g = crewOf(app, crewId) ?: return false
        val m = mateOf(app, g, tag) ?: return false
        show(app, g, m)
        return true
    }

    fun show(c: Context, g: GigGroup, m: Mate) {
        val app = c.applicationContext
        val crewId = GigArchive.idFor(g)
        open.value = Open(crewId, m.tag, m.name, m.friendId)
        if (book(app, crewId).markRead(m.tag)) save(app, crewId)
        clearNotification(app, crewId, m.tag)
        refresh(app)
    }

    fun close() {
        open.value = null
        lines.clear()
    }

    /** Draw the open thread again from its book. */
    private fun refresh(c: Context) {
        val o = open.value ?: return
        val book = book(c, o.crewId)
        muted.value = book.isMuted(o.mate)
        val myTag = crewOf(c, o.crewId)?.let { Identity.tag(c, it) } ?: 0L
        val shown = book.thread(o.mate).map { l ->
            CrewChat.Line(
                if (l.mine) me(c) else o.name, l.sortSec, l.text, l.mine,
                sender = if (l.mine) myTag else o.mate, state = l.state, id = GigGroup.idText(l.id),
            )
        }
        if (shown != lines.toList()) {
            lines.clear()
            lines.addAll(shown)
        }
    }

    /** Mute (or unmute) the open thread's mate, on this phone only. */
    fun setMuted(c: Context, on: Boolean) {
        val o = open.value ?: return
        val app = c.applicationContext
        book(app, o.crewId).mute(o.mate, on)
        save(app, o.crewId)
        if (on) clearNotification(app, o.crewId, o.mate)
        refresh(app)
    }

    /** Unread private messages from each mate of the main crew, by friend id (for their faces and the finder). Read while drawing. */
    fun unreadByFriend(c: Context): Map<String, Int> {
        version.value // redraw when a thread changes
        val g = GroupSync.group.value ?: return emptyMap()
        if (GroupSync.following) return emptyMap()
        val book = book(c.applicationContext, GigArchive.idFor(g))
        if (book.totalUnread() == 0) return emptyMap()
        val out = HashMap<String, Int>()
        FriendsRepository.friends.forEach { f ->
            val pub = GroupSync.pubOf(f.secret) ?: return@forEach
            val n = book.unread(CrewKeys.tagOf(pub))
            if (n > 0) out[f.id] = n
        }
        return out
    }

    // ---- Sending ----

    /** Send [text] to the open thread's mate. Shows at once, then says how it went, like crew chat. */
    fun send(c: Context, text: String) {
        val o = open.value ?: return
        val app = c.applicationContext
        val t = PrivateRule.clean(text)
        if (t.isEmpty()) return
        val g = crewOf(app, o.crewId) ?: return
        val book = book(app, o.crewId)
        val pub = book.pubOf(o.mate) ?: mateOf(app, g, o.mate)?.pub ?: return
        val nowSec = now() / 1000
        // After the newest message in the thread, so a reply never sorts above what it answers.
        val time = MessageClock.stamp(nowSec, book.newest(o.mate), lastOwnSec[o.crewId] ?: 0L)
        lastOwnSec[o.crewId] = time
        // Sealed once (kept until the relay has it): these same bytes go by the relay, by Bluetooth, or both.
        val body = g.privateBody(Identity.signer(app, g), pub, t, time) ?: return
        val id = GigGroup.privateId(body)
        book.own(o.mate, pub, id, time, t, OfflineMessages.firstState(), nowSec, body)
        save(app, o.crewId)
        refresh(app)
        if (OfflineMessages.post(app, g, g.wrapPrivate(body, time)) == null) {
            book.setState(id, OutboxState.FAILED)
            save(app, o.crewId)
            refresh(app)
        }
    }

    /** "Waiting for signal" or "Not sent", tapped: try again now. */
    fun retry(c: Context, line: CrewChat.Line) {
        val o = open.value ?: return
        val app = c.applicationContext
        val id = runCatching { java.lang.Long.parseUnsignedLong(line.id, 16) }.getOrNull() ?: return
        val g = crewOf(app, o.crewId) ?: return
        // The courier let it go (it said "Not sent", or its queue was lost): the same message again, with its id.
        if (!OfflineMessages.holds(id)) rewrap(app, o.crewId, g, id)?.let { OfflineMessages.post(app, g, it) }
        if (line.state == OutboxState.FAILED && book(app, o.crewId).setState(id, OfflineMessages.firstState()) != null) {
            save(app, o.crewId)
            refresh(app)
        }
        OfflineMessages.retryNow(app)
    }

    /**
     * Our private message [id] exactly as it was sealed, in crew [g]'s envelope (same id), to try
     * again one the courier let go. Null if it's no longer in a thread (its recipient was removed,
     * say) or the relay already has it: then it isn't sent.
     */
    private fun rewrap(c: Context, crewId: String, g: GigGroup, id: Long): ByteArray? {
        val (_, line) = book(c.applicationContext, crewId).ownLine(id) ?: return null
        val body = line.body ?: return null
        return g.wrapPrivate(body, line.timeSec)
    }

    /** From each chat check: our own that the courier isn't looking after (a lost queue, a restart at the wrong moment) go back in. */
    fun retryOutbox(c: Context, crews: List<GigGroup>) {
        val app = c.applicationContext
        val nowSec = now() / 1000
        crews.forEach { g ->
            if (!takesPart(app, g)) return@forEach
            val crewId = GigArchive.idFor(g)
            if (prefs(app).getString(crewId, null) == null && crewId !in books) return@forEach
            val book = book(app, crewId)
            var n = 0
            book.mates().forEach { mate ->
                book.thread(mate).filter { it.mine && it.state != OutboxState.SENT && it.state != OutboxState.FAILED }.forEach { l ->
                    if (OfflineMessages.holds(l.id) || n >= 10) return@forEach
                    if (nowSec - l.timeSec > PrivateRule.MAX_AGE_SEC) {
                        // Past the relay's three days: "Not sent", until the person taps it.
                        book.setState(l.id, OutboxState.FAILED)
                    } else {
                        n++
                        rewrap(app, crewId, g, l.id)?.let { OfflineMessages.post(app, g, it) }
                    }
                }
            }
            save(app, crewId)
        }
        refresh(app)
    }

    /** The courier says how our message [id] in crew [crewId] is doing ([OutboxState]). */
    fun stateChanged(c: Context, crewId: String, id: Long, state: Int) {
        val app = c.applicationContext
        if (prefs(app).getString(crewId, null) == null && crewId !in books) return
        if (book(app, crewId).setState(id, state) == null) return
        save(app, crewId)
        if (open.value?.crewId == crewId) refresh(app)
    }

    // ---- Arriving ----

    /** A private message for us in crew [g], by the relay or by Bluetooth. */
    fun arrived(c: Context, g: GigGroup, p: GigGroup.Private) {
        if (!onMain()) {
            scope.launch { arrived(c, g, p) }
            return
        }
        val app = c.applicationContext
        if (!takesPart(app, g)) return
        val crewId = GigArchive.idFor(g)
        val book = book(app, crewId)
        val mate = mateOf(app, g, p.sender)
        val v = book.offer(p, mate != null, viewing(crewId, p.sender), now() / 1000)
        save(app, crewId)
        if (v.shown && open.value?.crewId == crewId) refresh(app)
        if (v.alert && mate != null) notify(app, g, mate, listOf(p.text))
    }

    /**
     * Everything just fetched from [g]'s private mailbox ([inUploadBox]: how many of them are in
     * today's). The courier notes what's there and opens what's for us.
     */
    fun fetched(c: Context, g: GigGroup, blobs: List<ByteArray>, inUploadBox: Int) {
        val app = c.applicationContext
        if (!takesPart(app, g)) return
        OfflineMessages.fetchedPrivate(app, g, blobs, inUploadBox).forEach { arrived(app, g, it) }
        promoteKnown(app, g)
    }

    /** A crew mate's phone introduced itself ([pub]): anything they sent before that can be shown now. */
    fun mateSeen(c: Context, g: GigGroup, pub: ByteArray) {
        if (!onMain()) {
            scope.launch { mateSeen(c, g, pub) }
            return
        }
        val app = c.applicationContext
        val crewId = GigArchive.idFor(g)
        if (prefs(app).getString(crewId, null) == null && crewId !in books) return
        if (!book(app, crewId).waitingFrom(CrewKeys.tagOf(pub))) return
        promoteKnown(app, g)
    }

    /** Messages that waited for their sender to turn out to be a crew mate: shown now if they are. */
    private fun promoteKnown(c: Context, g: GigGroup) {
        val crewId = GigArchive.idFor(g)
        val book = book(c, crewId)
        for (tag in book.waitingSenders()) {
            val mate = mateOf(c, g, tag) ?: continue
            val viewing = viewing(crewId, tag)
            val shown = book.known(tag, mate.pub, viewing)
            save(c, crewId)
            if (shown.isNotEmpty() && !viewing && !book.isMuted(tag)) notify(c, g, mate, shown.map { it.text })
        }
        if (open.value?.crewId == crewId) refresh(c)
    }

    // ---- Notifications ----

    private fun threadKey(crewId: String, mate: Long) = "$crewId/$mate"

    /**
     * A range of its own (the others: 1 and 6 for the services, 9000–9899 for crew chat,
     * 0x20000000 up for crew alerts, 0x40000000 up for "light up" requests), and wide enough that
     * two threads practically never share one: a shared id would replace one person's
     * notification with another's, so a message would go unnoticed.
     */
    private fun notificationId(key: String) = 0x50000000 + (key.hashCode() and 0x0FFFFFFF)

    /**
     * One notification per thread, updated in place (like crew chat's): "Sam · private" and the
     * message, or "3 new private messages" with the latest underneath. On a locked phone that hides
     * sensitive content it says only "Private message".
     */
    private fun notify(c: Context, g: GigGroup, m: Mate, texts: List<String>) {
        val crewId = GigArchive.idFor(g)
        val key = threadKey(crewId, m.tag)
        val list = recent.getOrPut(key) { mutableListOf() }
        list += texts
        while (list.size > 6) list.removeAt(0)
        val total = book(c, crewId).unread(m.tag).coerceAtLeast(list.size)
        CrewNotifications.post(
            c,
            title = Txt.s(R.string.private_notif_title, m.name),
            text = if (total <= 1) list.last() else Txt.p(R.plurals.private_notif_count, total),
            openMap = false,
            crewId = crewId,
            notificationId = notificationId(key),
            lines = if (total <= 1) emptyList() else list.takeLast(5),
            privateWith = m.tag,
            lockScreenText = Txt.s(R.string.private_notif_public),
        )
    }

    private fun clearNotification(c: Context, crewId: String, mate: Long) {
        val key = threadKey(crewId, mate)
        recent.remove(key)
        val nm = c.applicationContext.getSystemService(android.app.NotificationManager::class.java) ?: return
        runCatching { nm.cancel(notificationId(key)) }
    }

    // ---- The crew's life ----

    /**
     * The crew moved to a new key ([fresh]): the threads move with it (same people, same signing
     * keys), without [removed]. (The courier puts our unsent ones in the new key's envelope itself;
     * one to someone removed goes nowhere: they can't open the new key's envelope.)
     */
    fun migrate(c: Context, old: GigGroup, fresh: GigGroup, removed: Set<Long>) {
        val app = c.applicationContext
        val from = GigArchive.idFor(old)
        val to = GigArchive.idFor(fresh)
        if (prefs(app).getString(from, null) == null && from !in books) return
        val book = book(app, from)
        // Ours to them that haven't gone yet stop here (they couldn't open them under the new key anyway).
        OfflineMessages.letGo(app, removed.flatMap { tag -> book.thread(tag).filter { it.mine && it.state != OutboxState.SENT }.map { it.id } })
        book.drop(removed)
        books.remove(from)
        books[to] = book
        book.dirty = true
        save(app, to)
        prefs(app).edit().remove(from).apply()
        lastOwnSec.remove(from)?.let { lastOwnSec[to] = it }
        removed.forEach { clearNotification(app, from, it) }
        val o = open.value
        if (o != null && o.crewId == from) {
            if (o.mate in removed) close() else open.value = Open(to, o.mate, o.name, o.friendId)
        }
        refresh(app)
    }

    /** The crew ended, or we left it: its private threads go (they're not kept in Your gigs). */
    fun forget(c: Context, g: GigGroup) = forgetId(c, GigArchive.idFor(g))

    fun forgetId(c: Context, crewId: String) {
        val app = c.applicationContext
        if (prefs(app).getString(crewId, null) != null || crewId in books) book(app, crewId).mates().forEach { clearNotification(app, crewId, it) }
        books.remove(crewId)
        prefs(app).edit().remove(crewId).apply()
        lastOwnSec.remove(crewId)
        if (open.value?.crewId == crewId) close()
        version.value++
    }
}
