package nz.waveformlabs.moshpoint.server

import io.ktor.client.HttpClient
import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsBytes
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** `POST /v1/batch` and `POST /v1/heldsince` (docs/RELAY_API.md), and how they sit beside the old endpoints. */
class BatchTest {
    private fun id(n: Int) = ByteArray(16) { (n * 16 + it).toByte() }
    private fun hex(b: ByteArray) = b.hex()
    private fun rec(n: Int, size: Int = 40) = ByteArray(size) { (n + it).toByte() }

    /** Builds a request: [version][count] then [type][length:2][payload] per op. */
    private class Req {
        val ops = ArrayList<ByteArray>()
        fun put(type: Int, id: ByteArray, data: ByteArray) = apply { ops += op(type, id + data) }
        fun get(type: Int, id: ByteArray, since: Long) = apply { ops += op(type, id + ByteBuffer.allocate(8).putLong(since).array()) }
        fun raw(type: Int, payload: ByteArray) = apply { ops += op(type, payload) }
        private fun op(type: Int, p: ByteArray) = byteArrayOf(type.toByte(), (p.size shr 8).toByte(), p.size.toByte()) + p
        fun bytes(): ByteArray = byteArrayOf(1, ops.size.toByte()) + ops.fold(ByteArray(0)) { a, b -> a + b }
    }

    /** One GET answer: status, next cursor, records oldest first. */
    private class Got(val status: Int, val next: Long, val records: List<ByteArray>)

    /** Reads an answer, given which ops were gets. */
    private fun parse(body: ByteArray, isGet: List<Boolean>): List<Any> {
        val b = ByteBuffer.wrap(body)
        assertEquals(1, b.get().toInt())
        assertEquals(isGet.size, b.get().toInt() and 0xFF)
        return isGet.map { get ->
            val status = b.get().toInt()
            if (!get || status == Batch.UNKNOWN || status == Batch.BAD) status
            else {
                val next = b.long
                val n = b.short.toInt() and 0xFFFF
                Got(status, next, List(n) { ByteArray(b.short.toInt() and 0xFFFF).also { r -> b.get(r) } })
            }
        }.also { assertEquals(0, b.remaining()) }
    }

    private suspend fun HttpClient.batch(r: Req, isGet: List<Boolean>): List<Any> {
        val res = post("/v1/batch") { setBody(r.bytes()) }
        assertEquals(HttpStatusCode.OK, res.status)
        return parse(res.bodyAsBytes(), isGet)
    }

    @Test fun putsAndGetsInOneRequest() = testApplication {
        application { moshpoint(testRelay()) }
        val out = client.batch(
            Req().put(Batch.PUT_BOX, id(1), rec(1)).put(Batch.PUT_BOX, id(1), rec(2)).put(Batch.PUT_HELD, id(2), rec(3, 3_000))
                .get(Batch.GET_BOX, id(1), 0).get(Batch.GET_HELD, id(2), 0).get(Batch.GET_BOX, id(9), 0),
            listOf(false, false, false, true, true, true),
        )
        assertEquals(listOf<Any>(0, 0, 0), out.take(3))
        val box = out[3] as Got
        assertEquals(Batch.OK, box.status)
        // Oldest first.
        assertContentEquals(rec(1), box.records[0])
        assertContentEquals(rec(2), box.records[1])
        assertContentEquals(rec(3, 3_000), (out[4] as Got).records.single())
        assertEquals(0, (out[5] as Got).records.size)
        // What a batch put is what the old endpoints see (newest first there), and the other way round.
        assertContentEquals(byteArrayOf(40) + rec(2) + byteArrayOf(40) + rec(1), client.get("/v1/box/${hex(id(1))}").bodyAsBytes())
        client.put("/v1/box/${hex(id(1))}") { setBody(rec(4)) }
        val again = client.batch(Req().get(Batch.GET_BOX, id(1), box.next), listOf(true))[0] as Got
        assertContentEquals(rec(4), again.records.single())
    }

