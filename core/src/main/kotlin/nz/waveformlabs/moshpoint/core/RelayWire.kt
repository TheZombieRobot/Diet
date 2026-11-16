package nz.waveformlabs.moshpoint.core

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * The bytes of our relay's new endpoints, as the app sends and reads them (docs/RELAY_API.md
 * sections 8 and 9). All numbers big-endian; an id is 16 raw bytes. The relay's side is
 * `server/Batch.kt`; both are checked against the same fixture (RelayWireTest here,
 * AppRequestsTest in the server).
 */
object RelayWire {
    const val VERSION = 1

    // Op types (`POST /v1/batch`).
    const val PUT_BOX = 1
    const val PUT_HELD = 2
    const val GET_BOX = 3
    const val GET_HELD = 4

    // Statuses, per op or per get block.
    const val OK = 0
    /** A get: the answer filled up; ask again from `next`. */
    const val MORE = 1
    /** Wrong size: never retry the same bytes. */
    const val BAD = 2
    /** That mailbox is busy: retry it later. */
    const val MAILBOX = 3
    /** This client's record budget: retry later. */
    const val BYTES = 4
    /** The relay is full or low on disk: retry later. */
    const val FULL = 5
    /** This relay doesn't know that op type. */
    const val UNKNOWN = 6

    const val ID_SIZE = 16
    const val MAX_IDS = 64
    const val MAX_OPS = 200
    const val MAX_BODY = 512 * 1024
    const val MIN_RECORD = 16
    const val MAX_BOX_RECORD = 255
    const val MAX_HELD_RECORD = 4_000

    /** One mailbox's part of an answer: [records] oldest first; [next] the cursor to keep. */
    class Block(val status: Int, val next: Long, val records: List<ByteArray>)

    /** `POST /v1/heldsince` body: `[id:16][since:8]` per ask (1 to 64). */
    fun heldSince(asks: List<Pair<ByteArray, Long>>): ByteArray {
        require(asks.size in 1..MAX_IDS) { "1 to 64 asks" }
        val b = ByteBuffer.allocate(asks.size * 24)
        for ((id, since) in asks) {
            require(id.size == ID_SIZE) { "an id is 16 bytes" }
            b.put(id).putLong(since)
        }
        return b.array()
    }

    /** `POST /v1/heldsince` answer: `[version][count]` then [expected] get blocks. Null if it isn't one. */
    fun parseHeldSince(body: ByteArray, expected: Int): List<Block>? = runCatching {
        val b = ByteBuffer.wrap(body)
        if (b.get().toInt() != VERSION || (b.get().toInt() and 0xFF) != expected) return null
        val out = List(expected) { readBlock(b) ?: return null }
        if (b.hasRemaining()) null else out
    }.getOrNull()

    /** `[status:1][next:8][count:2]` then count × `[len:2][record]`. */
    private fun readBlock(b: ByteBuffer): Block? {
        val status = b.get().toInt() and 0xFF
        val next = b.long
        val count = b.short.toInt() and 0xFFFF
        val records = ArrayList<ByteArray>(count)
        repeat(count) {
            val len = b.short.toInt() and 0xFFFF
            if (len > b.remaining()) return null
            records += ByteArray(len).also { b.get(it) }
        }
        return Block(status, next, records)
    }

    /** One op of a `POST /v1/batch` request: its type and payload. */
    class Op(val type: Int, val payload: ByteArray) {
        val isGet: Boolean get() = type == GET_BOX || type == GET_HELD

        /** Bytes it takes in the request: `[type:1][length:2]` and the payload. */
        val size: Int get() = 3 + payload.size
    }

    /** `PUT_BOX` / `PUT_HELD`: `[id:16][record]`. */
    fun put(held: Boolean, id: ByteArray, record: ByteArray): Op {
        require(id.size == ID_SIZE) { "an id is 16 bytes" }
        return Op(if (held) PUT_HELD else PUT_BOX, id + record)
    }

    /** `GET_BOX` / `GET_HELD`: `[id:16][since:8]` (since 0 = everything). */
    fun get(held: Boolean, id: ByteArray, since: Long): Op {
        require(id.size == ID_SIZE) { "an id is 16 bytes" }
        return Op(if (held) GET_HELD else GET_BOX, ByteBuffer.allocate(24).put(id).putLong(since).array())
    }

    /** Bytes of a whole request of [ops]: `[version][count]` and each op. */
    fun batchSize(ops: List<Op>): Int = 2 + ops.sumOf { it.size }

    /** `POST /v1/batch` body: `[version = 1][op count]` then each op as `[type:1][length:2][payload]`. */
    fun batch(ops: List<Op>): ByteArray {
        require(ops.size in 1..MAX_OPS) { "1 to 200 ops" }
        val out = ByteArrayOutputStream(batchSize(ops))
        out.write(VERSION)
        out.write(ops.size)
        for (op in ops) {
            out.write(op.type)
            out.u16(op.payload.size)
            out.write(op.payload)
        }
        return out.toByteArray()
    }

    /** One op's part of the answer: a put's [status], or a get's [block] (null for a put, or a type the relay didn't know). */
    class Answer(val status: Int, val block: Block?)

    /**
     * `POST /v1/batch` answer, `[version][count]` then per op in the order sent: a put's status
     * byte, a get's whole block, or a lone 6 (UNKNOWN) for a type the relay doesn't know. Null
     * if it isn't one.
     */
    fun parseBatch(body: ByteArray, ops: List<Op>): List<Answer>? = runCatching {
        val b = ByteBuffer.wrap(body)
        if (b.get().toInt() != VERSION || (b.get().toInt() and 0xFF) != ops.size) return null
        val out = ops.map { op ->
            if (!op.isGet) {
                Answer(b.get().toInt() and 0xFF, null)
            } else {
                // A get always answers its whole block, but a relay that didn't know the type sends 6
                // alone. (Peeked with an absolute get: Buffer.mark/reset return types differ on old Androids.)
                if ((b.get(b.position()).toInt() and 0xFF) == UNKNOWN) {
                    b.get()
                    Answer(UNKNOWN, null)
                } else {
                    val block = readBlock(b) ?: return null
                    Answer(block.status, block)
                }
            }
        }
        if (b.hasRemaining()) null else out
    }.getOrNull()

    private fun ByteArrayOutputStream.u16(v: Int) {
        write(v shr 8 and 0xFF)
        write(v and 0xFF)
    }
}
