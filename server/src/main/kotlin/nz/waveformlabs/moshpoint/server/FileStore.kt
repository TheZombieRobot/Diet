package nz.waveformlabs.moshpoint.server

import java.io.File
import java.io.FileInputStream
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicInteger

/**
 * Sealed files (crew photos and clips) on the volume, under a rotating id: `<dir>/<id>/<name>`,
 * where the name is `<unix seconds>-<random hex>`. The server can't open them: they're encrypted
 * on the phones with the crew's key.
 *
 * - Uploads arrive in a temp file (streamed, see [Disk.receive]) and are renamed into place, so
 *   a file is either all there or not there, through any crash.
 * - Kept [ttlMs] (a night and the morning after), then the sweep deletes them.
 * - [maxBytes] in total (each file counted in whole 4 KB blocks, as the disk stores it),
 *   [maxCount] files in total and [maxPerId] per id. A full store says "try later" instead of
 *   dropping files it already accepted.
 * - Each file can be downloaded in full [maxDownloads] times (a crew is far smaller), so a link
 *   to it is no use for sharing with the world. Refused or cut-off downloads don't count.
 *
 * The list of files is kept in memory (rebuilt from the directory at start), so listing a crew's
 * files never walks the disk.
 */
class FileStore(
    private val dir: File,
    private val ttlMs: Long = 24 * 3600_000L,
    private val maxBytes: Long = 4L shl 30,
    private val maxPerId: Int = 500,
    private val maxDownloads: Int = 500,
    private val maxCount: Int = 300_000,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private class Entry(val name: String, val timeSec: Long, val size: Long, val atMs: Long) {
        val downloads = AtomicInteger()
    }

    /** A file opened for download; call [completed] once it has been sent in full. */
    class Opened(val input: FileInputStream, val size: Long, val completed: () -> Unit = {})

    private val rnd = SecureRandom()
    private val byId = HashMap<String, MutableList<Entry>>()
    private val tmp = File(dir, ".tmp")

    @Volatile var bytes = 0L
        private set

    @Volatile var count = 0
        private set

    init {
        dir.mkdirs()
        tmp.mkdirs()
        // Uploads cut off by a crash or a stop never made it into place: drop them.
        tmp.listFiles()?.forEach { it.delete() }
        dir.listFiles()?.filter { it.isDirectory && ID_RE.matches(it.name) }?.forEach { d ->
            d.listFiles()?.forEach { f ->
                val t = f.name.substringBefore('-').toLongOrNull()
                if (f.isFile && t != null && NAME_RE.matches(f.name)) add(d.name, Entry(f.name, t, f.length(), f.lastModified()))
            }
        }
    }

    /** Where an upload is received before it's committed. */
    fun tempFile(): File = File.createTempFile("up-", ".part", tmp)

    /** Is there room for another [size]-byte file under [id]? */
    @Synchronized
    fun roomFor(id: String, size: Long): Room = when {
        (byId[id]?.size ?: 0) >= maxPerId -> Room.MAILBOX_FULL
        bytes + blocks(size) > maxBytes || count >= maxCount -> Room.STORE_FULL
        else -> Room.OK
    }

    enum class Room { OK, MAILBOX_FULL, STORE_FULL }

    /** Move a received upload ([temp], [size] bytes) into place under [id]. Returns its name. */
    fun commit(id: String, temp: File, size: Long): String {
        val now = clock()
        val name = "${now / 1000}-${java.lang.Long.toHexString(rnd.nextLong() and Long.MAX_VALUE)}"
        val d = File(dir, id).apply { mkdirs() }
        temp.setLastModified(now)
        Disk.move(temp, File(d, name))
        synchronized(this) { add(id, Entry(name, now / 1000, size, now)) }
        return name
    }

    /** (time s, name) of files under [id] from [sinceSec] on, newest first. */
    @Synchronized
    fun list(id: String, sinceSec: Long): List<Pair<Long, String>> {
        val now = clock()
        return byId[id].orEmpty()
            .filter { now - it.atMs <= ttlMs && it.timeSec >= sinceSec }
            .sortedByDescending { it.timeSec }
            .map { it.timeSec to it.name }
    }

    /** Open a file for download, or null if there's no such file, it has expired or it has been fetched in full too often. */
    fun open(id: String, name: String): Opened? {
        if (!NAME_RE.matches(name)) return null
        val e = synchronized(this) { byId[id]?.firstOrNull { it.name == name } } ?: return null
        if (clock() - e.atMs > ttlMs || e.downloads.get() >= maxDownloads) return null
        val input = runCatching { FileInputStream(File(File(dir, id), name)) }.getOrNull() ?: return null
        // The length of what was opened, whatever the index says.
        return Opened(input, input.channel.size()) { e.downloads.incrementAndGet() }
    }

    /** Delete expired files. Returns how many went. The list is updated under the lock; the disk outside it. */
    fun sweep(): Int {
        val now = clock()
        val gone = ArrayList<Pair<String, Entry>>()
        synchronized(this) {
            val ids = byId.entries.iterator()
            while (ids.hasNext()) {
                val (id, list) = ids.next()
                val old = list.filter { now - it.atMs > ttlMs }
                if (old.isEmpty()) continue
                old.forEach {
                    gone += id to it
                    bytes -= blocks(it.size)
                    count--
                }
                list.removeAll(old)
                if (list.isEmpty()) ids.remove()
            }
        }
        gone.forEach { (id, e) -> File(File(dir, id), e.name).delete() }
        gone.map { it.first }.distinct().forEach { id ->
            val d = File(dir, id)
            if (synchronized(this) { byId[id] == null }) d.delete() // only if empty: delete() leaves a folder with files
        }
        return gone.size
    }

    private fun add(id: String, e: Entry) {
        byId.getOrPut(id) { ArrayList() } += e
        bytes += blocks(e.size)
        count++
    }

    companion object {
        private val NAME_RE = Regex("^[0-9]+-[0-9a-f]+$")
        private val ID_RE = Regex("^[0-9a-f]{32}$")

        /** Bytes a file takes on disk: whole 4 KB blocks, at least one. */
        fun blocks(size: Long): Long = maxOf(1L, (size + 4095) / 4096) * 4096
    }
}
