package nz.waveformlabs.moshpoint.server

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import io.ktor.utils.io.ByteChannel
import io.ktor.utils.io.writeFully
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Who gets limited, by what, and that a crowd behind one address still gets through. */
class LimitsTest {
    private val id = "00112233445566778899aabbccddeeff"
    private val record = ByteArray(29) { 1 }

    /** Two writes at once, then nothing for a long time. */
    private val tight = LimitConfig(anonWrites = Bucket(2.0, 0.0001), tokenWrites = Bucket(2.0, 0.0001))

    @Test fun onFlyTheClientIsFlyClientIpAndForwardedForIsIgnored() = testApplication {
        application { moshpoint(testRelay(limits = tight, trust = ProxyTrust.FLY)) }
        suspend fun put(fly: String, xff: String? = null) = client.put("/v1/box/$id") {
            header("Fly-Client-IP", fly)
            if (xff != null) header("X-Forwarded-For", xff)
            setBody(record)
        }.status
        assertEquals(HttpStatusCode.NoContent, put("203.0.113.7"))
        assertEquals(HttpStatusCode.NoContent, put("203.0.113.7"))
        // The same client can't dodge its limit by writing a fresh X-Forwarded-For each time.
        assertEquals(HttpStatusCode.TooManyRequests, put("203.0.113.7", xff = "198.51.100.1"))
        assertEquals(HttpStatusCode.TooManyRequests, put("203.0.113.7", xff = "198.51.100.2"))
        // Someone else is someone else.
        assertEquals(HttpStatusCode.NoContent, put("203.0.113.8"))
        // One IPv6 phone gets a /64: other addresses in it are the same client.
        assertEquals(HttpStatusCode.NoContent, put("2001:db8:1:2::10"))
        assertEquals(HttpStatusCode.NoContent, put("2001:db8:1:2::11"))
        assertEquals(HttpStatusCode.TooManyRequests, put("2001:db8:1:2:ffff::1"))
        assertEquals(HttpStatusCode.NoContent, put("2001:db8:1:3::1"))
    }

    @Test fun offFlyProxyHeadersAreNotBelieved() = testApplication {
        application { moshpoint(testRelay(limits = tight, trust = ProxyTrust.NONE)) }
        repeat(2) { i ->
            assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$id") { header("Fly-Client-IP", "203.0.113.$i"); setBody(record) }.status)
        }
        // Every request came from the same connection, whatever the headers claim.
        assertEquals(HttpStatusCode.TooManyRequests, client.put("/v1/box/$id") { header("Fly-Client-IP", "203.0.113.99"); setBody(record) }.status)
    }

    @Test fun addressKeys() {
        assertEquals("203.0.113.7", Addresses.key(" 203.0.113.7 "))
        assertEquals(Addresses.key("2001:db8:1:2::10"), Addresses.key("2001:0db8:0001:0002:ffff:ffff:ffff:ffff"))
        assertEquals("192.0.2.1", Addresses.key("::ffff:192.0.2.1"))
        // Names are never looked up; rubbish isn't an address.
        assertNull(Addresses.key("relay.example.org"))
        assertNull(Addresses.key("1.2.3.4, 5.6.7.8"))
        assertNull(Addresses.key(""))
        assertEquals(ProxyTrust.FLY, ProxyTrust.from { if (it == "FLY_APP_NAME") "moshpoint-relay" else null })
        assertEquals(ProxyTrust.NONE, ProxyTrust.from { null })
        assertEquals(ProxyTrust.NONE, ProxyTrust.from { mapOf("FLY_APP_NAME" to "x", "TRUST_PROXY" to "none")[it] })
    }

