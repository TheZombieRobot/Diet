package nz.waveformlabs.moshpoint.server

import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsBytes
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

/**
 * What "messages without signal" relies on from the crew-chat mailbox (see core Courier):
 *
 *  - it keeps 200 records per id and drops the oldest past that. A phone uploading for crew
 *    mates stops at 180 (Courier.HELD_LIMIT), so a backlog can never push out what's there;
 *  - posting the same bytes again adds no record. A message is sealed once and uploaded as it
 *    is, so its author and a crew mate carrying it take one slot between them;
 *  - a lookup returns the newest first. New crew keys are followed in the order they reached
 *    the relay, which the app gets by reading the list backwards.
 *
 * If one of these changes here, change the courier with it.
 */
class HeldMailboxTest {
    private val id = "00112233445566778899aabbccddeeff"
    private val idBytes = ByteArray(16) { (it * 0x11).toByte() }

    private fun record(i: Int) = ByteArray(40) { (i + it).toByte() } + byteArrayOf((i shr 8).toByte(), i.toByte())

    /** The records in a one-id heldlookup answer: `[count:1]` then `[length:2][bytes]` each. */
    private fun parse(body: ByteArray): List<ByteArray> {
        val out = ArrayList<ByteArray>()
        var at = 1
        repeat(body[0].toInt() and 0xFF) {
            val n = ((body[at].toInt() and 0xFF) shl 8) or (body[at + 1].toInt() and 0xFF)
            out += body.copyOfRange(at + 2, at + 2 + n)
            at += 2 + n
        }
        return out
    }

    @Test fun keeps200PerIdNewestFirstAndTheSameBytesTakeOneSlot() = testApplication {
        // The default stores, as deployed; only the rate limit is opened up so the test can post freely.
        application { moshpoint(MailboxStore(), putLimit = RateLimiter(capacity = 5_000.0, refillPerSec = 1_000.0)) }
        suspend fun put(i: Int) = assertEquals(HttpStatusCode.NoContent, client.put("/v1/held/$id") { setBody(record(i)) }.status)
        suspend fun records() = parse(client.post("/v1/heldlookup") { setBody(idBytes) }.bodyAsBytes())

        repeat(150) { put(it) }
        assertEquals(150, records().size)
        // The same bytes again (the author and a helper both uploading one message): no new records.
        repeat(20) { put(it) }
        assertEquals(150, records().size)
        // Newest first; a repeat counts as newest.
        assertContentEquals(record(19), records().first())

        // Past 200 the oldest go.
        repeat(60) { put(1_000 + it) }
        val all = records()
        assertEquals(200, all.size)
        assertContentEquals(record(1_059), all.first())
        assertEquals(0, all.count { it.contentEquals(record(20)) }, "the oldest was dropped")
        assertEquals(1, all.count { it.contentEquals(record(19)) }, "the repeated ones were newer, so they stayed")
    }
}
