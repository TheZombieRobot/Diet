package nz.waveformlabs.moshpoint.core

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream

/*
 * Private messages (docs/PRIVATE_MESSAGES.md): tap a crew mate, "Message Sam", and only the two of
 * you can read it. The message itself is GigGroup.Private (sealed to one person, signed); the
 * courier carries it like crew chat. The rules every phone must apply the same way live here, where
 * tests can fail a build.
 */

/** Small rules for private messages. */
object PrivateRule {
    /**
     * Anything stamped longer ago than this is refused: the relay keeps messages 72 hours and crew
     * phones carry them 24, so an older one is a replay (or a clock days out).
     */
    const val MAX_AGE_SEC = 73 * 3600L

    /** What can be typed: the crew chat's limit (sealed, it's cut to 160 bytes too). */
    const val MAX_CHARS = 140

    /** The id for a new message: 8 random bytes, never 0 (0 means "none" everywhere). */
    fun newId(random: java.util.Random = java.security.SecureRandom()): Long {
        var id: Long
        do id = random.nextLong() while (id == 0L)
        return id
    }

    /** Should a message stamped [timeSec] be taken at [nowSec] (this phone's clock)? A future stamp is fine: it sorts at arrival. */
    fun accepts(timeSec: Long, nowSec: Long): Boolean = timeSec >= nowSec - MAX_AGE_SEC

    /** The text as it will be sent. */
    fun clean(text: String): String = text.trim().take(MAX_CHARS)
}

/**
 * One crew's private threads on this phone: one per crew mate (by their signing tag), the ids
 * already had (so a replay or a second copy is dropped), messages waiting for their sender to turn
 * out to be a crew mate, unread counts and mutes. Saved with the crew ([save]), deleted with it.
 *
 * Not thread-safe: the app uses it from the main thread.
 */