    @Test fun aWholeVenueBehindOneCarrierAddressStillWorks() = testApplication {
        // The default limits, as deployed. A minute at a venue: 300 phones of the current version
        // behind one carrier address, each posting its location every 15 s and looking its crew
        // up every 10 s; and 1,000 phones of the next version (install token, one batch a minute).
        var now = 1_700_000_000_000L
        val relay = testRelay(clock = { now }, trust = ProxyTrust.FLY)
        application { moshpoint(relay) }
        val tokens = (0 until 1_000).map { relay.tokens.issue() }
        var refused = 0
        var requests = 0
        for (second in 0 until 60) {
            for (phone in 0 until 300) {
                val box = "%032x".format(phone)
                if (second % 15 == phone % 15) {
                    requests++
                    if (client.put("/v1/box/$box") { header("Fly-Client-IP", "100.64.0.1"); setBody(record) }.status != HttpStatusCode.NoContent) refused++
                }
                if (second % 10 == phone % 10) {
                    requests++
                    if (client.get("/v1/box/$box") { header("Fly-Client-IP", "100.64.0.1") }.status == HttpStatusCode.TooManyRequests) refused++
                }
            }
            for (phone in tokens.indices) {
                if (second != phone % 60) continue
                requests++
                val batch = byteArrayOf(1, 2) + byteArrayOf(Batch.PUT_BOX.toByte(), 0, (16 + record.size).toByte()) + ByteArray(16) { phone.toByte() } + record +
                    byteArrayOf(Batch.GET_BOX.toByte(), 0, 24) + ByteArray(16) { phone.toByte() } + ByteArray(8)
                val r = client.post("/v1/batch") { header("Fly-Client-IP", "100.64.0.1"); header("X-Moshpoint-Token", tokens[phone]); setBody(batch) }
                if (r.status != HttpStatusCode.OK) refused++
            }
            now += 1_000
        }
        assertTrue(requests > 3_000)
        assertEquals(0, refused)
    }

    @Test fun aMailboxHasItsOwnLimitWhoeverWrites() = testApplication {
        val open = Bucket(10_000.0, 1_000.0)
        application { moshpoint(testRelay(limits = LimitConfig(anonWrites = open, heldWrites = Bucket(3.0, 0.0001)), trust = ProxyTrust.FLY)) }
        repeat(3) { i ->
            assertEquals(HttpStatusCode.NoContent, client.put("/v1/held/$id") { header("Fly-Client-IP", "198.51.100.$i"); setBody(ByteArray(40) { i.toByte() }) }.status)
        }
        val busy = client.put("/v1/held/$id") { header("Fly-Client-IP", "198.51.100.9"); setBody(ByteArray(40) { 9 }) }
        assertEquals(HttpStatusCode.TooManyRequests, busy.status)
        assertEquals("mailbox", busy.headers["X-Moshpoint-Limit"])
        assertNotNull(busy.headers["Retry-After"])
        // Another crew's mailbox is unaffected.
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/held/ffeeddccbbaa99887766554433221100") { setBody(ByteArray(40) { 1 }) }.status)
    }

    @Test fun byteBudgetsPerClient() = testApplication {
        val limits = LimitConfig(anonRecordBytesPerHour = 1_000, anonWrites = Bucket(10_000.0, 1_000.0), heldWrites = Bucket(10_000.0, 1_000.0))
        application { moshpoint(testRelay(limits = limits)) }
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/held/$id") { setBody(ByteArray(900) { 1 }) }.status)
        val over = client.put("/v1/held/$id") { setBody(ByteArray(200) { 2 }) }
        assertEquals(HttpStatusCode.TooManyRequests, over.status)
        assertEquals("bytes", over.headers["X-Moshpoint-Limit"])
    }

    @Test fun installTokensGiveEachPhoneItsOwnLimits() = testApplication {
        application { moshpoint(testRelay(limits = tight, trust = ProxyTrust.FLY)) }
        suspend fun token() = client.post("/v1/install") { header("Fly-Client-IP", "100.64.0.1") }.bodyAsText()
        val a = token()
        val b = token()
        assertEquals(44, a.length)
        assertTrue(a != b)
        suspend fun put(t: String?) = client.put("/v1/box/$id") {
            header("Fly-Client-IP", "100.64.0.1")
            if (t != null) header("X-Moshpoint-Token", t)
            setBody(record)
        }
        // Phone A uses up its own limit...
        repeat(2) { assertEquals(HttpStatusCode.NoContent, put(a).status) }
        assertEquals(HttpStatusCode.TooManyRequests, put(a).status)
        // ...which doesn't touch phone B or old phones (no token) behind the same address.
        repeat(2) { assertEquals(HttpStatusCode.NoContent, put(b).status) }
        repeat(2) { assertEquals(HttpStatusCode.NoContent, put(null).status) }
        // A token we didn't issue still works, with the address's limits, and the app is told to get a new one.
        val forged = put("A".repeat(44))
        assertEquals(HttpStatusCode.TooManyRequests, forged.status) // the address's two are used up
        assertEquals("invalid", forged.headers["X-Moshpoint-Token"])
    }

