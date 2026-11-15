package nz.waveformlabs.moshpoint.server

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.withContext
import org.slf4j.LoggerFactory
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/** The four kinds of mailbox, each with its own write limit. */
enum class Kind { BOX, HELD, FILE, AVATAR }

/** Which limit turned a request away (sent back as `X-Moshpoint-Limit`). */
enum class Limit(val header: String, val retryAfterSec: Long) {
    CLIENT("client", 5), ADDRESS("address", 5), MAILBOX("mailbox", 10), BYTES("bytes", 60)
}

/** How a write went. */
enum class Outcome { OK, MAILBOX, BYTES, FULL }

/** All the relay's limits (see [LimitConfig]). In memory only. */
class Limits(c: LimitConfig, private val clock: () -> Long) {
    private fun rl(b: Bucket) = RateLimiter(b.burst, b.perSec, clock)
    private fun perHour(bytes: Long) = RateLimiter(bytes.toDouble(), bytes / 3600.0, clock)

    private val anonWrites = rl(c.anonWrites)
    private val anonReads = rl(c.anonReads)
    private val tokenWrites = rl(c.tokenWrites)
    private val tokenReads = rl(c.tokenReads)
    private val tokenAddress = rl(c.tokenAddress)
    private val mailboxes = mapOf(Kind.BOX to rl(c.boxWrites), Kind.HELD to rl(c.heldWrites), Kind.FILE to rl(c.fileWrites), Kind.AVATAR to rl(c.avatarWrites))
    private val registrations = rl(c.registrations)
    private val anonRecordBytes = perHour(c.anonRecordBytesPerHour)
    private val tokenRecordBytes = perHour(c.tokenRecordBytesPerHour)
    private val anonUpload = perHour(c.anonUploadBytesPerHour)
    private val tokenUpload = perHour(c.tokenUploadBytesPerHour)
    private val anonDownload = perHour(c.anonDownloadBytesPerHour)
    private val tokenDownload = perHour(c.tokenDownloadBytesPerHour)

    /** A request from [client]: null if it may go ahead, else the limit it hit. */
    fun request(client: Client, write: Boolean, cost: Double = 1.0): Limit? {
        val install = client.install ?: return if ((if (write) anonWrites else anonReads).allow(client.address, cost)) null else Limit.CLIENT
        if (!tokenAddress.allow(client.address, cost)) return Limit.ADDRESS
        return if ((if (write) tokenWrites else tokenReads).allow(install, cost)) null else Limit.CLIENT
    }

    fun refund(client: Client, write: Boolean, cost: Double) {
        val install = client.install
        if (install == null) (if (write) anonWrites else anonReads).refund(client.address, cost)
        else (if (write) tokenWrites else tokenReads).refund(install, cost)
    }

    /** One write to the mailbox [id] of [kind], whoever sends it. */
    fun mailbox(kind: Kind, id: String): Boolean = mailboxes.getValue(kind).allow(id)

    fun recordBytes(client: Client, n: Int): Boolean = bytes(client, anonRecordBytes, tokenRecordBytes, n.toLong())

    fun uploadBytes(client: Client, n: Long): Boolean = bytes(client, anonUpload, tokenUpload, n)

    fun downloadBytes(client: Client, n: Long): Boolean = bytes(client, anonDownload, tokenDownload, n)

    fun registration(client: Client): Boolean = registrations.allow(client.address)

    private fun bytes(client: Client, anon: RateLimiter, token: RateLimiter, n: Long): Boolean =
        client.install?.let { token.allow(it, n.toDouble()) } ?: anon.allow(client.address, n.toDouble())

    fun sweep() {
        (listOf(anonWrites, anonReads, tokenWrites, tokenReads, tokenAddress, registrations, anonRecordBytes, tokenRecordBytes, anonUpload, tokenUpload, anonDownload, tokenDownload) +
            mailboxes.values).forEach { it.sweep() }
    }
}

/**
 * The relay: its stores on the volume, its limits, and the sweeps that delete what has expired.
 * One per process. [close] flushes and closes the database (graceful shutdown).
 */
