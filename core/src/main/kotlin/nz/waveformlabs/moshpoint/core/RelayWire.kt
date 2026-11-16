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

    internal fun ByteArrayOutputStream.u16(v: Int) {
        write(v shr 8 and 0xFF)
        write(v and 0xFF)
    }
}