class PrivateBook(
    private val maxPerThread: Int = 300,
    private val maxIds: Int = 3_000,
    private val maxPending: Int = 60,
) {
    /**
     * One message in a thread. [sortSec] is where it sorts ([MessageClock.sortTime]: its own time,
     * unless that was in the future when it arrived). [state] is [OutboxState]'s, for our own.
     */
    class Line(val id: Long, val timeSec: Long, val sortSec: Long, val text: String, val mine: Boolean, val state: Int) {
        fun withState(s: Int) = Line(id, timeSec, sortSec, text, mine, s)
    }

    /** What came of a message that arrived: [shown] in a thread; [alert] = notify (not muted, not on screen). */
    class Verdict(val shown: Boolean, val alert: Boolean)

    private class Thread(var pub: ByteArray?) {
        val lines = ArrayList<Line>()
        var unread = 0
        var muted = false
    }

    private val threads = LinkedHashMap<Long, Thread>()
    private val ids = LinkedHashSet<Long>()
    /** Sender tag and line, for messages from someone not (yet) known as a crew mate. */
    private val pending = ArrayList<Pair<Long, Line>>()

    /** True once something changed that [save] would write differently. The app saves and clears it. */
    var dirty = false

    /**
     * A message for us arrived, opened and signed (by any route). [mate]: is its sender a crew mate
     * on this phone? If not (yet), it waits unshown: see [known]. [viewing]: their thread is on
     * screen now (then it's neither unread nor announced).
     */
    fun offer(p: GigGroup.Private, mate: Boolean, viewing: Boolean, nowSec: Long): Verdict {
        if (p.kind != GigGroup.Private.TEXT) return Verdict(false, false)
        if (!PrivateRule.accepts(p.timeSec, nowSec)) return Verdict(false, false)
        if (!remember(p.id)) return Verdict(false, false)
        val line = Line(p.id, p.timeSec, MessageClock.sortTime(p.timeSec, nowSec), p.text, mine = false, state = OutboxState.SENT)
        if (!mate) {
            pending += p.sender to line
            while (pending.size > maxPending) pending.removeAt(0)
            return Verdict(false, false)
        }
        val t = thread(p.sender, p.fromPub)
        insert(t, line)
        val alert = !viewing && !t.muted
        if (alert) t.unread++
        return Verdict(true, alert)
    }

    /**
     * [sender] is a crew mate now (their phone introduced itself): what they sent that was waiting
     * goes into their thread. Returns those lines, oldest first (the caller announces them, unless
     * the person is muted: see [isMuted]).
     */
    fun known(sender: Long, pub: ByteArray?, viewing: Boolean): List<Line> {
        val theirs = pending.filter { it.first == sender }.map { it.second }
        if (theirs.isEmpty()) return emptyList()
        pending.removeAll { it.first == sender }
        val t = thread(sender, pub)
        theirs.forEach { insert(t, it) }
        if (!viewing && !t.muted) t.unread += theirs.size
        dirty = true
        return theirs.sortedWith { a, b -> MessageClock.compare(a.sortSec, a.id, b.sortSec, b.id) }
    }

    /** Is anything from [sender] waiting for them to turn out to be a crew mate? */
    fun waitingFrom(sender: Long): Boolean = pending.any { it.first == sender }

    /** Everyone with messages waiting to turn out to be a crew mate (see [known]). */
    fun waitingSenders(): Set<Long> = pending.map { it.first }.toSet()

    /** One of ours to [mate] (signing key [matePub]), as just sent. */
    fun own(mate: Long, matePub: ByteArray, id: Long, timeSec: Long, text: String, state: Int, nowSec: Long) {
        remember(id)
        val t = thread(mate, matePub)
        if (t.lines.any { it.id == id }) return
        insert(t, Line(id, timeSec, MessageClock.sortTime(timeSec, nowSec), text, mine = true, state = state))
    }

    /**
     * One of our messages moved on ([OutboxState]: only forward, or back to waiting when retried).
     * Returns the thread it's in if it changed, else null.
     */
    fun setState(id: Long, state: Int): Long? {
        for ((mate, t) in threads) {
            val i = t.lines.indexOfFirst { it.id == id && it.mine }
            if (i < 0) continue
            if (!OutboxState.mayMove(t.lines[i].state, state)) return null
            t.lines[i] = t.lines[i].withState(state)
            dirty = true
            return mate
        }
        return null
    }

    /** The thread with [mate], oldest first. */
    fun thread(mate: Long): List<Line> = threads[mate]?.lines?.toList().orEmpty()

    /** Our own message [id], and who it went to (for sealing it again). */
    fun ownLine(id: Long): Pair<Long, Line>? {
        for ((mate, t) in threads) t.lines.firstOrNull { it.id == id && it.mine }?.let { return mate to it }
        return null
    }

    /** [mate]'s signing key, if we've had a message from them or sent them one. */
    fun pubOf(mate: Long): ByteArray? = threads[mate]?.pub

    /** Everyone we have a thread with. */
    fun mates(): Set<Long> = threads.keys.toSet()

    /** The newest time in the thread with [mate] (our next message is stamped after it, see [MessageClock.stamp]). */
    fun newest(mate: Long): Long = threads[mate]?.lines?.maxOfOrNull { it.timeSec } ?: 0L

    fun unread(mate: Long): Int = threads[mate]?.unread ?: 0

    fun totalUnread(): Int = threads.values.sumOf { it.unread }

    /** Their thread was opened. True if that changed anything. */
    fun markRead(mate: Long): Boolean {
        val t = threads[mate] ?: return false
        if (t.unread == 0) return false
        t.unread = 0
        dirty = true
        return true
    }

    /** Mute [mate] on this phone ([on]), or unmute. Their messages still arrive; they never notify or count as unread. */
    fun mute(mate: Long, on: Boolean) {
        val t = thread(mate, null)
        if (t.muted == on) return
        t.muted = on
        if (on) t.unread = 0
        dirty = true
    }

    fun isMuted(mate: Long): Boolean = threads[mate]?.muted == true

    /** These people are out of the crew (removed): their threads, waiting messages and mutes go. */
    fun drop(tags: Set<Long>) {
        if (tags.isEmpty()) return
        val before = threads.size + pending.size
        threads.keys.removeAll(tags)
        pending.removeAll { it.first in tags }
        if (threads.size + pending.size != before) dirty = true
    }

    private fun thread(mate: Long, pub: ByteArray?): Thread {
        val t = threads.getOrPut(mate) { dirty = true; Thread(null) }
        if (pub != null && pub.size == CrewKeys.PUB_BYTES && CrewKeys.tagOf(pub) == mate && t.pub?.contentEquals(pub) != true) {
            t.pub = pub.copyOf()
            dirty = true
        }
        return t
    }

    /** False if [id] was had before. */
    private fun remember(id: Long): Boolean {
        if (!ids.add(id)) return false
        while (ids.size > maxIds) ids.remove(ids.first())
        dirty = true
        return true
    }

    /** In the order every phone shows (time, then id), keeping the newest [maxPerThread]. */
    private fun insert(t: Thread, l: Line) {
        if (t.lines.any { it.id == l.id }) return
        val at = t.lines.indexOfFirst { MessageClock.compare(l.sortSec, l.id, it.sortSec, it.id) < 0 }.let { if (it < 0) t.lines.size else it }
        t.lines.add(at, l)
        while (t.lines.size > maxPerThread) t.lines.removeAt(0)
        dirty = true
    }

    // ---- Saving ----

    fun save(): ByteArray {
        val bytes = ByteArrayOutputStream()
        DataOutputStream(bytes).use { d ->
            d.writeByte(SAVE_VERSION)
            d.writeInt(threads.size)
            for ((mate, t) in threads) {
                d.writeLong(mate)
                val pub = t.pub
                d.writeByte(if (pub != null) 1 else 0)
                if (pub != null) d.write(pub)
                d.writeInt(t.unread)
                d.writeBoolean(t.muted)
                d.writeInt(t.lines.size)
                t.lines.forEach { writeLine(d, it) }
            }
            d.writeInt(pending.size)
            pending.forEach { (sender, l) ->
                d.writeLong(sender)
                writeLine(d, l)
            }
            d.writeInt(ids.size)
            ids.forEach { d.writeLong(it) }
        }
        return bytes.toByteArray()
    }

    /** Load what [save] wrote. Anything unreadable is ignored: better empty threads than a crash. */
    fun restore(saved: ByteArray?) {
        threads.clear()
        pending.clear()
        ids.clear()
        if (saved == null || saved.isEmpty()) return
        runCatching {
            val d = DataInputStream(ByteArrayInputStream(saved))
            if (d.readUnsignedByte() != SAVE_VERSION) return
            repeat(d.readInt().coerceIn(0, 1_000)) {
                val mate = d.readLong()
                val pub = if (d.readUnsignedByte() == 1) ByteArray(CrewKeys.PUB_BYTES).also { d.readFully(it) } else null
                val t = Thread(pub)
                t.unread = d.readInt().coerceAtLeast(0)
                t.muted = d.readBoolean()
                repeat(d.readInt().coerceIn(0, maxPerThread)) { t.lines += readLine(d) }
                threads[mate] = t
            }
            repeat(d.readInt().coerceIn(0, maxPending)) { pending += d.readLong() to readLine(d) }
            repeat(d.readInt().coerceIn(0, maxIds)) { ids += d.readLong() }
        }
        // Ours, and everything shown: always remembered, whatever happened to the list of ids.
        threads.values.forEach { t -> t.lines.forEach { ids += it.id } }
        dirty = false
    }

    private fun writeLine(d: DataOutputStream, l: Line) {
        d.writeLong(l.id)
        d.writeLong(l.timeSec)
        d.writeLong(l.sortSec)
        d.writeBoolean(l.mine)
        d.writeByte(l.state)
        d.writeUTF(l.text)
    }

    private fun readLine(d: DataInputStream): Line {
        val id = d.readLong()
        val time = d.readLong()
        val sort = d.readLong()
        val mine = d.readBoolean()
        val state = d.readUnsignedByte()
        return Line(id, time, sort, d.readUTF(), mine, state)
    }

    private companion object {
        const val SAVE_VERSION = 1
    }
}
