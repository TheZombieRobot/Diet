package nz.waveformlabs.moshpoint.server

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * `POST /v1/batch`: several mailbox puts and gets in one request, so a phone can talk to the
 * relay about once a minute instead of every few seconds. `POST /v1/heldsince` is the same
 * answer for chat lookups alone. Wire format (all numbers big-endian), docs/RELAY_API.md:
 *
 * ```
 * request:  [version = 1][op count, 1..200]  then per op  [type:1][length:2][payload]
 *   1 PUT_BOX   payload = [id:16][record, 16..255 bytes]
 *   2 PUT_HELD  payload = [id:16][record, 16..4000 bytes]
 *   3 GET_BOX   payload = [id:16][since:8]   (since 0 = everything)
 *   4 GET_HELD  payload = [id:16][since:8]
 * answer:   [version = 1][op count]  then per op, in order:
 *   PUT  [status:1]
 *   GET  [status:1][next:8][count:2] then count x [length:2][record], oldest first (always the
 *        whole block, even for BAD)
 *   an op type this server doesn't know: [status = 6] only
 * ```
 *
 * Statuses: 0 OK, 1 MORE (the answer is full: ask again from `next`), 2 BAD (wrong size; it will
 * never work), 3 MAILBOX (that mailbox is busy), 4 BYTES (your byte budget), 5 FULL (the relay is
 * full), 6 UNKNOWN (op type not known here). 3 to 5 mean "try again later".
 */
object Batch {
    const val VERSION = 1
    const val PUT_BOX = 1
    const val PUT_HELD = 2
    const val GET_BOX = 3
    const val GET_HELD = 4

    const val OK = 0
    const val MORE = 1
    const val BAD = 2
    const val MAILBOX = 3
    const val BYTES = 4
    const val FULL = 5
    const val UNKNOWN = 6

    const val MAX_OPS = 200
    const val MAX_BODY = 512 * 1024

    /** Records in one answer at most (the rest come with MORE). */
    const val MAX_ANSWER = 512 * 1024

    const val MIN_RECORD = 16
    const val MAX_RECORD = 255
    const val MAX_HELD = 4_000

    sealed class Op {
        class Put(val kind: Kind, val id: ByteArray, val data: ByteArray) : Op()
        class Get(val kind: Kind, val id: ByteArray, val since: Long) : Op()
        /** The right type but the wrong size: answered BAD (a GET with a whole, empty get block). */
        class Bad(val get: Boolean) : Op()
        object Unknown : Op()
    }

    /** The ops in a request, or null if it isn't one. */
    fun parse(body: ByteArray): List<Op>? {
        if (body.size < 2 || body[0].toInt() != VERSION) return null
        val n = body[1].toInt() and 0xFF
        if (n < 1 || n > MAX_OPS) return null
        val b = ByteBuffer.wrap(body, 2, body.size - 2)
        val ops = ArrayList<Op>(n)
        repeat(n) {
            if (b.remaining() < 3) return null
            val type = b.get().toInt() and 0xFF
            val len = b.short.toInt() and 0xFFFF
            if (b.remaining() < len) return null
            val p = ByteArray(len).also { b.get(it) }
            ops += when (type) {
                PUT_BOX, PUT_HELD -> {
                    val held = type == PUT_HELD
                    val size = len - 16
                    if (len < 16 || size < MIN_RECORD || size > (if (held) MAX_HELD else MAX_RECORD)) Op.Bad(get = false)
                    else Op.Put(if (held) Kind.HELD else Kind.BOX, p.copyOfRange(0, 16), p.copyOfRange(16, len))
                }
                GET_BOX, GET_HELD -> if (len != 24) Op.Bad(get = true)
                else Op.Get(if (type == GET_HELD) Kind.HELD else Kind.BOX, p.copyOfRange(0, 16), ByteBuffer.wrap(p, 16, 8).long)
                else -> Op.Unknown
            }
        }
        if (b.hasRemaining()) return null
        return ops
    }

