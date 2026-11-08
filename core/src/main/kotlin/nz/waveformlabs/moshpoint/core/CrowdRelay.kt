package nz.waveformlabs.moshpoint.core

/**
 * Crowd relay: sealed locations hopping phone to phone over Bluetooth.
 *
 * When mobile data drops out at a venue, a visible phone still knows its own GPS. It
 * seals it (see [LocationBox]) and broadcasts a [RelayPacket]. Any Moshpoint phone that
 * hears it:
 *  - keeps it in a [RelayCache],
 *  - re-broadcasts it with one fewer hop left, and
 *  - uploads it to the relay server if it has signal.
 * A phone looking for a friend checks the cache for that friend's rotating ids.
 *
 * Helper phones only ever see a rotating id and ciphertext. They can't tell whose it
 * is or where it points.
 */
data class RelayPacket(val ttl: Int, val id: ByteArray, val sealed: ByteArray) {
    init {
        require(id.size == EphemeralId.ID_BYTES)
        require(sealed.size == LocationBox.SEALED_BYTES)
        require(ttl in 0..MAX_TTL)
    }

    /** Sealed boxes start with a 4-byte timestamp in the clear (it's also the nonce). */
    val timeSec: Long
        get() = ((sealed[0].toLong() and 0xFF) shl 24) or ((sealed[1].toLong() and 0xFF) shl 16) or
            ((sealed[2].toLong() and 0xFF) shl 8) or (sealed[3].toLong() and 0xFF)

    fun encode(): ByteArray = byteArrayOf(VERSION.toByte(), ttl.toByte()) + id + sealed

    override fun equals(other: Any?) =
        other is RelayPacket && ttl == other.ttl && id.contentEquals(other.id) && sealed.contentEquals(other.sealed)

    override fun hashCode() = id.contentHashCode() * 31 + sealed.contentHashCode()

    companion object {
        const val VERSION = 1
        const val MAX_TTL = 6
        /** 2 + 16 + 30 = 48 bytes: needs Bluetooth 5 extended advertising. */
        const val SIZE = 2 + EphemeralId.ID_BYTES + LocationBox.SEALED_BYTES

        fun decode(b: ByteArray): RelayPacket? {
            if (b.size != SIZE || b[0].toInt() != VERSION) return null
            val ttl = b[1].toInt() and 0xFF
            if (ttl > MAX_TTL) return null
            return RelayPacket(ttl, b.copyOfRange(2, 18), b.copyOfRange(18, SIZE))
        }
    }
}

/**
 * What a phone has heard from the crowd. Keeps the newest packet per rotating id (with
 * the most hops left as a tie-break), drops old ones, and caps memory.
 */
class RelayCache(
    private val maxEntries: Int = 300,
    private val maxAgeSec: Long = 10 * 60,
) {
    private class Entry(var packet: RelayPacket, var heardAtSec: Long, var sentCount: Int)

    private val byId = LinkedHashMap<String, Entry>()

    /** Returns true if this was new information (worth re-broadcasting / uploading). */
    @Synchronized
    fun offer(packet: RelayPacket, nowSec: Long): Boolean {
        if (nowSec - packet.timeSec > maxAgeSec || packet.timeSec - nowSec > 120) return false
        val key = packet.id.toHex()
        val existing = byId[key]
        if (existing != null) {
            val newer = packet.timeSec > existing.packet.timeSec
            val sameButFewerHops = packet.timeSec == existing.packet.timeSec && packet.ttl > existing.packet.ttl
            if (!newer && !sameButFewerHops) return false
            existing.packet = packet
            existing.heardAtSec = nowSec
            existing.sentCount = 0
            return newer
        }
        byId[key] = Entry(packet, nowSec, 0)
        evict(nowSec)
        return true
    }

    @Synchronized
    fun lookup(id: ByteArray, nowSec: Long): RelayPacket? =
        byId[id.toHex()]?.packet?.takeIf { nowSec - it.timeSec <= maxAgeSec }

    /**
     * Next packets to re-broadcast, as copies with one fewer hop. Prefers packets sent the
     * fewest times so everything gets airtime. Packets with no hops left aren't re-sent.
     */
    @Synchronized
    fun nextToBroadcast(n: Int, nowSec: Long): List<RelayPacket> {
        evict(nowSec)
        val candidates = byId.values.filter { it.packet.ttl > 0 }.sortedBy { it.sentCount }.take(n)
        candidates.forEach { it.sentCount++ }
        return candidates.map { it.packet.copy(ttl = it.packet.ttl - 1) }
    }

    @Synchronized
    fun size() = byId.size

    private fun evict(nowSec: Long) {
        byId.values.removeAll { nowSec - it.packet.timeSec > maxAgeSec }
        while (byId.size > maxEntries) {
            val oldest = byId.entries.minBy { it.value.packet.timeSec }
            byId.remove(oldest.key)
        }
    }
}

internal fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }
