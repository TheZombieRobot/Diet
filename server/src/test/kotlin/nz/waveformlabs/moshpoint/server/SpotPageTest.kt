package nz.waveformlabs.moshpoint.server

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import org.json.JSONArray
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SpotPageTest {
    private val play = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99"

    @Test fun withNothingSetTheLinksOpenInTestBuilds() {
        val links = AppLinks.fromEnv { null }
        assertEquals(AppLinks.APP_ID, links.appId)
        assertEquals(listOf(AppLinks.DEBUG_CERT), links.certs)
    }

    @Test fun theOwnerListsTheCertificatesNotSecrets() {
        val env = mapOf("MOSHPOINT_APP_CERTS" to " ${play.lowercase()} , ${AppLinks.DEBUG_CERT}, not-a-cert, ${AppLinks.DEBUG_CERT}")
        val links = AppLinks.fromEnv { env[it] }
        assertEquals(listOf(play, AppLinks.DEBUG_CERT), links.certs, "upper case, checked, once each")
        assertEquals(AppLinks.APP_ID, AppLinks.fromEnv { if (it == "MOSHPOINT_APP_ID") "not a package" else null }.appId)
    }

    @Test fun theStatementAndroidReads() = testApplication {
        application { moshpoint(testRelay(), appLinks = AppLinks(AppLinks.APP_ID, listOf(play))) }
        val res = client.get("/.well-known/assetlinks.json")
        assertEquals(HttpStatusCode.OK, res.status)
        assertTrue(res.contentType()!!.match(ContentType.Application.Json))
        val statement = JSONArray(res.bodyAsText()).getJSONObject(0)
        assertEquals("delegate_permission/common.handle_all_urls", statement.getJSONArray("relation").getString(0))
        val target = statement.getJSONObject("target")
        assertEquals("android_app", target.getString("namespace"))
        assertEquals(AppLinks.APP_ID, target.getString("package_name"))
        assertEquals(play, target.getJSONArray("sha256_cert_fingerprints").getString(0))
    }

    @Test fun thePageOpensTheSpotInTheBrowserAndAsksNothingOfUs() = testApplication {
        application { moshpoint(testRelay(), appLinks = AppLinks.fromEnv { null }) }
        val page = client.get("/spot")
        assertEquals(HttpStatusCode.OK, page.status)
        assertTrue(page.contentType()!!.match(ContentType.Text.Html))
        assertEquals(SpotPage.SECURITY, page.headers["Content-Security-Policy"])
        assertEquals("no-referrer", page.headers["Referrer-Policy"])
        val html = page.bodyAsText()
        assertTrue("<script src=\"/spot.js\"></script>" in html)
        assertTrue("https://play.google.com/store/apps/details?id=${AppLinks.APP_ID}" in html, "Get Moshpoint")
        // Its only script is its own file (the policy allows nothing inline), and nothing loads from elsewhere.
        assertFalse(Regex("<script>").containsMatchIn(html))
        assertFalse(Regex("(src|href)=\"https?://(?!maps\\.google\\.com/|play\\.google\\.com/)").containsMatchIn(html))

        val script = client.get("/spot.js")
        assertEquals(HttpStatusCode.OK, script.status)
        assertTrue(script.contentType()!!.match(ContentType.Application.JavaScript))
        val js = script.bodyAsText()
        assertTrue("location.hash" in js && "location.replace" in js && "textContent" in js)
        assertFalse("innerHTML" in js || "fetch(" in js || "XMLHttpRequest" in js || "sendBeacon" in js, "never sends the spot anywhere but the map")
    }

    @Test fun aSpotLinksQueryIsJustThePage() = testApplication {
        application { moshpoint(testRelay(), appLinks = AppLinks.fromEnv { null }) }
        assertEquals(HttpStatusCode.OK, client.get("/spot?anything=1").status)
    }
}