    /** `/v1/heldsince`: `[id:16][since:8]` per id, 1 to 64 of them. */
    fun parseHeldSince(body: ByteArray): List<Op>? {
        if (body.isEmpty() || body.size % 24 != 0 || body.size / 24 > 64) return null
        return (0 until body.size / 24).map { i ->
            Op.Get(Kind.HELD, body.copyOfRange(i * 24, i * 24 + 16), ByteBuffer.wrap(body, i * 24 + 16, 8).long)
        }
    }

    /** Run [ops] for [client] (whose request limit has already been charged) and build the answer. */
    suspend fun run(relay: Relay, client: Client, ops: List<Op>): ByteArray {
        val status = IntArray(ops.size)
        // Puts: limits per op, then one transaction per store, in the order sent.
        for (kind in listOf(Kind.BOX, Kind.HELD)) {
            val admitted = ArrayList<Int>()
            ops.forEachIndexed { i, op ->
                if (op !is Op.Put || op.kind != kind) return@forEachIndexed
                status[i] = when (relay.admitRecord(client, kind, op.id.hex(), op.data.size)) {
                    null -> OK.also { admitted += i }
                    Outcome.MAILBOX -> MAILBOX
                    Outcome.BYTES -> BYTES
                    else -> FULL
                }
            }
            val results = relay.store(kind).putAll(admitted.map { (ops[it] as Op.Put).let { p -> p.id to p.data } })
            admitted.forEachIndexed { j, i -> if (results[j] == MailboxStore.Put.FULL) status[i] = FULL }
        }
        // Gets: after the puts, so a phone sees its own records; one answer budget for all.
        var budget = MAX_ANSWER
        val answers = arrayOfNulls<MailboxStore.Since>(ops.size)
        for (kind in listOf(Kind.BOX, Kind.HELD)) {
            val idx = ops.indices.filter { (ops[it] as? Op.Get)?.kind == kind }
            if (idx.isEmpty()) continue
            val got = relay.store(kind).since(idx.map { (ops[it] as Op.Get).let { g -> g.id to g.since } }, budget)
            idx.forEachIndexed { j, i ->
                answers[i] = got[j]
                budget -= got[j].records.sumOf { it.size + 2 }
            }
        }
        val out = ByteArrayOutputStream()
        out.write(VERSION)
        out.write(ops.size)
        ops.forEachIndexed { i, op ->
            when (op) {
                is Op.Put -> out.write(status[i])
                is Op.Get -> writeGet(out, answers[i]!!)
                is Op.Bad -> if (op.get) writeGet(out, MailboxStore.Since(emptyList(), 0L, false), BAD) else out.write(BAD)
                Op.Unknown -> out.write(UNKNOWN)
            }
        }
        return out.toByteArray()
    }

    /** `/v1/heldsince` answer: the same blocks as a batch of GET_HELD ops. */
    suspend fun heldSince(relay: Relay, ops: List<Op>): ByteArray {
        val got = relay.held.since(ops.map { (it as Op.Get).let { g -> g.id to g.since } }, MAX_ANSWER)
        val out = ByteArrayOutputStream()
        out.write(VERSION)
        out.write(got.size)
        got.forEach { writeGet(out, it) }
        return out.toByteArray()
    }

    private fun writeGet(out: ByteArrayOutputStream, s: MailboxStore.Since, status: Int = if (s.more) MORE else OK) {
        out.write(status)
        out.write(ByteBuffer.allocate(10).putLong(s.next).putShort(s.records.size.toShort()).array())
        s.records.forEach {
            out.write(it.size shr 8)
            out.write(it.size and 0xFF)
            out.write(it)
        }
    }

    /**
     * What a batch costs against the client's request limits, on top of the one read charged
     * when it arrives: a write per eight puts (at least one if there are any) and a read per
     * eight gets.
     */
    fun costs(ops: List<Op>): Pair<Double, Double> {
        val puts = ops.count { it is Op.Put }
        val gets = ops.count { it is Op.Get }
        return (if (puts > 0) maxOf(1.0, puts / 8.0) else 0.0) to gets / 8.0
    }
}
