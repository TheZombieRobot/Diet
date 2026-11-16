package nz.waveformlabs.moshpoint.server

import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import org.json.JSONArray
import org.json.JSONObject
import java.util.Base64
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Reports: stored, listed, deleted, kept 90 days, limited per phone, and only the owner reads them. */
class ReportTest {
    // A made-up admin token for tests only. secret-scan: allow
    private val admin = "test-admin-token-0123456789abcdef" // secret-scan: allow

    private fun relay(clock: () -> Long = System::currentTimeMillis, adminToken: String? = admin) =
        Relay(testConfig(clock = clock).copy(adminToken = adminToken))

    private val jpeg = byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()) + ByteArray(200) { 3 } + byteArrayOf(0xFF.toByte(), 0xD9.toByte())
    private val key = "02" + "ab".repeat(32)
    private val crew = "cd".repeat(32)

    private fun message(text: String = "you're dead tonight", reason: String = "violence") = JSONObject()
        .put("reason", reason).put("kind", "message").put("senderName", "Jo").put("senderKey", key)
        .put("crewHash", crew).put("text", text).put("postedSec", 1_700_000_000L).put("note", "  not ok  ")

    private fun photo() = JSONObject()
        .put("reason", "sexual").put("kind", "photo").put("senderName", "Jo").put("senderKey", key)
        .put("crewHash", crew).put("caption", "lol").put("images", JSONArray().put(Base64.getEncoder().encodeToString(jpeg)))

    @Test fun aReportIsStoredAndTheOwnerCanListAndDeleteIt() = testApplication {
        application { moshpoint(relay()) }
        val sent = client.post("/v1/report") { setBody(message().toString()) }
        assertEquals(HttpStatusCode.Created, sent.status)
        val id = JSONObject(sent.bodyAsText()).getString("id")
        assertTrue(ReportStore.ID.matches(id))
        assertEquals(HttpStatusCode.Created, client.post("/v1/report") { setBody(photo().toString()) }.status)

        val list = client.get("/v1/admin/reports") { header("Authorization", "Bearer $admin") }
        assertEquals(HttpStatusCode.OK, list.status)
        val reports = JSONArray(list.bodyAsText())
        assertEquals(2, reports.length())
        // Newest first: the photo.
        assertEquals("photo", reports.getJSONObject(0).getString("kind"))
        val m = reports.getJSONObject(1)
        assertEquals(id, m.getString("id"))
        assertEquals("violence", m.getString("reason"))
        assertEquals("you're dead tonight", m.getString("text"))
        assertEquals(key, m.getString("senderKey"))
        assertEquals(crew, m.getString("crewHash"))
        assertEquals("not ok", m.getString("note"))
        assertTrue(m.getLong("receivedSec") > 0)
        // Nothing about the reporter is kept.
        assertFalse(m.has("address") || m.has("install"))

        assertEquals(HttpStatusCode.NoContent, client.delete("/v1/admin/reports/$id") { header("Authorization", "Bearer $admin") }.status)
        assertEquals(HttpStatusCode.NotFound, client.delete("/v1/admin/reports/$id") { header("Authorization", "Bearer $admin") }.status)
        assertEquals(1, JSONArray(client.get("/v1/admin/reports") { header("Authorization", "Bearer $admin") }.bodyAsText()).length())
    }

    @Test fun aWrongOrMissingTokenIsRefusedAndNoTokenMeansNoAdminRoutes() = testApplication {
        application { moshpoint(relay()) }
        assertEquals(HttpStatusCode.Created, client.post("/v1/report") { setBody(message().toString()) }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/v1/admin/reports").status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/v1/admin/reports") { header("Authorization", "Bearer nope") }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/v1/admin/reports") { header("Authorization", admin) }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/v1/admin/reports") { header("Authorization", "Bearer ") }.status)
        assertEquals(HttpStatusCode.Unauthorized, client.delete("/v1/admin/reports/0000000000000-000000000000") { header("Authorization", "Bearer x$admin") }.status)
    }

    @Test fun withoutAnAdminTokenTheAdminRoutesAreOff() = testApplication {
        application { moshpoint(relay(adminToken = null)) }
        // Reports still arrive (the owner sets a token to read them).
        assertEquals(HttpStatusCode.Created, client.post("/v1/report") { setBody(message().toString()) }.status)
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/admin/reports") { header("Authorization", "Bearer $admin") }.status)
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/admin/reports") { header("Authorization", "Bearer ") }.status)
        assertEquals(HttpStatusCode.NotFound, client.delete("/v1/admin/reports/0000000000000-000000000000").status)
    }

    @Test fun reportsAreKeptNinetyDays() {
        var now = 1_800_000_000_000L
        val r = relay(clock = { now })
        val id = assertNotNull(r.reports.add(assertNotNull(ReportRules.parse(message().toString().toByteArray(), now / 1000))))
        now += 89L * 24 * 3_600_000
        assertEquals(0, r.reports.sweep())
        assertEquals(id, r.reports.list(10).single().getString("id"))
        now += 2L * 24 * 3_600_000
        assertEquals(1, r.reports.sweep())
        assertTrue(r.reports.list(10).isEmpty())
        r.close()
    }

    @Test fun eachPhoneCanOnlyReportSoOften() = testApplication {
        application { moshpoint(relay()) }
        // By address (no install token): 20 at once.
        repeat(20) { assertEquals(HttpStatusCode.Created, client.post("/v1/report") { setBody(message("m$it").toString()) }.status) }
        val refused = client.post("/v1/report") { setBody(message().toString()) }
        assertEquals(HttpStatusCode.TooManyRequests, refused.status)
        assertEquals("reports", refused.headers["X-Moshpoint-Limit"])
    }

    @Test fun anInstallIsLimitedOnItsOwn() {
        val limits = ReportLimits { 0L }
        val phone = Client("203.0.113.5", "install-a")
        repeat(5) { assertTrue(limits.allow(phone)) }
        assertFalse(limits.allow(phone))
        // Another install behind the same address still can.
        assertTrue(limits.allow(Client("203.0.113.5", "install-b")))
    }

    @Test fun theStoreHasACap() {
        val r = Relay(testConfig().copy(reportMaxCount = 2, adminToken = admin))
        val rep = assertNotNull(ReportRules.parse(message().toString().toByteArray(), 1_700_000_000L))
        assertNotNull(r.reports.add(rep))
        assertNotNull(r.reports.add(rep))
        assertNull(r.reports.add(rep))
        r.close()
    }

    @Test fun badReportsAreRefused() {
        val now = 1_800_000_000L
        fun bad(o: JSONObject) = assertNull(ReportRules.parse(o.toString().toByteArray(), now), o.toString())
        bad(message(reason = "rude"))
        bad(message().put("kind", "poem"))
        bad(message().put("senderKey", "zz"))
        bad(message().put("crewHash", "abc"))
        bad(message(text = " "))
        bad(message(text = "x".repeat(ReportRules.MAX_TEXT + 1)))
        bad(photo().put("images", JSONArray().put(Base64.getEncoder().encodeToString("not a jpeg".toByteArray()))))
        bad(photo().put("images", JSONArray()))
        bad(photo().put("images", JSONArray().apply { repeat(5) { put(Base64.getEncoder().encodeToString(jpeg)) } }))
        assertNull(ReportRules.parse("not json".toByteArray(), now))
        // A person needs no content; a key in capitals is kept in lower case.
        val person = assertNotNull(ReportRules.parse(JSONObject().put("reason", "spam").put("kind", "person").put("crewHash", crew).put("senderKey", key.uppercase()).toString().toByteArray(), now))
        assertEquals(key, person.getString("senderKey"))
        // A posted time far in the future isn't believed.
        assertEquals(0L, assertNotNull(ReportRules.parse(message().put("postedSec", now + 10 * 86_400).toString().toByteArray(), now)).getLong("postedSec"))
    }

    @Test fun deleteRefusesIdsThatArentIds() {
        val r = relay()
        assertFalse(r.reports.delete("../relay.db"))
        assertFalse(r.reports.delete(""))
        r.close()
    }

    @Test fun theAdminTokenComparesWhole() {
        val a = AdminAuth(admin)
        assertTrue(a.enabled)
        assertTrue(a.allows("Bearer $admin"))
        assertTrue(a.allows("bearer  $admin "))
        assertFalse(a.allows("Bearer ${admin.dropLast(1)}"))
        assertFalse(a.allows("Bearer ${admin}x"))
        assertFalse(a.allows(null))
        assertFalse(AdminAuth(null).enabled)
        assertFalse(AdminAuth("  ").allows("Bearer "))
    }
}
