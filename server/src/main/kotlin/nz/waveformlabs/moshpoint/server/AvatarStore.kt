package nz.waveformlabs.moshpoint.server

import java.util.concurrent.ConcurrentHashMap

/**
 * Encrypted profile photos, by weekly id. The server can't open them (only the owner's
 * friends can). Kept 8 days; total size capped, oldest dropped first.
 */
class AvatarStore(
    private val ttlMs: Long = 8L * 24 * 60 * 60 * 1000,
    private val maxTotalBytes: Long = 256L * 1024 * 1024,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private class Entry(val data: ByteArray, val atMs: Long)

    private val items = ConcurrentHashMap<String, Entry>()

    @Synchronized
    fun put(id: String, data: ByteArray) {
        items[id] = Entry(data, clock())
        var total = items.values.sumOf { it.data.size.toLong() }
        while (total > maxTotalBytes && items.isNotEmpty()) {
            val oldest = items.entries.minBy { it.value.atMs }
            items.remove(oldest.key)
            total -= oldest.value.data.size
        }
    }

    fun get(id: String): ByteArray? {
        val e = items[id] ?: return null
        if (clock() - e.atMs > ttlMs) {
            items.remove(id)
            return null
        }
        return e.data
    }

    fun sweep() {
        val now = clock()
        items.entries.removeIf { now - it.value.atMs > ttlMs }
    }
}
