package nz.waveformlabs.moshpoint.core

import java.nio.ByteBuffer
import java.security.MessageDigest

/**
 * Version 2 of the crowd-relay packet: a sealed crew message instead of a location.
 *
 * ```
 * [version = 2][hops left:1][fragment:1][payload: up to 197 bytes]
 * ```
 *
 * - Older phones only accept packets that are exactly 48 bytes and start with `1`
 *   ([RelayPacket.decode]), so they drop these without a second look.
 * - The payload is the message exactly as its author sealed it. Nothing in the packet says
 *   which crew or person it belongs to: a phone finds its own crew's packets by trying its
 *   key. A stranger's phone learns the size, the time and how many hops are left.
 * - Kept to 200 bytes in all. Many phones cap an advert near 251 bytes and an oversized
 *   update fails without saying so. A long chat line is cut into two fragments; a fragment's
 *   payload starts with 4 bytes naming the whole it belongs to.
 * - `hops left` 0 means "crew phones only": chat is sent that way, so it never floods a venue.
 */
class MessagePacket(val ttl: Int, val index: Int, val count: Int, val payload: ByteArray) {
    init {
        require(ttl in 0..MAX_TTL)
        require(count in 1..MAX_FRAGMENTS && index in 0 until count)
        require(payload.size in 1..MAX_PAYLOAD)
    }

    fun encode(): ByteArray = byteArrayOf(VERSION.toByte(), ttl.toByte(), ((index shl 4) or (count - 1)).toByte()) + payload

    /** The same packet with one fewer hop, or null if it has none left. */
    fun hop(): MessagePacket? = if (ttl > 0) MessagePacket(ttl - 1, index, count, payload) else null

    /**
     * What a phone that can't open the packet uses to recognise a repeat: a hash of everything
     * but the hop count. Never used to say which *message* something is (see GigGroup.messageId).
     */
    val relayKey: Long by lazy {
        val md = MessageDigest.getInstance("SHA-256")
        md.update(byteArrayOf(index.toByte(), count.toByte()))
        ByteBuffer.wrap(md.digest(payload)).long
    }

    /** A whole (unfragmented) sealed message starts with its 4-byte time in the clear. */
    val timeSec: Long?
        get() = if (count == 1 && payload.size >= 4) ByteBuffer.wrap(payload, 0, 4).int.toLong() and 0xFFFFFFFFL else null

    companion object {
        const val VERSION = 2
        const val MAX_TTL = 5
        const val HEADER = 3
        /** The whole packet (the advert's service data). */
        const val MAX_SIZE = 200
        const val MAX_PAYLOAD = MAX_SIZE - HEADER
        const val MAX_FRAGMENTS = 2
        private const val FRAGMENT_KEY = 4
        /** The longest sealed message that can be sent: two fragments. A full chat line is 318. */
        const val MAX_SEALED = MAX_FRAGMENTS * (MAX_PAYLOAD - FRAGMENT_KEY)

        fun decode(b: ByteArray): MessagePacket? {
            if (b.size < HEADER + 1 || b.size > MAX_SIZE || b[0].toInt() != VERSION) return null
            val ttl = b[1].toInt() and 0xFF
            val frag = b[2].toInt() and 0xFF
            val index = frag shr 4
            val count = (frag and 0x0F) + 1
            if (ttl > MAX_TTL || count > MAX_FRAGMENTS || index >= count) return null
            return MessagePacket(ttl, index, count, b.copyOfRange(HEADER, b.size))
        }

        /** [sealed] as one packet, or as fragments if it's too long for one. Empty if it can't be sent at all. */
        fun split(sealed: ByteArray, ttl: Int): List<MessagePacket> {
            if (sealed.isEmpty() || sealed.size > MAX_SEALED) return emptyList()
            if (sealed.size <= MAX_PAYLOAD) return listOf(MessagePacket(ttl, 0, 1, sealed))
            val key = fragmentKey(sealed)
            val chunk = MAX_PAYLOAD - FRAGMENT_KEY
            val count = (sealed.size + chunk - 1) / chunk
            return List(count) { i ->
                MessagePacket(ttl, i, count, key + sealed.copyOfRange(i * chunk, minOf(sealed.size, (i + 1) * chunk)))
            }
        }

        internal fun fragmentKey(sealed: ByteArray): ByteArray = MessageDigest.getInstance("SHA-256").digest(sealed).copyOf(FRAGMENT_KEY)

        internal fun fragmentKeyOf(p: MessagePacket): Int = ByteBuffer.wrap(p.payload, 0, FRAGMENT_KEY).int

        internal fun fragmentBody(p: MessagePacket): ByteArray = p.payload.copyOfRange(FRAGMENT_KEY, p.payload.size)
    }
}

/** Puts fragments back together. Holds a few half-finished messages for a minute. */
class Reassembly(private val maxPending: Int = 16, private val keepMs: Long = 60_000L) {
    private class Pending(val parts: Array<ByteArray?>, val atMs: Long)

    private val pending = LinkedHashMap<Int, Pending>()

    /** The whole sealed message once every part is in, or null while it isn't. */
    fun offer(p: MessagePacket, nowMs: Long): ByteArray? {
        if (p.count == 1) return p.payload
        if (p.payload.size <= 4) return null
        pending.values.removeAll { nowMs - it.atMs > keepMs }
        val key = MessagePacket.fragmentKeyOf(p)
        val entry = pending[key]?.takeIf { it.parts.size == p.count } ?: Pending(arrayOfNulls(p.count), nowMs).also {
            pending[key] = it
            while (pending.size > maxPending) pending.remove(pending.keys.first())
        }
        entry.parts[p.index] = MessagePacket.fragmentBody(p)
        if (entry.parts.any { it == null }) return null
        pending.remove(key)
        val whole = entry.parts.fold(ByteArray(0)) { acc, part -> acc + part!! }
        // The key is a hash of the whole: a stray fragment from something else can't complete it.
        return whole.takeIf { ByteBuffer.wrap(MessagePacket.fragmentKey(it)).int == key }
    }
}

/**
 * What any Moshpoint phone does with a message packet it can't read: pass it on a couple of
 * times with one fewer hop, and nothing else.
 *
 * The limits that stop a venue from being flooded:
 *  - only whole packets with hops left are passed on (so never chat, which is sent with none);
 *  - each packet is taken once ([relayKey][MessagePacket.relayKey]) and aired [turns] times;
 *  - at most [perMinute] new packets a minute are taken from the air;
 *  - [maxEntries] waiting at once, the longest-held dropped first;
 *  - nothing stamped more than 2 minutes ahead, nothing older than [maxAgeSec].
 *
 * Separate from [RelayCache], which keeps the *newest* location per id: here every packet is
 * a different message and all of them matter.
 */
class MessageRelay(
    private val maxEntries: Int = 40,
    private val maxAgeSec: Long = 3600L,
    private val perMinute: Int = 6,
    private val turns: Int = 2,
) {
    private class Entry(val packet: MessagePacket, val heardAtSec: Long, var sent: Int)

    private val waiting = LinkedHashMap<Long, Entry>()
    private val seen = LinkedHashMap<Long, Long>()
    private val taken = ArrayDeque<Long>()

    /** A packet heard on air. True if it's new here and will be passed on. */
    @Synchronized
    fun offer(p: MessagePacket, nowSec: Long): Boolean {
        if (p.ttl <= 0 || p.count != 1) return false
        val t = p.timeSec ?: return false
        if (t - nowSec > 120 || nowSec - t > maxAgeSec) return false
        prune(nowSec)
        if (seen.containsKey(p.relayKey)) return false
        while (taken.isNotEmpty() && nowSec - taken.first() >= 60) taken.removeFirst()
        if (taken.size >= perMinute) return false
        taken.addLast(nowSec)
        seen[p.relayKey] = nowSec
        waiting[p.relayKey] = Entry(p, nowSec, 0)
        while (waiting.size > maxEntries) waiting.remove(waiting.keys.first())
        return true
    }

    /** Remember a packet as already handled (one of our own, say) so an echo of it isn't passed on. */
    @Synchronized
    fun know(p: MessagePacket, nowSec: Long) {
        seen[p.relayKey] = nowSec
        waiting.remove(p.relayKey)
    }

    /** The next packet to pass on, with one fewer hop, or null. */
    @Synchronized
    fun next(nowSec: Long): MessagePacket? {
        prune(nowSec)
        val e = waiting.values.minByOrNull { it.sent } ?: return null
        e.sent++
        if (e.sent >= turns) waiting.remove(e.packet.relayKey)
        return e.packet.hop()
    }

    @Synchronized
    fun waitingCount(): Int = waiting.size

    private fun prune(nowSec: Long) {
        waiting.values.removeAll { nowSec - it.heardAtSec > maxAgeSec || nowSec - (it.packet.timeSec ?: nowSec) > maxAgeSec }
        seen.values.removeAll { nowSec - it > maxAgeSec + 120 }
        while (seen.size > 500) seen.remove(seen.keys.first())
    }
}

/**
 * Whose turn it is in the one advertising set the crowd relay uses.
 *
 * Messages share that set rather than starting another advertiser: the phone already runs
 * up to five, and one that fails to start doesn't retry, so a new one could cost someone
 * their visible advert.
 *
 * - Nothing waiting: exactly what the relay always did. Our own location every third second,
 *   otherwise a location heard from the crowd, one second each.
 * - A message waiting: it gets [MESSAGE_MS] on air (a phone scanning at low power listens
 *   for about half a second every five, so a shorter turn is often missed), then locations
 *   get three one-second turns, ours first. So under the heaviest load our own location
 *   still goes out every 8.5 s and the crowd's keep two turns in each cycle.
 */
class RelaySchedule {
    enum class Turn { OWN_LOCATION, HEARD_LOCATION, MESSAGE }

    class Slot(val turn: Turn, val holdMs: Long)

    private var locationTurnsSinceMessage = LOCATION_TURNS

    fun next(nowSec: Long, messageWaiting: Boolean): Slot {
        if (messageWaiting && locationTurnsSinceMessage >= LOCATION_TURNS) {
            locationTurnsSinceMessage = 0
            return Slot(Turn.MESSAGE, MESSAGE_MS)
        }
        val firstAfterMessage = locationTurnsSinceMessage == 0
        if (locationTurnsSinceMessage < LOCATION_TURNS) locationTurnsSinceMessage++
        return Slot(if (firstAfterMessage || nowSec % 3L == 0L) Turn.OWN_LOCATION else Turn.HEARD_LOCATION, LOCATION_MS)
    }

    companion object {
        const val MESSAGE_MS = 5_500L
        const val LOCATION_MS = 1_000L
        const val LOCATION_TURNS = 3
    }
}