    @Test fun aCursorReturnsOnlyWhatIsNew() = testApplication {
        application { moshpoint(testRelay(limits = LimitConfig(heldWrites = Bucket(10_000.0, 1_000.0)))) }
        val chat = id(5)
        repeat(150) { client.put("/v1/held/${hex(chat)}") { setBody(rec(it)) } }
        val first = client.batch(Req().get(Batch.GET_HELD, chat, 0), listOf(true))[0] as Got
        assertEquals(150, first.records.size)
        // Nothing new: nothing comes back, and the cursor stays usable.
        val quiet = client.batch(Req().get(Batch.GET_HELD, chat, first.next), listOf(true))[0] as Got
        assertEquals(0, quiet.records.size)
        assertEquals(Batch.OK, quiet.status)
        // Two new lines: just those two, in the order they arrived.
        client.put("/v1/held/${hex(chat)}") { setBody(rec(200)) }
        client.put("/v1/held/${hex(chat)}") { setBody(rec(201)) }
        val two = client.batch(Req().get(Batch.GET_HELD, chat, quiet.next), listOf(true))[0] as Got
        assertEquals(2, two.records.size)
        assertContentEquals(rec(200), two.records[0])
        assertContentEquals(rec(201), two.records[1])
        // The same with /v1/heldsince: [id][since] per mailbox.
        val res = client.post("/v1/heldsince") { setBody(chat + ByteBuffer.allocate(8).putLong(quiet.next).array()) }
        val got = parse(res.bodyAsBytes(), listOf(true))[0] as Got
        assertEquals(2, got.records.size)
        assertEquals(two.next, got.next)
        // A repeat of a record already there counts as arriving again (it moves to newest).
        client.put("/v1/held/${hex(chat)}") { setBody(rec(7)) }
        val repeat = client.batch(Req().get(Batch.GET_HELD, chat, two.next), listOf(true))[0] as Got
        assertContentEquals(rec(7), repeat.records.single())
        // A cursor from some other relay (bigger than anything this one handed out) means "start over".
        val stranger = client.batch(Req().get(Batch.GET_HELD, chat, Long.MAX_VALUE), listOf(true))[0] as Got
        assertEquals(152, stranger.records.size)
    }

    @Test fun aBigAnswerComesInPartsWithoutLosingAnything() = testApplication {
        val open = Bucket(10_000.0, 1_000.0)
        application { moshpoint(testRelay(limits = LimitConfig(anonWrites = open, heldWrites = open, anonRecordBytesPerHour = 1L shl 30))) }
        // 6 mailboxes of 200 lines of 3,900 bytes: 4.7 MB, more than one answer holds (1 MB).
        val ids = (0 until 6).map { id(20 + it) }
        ids.forEach { i -> repeat(200) { n -> client.put("/v1/held/${hex(i)}") { setBody(rec(n, 3_900)) } } }
        val cursors = LongArray(ids.size)
        val received = IntArray(ids.size)
        var rounds = 0
        while (true) {
            rounds++
            val req = Req().apply { ids.forEachIndexed { i, m -> get(Batch.GET_HELD, m, cursors[i]) } }
            val out = client.batch(req, ids.map { true }).map { it as Got }
            out.forEachIndexed { i, g ->
                received[i] += g.records.size
                cursors[i] = g.next
            }
            if (out.none { it.status == Batch.MORE }) break
            assertTrue(rounds < 20)
        }
        assertTrue(rounds >= 5, "rounds $rounds")
        assertEquals(List(ids.size) { 200 }, received.toList())
    }

    @Test fun eachPutSaysHowItWent() = testApplication {
        application { moshpoint(testRelay(limits = LimitConfig(boxWrites = Bucket(1.0, 0.0001)))) }
        val out = client.batch(
            Req().put(Batch.PUT_BOX, id(1), rec(1)).put(Batch.PUT_BOX, id(1), rec(2)).put(Batch.PUT_BOX, id(2), ByteArray(3))
                .raw(99, ByteArray(5)).put(Batch.PUT_HELD, id(3), rec(4)),
            listOf(false, false, false, false, false),
        )
        assertEquals(listOf<Any>(Batch.OK, Batch.MAILBOX, Batch.BAD, Batch.UNKNOWN, Batch.OK), out)
    }

    @Test fun malformedBatchesAreRefusedWhole() = testApplication {
        application { moshpoint(testRelay()) }
        for (bad in listOf(byteArrayOf(), byteArrayOf(2, 1), byteArrayOf(1, 0), byteArrayOf(1, 1, 3, 0, 24) + ByteArray(10), Req().get(3, id(1), 0).bytes() + byteArrayOf(0))) {
            assertEquals(HttpStatusCode.BadRequest, client.post("/v1/batch") { setBody(bad) }.status)
        }
        assertEquals(HttpStatusCode.PayloadTooLarge, client.post("/v1/batch") { setBody(ByteArray(Batch.MAX_BODY + 1)) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.post("/v1/heldsince") { setBody(ByteArray(23)) }.status)
    }
}

/**
 * The exact bytes every endpoint of the current test builds sends and gets back (RelayClient,
 * VenueLookup, GigSearch in the app). If one of these changes, phones in testers' hands break.
 */
class OldClientsTest {
    private val idHex = "0123456789abcdef0123456789abcdef"
    private val idRaw = ByteArray(16) { i -> idHex.substring(i * 2, i * 2 + 2).toInt(16).toByte() }

