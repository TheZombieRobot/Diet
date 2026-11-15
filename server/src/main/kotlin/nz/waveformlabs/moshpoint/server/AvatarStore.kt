package nz.waveformlabs.moshpoint.server

import java.io.File
import java.io.FileInputStream

/**
 * Encrypted profile photos, by weekly id, as files on the volume (`<dir>/<id>`). The server can't
 * open them (only the owner's friends can). Kept [ttlMs] (8 days). A new photo under the same id
 * replaces the old one in one step (temp file, flush, rename).
 *
 * Capped at [maxBytes] in total (in whole 4 KB blocks, as the disk stores them) and [maxCount]
 * photos. A full store says "try later"; photos already accepted stay until they expire. Nothing
 * is held in memory but the list of ids, sizes and times.
 */
class AvatarStore(
    private val dir: File,
    private val ttlMs: Long = 8L * 24 * 60 * 60 * 1000,
    private val maxBytes: Long = 1L shl 30,
    private val maxCount: Int = 300_000,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private class Entry(val size: Long, val atMs: Long)

    private val items = HashMap<String, Entry>()
    private val tmp = File(dir, ".tmp")

    /** Writes and deletes of one id's file go one at a time (a lock per stripe of ids). */
    private val stripes = Array(64) { Any() }

    private fun stripe(id: String) = stripes[(id.hashCode() and 0x7fffffff) % stripes.size]

    @Volatile var bytes = 0L
        private set

    val count: Int @Synchronized get() = items.size

    init {
        dir.mkdirs()
        tmp.mkdirs()
        tmp.listFiles()?.forEach { it.delete() }
        dir.listFiles()?.filter { it.isFile && ID_RE.matches(it.name) }?.forEach { f ->
            items[f.name] = Entry(f.length(), f.lastModified())
            bytes += FileStore.blocks(f.length())
        }
    }

    /** Is there room for a [size]-byte photo under [id] (replacing its old one)? */
    @Synchronized
    fun roomFor(id: String, size: Long): Boolean {
        val old = items[id]
        if (old == null && items.size >= maxCount) return false
        return bytes - (old?.let { FileStore.blocks(it.size) } ?: 0L) + FileStore.blocks(size) <= maxBytes
    }

    /** Store [data] as [id]'s photo (blocking: a write and two flushes). False if the store is full. */
    fun put(id: String, data: ByteArray): Boolean = synchronized(stripe(id)) {
        if (!roomFor(id, data.size.toLong())) return false
        val now = clock()
        val temp = Disk.writeTemp(tmp, data)
        temp.setLastModified(now)
        Disk.move(temp, File(dir, id))
        synchronized(this) {
            bytes += FileStore.blocks(data.size.toLong()) - (items[id]?.let { FileStore.blocks(it.size) } ?: 0L)
            items[id] = Entry(data.size.toLong(), now)
        }
        true
    }

    /** Open [id]'s photo for download, or null if there's none (or it has expired). */
    fun open(id: String): FileStore.Opened? {
        val e = synchronized(this) { items[id] } ?: return null
        if (clock() - e.atMs > ttlMs) return null
        val input = runCatching { FileInputStream(File(dir, id)) }.getOrNull() ?: return null
        // The length of the file that was opened (a new photo may have just replaced the old one).
        return FileStore.Opened(input, input.channel.size())
    }

    /** Delete expired photos. Returns how many went. */
    fun sweep(): Int {
        val now = clock()
        val old = synchronized(this) { items.filterValues { now - it.atMs > ttlMs }.keys.toList() }
        var gone = 0
        for (id in old) {
            synchronized(stripe(id)) {
                // Still the expired one? (A new photo may have arrived since.)
                val e = synchronized(this) { items[id] }
                if (e != null && now - e.atMs > ttlMs) {
                    File(dir, id).delete()
                    synchronized(this) {
                        items.remove(id)
                        bytes -= FileStore.blocks(e.size)
                    }
                    gone++
                }
            }
        }
        return gone
    }

    private companion object {
        val ID_RE = Regex("^[0-9a-f]{32}$")
    }
}
