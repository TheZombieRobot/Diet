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
import java.io.File
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * What the relay has accepted is still there after it stops and starts again (a deploy, a crash,
 * a resize), and it is gone from disk once it has expired.
 */
class DurabilityTest {
    private val idHex = "00112233445566778899aabbccddeeff"
    private val idRaw = ByteArray(16) { (it * 0x11).toByte() }
    private val ping = ByteArray(40) { 3 }
    private val chat = ByteArray(1_500) { (it % 7 + 1).toByte() }
    private val photo = ByteArray(9_000) { (it % 13 + 1).toByte() }
    private val moment = ByteArray(70_000) { (it % 241 + 1).toByte() }

    @Test fun everythingAcceptedSurvivesARestart() {
        val dir = tempDataDir()
        var name = ""
        // First run: a ping, a chat line, a photo and a moment, as the current app sends them.
        testApplication {
            application { moshpoint(testRelay(dir)) }
            assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$idHex") { setBody(ping) }.status)
            assertEquals(HttpStatusCode.NoContent, client.put("/v1/held/$idHex") { setBody(chat) }.status)
            assertEquals(HttpStatusCode.NoContent, client.put("/v1/avatar/$idHex") { setBody(photo) }.status)
            name = client.put("/v1/file/$idHex") { setBody(moment) }.bodyAsText()
        }
        // The application stopped (as at a deploy): a new relay on the same volume has it all.
        testApplication {
            application { moshpoint(testRelay(dir)) }
            assertContentEquals(byteArrayOf(40) + ping, client.get("/v1/box/$idHex").bodyAsBytes())
            val held = client.post("/v1/heldlookup") { setBody(idRaw) }.bodyAsBytes()
            assertEquals(1, held[0].toInt())
            assertContentEquals(chat, held.copyOfRange(3, held.size))
            assertContentEquals(photo, client.get("/v1/avatar/$idHex").bodyAsBytes())
            assertTrue(client.get("/v1/files/$idHex?since=0").bodyAsText().endsWith(" $name"))
            assertContentEquals(moment, client.get("/v1/file/$idHex/$name").bodyAsBytes())
        }
    }

    @Test fun aCrashLosesNothingThatWasAnswered() = runBlocking<Unit> {
        // No close (as if the process were killed): SQLite's WAL already has every answered write.
        val dir = tempDataDir()
        val a = testRelay(dir)
        a.box.put(idRaw, ping)
        a.held.put(idRaw, chat)
        assertTrue(a.avatars.put(idHex, photo))
        val b = testRelay(dir)
        assertContentEquals(ping, b.box.get(idRaw).single())
        assertContentEquals(chat, b.held.get(idRaw).single())
        assertEquals(photo.size.toLong(), b.avatars.open(idHex)!!.size)
        // The cursor keeps counting up from where it was.
        val before = b.held.lastSeq
        b.held.put(idRaw, ByteArray(20) { 9 })
        assertTrue(b.held.lastSeq > before)
        a.close()
        b.close()
    }

    @Test fun anUploadCutOffByACrashIsNeverServed() {
        val dir = tempDataDir()
        testRelay(dir).close()
        // A half-written upload left in the temp folder, as a crash mid-upload leaves it.
        val half = File(File(dir, "files/.tmp"), "up-123.part").apply { writeBytes(ByteArray(1000)) }
        val r = testRelay(dir)
        assertTrue(!half.exists())
        assertEquals(0, r.files.count)
        r.close()
    }

    @Test fun eachKindExpiresOnTimeAndLeavesTheDisk() = runBlocking<Unit> {
        var now = 1_700_000_000_000L
        val dir = tempDataDir()
        val r = testRelay(dir, clock = { now })
        r.box.put(idRaw, ping)
        r.held.put(idRaw, chat)
        r.avatars.put(idHex, photo)
        val temp = r.files.tempFile().apply { writeBytes(moment) }
        r.files.commit(idHex, temp, moment.size.toLong())

        now += 14 * 60_000L // 14 min: everything still there
        r.sweep()
        assertEquals(1, r.box.get(idRaw).size)
        now += 2 * 60_000L // 16 min: the location box has gone
        r.sweep()
        assertEquals(0, r.box.get(idRaw).size)
        assertEquals(0L, r.box.records)
        assertEquals(1, r.held.get(idRaw).size)

        now += 23 * 3_600_000L // 23 h 16 min: moments still there
        r.sweep()
        assertEquals(1, r.files.count)
        now += 3_600_000L // over 24 h: moments gone, from the disk too
        r.sweep()
        assertEquals(0, r.files.count)
        assertTrue(File(dir, "files").listFiles()!!.none { it.name != ".tmp" })

        now += 48 * 3_600_000L // over 72 h: chat gone
        r.sweep()
        assertEquals(0, r.held.get(idRaw).size)
        assertEquals(0L, r.held.records)
        assertTrue(r.avatars.open(idHex) != null)
        now += 5 * 24 * 3_600_000L // over 8 days: the photo too
        r.sweep()
        assertEquals(null, r.avatars.open(idHex))
        assertTrue(File(dir, "avatars").listFiles()!!.none { it.isFile })
        r.close()
    }

    @Test fun storesAreCappedInBytesAndAFullStoreRefusesRatherThanForgets() = runBlocking<Unit> {
        val s = MailboxStore(Db.memory(), "held", ttlMs = 60_000, maxPerId = 200, maxBytes = 10_000)
        var stored = 0
        for (i in 0 until 100) {
            val id = ByteArray(16) { i.toByte() }
            if (s.put(id, ByteArray(1_000) { (i + 1).toByte() }) == MailboxStore.Put.STORED) stored++
        }
        // 1,000 bytes + 64 bytes' overhead each: 9 fit in 10,000.
        assertEquals(9, stored)
        assertTrue(s.bytes <= 10_000)
        // What was accepted is still there.
        assertEquals(1, s.get(ByteArray(16) { 0 }).size)
        assertEquals(MailboxStore.Put.FULL, s.put(ByteArray(16) { 0 }, ByteArray(500) { 5 }))
    }

    @Test fun fullStoreAnswersTryLaterOverHttp() = testApplication {
        // Two 100-byte records fit (100 + 64 bytes' overhead each), a third doesn't.
        val r = Relay(testConfig().copy(boxMaxBytes = 400))
        application { moshpoint(r) }
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$idHex") { setBody(ByteArray(100) { 1 }) }.status)
        assertEquals(HttpStatusCode.NoContent, client.put("/v1/box/$idHex") { setBody(ByteArray(100) { 2 }) }.status)
        // 503 is "no answer, try again" to the app (RelayClient), never "refused".
        assertEquals(HttpStatusCode.ServiceUnavailable, client.put("/v1/box/$idHex") { setBody(ByteArray(100) { 3 }) }.status)
    }
}
