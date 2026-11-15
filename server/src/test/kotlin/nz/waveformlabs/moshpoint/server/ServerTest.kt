package nz.waveformlabs.moshpoint.server

import io.ktor.client.request.get
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsBytes
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.runBlocking
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
        application { moshpoint(testRelay()) }
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/box/$idHex").status)
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$idHex") { setBody(rec1) }.status)
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$idHex") { setBody(rec2) }.status)
        val body = client.get("/v1/box/$idHex").bodyAsBytes()
        // newest first: [29][rec2][29][rec1]
        assertContentEquals(byteArrayOf(29) + rec2 + byteArrayOf(29) + rec1, body)
    }

    @Test fun rejectsBadInput() = testApplication {
        application { moshpoint(testRelay()) }
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/box/nothex") { setBody(rec1) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/box/$idHex") { setBody(ByteArray(3)) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/box/$idHex") { setBody(ByteArray(500)) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.post("/v1/lookup") { setBody(ByteArray(15)) }.status)
    }

    @Test fun lookupMany() = testApplication {
        application { moshpoint(testRelay()) }
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
        application { moshpoint(testRelay(limits = LimitConfig(anonWrites = Bucket(1.0, 0.0001)))) }
        val id = "00112233445566778899aabbccddeeff"
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$id") { setBody(ByteArray(29)) }.status)
        assertEquals(HttpStatusCode.TooManyRequests, client.put("/v1/box/$id") { setBody(ByteArray(29)) }.status)
    }
}

class AvatarTest {
    @Test fun putGetAvatar() = testApplication {
        application { moshpoint(testRelay()) }
        val id = "aabbccddeeff00112233445566778899"
        val photo = ByteArray(9000) { 5 }
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/avatar/$id").status)
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/avatar/$id") { setBody(photo) }.status)
        assertContentEquals(photo, client.get("/v1/avatar/$id").bodyAsBytes())
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/avatar/$id") { setBody(ByteArray(60_000)) }.status)
    }

    @Test fun storeExpiresAndCaps() {
        var now = 0L
        val dir = tempDataDir()
        // Room for two photos: each takes a 4 KB block on disk, whatever its size.
        val s = AvatarStore(dir, ttlMs = 1000, maxBytes = 10_000, clock = { now })
        assertTrue(s.put("a", ByteArray(1000))); now = 1; assertTrue(s.put("b", ByteArray(1000)))
        now = 2
        assertEquals(false, s.put("c", ByteArray(1000))) // full: "try later", and nothing accepted is dropped
        assertTrue(s.put("a", ByteArray(900))) // replacing a photo frees its old room
        assertEquals(900L, s.open("a")!!.size)
        assertTrue(s.open("b") != null)
        now = 5000
        assertEquals(null, s.open("b"))
        assertEquals(2, s.sweep())
        assertEquals(0, dir.listFiles()!!.count { it.isFile })
        assertEquals(0L, s.bytes)
    }
}

class MailboxStoreTest {
    private fun id(s: String) = s.toByteArray().copyOf(16)

    @Test fun expiresAndCaps() = runBlocking<Unit> {
        var now = 0L
        val s = MailboxStore(Db.memory(), "box", ttlMs = 1000, maxPerId = 2, maxBytes = 1L shl 20, clock = { now })
        s.put(id("a"), byteArrayOf(1)); s.put(id("a"), byteArrayOf(2)); s.put(id("a"), byteArrayOf(3))
        assertEquals(listOf(3, 2), s.get(id("a")).map { it[0].toInt() })
        now = 2000
        assertEquals(0, s.get(id("a")).size)
        s.sweep()
        assertEquals(0L, s.records)
        assertEquals(0L, s.bytes)
    }

    @Test fun duplicateMovesToFront() = runBlocking<Unit> {
        val s = MailboxStore(Db.memory(), "box", ttlMs = 60_000, maxPerId = 64, maxBytes = 1L shl 20)
        s.put(id("a"), byteArrayOf(1)); s.put(id("a"), byteArrayOf(2)); s.put(id("a"), byteArrayOf(1))
        assertEquals(listOf(1, 2), s.get(id("a")).map { it[0].toInt() })
        assertEquals(2L, s.records)
    }

    @Test fun filesPutListGet() = testApplication {
        val idHex = "00112233445566778899aabbccddeeff"
        val dir = tempDataDir()
        application { moshpoint(testRelay(dir)) }
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
        application { moshpoint(testRelay()) }
        val id = "00112233445566778899aabbccddeeff"
        val chat = ByteArray(2_900) { 7 }
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/held/$id") { setBody(chat) }.status)
        assertEquals(HttpStatusCode.BadRequest, client.put("/v1/held/$id") { setBody(ByteArray(5_000)) }.status)
        val idBytes = ByteArray(16) { (it * 0x11).toByte() }
        val body = client.post("/v1/heldlookup") { setBody(idBytes) }.bodyAsBytes()
        assertEquals(1, body[0].toInt())
        assertEquals(2_900, ((body[1].toInt() and 0xFF) shl 8) or (body[2].toInt() and 0xFF))
        assertContentEquals(chat, body.copyOfRange(3, 2_903))
    }

    @Test fun gigSearchMergesSourcesAndKeepsKeysServerSide() = runBlocking<Unit> {
        val tm = """{"_embedded":{"events":[{"name":"Iron Maiden","dates":{"start":{"dateTime":"2099-03-01T08:00:00Z","localDate":"2099-03-01","localTime":"20:00:00"}},
            "_embedded":{"venues":[{"name":"Spark Arena","city":{"name":"Auckland"},"country":{"countryCode":"NZ"},"location":{"latitude":"-36.85","longitude":"174.77"}}]}}]}}"""
        val bit = """[{"datetime":"2099-03-01T20:00:00","title":"","artist":{"name":"Iron Maiden"},"venue":{"name":"Spark Arena","city":"Auckland","country":"New Zealand","latitude":"-36.85","longitude":"174.77"}},
            {"datetime":"2099-05-10T20:00:00","title":"","artist":{"name":"Iron Maiden"},"venue":{"name":"O2","city":"London","country":"United Kingdom"}}]"""
        val urls = mutableListOf<String>()
        val s = GigSearch(
            env = { mapOf("TICKETMASTER_KEY" to "tm-secret", "BANDSINTOWN_APP_ID" to "bit-id")[it] },
            fetch = { url -> urls += url; if (url.contains("ticketmaster")) tm else bit },
            clock = { 1_700_000_000_000L },
        )
        val nz = s.search("Iron Maiden", "nz")
        assertEquals(1, nz.size) // the NZ show from both sources counts once; London is another country
        assertEquals("Spark Arena", nz[0].venue)
        assertTrue(urls.any { it.contains("countryCode=NZ") })
        val anywhere = s.search("iron maiden", null)
        assertTrue(anywhere.size >= 2)
        assertTrue(s.toJson(anywhere).let { !it.contains("tm-secret") && !it.contains("bit-id") })
        assertEquals(listOf("ticketmaster", "bandsintown"), s.sources)
    }
}
