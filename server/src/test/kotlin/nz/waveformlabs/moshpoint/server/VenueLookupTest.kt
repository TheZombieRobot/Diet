package nz.waveformlabs.moshpoint.server

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import org.json.JSONObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue

/** The venue lookup keeps to Nominatim's usage policy: one a second, identified, cached, switchable. */
class VenueLookupTest {
    private val spark = """[{"lat":"-36.8468","lon":"174.7766","display_name":"Spark Arena, Mahuhu Crescent, Auckland"}]"""

    /** A pretend search service and clock. Sleeping moves the clock, as it would. */
    private class World(var answer: (String) -> VenueLookup.Fetched) {
        var now = 1_000_000L
        val asked = ArrayList<Pair<Long, String>>() // (when, url)
        val agents = ArrayList<String>()
        val env = HashMap<String, String>()
        val lookup = VenueLookup(
            env = { env[it] },
            fetch = { url, ua ->
                asked += now to url
                agents += ua
                answer(url)
            },
            clock = { now },
            sleep = { now += it },
        )
    }

    private fun ok(body: String) = VenueLookup.Fetched(200, body)

    @Test fun findsAVenueAndSaysWhoIsAsking() {
        val w = World { ok(spark) }
        val r = assertIs<VenueLookup.Result.Found>(w.lookup.find("  Spark   Arena ", "173,-35,176,-38"))
        assertEquals(-36.8468, r.place.lat, 1e-9)
        assertEquals(174.7766, r.place.lon, 1e-9)
        val url = w.asked.single().second
        assertTrue(url.startsWith("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=Spark+Arena"), url)
        // The rough box is a preference, not a limit.
        assertTrue(url.endsWith("&viewbox=173%2C-35%2C176%2C-38&bounded=0"), url)
        // Nominatim asks every app to identify itself: never a stock User-Agent.
        assertTrue(w.agents.single().startsWith("Moshpoint-relay/"))
        w.env["MOSHPOINT_CONTACT"] = "ops@example.org"
        w.lookup.find("Powerstation", null)
        assertTrue("ops@example.org" in w.agents.last())
    }

    @Test fun neverAsksTwiceForTheSameVenue() {
        val w = World { ok(spark) }
        repeat(5) { assertIs<VenueLookup.Result.Found>(w.lookup.find("Spark Arena", null)) }
        assertIs<VenueLookup.Result.Found>(w.lookup.find("spark arena", null)) // same venue, typed differently
        assertEquals(1, w.asked.size)
        // "No such place" is remembered too, for a day.
        val none = World { ok("[]") }
        repeat(3) { assertEquals(VenueLookup.Result.NotFound, none.lookup.find("Nowhere Hall", null)) }
        assertEquals(1, none.asked.size)
        none.now += 25L * 3600 * 1000
        none.lookup.find("Nowhere Hall", null)
        assertEquals(2, none.asked.size)
    }

    @Test fun atMostOneQuestionASecondForEveryoneTogether() {
        val w = World { ok(spark) }
        // Four phones ask about four venues in the same instant.
        val results = listOf("Venue one", "Venue two", "Venue three", "Venue four").map { w.lookup.find(it, null) }
        assertTrue(results.all { it is VenueLookup.Result.Found })
        val times = w.asked.map { it.first }
        assertEquals(4, times.size)
        assertTrue(times.zipWithNext().all { (a, b) -> b - a >= 1_000 }, "asked at $times")
    }

    @Test fun aLongQueueIsToldToComeBackRatherThanHurried() {
        // Phones arrive faster than one a second (the pretend clock doesn't move while "waiting").
        val now = 5_000_000L
        var asked = 0
        val lookup = VenueLookup(env = { null }, fetch = { _, _ -> asked++; VenueLookup.Fetched(200, spark) }, clock = { now }, sleep = { })
        val results = (1..12).map { lookup.find("Venue number $it", null) }
        val served = results.count { it is VenueLookup.Result.Found }
        assertEquals(served, asked)
        assertTrue(served in 3..5, "served $served") // about four seconds' worth
        assertTrue(results.drop(served).all { it == VenueLookup.Result.Unavailable })
    }

    @Test fun aFailureIsNotRememberedAndBeingTurnedAwayIsRespected() {
        var fail = true
        val w = World { if (fail) VenueLookup.Fetched(0, null) else ok(spark) }
        assertEquals(VenueLookup.Result.Unavailable, w.lookup.find("Spark Arena", null))
        fail = false
        w.now += 10_000
        assertIs<VenueLookup.Result.Found>(w.lookup.find("Spark Arena", null))
        // 403 or 429 is the service saying "not you": we stop asking for a day.
        val blocked = World { VenueLookup.Fetched(429, "slow down") }
        assertEquals(VenueLookup.Result.Unavailable, blocked.lookup.find("Venue one", null))
        blocked.now += 60_000
        assertEquals(VenueLookup.Result.Unavailable, blocked.lookup.find("Venue two", null))
        assertEquals(1, blocked.asked.size)
        blocked.answer = { ok(spark) }
        blocked.now += 25L * 3600 * 1000
        assertIs<VenueLookup.Result.Found>(blocked.lookup.find("Venue two", null))
    }

    @Test fun theServiceCanBeSwitchedOrTurnedOffWithoutAnAppUpdate() {
        val w = World { ok(spark) }
        w.env["MOSHPOINT_GEOCODER"] = "https://geocoder.example.org/search"
        w.lookup.find("Spark Arena", null)
        assertTrue(w.asked.single().second.startsWith("https://geocoder.example.org/search?"))
        val off = World { ok(spark) }
        off.env["MOSHPOINT_GEOCODER"] = "off"
        assertEquals(VenueLookup.Result.Unavailable, off.lookup.find("Spark Arena", null))
        assertTrue(off.asked.isEmpty())
    }

    @Test fun rubbishInIsNotPassedOn() {
        val w = World { ok(spark) }
        assertEquals(VenueLookup.Result.NotFound, w.lookup.find(" a ", null)) // too short to mean anywhere
        assertTrue(w.asked.isEmpty())
        // A box that isn't four whole numbers is dropped, not forwarded.
        w.lookup.find("Spark Arena", "1,2,3,4&email=x")
        assertTrue("viewbox" !in w.asked.single().second)
        // An answer we can't read is "try later", not a wrong place.
        assertEquals(VenueLookup.Result.Unavailable, World { ok("<html>busy</html>") }.lookup.find("Spark Arena", null))
        assertEquals(VenueLookup.Result.NotFound, World { ok("""[{"lat":"abc","lon":"1"}]""") }.lookup.find("Spark Arena", null))
    }

    @Test fun endpoint() = testApplication {
        val w = World { url -> if ("Nowhere" in url) ok("[]") else ok(spark) }
        application { moshpoint(MailboxStore(), venues = w.lookup) }
        val found = client.get("/v1/venue?q=Spark%20Arena&box=173,-35,176,-38")
        assertEquals(HttpStatusCode.OK, found.status)
        val o = JSONObject(found.bodyAsText())
        assertEquals(-36.8468, o.getDouble("lat"), 1e-9)
        assertEquals(174.7766, o.getDouble("lon"), 1e-9)
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/venue?q=Nowhere%20Hall").status)
        assertEquals(HttpStatusCode.NotFound, client.get("/v1/venue").status)
        w.env["MOSHPOINT_GEOCODER"] = "off"
        assertEquals(HttpStatusCode.ServiceUnavailable, client.get("/v1/venue?q=Another%20Venue").status)
    }
}
