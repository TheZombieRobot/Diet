package nz.waveformlabs.moshpoint.server

import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsBytes
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ServerTest {
    private val idHex = "00112233445566778899aabbccddeeff"
    private val idRaw = ByteArray(16) { (it * 0x11).toByte() }
    private val rec1 = ByteArray(29) { 1 }
    private val rec2 = ByteArray(29) { 2 }

    @Test fun putThenGet() = testApplication {
        application { moshpoint(MailboxStore()) }
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/box/$idHex").status)
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$idHex") { setBody(rec1) }.status)
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$idHex") { setBody(rec2) }.status)
        val body = client.get("/v1/box/$idHex").bodyAsBytes()
        // newest first: [29][rec2][29][rec1]
        assertContentEquals(byteArrayOf(29) + rec2 + byteArrayOf(29) + rec1, body)
    }

    @Test fun rejectsBadInput() = testApplication {
        application { moshpoint(MailboxStore()) }
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/box/nothex") { setBody(rec1) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/box/$idHex") { setBody(ByteArray(3)) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/box/$idHex") { setBody(ByteArray(500)) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.post("/v1/lookup") { setBody(ByteArray(15)) }.status)
    }

    @Test fun lookupMany() = testApplication {
        application { moshpoint(MailboxStore()) }
        client.put("/v1/box/$idHex") { setBody(rec1) }
        val unknown = ByteArray(16) { 7 }
        val body = client.post("/v1/lookup") { setBody(idRaw + unknown) }.bodyAsBytes()
        assertContentEquals(byteArrayOf(1, 29) + rec1 + byteArrayOf(0), body)
    }
}

class RateLimitTest {
    @Test fun bucketRefills() {
        var now = 0L
        val r = RateLimiter(capacity = 2.0, refillPerSec = 1.0, clock = { now })
        assertEquals(true, r.allow("a"))
        assertEquals(true, r.allow("a"))
        assertEquals(false, r.allow("a"))
        assertEquals(true, r.allow("b")) // separate client
        now = 1000
        assertEquals(true, r.allow("a"))
    }

    @Test fun serverReturns429() = testApplication {
        application { moshpoint(MailboxStore(), putLimit = RateLimiter(1.0, 0.0001)) }
        val id = "00112233445566778899aabbccddeeff"
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$id") { setBody(ByteArray(29)) }.status)
        assertEquals(HttpStatusCode.TooManyRequests, client.put("/v1/box/$id") { setBody(ByteArray(29)) }.status)
    }
}

class AvatarTest {
    @Test fun putGetAvatar() = testApplication {
        application { moshpoint(MailboxStore()) }
        val id = "aabbccddeeff00112233445566778899"
        val photo = ByteArray(9000) { 5 }
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/avatar/$id").status)
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/avatar/$id") { setBody(photo) }.status)
        assertContentEquals(photo, client.get("/v1/avatar/$id").bodyAsBytes())
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/avatar/$id") { setBody(ByteArray(60_000)) }.status)
    }

    @Test fun storeExpiresAndCaps() {
        var now = 0L
        val s = AvatarStore(ttlMs = 1000, maxTotalBytes = 2500, clock = { now })
        s.put("a", ByteArray(1000)); now = 1; s.put("b", ByteArray(1000)); now = 2; s.put("c", ByteArray(1000))
        assertEquals(null, s.get("a")) // oldest dropped to fit the cap
        now = 5000
        assertEquals(null, s.get("c"))
    }
}

class MailboxStoreTest {
    @Test fun expiresAndCaps() {
        var now = 0L
        val s = MailboxStore(ttlMs = 1000, maxPerId = 2, clock = { now })
        s.put("a", byteArrayOf(1)); s.put("a", byteArrayOf(2)); s.put("a", byteArrayOf(3))
        assertEquals(listOf(3, 2), s.get("a").map { it[0].toInt() })
        now = 2000
        assertEquals(0, s.get("a").size)
        assertEquals(0, s.size())
    }

    @Test fun duplicateMovesToFront() {
        val s = MailboxStore()
        s.put("a", byteArrayOf(1)); s.put("a", byteArrayOf(2)); s.put("a", byteArrayOf(1))
        assertEquals(listOf(1, 2), s.get("a").map { it[0].toInt() })
    }

    @Test fun filesPutListGet() = testApplication {
        val idHex = "00112233445566778899aabbccddeeff"
        val dir = kotlin.io.path.createTempDirectory("mp-files").toFile()
        application { moshpoint(MailboxStore(), files = FileStore(dir)) }
        val photo = ByteArray(5_000) { (it % 251).toByte() }
        val name = client.put("/v1/file/$idHex") { setBody(photo) }.bodyAsText()
        val listing = client.get("/v1/files/$idHex?since=0").bodyAsText()
        assertTrue(listing.lines().any { it.endsWith(" $name") }, listing)
        assertContentEquals(photo, client.get("/v1/file/$idHex/$name").bodyAsBytes())
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/file/$idHex/../etc").status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/file/$idHex") { setBody(ByteArray(3)) }.status)
        dir.deleteRecursively()
    }

    @Test fun heldChatTakesBiggerRecords() = testApplication {
        application { moshpoint(MailboxStore()) }
        val id = "00112233445566778899aabbccddeeff"
        val chat = ByteArray(240) { 7 }
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/held/$id") { setBody(chat) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/held/$id") { setBody(ByteArray(300)) }.status)
        val idBytes = ByteArray(16) { (it * 0x11).toByte() }
        val body = client.post("/v1/heldlookup") { setBody(idBytes) }.bodyAsBytes()
        assertEquals(1, body[0].toInt())
        assertEquals(240, body[1].toInt() and 0xFF)
        assertContentEquals(chat, body.copyOfRange(2, 242))
    }
}