    @Test fun everyOldEndpointAnswersAsBefore() = testApplication {
        application { moshpoint(testRelay()) }
        assertEquals("ok", String(client.get("/healthz").bodyAsBytes()))
        // Location box: PUT 16..255 bytes -> 204; GET -> [len:1][bytes] newest first; 404 when empty.
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/box/$idHex").status)
        val a = ByteArray(29) { 1 }
        val b = ByteArray(255) { 2 }
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$idHex") { setBody(a) }.status)
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/${idHex.uppercase()}") { setBody(b) }.status)
        assertContentEquals(byteArrayOf(255.toByte()) + b + byteArrayOf(29) + a, client.get("/v1/box/$idHex").bodyAsBytes())
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/box/$idHex") { setBody(ByteArray(256)) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/box/$idHex") { setBody(ByteArray(15)) }.status)
        // Lookup: raw ids in -> per id [count:1]([len:1][bytes])*.
        assertContentEquals(
            byteArrayOf(2, 255.toByte()) + b + byteArrayOf(29) + a + byteArrayOf(0),
            client.post("/v1/lookup") { setBody(idRaw + ByteArray(16)) }.bodyAsBytes(),
        )
        assertEquals(HttpStatusCode.BadRequest, client.post("/v1/lookup") { setBody(ByteArray(65 * 16)) }.status)
        // Chat: PUT 16..4000 bytes; heldlookup -> per id [count:1]([len:2][bytes])* newest first.
        val c = ByteArray(4_000) { 3 }
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/held/$idHex") { setBody(c) }.status)
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/held/$idHex") { setBody(a) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/held/$idHex") { setBody(ByteArray(4_001)) }.status)
        assertContentEquals(
            byteArrayOf(2, 0, 29) + a + byteArrayOf(0x0F, 0xA0.toByte()) + c + byteArrayOf(0),
            client.post("/v1/heldlookup") { setBody(idRaw + ByteArray(16)) }.bodyAsBytes(),
        )
        // Photos: 28..49216 bytes.
        val photo = ByteArray(48 * 1024 + 64) { (it % 200 + 1).toByte() }
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/avatar/$idHex") { setBody(photo) }.status)
        assertContentEquals(photo, client.get("/v1/avatar/$idHex").bodyAsBytes())
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/avatar/$idHex") { setBody(ByteArray(27) { 1 }) }.status)
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/avatar/ffffffffffffffffffffffffffffffff").status)
        // Moments: PUT -> the name as text; list -> "<time> <name>" lines newest first; GET -> the bytes.
        val m1 = ByteArray(100) { (it + 1).toByte() }
        val name1 = String(client.put("/v1/file/$idHex") { setBody(m1) }.bodyAsBytes())
        assertTrue(name1.matches(Regex("^[0-9]+-[0-9a-f]+$")), name1)
        val listing = String(client.get("/v1/files/$idHex?since=0").bodyAsBytes())
        assertEquals("${name1.substringBefore('-')} $name1", listing)
        assertEquals("", String(client.get("/v1/files/$idHex?since=99999999999").bodyAsBytes()))
        assertContentEquals(m1, client.get("/v1/file/$idHex/$name1").bodyAsBytes())
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/file/$idHex/1-abc").status)
        assertEquals(HttpStatusCode.BadRequest, client.get("/v1/files/nothex").status)
        // Gig search with no sources configured: an empty list, as JSON.
        assertEquals("[]", String(client.get("/v1/gigs/search?q=iron%20maiden&country=NZ").bodyAsBytes()))
        assertEquals("[]", String(client.get("/v1/gigs/sources").bodyAsBytes()))
    }

    @Test fun aRestartedRelayStillAnswersOldLookupsInTheSameOrder() {
        val dir = tempDataDir()
        val recs = (1..5).map { n -> ByteArray(20 + n) { n.toByte() } }
        testApplication {
            application { moshpoint(testRelay(dir)) }
            recs.forEach { client.put("/v1/held/$idHex") { setBody(it) } }
        }
        testApplication {
            application { moshpoint(testRelay(dir)) }
            val out = ByteArrayOutputStream().apply {
                write(5)
                recs.reversed().forEach { write(0); write(it.size); write(it) }
            }.toByteArray()
            assertContentEquals(out, client.post("/v1/heldlookup") { setBody(idRaw) }.bodyAsBytes())
        }
    }
}