    @Test fun aTokenOverItsOwnLimitDoesNotUseUpItsAddress() = testApplication {
        val limits = LimitConfig(tokenWrites = Bucket(2.0, 0.0001), tokenAddress = Bucket(5.0, 0.0001))
        val relay = testRelay(limits = limits, trust = ProxyTrust.FLY)
        application { moshpoint(relay) }
        val a = relay.tokens.issue()
        val b = relay.tokens.issue()
        suspend fun put(t: String) = client.put("/v1/box/$id") { header("Fly-Client-IP", "100.64.0.1"); header("X-Moshpoint-Token", t); setBody(record) }
        repeat(2) { assertEquals(HttpStatusCode.NoContent, put(a).status) }
        repeat(20) { assertEquals("client", put(a).headers["X-Moshpoint-Limit"]) }
        // The address's shared 5 still has 3 left for everyone else there.
        repeat(2) { assertEquals(HttpStatusCode.NoContent, put(b).status) }
        val c = relay.tokens.issue()
        assertEquals(HttpStatusCode.NoContent, put(c).status)
        assertEquals("address", put(c).headers["X-Moshpoint-Limit"])
    }

    @Test fun refusedDownloadsDontUseUpAFile() = testApplication {
        var now = 1_700_000_000_000L
        // A budget of one 1,000-byte download an hour per address; each file can be fetched twice.
        val relay = Relay(testConfig(clock = { now }, limits = LimitConfig(addressDownloadBytesPerHour = 1_500)).copy(downloadsPerFile = 2))
        application { moshpoint(relay) }
        val name = client.put("/v1/file/$id") { setBody(ByteArray(1_000) { (it * 31 + 17).toByte() }) }.bodyAsText()
        assertEquals(HttpStatusCode.OK, client.get("/v1/file/$id/$name").status)
        repeat(5) { assertEquals(HttpStatusCode.TooManyRequests, client.get("/v1/file/$id/$name").status) }
        now += 3_600_000L
        // The refused tries didn't count: the second full download still works, then it's used up.
        assertEquals(HttpStatusCode.OK, client.get("/v1/file/$id/$name").status)
        now += 3_600_000L
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/file/$id/$name").status)
    }

    @Test fun aFailedUploadGivesBackItsSlot() = testApplication {
        val dir = tempDataDir()
        val relay = Relay(testConfig(dir).copy(maxUploads = 1))
        application { moshpoint(relay) }
        val sealed = ByteArray(1_000) { (it * 31 + 17).toByte() }
        // The temp folder vanishes (a full disk, a mistake): uploads fail...
        File(dir, "files/.tmp").deleteRecursively()
        repeat(3) { assertEquals(HttpStatusCode.ServiceUnavailable, client.put("/v1/file/$id") { setBody(sealed) }.status) }
        // ...and once it's back, the one upload slot is free again.
        File(dir, "files/.tmp").mkdirs()
        assertEquals(HttpStatusCode.OK, client.put("/v1/file/$id") { setBody(sealed) }.status)
    }

    @Test fun perKeyCounts() {
        val p = PerKey(2)
        assertTrue(p.enter("a"))
        assertTrue(p.enter("a"))
        assertEquals(false, p.enter("a"))
        assertTrue(p.enter("b"))
        p.exit("a")
        assertTrue(p.enter("a"))
        p.exit("a"); p.exit("a"); p.exit("b")
        assertEquals(0, p.count("a"))
        assertEquals(0, p.count("b"))
    }

    @Test fun tokensAreCheckedWithoutStorage() {
        val t = InstallTokens(ByteArray(32) { 1 })
        val token = t.issue()
        val install = t.verify(token)
        assertNotNull(install)
        assertEquals(24, install.length)
        assertNull(InstallTokens(ByteArray(32) { 2 }).verify(token)) // another secret
        val flipped = token.toCharArray().also { it[30] = if (it[30] == 'A') 'B' else 'A' }.concatToString()
        assertNull(t.verify(flipped))
        assertNull(t.verify(null))
        assertNull(t.verify("short"))
    }

