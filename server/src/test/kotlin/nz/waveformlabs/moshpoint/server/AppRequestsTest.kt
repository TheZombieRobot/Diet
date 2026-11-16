package nz.waveformlabs.moshpoint.server

import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsBytes
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * The app's own requests to the new endpoints, sent to the real relay. `app-requests.txt` holds
 * bytes built by the app's code (core RelayWire and BatchPlan); core's AppRequestFixtureTest
 * checks the app still builds exactly those. (A fixture rather than a dependency on core: the
 * server's Docker build holds only `server/`.)
 */
class AppRequestsTest {
    private val requests: Map<String, ByteArray> = assertNotNull(javaClass.getResource("/app-requests.txt"), "app-requests.txt").readText()
        .lines().filter { it.isNotBlank() && !it.startsWith("#") }
        .associate { l -> l.substringBefore(' ') to l.substringAfter(' ').trim().chunked(2).map { it.toInt(16).toByte() }.toByteArray() }

    private class Got(val status: Int, val next: Long, val records: List<ByteArray>)

    private fun readGet(b: ByteBuffer): Got {
        val status = b.get().toInt() and 0xFF
        val next = b.long
        val n = b.short.toInt() and 0xFFFF
        return Got(status, next, List(n) { ByteArray(b.short.toInt() and 0xFFFF).also { r -> b.get(r) } })
    }

    @Test fun theAppsSyncBatchWorksOnTheRealRelay() = testApplication {
        application { moshpoint(testRelay()) }
        val body = assertNotNull(requests["batch"])
        // What the relay itself reads in it: the app's puts and gets, none malformed.
        val ops = assertNotNull(Batch.parse(body), "the relay can read the app's batch")
        assertTrue(ops.none { it is Batch.Op.Bad || it is Batch.Op.Unknown })
        val puts = ops.filterIsInstance<Batch.Op.Put>()
        val gets = ops.filterIsInstance<Batch.Op.Get>()
        assertEquals(5, puts.size)
        assertEquals(5, gets.size)
        assertTrue(gets.all { it.kind == Kind.BOX && it.since == 0L })
        // Each rotating id at most once (the app sent only the newest copy of its location).
        assertEquals(puts.size, puts.map { it.id.hex() }.toSet().size)

        val res = client.post("/v1/batch") { setBody(body) }
        assertEquals(HttpStatusCode.OK, res.status)
        val b = ByteBuffer.wrap(res.bodyAsBytes())
        assertEquals(1, b.get().toInt())
        assertEquals(ops.size, b.get().toInt() and 0xFF)
        val answers = ops.map { op -> if (op is Batch.Op.Get) readGet(b) else b.get().toInt() }
        assertEquals(0, b.remaining())
        assertEquals(List(puts.size) { Batch.OK }, answers.filterIsInstance<Int>(), "every put stored")

        // Each get sees what this same batch put there (puts run first), oldest first...
        val got = answers.filterIsInstance<Got>()
        gets.zip(got).forEach { (g, a) ->
            assertEquals(Batch.OK, a.status)
            val want = puts.filter { it.kind == Kind.BOX && it.id.contentEquals(g.id) }.map { it.data }
            assertEquals(want.size, a.records.size, "records under ${g.id.hex()}")
            want.zip(a.records).forEach { (w, r) -> assertContentEquals(w, r) }
        }
        // ...and, read backwards, exactly what /v1/lookup answers for the same ids: what the app's
        // sync hands the crew code in place of a lookup.
        val ids = gets.fold(ByteArray(0)) { acc, g -> acc + g.id }
        val lookup = client.post("/v1/lookup") { setBody(ids) }.bodyAsBytes()
        val fromBatch = ByteArrayOutputStream()
        got.forEach { a ->
            fromBatch.write(a.records.size)
            a.records.asReversed().forEach { r ->
                fromBatch.write(r.size)
                fromBatch.write(r)
            }
        }
        assertContentEquals(lookup, fromBatch.toByteArray())

        // The chat line went to the chat mailbox: the app's chat poll finds it there.
        val chat = puts.single { it.kind == Kind.HELD }
        val again = client.post("/v1/heldsince") { setBody(chat.id + ByteArray(8)) }.bodyAsBytes()
        val h = ByteBuffer.wrap(again)
        assertEquals(1, h.get().toInt())
        assertEquals(1, h.get().toInt())
        assertContentEquals(chat.data, readGet(h).records.single())
    }

    @Test fun theAppsChatPollWorksOnTheRealRelay() = testApplication {
        application { moshpoint(testRelay()) }
        val body = assertNotNull(requests["heldsince"])
        val asks = assertNotNull(Batch.parseHeldSince(body), "the relay can read the app's chat poll").map { it as Batch.Op.Get }
        assertEquals(2, asks.size)
        val res = client.post("/v1/heldsince") { setBody(body) }
        assertEquals(HttpStatusCode.OK, res.status)
        val b = ByteBuffer.wrap(res.bodyAsBytes())
        assertEquals(1, b.get().toInt())
        assertEquals(2, b.get().toInt())
        repeat(2) {
            val a = readGet(b)
            assertEquals(Batch.OK, a.status)
            assertEquals(0, a.records.size)
            assertTrue(a.next > 0, "a cursor to keep")
        }
        assertEquals(0, b.remaining())
    }
}
