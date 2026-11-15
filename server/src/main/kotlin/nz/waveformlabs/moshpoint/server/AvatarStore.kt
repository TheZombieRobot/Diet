package nz.waveformlabs.moshpoint.server

import java.io.File
import java.io.FileInputStream

/**
 * Encrypted profile photos, by weekly id, as files on the volume (`<dir>/<id>`). The server can't
 * open them (only the owner's friends can). Kept [ttlMs] (8 days). A new photo under the same id
 * replaces the old one in one step (temp file, flush, rename).
 *
 * Capped at [maxBytes] in total. A full store says "try later"; photos already accepted stay
 * until they expire. Nothing is held in memory but the list of ids, sizes and times.
 */
class AvatarStore(
    private val dir: File,
    private val ttlMs: Long = 8L * 24 * 60 * 60 * 1000,
    private val maxBytes: Long = 1L shl 30,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private class Entry(val size: Long, val atMs: Long)

    private val items = HashMap<String, Entry>()
    private val tmp = File(dir, ".tmp")

    @Volatile var bytes = 0L
        private set

    val count: Int @Synchronized get() = items.size

    init {
        dir.mkdirs()
        tmp.mkdirs()
        tmp.listFiles()?.forEach { it.delete() }
        dir.listFiles()?.filter { it.isFile && ID_RE.matches(it.name) }?.forEach { f ->
            items[f.name] = Entry(f.length(), f.lastModified())
            bytes += f.length()
        }
    }

    /** Store [data] as [id]'s photo. False if the store is full. */
    fun put(id: String, data: ByteArray): Boolean {
        synchronized(this) {
            if (bytes - (items[id]?.size ?: 0L) + data.size > maxBytes) return false
        }
        val now = clock()
        val temp = Disk.writeTemp(tmp, data)
        temp.setLastModified(now)
        Disk.move(temp, File(dir, id))
        synchronized(this) {
            bytes += data.size - (items[id]?.size ?: 0L)
            items[id] = Entry(data.size.toLong(), now)
        }
        return true
    }

    /** Open [id]'s photo for download, or null if there's none (or it has expired). */
    fun open(id: String): FileStore.Opened? {
        val e = synchronized(this) { items[id] } ?: return null
        if (clock() - e.atMs > ttlMs) return null
        return runCatching { FileStore.Opened(FileInputStream(File(dir, id)), e.size) }.getOrNull()
    }

    /** Delete expired photos. Returns how many went. */
    @Synchronized
    fun sweep(): Int {
        val now = clock()
        val old = items.filterValues { now - it.atMs > ttlMs }
        old.forEach { (id, e) ->
            File(dir, id).delete()
            items.remove(id)
            bytes -= e.size
        }
        return old.size
    }

    private companion object {
        val ID_RE = Regex("^[0-9a-f]{32}$")
    }
}
