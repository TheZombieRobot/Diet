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
    private fun perHour(amount: Long) = RateLimiter(amount.toDouble(), amount / 3600.0, clock)

    private val anonWrites = rl(c.anonWrites)
    private val anonReads = rl(c.anonReads)
    private val tokenWrites = rl(c.tokenWrites)
    private val tokenReads = rl(c.tokenReads)
    private val tokenAddress = rl(c.tokenAddress)
    private val mailboxes = mapOf(Kind.BOX to rl(c.boxWrites), Kind.HELD to rl(c.heldWrites), Kind.FILE to rl(c.fileWrites), Kind.AVATAR to rl(c.avatarWrites))
    private val registrations = rl(c.registrations)

    /** A budget per address that every client there shares, and a smaller one per install. */
    private class Budget(val address: RateLimiter, val install: RateLimiter)

    private val recordBytes = Budget(perHour(c.anonRecordBytesPerHour), perHour(c.tokenRecordBytesPerHour))
    private val uploadBytes = Budget(perHour(c.anonUploadBytesPerHour), perHour(c.tokenUploadBytesPerHour))
    private val uploadCount = Budget(rl(c.anonUploads), rl(c.tokenUploads))
    private val downloadBytes = Budget(perHour(c.addressDownloadBytesPerHour), perHour(c.tokenDownloadBytesPerHour))

    /** A request from [client]: null if it may go ahead, else the limit it hit. */
    fun request(client: Client, write: Boolean, cost: Double = 1.0): Limit? {
        val install = client.install ?: return if ((if (write) anonWrites else anonReads).allow(client.address, cost)) null else Limit.CLIENT
        // The install's own limit first: a client over it never touches what its address shares.
        val own = if (write) tokenWrites else tokenReads
        if (!own.allow(install, cost)) return Limit.CLIENT
        if (!tokenAddress.allow(client.address, cost)) {
            own.refund(install, cost)
            return Limit.ADDRESS
        }
        return null
    }

    fun refund(client: Client, write: Boolean, cost: Double) {
        val install = client.install
        if (install == null) {
            (if (write) anonWrites else anonReads).refund(client.address, cost)
        } else {
            (if (write) tokenWrites else tokenReads).refund(install, cost)
            tokenAddress.refund(client.address, cost)
        }
    }

    /** One write to the mailbox [id] of [kind], whoever sends it. */
    fun mailbox(kind: Kind, id: String): Boolean = mailboxes.getValue(kind).allow(id)

    fun refundMailbox(kind: Kind, id: String) = mailboxes.getValue(kind).refund(id, 1.0)

    fun recordBytes(client: Client, n: Int): Boolean = take(recordBytes, client, n.toDouble())

    /** One upload (a moment or a photo) of [n] bytes: counts against both the bytes and the number of uploads. */
    fun upload(client: Client, n: Long): Boolean {
        if (!take(uploadCount, client, 1.0)) return false
        if (take(uploadBytes, client, n.toDouble())) return true
        give(uploadCount, client, 1.0)
        return false
    }

    fun refundUpload(client: Client, n: Long) {
        give(uploadCount, client, 1.0)
        give(uploadBytes, client, n.toDouble())
    }

    fun downloadBytes(client: Client, n: Long): Boolean = take(downloadBytes, client, n.toDouble())

    fun registration(client: Client): Boolean = registrations.allow(client.address)

    /** Every client counts against its address; one with a token against its install as well. */
    private fun take(b: Budget, client: Client, n: Double): Boolean {
        val install = client.install
        if (install != null && !b.install.allow(install, n)) return false
        if (b.address.allow(client.address, n)) return true
        if (install != null) b.install.refund(install, n)
        return false
    }

    private fun give(b: Budget, client: Client, n: Double) {
        b.address.refund(client.address, n)
        client.install?.let { b.install.refund(it, n) }
    }

    fun sweep() {
        (listOf(anonWrites, anonReads, tokenWrites, tokenReads, tokenAddress, registrations) + mailboxes.values +
            listOf(recordBytes, uploadBytes, uploadCount, downloadBytes).flatMap { listOf(it.address, it.install) }).forEach { it.sweep() }
    }
}

/** How many of something each key (an address) has going at once, at most [max]. */
class PerKey(private val max: Int) {
    private val counts = java.util.concurrent.ConcurrentHashMap<String, Int>()

    fun enter(key: String): Boolean {
        var ok = false
        counts.compute(key) { _, n ->
            val now = n ?: 0
            ok = now < max
            if (ok) now + 1 else now.takeIf { it > 0 }
        }
        return ok
    }

    fun exit(key: String) {
        counts.computeIfPresent(key) { _, n -> (n - 1).takeIf { it > 0 } }
    }

    fun count(key: String): Int = counts[key] ?: 0
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
    val files = FileStore(File(config.dataDir, "files"), config.fileTtlMs, config.fileMaxBytes, config.filesPerId, config.downloadsPerFile, config.fileMaxCount, clock)
    val avatars = AvatarStore(File(config.dataDir, "avatars"), config.avatarTtlMs, config.avatarMaxBytes, config.avatarMaxCount, clock)
    val limits = Limits(config.limits, clock)
    val tokens = InstallTokens(config.tokenSecret ?: InstallTokens.secret({ null }, config.dataDir), clock)
    /** Uploads being received, everyone together and per address. */
    val uploads = Semaphore(config.maxUploads)
    val uploaders = PerKey(config.maxUploadsPerAddress)

    /** Requests in progress per address, and big answers being built and sent, everyone together. */
    val inFlight = PerKey(config.maxInFlightPerAddress)
    val answers = Semaphore(config.maxAnswers)

    /** Requests in progress, everyone together, and whether the relay is stopping (see [drain]). */
    val active = java.util.concurrent.atomic.AtomicInteger()

    @Volatile var draining = false
        private set

    /** Stop taking requests and wait (up to [maxMs]) for those in progress to finish. */
    fun drain(maxMs: Long) {
        draining = true
        val until = System.currentTimeMillis() + maxMs
        while (active.get() > 0 && System.currentTimeMillis() < until) Thread.sleep(50)
    }
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
