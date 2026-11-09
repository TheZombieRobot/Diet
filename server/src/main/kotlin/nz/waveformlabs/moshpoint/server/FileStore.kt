package nz.waveformlabs.moshpoint.server

import java.io.File
import java.security.SecureRandom

/**
 * Sealed files (crew photos and clips, profile photos) on local disk, under a rotating id.
 * The server can't open them: they're encrypted on the phones with the crew's or owner's key.
 * Kept [ttlMs] (a night and the morning after), and the oldest go first past [maxBytes].
 */
class FileStore(
    private val dir: File = File(System.getenv("FILES_DIR") ?: "/tmp/moshpoint-files"),
    private val ttlMs: Long = 24 * 3600_000L,
    private val maxBytes: Long = 2L * 1024 * 1024 * 1024,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private val rnd = SecureRandom()

    init {
        dir.mkdirs()
    }

    /** Store [data] under [id] (32 hex chars). Returns the file's name. */
    @Synchronized
    fun put(id: String, data: ByteArray): String {
        val d = File(dir, id).apply { mkdirs() }
        val name = "${clock() / 1000}-${java.lang.Long.toHexString(rnd.nextLong() and Long.MAX_VALUE)}"
        File(d, name).writeBytes(data)
        trim()
        return name
    }

    /** (time s, name) of files under [id] newer than [sinceSec], newest first. */
    fun list(id: String, sinceSec: Long): List<Pair<Long, String>> {
        val now = clock()
        return File(dir, id).listFiles().orEmpty()
            .filter { now - it.lastModified() <= ttlMs }
            .mapNotNull { f -> f.name.substringBefore('-').toLongOrNull()?.let { it to f.name } }
            .filter { it.first >= sinceSec }
            .sortedByDescending { it.first }
    }

    fun get(id: String, name: String): ByteArray? {
        if (!NAME_RE.matches(name)) return null
        val f = File(File(dir, id), name)
        return if (f.exists() && clock() - f.lastModified() <= ttlMs) f.readBytes() else null
    }

    /** Drop expired files, then the oldest while over the size cap. */
    @Synchronized
    fun sweep() = trim()

    private fun trim() {
        val now = clock()
        val all = dir.listFiles().orEmpty().flatMap { it.listFiles().orEmpty().toList() }
        all.filter { now - it.lastModified() > ttlMs }.forEach { it.delete() }
        var live = all.filter { it.exists() }.sortedBy { it.lastModified() }
        var total = live.sumOf { it.length() }
        while (total > maxBytes && live.isNotEmpty()) {
            total -= live.first().length()
            live.first().delete()
            live = live.drop(1)
        }
        dir.listFiles().orEmpty().filter { it.isDirectory && it.list().isNullOrEmpty() }.forEach { it.delete() }
    }

    private companion object {
        val NAME_RE = Regex("^[0-9]+-[0-9a-f]+$")
    }
}
