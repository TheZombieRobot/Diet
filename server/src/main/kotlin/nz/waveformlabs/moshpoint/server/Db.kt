package nz.waveformlabs.moshpoint.server

import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.withContext
import java.io.File
import java.sql.Connection
import java.sql.DriverManager
import java.sql.PreparedStatement
import java.util.concurrent.Callable
import java.util.concurrent.ExecutionException
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.TimeUnit

/**
 * The relay's SQLite database, owned by one thread. Every statement runs on that thread, one at
 * a time: no locks to get wrong, and request threads never wait on the disk themselves.
 *
 * WAL journal, `synchronous=NORMAL` by default: a committed write survives the process being
 * killed (the WAL is already in the kernel's hands); only a power cut or host failure can lose
 * the last moments of writes. `SQLITE_SYNC=FULL` fsyncs every commit instead.
 */
class Db private constructor(private val url: String, private val sync: String) : AutoCloseable {
    /** The database is closed (the relay is shutting down): the request is answered "try later". */
    class ClosedException : IllegalStateException("database closed")

    private val thread = Executors.newSingleThreadExecutor { r -> Thread(r, "relay-db").apply { isDaemon = true } }
    private val dispatcher = thread.asCoroutineDispatcher()
    private lateinit var conn: Connection
    private val statements = HashMap<String, PreparedStatement>()

    @Volatile private var closed = false

    init {
        blocking {
            conn = DriverManager.getConnection(url)
            exec("PRAGMA journal_mode=WAL")
            exec("PRAGMA synchronous=$sync")
            exec("PRAGMA busy_timeout=5000")
            // 32 MB of page cache, outside the Java heap.
            exec("PRAGMA cache_size=-32000")
            exec("PRAGMA temp_store=MEMORY")
        }
    }

    /** Run [block] on the database thread. */
    suspend fun <T> run(block: Db.() -> T): T {
        if (closed) throw ClosedException()
        return try {
            withContext(dispatcher) {
                if (closed) throw ClosedException()
                block()
            }
        } catch (e: RejectedExecutionException) {
            throw ClosedException()
        }
    }

    /** Run [block] on the database thread and wait (start-up, shutdown and tests). */
    fun <T> blocking(block: Db.() -> T): T = try {
        thread.submit(Callable { block() }).get()
    } catch (e: ExecutionException) {
        throw e.cause ?: e
    } catch (e: RejectedExecutionException) {
        throw ClosedException()
    }

    // ---- Only on the database thread ----

    fun stmt(sql: String): PreparedStatement = statements.getOrPut(sql) { conn.prepareStatement(sql) }

    fun exec(sql: String) {
        conn.createStatement().use { it.execute(sql) }
    }

    fun longQuery(sql: String, vararg args: Any): Long? {
        val s = stmt(sql)
        args.forEachIndexed { i, a -> s.setObject(i + 1, a) }
        s.executeQuery().use { rs -> return if (rs.next()) rs.getLong(1).takeUnless { rs.wasNull() } else null }
    }

    /** One transaction around [block]; rolled back if it throws. */
    fun <T> tx(block: () -> T): T {
        conn.autoCommit = false
        try {
            val r = block()
            conn.commit()
            return r
        } catch (e: Throwable) {
            runCatching { conn.rollback() }
            throw e
        } finally {
            conn.autoCommit = true
        }
    }

    /** Write everything out (WAL checkpoint) and close. Safe to call twice. */
    override fun close() {
        if (closed) return
        closed = true
        runCatching {
            thread.submit {
                runCatching { exec("PRAGMA wal_checkpoint(TRUNCATE)") }
                statements.values.forEach { runCatching { it.close() } }
                statements.clear()
                runCatching { conn.close() }
            }.get(20, TimeUnit.SECONDS)
        }
        thread.shutdown()
        thread.awaitTermination(5, TimeUnit.SECONDS)
    }

    companion object {
        fun open(file: File, sync: String = "NORMAL"): Db {
            file.parentFile?.mkdirs()
            return Db("jdbc:sqlite:${file.absolutePath}", sync)
        }

        /** A private in-memory database (unit tests). */
        fun memory(): Db = Db("jdbc:sqlite::memory:", "OFF")
    }
}
