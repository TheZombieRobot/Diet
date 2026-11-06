package nz.waveformlabs.moshpoint.server

import java.util.concurrent.ConcurrentHashMap

/**
 * In-memory store: rotating id -> the few most recent sealed locations posted under it.
 *
 * The server never sees names, accounts, secrets or plain locations. Ids rotate every
 * 5 minutes, so even the server can't follow one phone across the night. Everything
 * expires after [ttlMs].
 *
 * Several entries are kept per id because in crowd mode different helper phones post
 * the same person's id with their own (sealed) location.
 */
class MailboxStore(
    private val ttlMs: Long = 15 * 60 * 1000L,
    private val maxPerId: Int = 8,
    private val maxIds: Int = 2_000_000,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private data class Entry(val data: ByteArray, val atMs: Long)

    private val boxes = ConcurrentHashMap<String, ArrayDeque<Entry>>()

    /** Returns false if the store is full. */
    fun put(id: String, data: ByteArray): Boolean {
        if (boxes.size >= maxIds && !boxes.containsKey(id)) {
            sweep()
            if (boxes.size >= maxIds) return false
        }
        val now = clock()
        boxes.compute(id) { _, existing ->
            val q = existing ?: ArrayDeque()
            q.removeAll { it.data.contentEquals(data) }
            q.addFirst(Entry(data, now))
            while (q.size > maxPerId) q.removeLast()
            q
        }
        return true
    }

    /** Newest first, expired entries removed. */
    fun get(id: String): List<ByteArray> {
        val now = clock()
        var out: List<ByteArray> = emptyList()
        boxes.computeIfPresent(id) { _, q ->
            q.removeAll { now - it.atMs > ttlMs }
            out = q.map { it.data }
            if (q.isEmpty()) null else q
        }
        return out
    }

    fun sweep() {
        val now = clock()
        boxes.keys.forEach { id ->
            boxes.computeIfPresent(id) { _, q ->
                q.removeAll { now - it.atMs > ttlMs }
                if (q.isEmpty()) null else q
            }
        }
    }

    fun size() = boxes.size
}
