package nz.waveformlabs.moshpoint.server

import java.io.File

/** A token bucket's size: [burst] at once, then [perSec]. */
data class Bucket(val burst: Double, val perSec: Double) {
    fun scaled(f: Double) = Bucket(burst * f, perSec * f)
}

/**
 * Who may do how much. Requests without an install token are limited per address (generously:
 * a whole venue can be behind one carrier address); requests with a valid token per install,
 * plus a high ceiling per address. Mailboxes have their own write limits whoever writes, and
 * every client has byte budgets per hour. All of it in memory, never stored.
 */
data class LimitConfig(
    // Without a token, per address (today's test builds): 5 to 10 times what the old server allowed.
    val anonWrites: Bucket = Bucket(600.0, 20.0),
    val anonReads: Bucket = Bucket(600.0, 10.0),
    // With a valid token, per install: about one request every 4 s sustained, bursts for catching up.
    val tokenWrites: Bucket = Bucket(120.0, 2.0),
    val tokenReads: Bucket = Bucket(120.0, 2.0),
    // Every tokened request from one address together (a festival behind a few carrier addresses).
    val tokenAddress: Bucket = Bucket(20_000.0, 500.0),
    // Per mailbox, whoever writes. Box: a location id hears helpers' crowd-relay uploads too.
    val boxWrites: Bucket = Bucket(600.0, 10.0),
    val heldWrites: Bucket = Bucket(120.0, 2.0),
    val fileWrites: Bucket = Bucket(100.0, 0.2),
    val avatarWrites: Bucket = Bucket(20.0, 1.0 / 60),
    // Asking for an install token, per address.
    val registrations: Bucket = Bucket(60.0, 1.0 / 30),
    // Bytes per hour.
    val anonRecordBytesPerHour: Long = 64L shl 20,
    val tokenRecordBytesPerHour: Long = 8L shl 20,
    val anonUploadBytesPerHour: Long = 2L shl 30,
    val tokenUploadBytesPerHour: Long = 300L shl 20,
    val anonDownloadBytesPerHour: Long = 10L shl 30,
    val tokenDownloadBytesPerHour: Long = 2L shl 30,
) {
    /** Every per-client limit times [f] (mailbox limits stay as they are). */
    fun scaled(f: Double): LimitConfig = if (f == 1.0) this else copy(
        anonWrites = anonWrites.scaled(f), anonReads = anonReads.scaled(f),
        tokenWrites = tokenWrites.scaled(f), tokenReads = tokenReads.scaled(f), tokenAddress = tokenAddress.scaled(f),
        anonRecordBytesPerHour = (anonRecordBytesPerHour * f).toLong(), tokenRecordBytesPerHour = (tokenRecordBytesPerHour * f).toLong(),
        anonUploadBytesPerHour = (anonUploadBytesPerHour * f).toLong(), tokenUploadBytesPerHour = (tokenUploadBytesPerHour * f).toLong(),
        anonDownloadBytesPerHour = (anonDownloadBytesPerHour * f).toLong(), tokenDownloadBytesPerHour = (tokenDownloadBytesPerHour * f).toLong(),
    )
}

/**
 * Everything the relay can be told. [fromEnv] reads the environment; the defaults suit one
 * Machine with 1–2 GB of memory and a 10–20 GB volume. Byte caps default to shares of the
 * volume's size, so extending the volume raises them at the next start.
 */
data class RelayConfig(
    val dataDir: File,
    val clock: () -> Long = System::currentTimeMillis,
    val boxTtlMs: Long = 15 * 60_000L,
    val heldTtlMs: Long = 72 * 3_600_000L,
    val fileTtlMs: Long = 24 * 3_600_000L,
    val avatarTtlMs: Long = 8 * 24 * 3_600_000L,
    /** Protocol: the app relies on these (HeldMailboxTest, core Courier). */
    val boxMaxPerId: Int = 64,
    val heldMaxPerId: Int = 200,
    val boxMaxBytes: Long = 512L shl 20,
    val heldMaxBytes: Long = 2L shl 30,
    val fileMaxBytes: Long = 8L shl 30,
    val avatarMaxBytes: Long = 2L shl 30,
    val filesPerId: Int = 500,
    val downloadsPerFile: Int = 500,
    /** Writes are refused ("try later") while the volume has less than this free. */
    val minFreeBytes: Long = 256L shl 20,
    val proxyTrust: ProxyTrust = ProxyTrust.NONE,
    val limits: LimitConfig = LimitConfig(),
    /** Secret for install tokens; null = made once and kept in [dataDir]. */
    val tokenSecret: ByteArray? = null,
    val sqliteSync: String = "NORMAL",
    /** Uploads received at the same time (each holds a temp file and a little memory). */
    val maxUploads: Int = 48,
) {
    companion object {
        fun fromEnv(env: (String) -> String? = System::getenv): RelayConfig {
            val dir = File(env("DATA_DIR")?.trim()?.ifBlank { null } ?: (System.getProperty("java.io.tmpdir") + "/moshpoint-relay"))
            dir.mkdirs()
            val disk = dir.totalSpace.takeIf { it > 0 } ?: (20L shl 30)
            fun mb(name: String, share: Double): Long = env(name)?.trim()?.toLongOrNull()?.let { it shl 20 } ?: (disk * share).toLong()
            return RelayConfig(
                dataDir = dir,
                // Shares of the volume: 3% + 12% for the database (counted with per-record overhead),
                // 45% moments, 15% photos; the rest is headroom for SQLite's own pages and the WAL.
                boxMaxBytes = mb("BOX_MAX_MB", 0.03),
                heldMaxBytes = mb("HELD_MAX_MB", 0.12),
                fileMaxBytes = mb("FILES_MAX_MB", 0.45),
                avatarMaxBytes = mb("AVATARS_MAX_MB", 0.15),
                minFreeBytes = maxOf(256L shl 20, (disk * 0.03).toLong()),
                proxyTrust = ProxyTrust.from(env),
                limits = LimitConfig().scaled(env("LIMIT_SCALE")?.toDoubleOrNull()?.takeIf { it > 0 } ?: 1.0),
                tokenSecret = InstallTokens.secret(env, dir),
                sqliteSync = if (env("SQLITE_SYNC").equals("FULL", ignoreCase = true)) "FULL" else "NORMAL",
            )
        }
    }
}