class Relay(val config: RelayConfig) : AutoCloseable {
    private val log = LoggerFactory.getLogger("nz.waveformlabs.moshpoint.server")
    val clock = config.clock
    val db = Db.open(File(config.dataDir, "relay.db"), config.sqliteSync)
    val box = MailboxStore(db, "box", config.boxTtlMs, config.boxMaxPerId, config.boxMaxBytes, clock)
    val held = MailboxStore(db, "held", config.heldTtlMs, config.heldMaxPerId, config.heldMaxBytes, clock)
    val files = FileStore(File(config.dataDir, "files"), config.fileTtlMs, config.fileMaxBytes, config.filesPerId, config.downloadsPerFile, clock)
    val avatars = AvatarStore(File(config.dataDir, "avatars"), config.avatarTtlMs, config.avatarMaxBytes, clock)
    val limits = Limits(config.limits, clock)
    val tokens = InstallTokens(config.tokenSecret ?: InstallTokens.secret({ null }, config.dataDir), clock)
    val uploads = Semaphore(config.maxUploads)
    private val closed = AtomicBoolean(false)

    fun store(kind: Kind): MailboxStore = if (kind == Kind.HELD) held else box

    /** The volume is nearly full: refuse writes ("try later") before SQLite or a file runs out of room. */
    fun lowOnDisk(): Boolean = config.dataDir.usableSpace.let { it in 1 until config.minFreeBytes }

    /** Limits for one record write; null if it may go ahead. */
    fun admitRecord(client: Client, kind: Kind, idHex: String, size: Int): Outcome? = when {
        !limits.mailbox(kind, idHex) -> Outcome.MAILBOX
        !limits.recordBytes(client, size) -> Outcome.BYTES
        lowOnDisk() -> Outcome.FULL
        else -> null
    }

    suspend fun putRecord(client: Client, kind: Kind, id: ByteArray, data: ByteArray): Outcome {
        admitRecord(client, kind, id.hex(), data.size)?.let { return it }
        return if (store(kind).put(id, data) == MailboxStore.Put.STORED) Outcome.OK else Outcome.FULL
    }

    /** Delete everything that has expired. */
    suspend fun sweep() = withContext(Dispatchers.IO) {
        box.sweep()
        held.sweep()
        files.sweep()
        avatars.sweep()
        limits.sweep()
    }

    /** Sweep every minute and log the totals (counts and sizes only) every ten. */
    fun startSweeps(scope: CoroutineScope): Job = scope.launch {
        var n = 0
        while (isActive) {
            delay(60_000)
            runCatching { sweep() }.onFailure { log.warn("Sweep failed: {}", it::class.simpleName) }
            if (n++ % 10 == 0) log.info(stats())
        }
    }

    /** Totals only: nothing that says who or which mailbox. */
    fun stats(): String {
        fun mb(b: Long) = "%.1f MB".format(b / 1048576.0)
        return "Relay: box ${box.records} records (${mb(box.bytes)}), chat ${held.records} (${mb(held.bytes)}), " +
            "moments ${files.count} (${mb(files.bytes)}), photos ${avatars.count} (${mb(avatars.bytes)}), " +
            "volume free ${mb(config.dataDir.usableSpace)}"
    }

    override fun close() {
        if (!closed.compareAndSet(false, true)) return
        db.close()
        log.info("Relay closed: database flushed")
    }

    companion object {
        /** Open the relay's stores in [config]'s data directory. */
        fun open(config: RelayConfig): Relay = Relay(config)
    }
}

/** Lower-case hex, as ids appear in URLs. */
fun ByteArray.hex(): String = joinToString("") { "%02x".format(it) }

private val ID_RE = Regex("^[0-9a-f]{32}$")

/** A mailbox id from a URL (32 hex characters) as 16 bytes, or null. */
fun idBytes(hex: String?): ByteArray? {
    val h = hex?.lowercase() ?: return null
    if (!ID_RE.matches(h)) return null
    return ByteArray(16) { ((Character.digit(h[it * 2], 16) shl 4) or Character.digit(h[it * 2 + 1], 16)).toByte() }
}