    @Test fun theRelayIsNotFreeFileHosting() = testApplication {
        application { moshpoint(testRelay()) }
        val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) + ByteArray(5_000) { 7 }
        val mp4 = ByteArray(4) + "ftypisom".toByteArray() + ByteArray(5_000) { 7 }
        val html = "<!DOCTYPE html><html><body>hello</body></html>".toByteArray()
        val pdf = "%PDF-1.7\n".toByteArray() + ByteArray(5_000) { 7 }
        for (plain in listOf(jpeg, mp4, html, pdf)) {
            assertEquals(HttpStatusCode.BadRequest, client.put("/v1/file/$id") { setBody(plain) }.status)
            assertEquals(HttpStatusCode.BadRequest, client.put("/v1/avatar/$id") { setBody(plain.copyOf(minOf(plain.size, 40_000))) }.status)
        }
        // A sealed moment starts with the time and a random nonce: fine.
        val sealed = byteArrayOf(0x6A, 0xFA.toByte(), 0x32, 0x68) + ByteArray(5_000) { (it * 31 + 17).toByte() }
        val name = client.put("/v1/file/$id") { setBody(sealed) }.bodyAsText()
        assertTrue(name.matches(Regex("^[0-9]+-[0-9a-f]+$")), name)
    }

    @Test fun aFileCanOnlyBeDownloadedSoOften() = testApplication {
        val r = Relay(testConfig().copy(downloadsPerFile = 3))
        application { moshpoint(r) }
        val sealed = ByteArray(1_000) { (it * 31 + 17).toByte() }
        val name = client.put("/v1/file/$id") { setBody(sealed) }.bodyAsText()
        repeat(3) { assertEquals(HttpStatusCode.OK, client.get("/v1/file/$id/$name").status) }
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/file/$id/$name").status)
    }

    @Test fun logsHideIdsTokensAndAddresses() {
        val line = "PUT /v1/box/00112233445566778899aabbccddeeff from 203.0.113.7 and [2001:db8::1] token " +
            InstallTokens(ByteArray(32)).issue() + " install 0a1b2c3d4e5f60718293a4b5 at 12:30:05"
        val masked = LogPrivacy.mask(line)
        assertTrue("00112233" !in masked && "203.0.113.7" !in masked && "2001:db8" !in masked && "0a1b2c3d" !in masked, masked)
        assertTrue("12:30:05" in masked, masked)
        assertTrue("[id]" in masked && "[address]" in masked && "[token]" in masked, masked)
    }

    @Test fun logsHideTheGigSourcesApiKeys() {
        // Made-up keys, the length of the real ones (32 characters: too short for the token rule).
        val tm = "AbCdEfGhIjKlMnOpQrStUvWxYz012345" // secret-scan: allow (made up)
        val line = "GET https://app.ticketmaster.com/discovery/v2/events.json?apikey=$tm&keyword=iron failed; " +
            "https://api.seatgeek.com/2/events?client_id=Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp&q=x; " + // secret-scan: allow (made up)
            "https://rest.bandsintown.com/artists/x/events?app_id=moshpoint-relay-app-id-1234; Authorization: Bearer Ab12Cd34Ef56Gh78" // secret-scan: allow (made up)
        val masked = LogPrivacy.mask(line)
        assertTrue(tm !in masked && "Zz9Yy8" !in masked && "moshpoint-relay-app-id" !in masked && "Ab12Cd34" !in masked, masked)
        assertTrue("apikey=[secret]" in masked && "client_id=[secret]" in masked && "app_id=[secret]" in masked, masked)
        assertTrue("keyword=iron" in masked, masked)
    }
}

/** An upload that crawls is dropped (408, which the app retries), so a trickle can't hold a slot. */
class SlowUploadTest {
    @Test fun aCrawlingUploadIsDropped() = runBlocking<Unit> {
        val body = ByteChannel()
        val f = File.createTempFile("crawl", ".part").apply { deleteOnExit() }
        var now = 0L
        val writer = launch {
            body.writeFully(ByteArray(100) { 7 })
            body.flush()
            delay(100)
            now = 120_000 // two minutes pass with 110 bytes in all: far under 4 KB/s
            body.writeFully(ByteArray(10) { 1 })
            body.flush()
        }
        val r = runCatching { Disk.receive(body, f, 1_000_000, ByteArray(16)) { now } }
        writer.cancel()
        assertTrue(r.exceptionOrNull() is Disk.TooSlow, r.toString())
    }
}
