package nz.waveformlabs.moshpoint.server

/**
 * Rotating id -> the most recent sealed records posted under it, kept in SQLite on the volume,
 * so nothing accepted is lost to a restart, a deploy or a crash.
 *
 * The server never sees names, accounts, secrets or plain locations. Location ids rotate every
 * 5 minutes, so even the server can't follow one phone across the night. Everything expires
 * after [ttlMs] (the sweep deletes it from disk).
 *
 * The rules the app relies on (core Courier, HeldMailboxTest) are unchanged:
 *  - at most [maxPerId] records per id; past that the oldest go;
 *  - posting the same bytes again adds no record: the old copy goes and the new one is newest;
 *  - lookups return the newest first.
 *
 * Every record gets a sequence number, `seq`, that only ever grows. It is the cursor for
 * "what's new since I last looked" ([since]). Sequence numbers start from the clock (in
 * microseconds) when a store is created, so a store recreated empty never hands out a cursor
 * below one a phone kept from before.
 *
 * Besides the count per id, the whole store is capped at [maxBytes] (payload plus [ROW_OVERHEAD]
 * per record). A full store refuses new records ([Put.FULL], "try later") rather than dropping
 * ones it already accepted.
 */
class MailboxStore(
    private val db: Db,
    private val table: String,
    private val ttlMs: Long,
    val maxPerId: Int,
    private val maxBytes: Long,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    enum class Put { STORED, FULL }

    /** What's new under one id since a cursor, oldest first. Ask again from [next]; [more] = there's more now. */
    class Since(val records: List<ByteArray>, val next: Long, val more: Boolean)

    @Volatile var records = 0L
        private set

    @Volatile var bytes = 0L
        private set

    /** The highest sequence number handed out so far. */
    @Volatile var lastSeq = 0L
        private set

    init {
        require(table.matches(Regex("[a-z]+"))) { "table name" }
        db.blocking {
            exec("CREATE TABLE IF NOT EXISTS $table (seq INTEGER PRIMARY KEY AUTOINCREMENT, id BLOB NOT NULL, at INTEGER NOT NULL, data BLOB NOT NULL)")
            exec("CREATE INDEX IF NOT EXISTS ${table}_id ON $table(id, seq)")
            exec("CREATE INDEX IF NOT EXISTS ${table}_at ON $table(at)")
            if (longQuery("SELECT seq FROM sqlite_sequence WHERE name = ?", table) == null) {
                stmt("INSERT INTO sqlite_sequence(name, seq) VALUES (?, ?)").apply {
                    setString(1, table)
                    setLong(2, clock() * 1000)
                }.executeUpdate()
            }
            recount()
        }
    }

    suspend fun put(id: ByteArray, data: ByteArray): Put = db.run { guarded { tx { putHere(id, data) } } }

    /** Several records in one transaction (a batch). */
    suspend fun putAll(items: List<Pair<ByteArray, ByteArray>>): List<Put> =
        if (items.isEmpty()) emptyList() else db.run { guarded { tx { items.map { (id, data) -> putHere(id, data) } } } }

    /** Newest first, at most [limit], expired ones left out. */
    suspend fun get(id: ByteArray, limit: Int = maxPerId): List<ByteArray> = db.run { getHere(id, limit) }

    /** [get] for several ids in one trip to the database thread. */
    suspend fun getMany(ids: List<ByteArray>, limit: Int = maxPerId): List<List<ByteArray>> = db.run { ids.map { getHere(it, limit) } }

    /**
     * For each (id, cursor): the records that arrived after the cursor, oldest first. Cursor 0
     * means everything. Answers stop at [budgetBytes] in total (2 bytes of framing per record
     * counted): an id cut short says [Since.more] and its [Since.next] is the last record sent.
     * A cursor above anything this store has handed out (the store was replaced) counts as 0.
     */
    suspend fun since(requests: List<Pair<ByteArray, Long>>, budgetBytes: Int): List<Since> = db.run {
        var left = budgetBytes
        val top = lastSeq
        val oldest = clock() - ttlMs
        requests.map { (id, asked) ->
            val since = if (asked > top || asked < 0) 0L else asked
            if (left <= 0) return@map Since(emptyList(), since, more = true)
            val s = stmt("SELECT seq, data FROM $table WHERE id = ? AND seq > ? AND at >= ? ORDER BY seq ASC LIMIT ?")
            s.setBytes(1, id)
            s.setLong(2, since)
            s.setLong(3, oldest)
            s.setInt(4, maxPerId)
            val out = ArrayList<ByteArray>()
            var last = since
            var more = false
            s.executeQuery().use { rs ->
                while (rs.next()) {
                    val data = rs.getBytes(2)
                    if (data.size + 2 > left) {
                        more = true
                        break
                    }
                    out += data
                    left -= data.size + 2
                    last = rs.getLong(1)
                }
            }
            Since(out, if (more) last else top, more)
        }
    }

    /** Delete what has expired (in small transactions, so requests aren't held up). Returns how many went. */
    suspend fun sweep(): Int {
        var total = 0
        while (true) {
            val n = db.run { guarded { sweepChunk(clock(), SWEEP_CHUNK) } }
            total += n
            if (n < SWEEP_CHUNK) return total
        }
    }

    // ---- On the database thread ----

    private fun <T> Db.guarded(block: Db.() -> T): T = try {
        block()
    } catch (e: Throwable) {
        // A rolled-back transaction may have moved the counters: count again from the table.
        runCatching { recount() }
        throw e
    }

    private fun Db.recount() {
        lastSeq = longQuery("SELECT seq FROM sqlite_sequence WHERE name = ?", table) ?: 0L
        stmt("SELECT COUNT(*), COALESCE(SUM(length(data)), 0) FROM $table").executeQuery().use { rs ->
            rs.next()
            records = rs.getLong(1)
            bytes = rs.getLong(2) + records * ROW_OVERHEAD
        }
    }

    private fun Db.putHere(id: ByteArray, data: ByteArray): Put {
        val now = clock()
        val cost = data.size.toLong() + ROW_OVERHEAD
        if (bytes + cost > maxBytes) {
            sweepChunk(now, SWEEP_CHUNK)
            if (bytes + cost > maxBytes) return Put.FULL
        }
        // The same bytes again take one slot: the old copy goes and the new one is newest.
        val dup = stmt("DELETE FROM $table WHERE id = ? AND data = ?").run {
            setBytes(1, id)
            setBytes(2, data)
            executeUpdate()
        }
        records -= dup
        bytes -= dup * cost
        stmt("INSERT INTO $table(id, at, data) VALUES (?, ?, ?)").run {
            setBytes(1, id)
            setLong(2, now)
            setBytes(3, data)
            executeUpdate()
        }
        lastSeq = longQuery("SELECT last_insert_rowid()")!!
        records++
        bytes += cost
        // Past maxPerId the oldest go.
        val n = longQuery("SELECT COUNT(*) FROM $table WHERE id = ?", id)!!
        if (n > maxPerId) {
            val cutoff = longQuery("SELECT seq FROM $table WHERE id = ? ORDER BY seq DESC LIMIT 1 OFFSET ?", id, maxPerId)!!
            stmt("SELECT COUNT(*), COALESCE(SUM(length(data)), 0) FROM $table WHERE id = ? AND seq <= ?").run {
                setBytes(1, id)
                setLong(2, cutoff)
                executeQuery().use { rs ->
                    rs.next()
                    records -= rs.getLong(1)
                    bytes -= rs.getLong(2) + rs.getLong(1) * ROW_OVERHEAD
                }
            }
            stmt("DELETE FROM $table WHERE id = ? AND seq <= ?").run {
                setBytes(1, id)
                setLong(2, cutoff)
                executeUpdate()
            }
        }
        return Put.STORED
    }

    private fun Db.getHere(id: ByteArray, limit: Int): List<ByteArray> {
        val s = stmt("SELECT data FROM $table WHERE id = ? AND at >= ? ORDER BY seq DESC LIMIT ?")
        s.setBytes(1, id)
        s.setLong(2, clock() - ttlMs)
        s.setInt(3, limit)
        return s.executeQuery().use { rs -> buildList { while (rs.next()) add(rs.getBytes(1)) } }
    }

    private fun Db.sweepChunk(now: Long, limit: Int): Int = tx {
        val found = ArrayList<Long>()
        var gone = 0L
        stmt("SELECT seq, length(data) FROM $table WHERE at < ? ORDER BY at LIMIT ?").run {
            setLong(1, now - ttlMs)
            setInt(2, limit)
            executeQuery().use { rs ->
                while (rs.next()) {
                    found += rs.getLong(1)
                    gone += rs.getLong(2) + ROW_OVERHEAD
                }
            }
        }
        if (found.isNotEmpty()) {
            val del = stmt("DELETE FROM $table WHERE seq = ?")
            found.forEach {
                del.setLong(1, it)
                del.addBatch()
            }
            del.executeBatch()
            records -= found.size
            bytes -= gone
        }
        found.size
    }

    companion object {
        /** Bytes counted per record on top of its payload (row, index entries). */
        const val ROW_OVERHEAD = 64L
        private const val SWEEP_CHUNK = 2_000
    }
}
