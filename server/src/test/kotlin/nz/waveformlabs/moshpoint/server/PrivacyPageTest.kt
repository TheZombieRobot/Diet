package nz.waveformlabs.moshpoint.server

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** The privacy policy page: built from docs/PRIVACY.md, the contact put in at runtime, and true to the relay's own settings. */
class PrivacyPageTest {
    private val source = File("../docs/PRIVACY.md").readText()

    @Test fun theRelayServesThePolicyWithTheOwnersContact() = testApplication {
        application { moshpoint(testRelay(), privacy = PrivacyPage("help@example.org")) }
        val res = client.get("/privacy")
        assertEquals(HttpStatusCode.OK, res.status)
        assertTrue(res.contentType()!!.match(ContentType.Text.Html))
        assertEquals(PrivacyPage.SECURITY, res.headers["Content-Security-Policy"])
        assertEquals("no-referrer", res.headers["Referrer-Policy"])
        val page = res.bodyAsText()
        assertTrue("<title>Moshpoint privacy policy</title>" in page)
        assertTrue("href=\"mailto:help@example.org\">help@example.org</a>" in page)
        assertFalse(PrivacyPage.PLACEHOLDER in page, "every placeholder filled in")
        // Nothing runs and nothing loads from anywhere else.
        assertFalse("<script" in page)
        assertFalse(Regex("<(img|link|iframe)\\b").containsMatchIn(page))
    }

    @Test fun withoutAContactThePlaceholderShows() = testApplication {
        application { moshpoint(testRelay(), privacy = PrivacyPage(null)) }
        val page = client.get("/privacy").bodyAsText()
        assertTrue(PrivacyPage.PLACEHOLDER in page)
        assertEquals(PrivacyPage.template(), page)
        assertEquals(PrivacyPage.template(), PrivacyPage("  ").html)
    }

    @Test fun theContactIsALinkOrPlainTextAndNeverMarkup() {
        val web = PrivacyPage("https://example.org/help").html
        assertTrue("href=\"https://example.org/help\">https://example.org/help</a>" in web)
        val words = PrivacyPage("Ask at the merch desk").html
        assertTrue("<span class=\"contact\">Ask at the merch desk</span>" in words)
        assertFalse("mailto:Ask" in words)
        val markup = PrivacyPage("<script>alert(1)</script>\"@x.y").html
        assertFalse("<script>" in markup)
        assertTrue("&lt;script&gt;" in markup)
        assertFalse(PrivacyPage.PLACEHOLDER in markup)
    }

    @Test fun thePageIsBuiltFromPrivacyMd() {
        // The exact build is checked in CI (python3 tools/privacy_page.py --check); here, that
        // the page the relay serves carries every heading and the date of the current policy.
        val page = PrivacyPage.template()
        val headings = Regex("^#{1,2} (.+)$", RegexOption.MULTILINE).findAll(source).map { it.groupValues[1].trim() }.toList()
        assertTrue(headings.size >= 10)
        headings.forEach { assertTrue(escape(it) in page, "heading \"$it\" is on the page") }
        val updated = Regex("Last updated: ([^.]+)\\.").find(source)!!.groupValues[1]
        assertTrue("Last updated: $updated." in page)
        assertTrue(PrivacyPage.PLACEHOLDER in source, "the policy's contact is the placeholder, filled in at runtime")
    }

    @Test fun thePolicySaysWhatTheRelayReallyKeeps() {
        // The retention table in PRIVACY.md is the relay's own settings, in words.
        val c = RelayConfig(dataDir = tempDataDir())
        assertEquals(15 * 60_000L, c.boxTtlMs)
        assertEquals(24 * 3_600_000L, c.fileTtlMs)
        assertEquals(72 * 3_600_000L, c.heldTtlMs)
        assertEquals(8 * 24 * 3_600_000L, c.avatarTtlMs)
        assertEquals(90L * 24 * 3_600_000L, c.reportTtlMs)
        for (row in listOf(
            "| Locations, floor readings, pings and the meet-up pin | 15 minutes |",
            "| Moments (photos and clips) | 24 hours |",
            "| Crew chat and private messages | 72 hours (3 days) |",
            "| Profile photos | 8 days |",
            "| Reports (the one thing it can read) | 90 days |",
        )) assertTrue(row in source, "PRIVACY.md says: $row")
        // And the things the brief asks it to cover are there.
        for (topic in listOf("No account", "18 and over", "Text my spot", "satellite", "Smart search", "Reporting", "Blocking", "Need help")) {
            assertTrue(topic in source, "PRIVACY.md covers $topic")
        }
    }

    private fun escape(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#x27;")
}
