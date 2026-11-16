package nz.waveformlabs.moshpoint.server

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertSame
import kotlin.test.assertTrue

/**
 * Pretend sources answering with the recorded samples, a clock that only moves when told, and
 * every URL asked for. The keys are made up.
 */
private class World(
    val dir: File = tempDataDir(),
    tm: Boolean = true,
    sg: Boolean = true,
    bit: Boolean = true,
    configure: (DiscoverConfig) -> DiscoverConfig = { it },
) {
    var now: Long = Instant.parse("2026-11-16T09:00:00Z").toEpochMilli()
    val urls = ArrayList<String>()

    /** How many pages Ticketmaster says it has (each one answers the same sample). */
    var tmPages = 1

    val config = configure(
        DiscoverConfig(
            dir = File(dir, "discover"),
            ticketmasterKey = "tm-test".takeIf { tm }, // secret-scan: allow
            seatgeekClientId = "sg-test".takeIf { sg }, // secret-scan: allow
            bandsintownAppId = "bit-test".takeIf { bit }, // secret-scan: allow
            autoRefresh = false,
        ),
    )

    fun answer(url: String): String? = when {
        url.startsWith("https://app.ticketmaster.com/") -> TM.replace("\"totalPages\": 1", "\"totalPages\": $tmPages")
        url.startsWith("https://api.seatgeek.com/") -> SG
        url.startsWith("https://rest.bandsintown.com/artists/Ivy%20Lanes/events?") -> BIT_EVENTS
        url.startsWith("https://rest.bandsintown.com/artists/Ivy%20Lanes?") -> BIT_ACT
        url.startsWith("https://rest.bandsintown.com/") -> """{"error":"Not Found"}"""
        else -> null
    }

    /** A Discover on this world's volume (a second one is the relay after a restart). */
    fun discover() = Discover(config, fetch = { urls += it; answer(it) }, clock = { now }, sleep = {})

    val d = discover()

    companion object {
        val TM = discoverSample("ticketmaster-nz.json")
        val SG = discoverSample("seatgeek-us.json")
        val BIT_ACT = discoverSample("bandsintown-act.json")
        val BIT_EVENTS = discoverSample("bandsintown-events.json")
    }
}

private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }

private fun JSONObject.artists(key: String): List<String> = getJSONArray(key).objects().map { it.getString("artist") }

class DiscoverTest {
    @Test fun buildsACountryListFromEverySourceAndKeepsItOnTheVolume() = runBlocking<Unit> {
        val w = World()
        w.d.ask("NZ")
        assertTrue(w.d.refresh("NZ"))
        // One Ticketmaster page; Bandsintown for each act (twice for the one it knows); SeatGeek isn't in New Zealand.
        assertEquals(1, w.d.callsToday("ticketmaster"))
        assertEquals(0, w.d.callsToday("seatgeek"))
        assertEquals(6, w.d.callsToday("bandsintown"))
        val c = w.d.coming("NZ", null, "country")
        assertTrue(c.getBoolean("ready"))
        assertEquals(6, c.getInt("total")) // 7 Ticketmaster events (a VIP package among them) and Bandsintown's Auckland date: 6 shows
        val first = c.getJSONArray("shows").getJSONObject(0)
        assertEquals("Ivy Lanes", first.getString("artist"))
        assertEquals("2027-03-13", first.getString("date"))
        assertTrue(first.getString("tickets").startsWith("https://www.ticketmaster.co.nz/"))
        assertEquals(0.867, first.getDouble("score")) // with Bandsintown's followers and tour size
        assertEquals("arena", first.getString("kind"))
        assertEquals(listOf("north", "south"), c.getJSONArray("regions").objects().map { it.getString("id") })
        assertTrue(File(w.dir, "discover/lists/NZ.json").isFile)

        // A restarted relay answers straight from the volume, without asking a source.
        val again = w.discover()
        val c2 = again.coming("NZ", null, "country")
        assertTrue(c2.getBoolean("ready"))
        assertEquals(c.getJSONArray("shows").toString(), c2.getJSONArray("shows").toString())
        assertEquals(0, again.sourceCalls.get())
        assertEquals(1, again.callsToday("ticketmaster")) // and today's calls are still counted
    }

    @Test fun suggestionsComeNearElsewhereWorldwideAndNeverFromASource() = runBlocking<Unit> {
        val w = World()
        w.d.refresh("NZ")
        w.d.refresh("US")
        val calls = w.d.sourceCalls.get()
        val s = w.d.suggest("NZ", "i", "north")
        assertTrue(s.getBoolean("ready"))
        assertEquals("north", s.getString("region"))
        assertEquals(listOf("Ivy Lanes", "Iron Harbour"), s.artists("near"), s.toString())
        val ivy = s.getJSONArray("near").getJSONObject(0)
        assertEquals(1, ivy.getInt("shows")) // Auckland
        assertEquals(2, ivy.getInt("countryShows")) // and Christchurch
        assertEquals("Auckland", ivy.getJSONObject("next").getString("city"))
        assertEquals(listOf("Inkwell"), s.artists("elsewhere")) // Nelson, on the South Island
        assertEquals(listOf("Indigo Static"), s.artists("worldwide")) // a US festival
        // No region: nothing is "near", everything here is "elsewhere".
        val noRegion = w.d.suggest("NZ", "I", null)
        assertEquals(emptyList(), noRegion.artists("near"))
        assertEquals(listOf("Ivy Lanes", "Iron Harbour", "Inkwell"), noRegion.artists("elsewhere"))
        // Accents and words: "kō" finds Kōtuku Sound; "lan" finds Ivy Lanes.
        assertEquals(listOf("Kōtuku Sound"), w.d.suggest("NZ", "kō", "north").artists("near"))
        assertEquals(listOf("Ivy Lanes"), w.d.suggest("NZ", "lan", "Auckland").artists("near"))
        // Typing, in a country with no list yet: an empty answer that says so, and still no source call.
        val fr = w.d.suggest("FR", "i", null)
        assertFalse(fr.getBoolean("ready"))
        listOf("", "i", "iv", "ivy", "ivy l", "z", "の").forEach { q -> listOf("north", "south", null).forEach { w.d.suggest("NZ", q, it) } }
        assertEquals(calls, w.d.sourceCalls.get())
    }

    @Test fun suggestionsAreCachedPerCountryAndPrefix() = runBlocking<Unit> {
        val w = World()
        w.d.refresh("NZ")
        w.d.suggest("NZ", "i", "north")
        w.d.suggest("NZ", "I", "south")
        w.d.suggest("NZ", " i ", null)
        assertEquals(1, w.d.matchesWorkedOut.get()) // "i" in New Zealand, looked up once
        w.d.suggest("NZ", "iv", null)
        w.d.suggest("AU", "i", null)
        assertEquals(3, w.d.matchesWorkedOut.get())
        // A new list means new answers.
        w.now += 7 * 3_600_000L
        w.d.refresh("NZ")
        w.d.suggest("NZ", "i", null)
        assertEquals(4, w.d.matchesWorkedOut.get())
    }

    @Test fun comingUpByRegionCountryAndTravel() = runBlocking<Unit> {
        val w = World()
        w.d.refresh("NZ")
        w.d.refresh("AU", full = false) // a neighbour's short list
        w.d.refresh("US")
        val north = w.d.coming("NZ", "north", null)
        assertEquals("near", north.getString("scope"))
        assertEquals(listOf("Ivy Lanes", "Iron Harbour", "Harbour Kites", "Kōtuku Sound"), north.artists("shows")) // biggest first
        assertEquals(listOf("Ivy Lanes", "Inkwell"), w.d.coming("NZ", "South Island", null).artists("shows"))
        assertEquals(6, w.d.coming("NZ", null, "country").getInt("total"))
        // An unknown region falls back to the whole country.
        assertEquals(6, w.d.coming("NZ", "Atlantis", null).getInt("total"))
        // Worth travelling for: big shows abroad within a few hours' flight. Sydney, not Japan or Los Angeles.
        val travel = w.d.coming("NZ", "north", "travel")
        assertEquals("travel", travel.getString("scope"))
        val shows = travel.getJSONArray("shows").objects()
        assertEquals(listOf("Sydney"), shows.map { it.getString("city") })
        assertTrue(shows[0].getInt("km") in 1_800..2_600, shows[0].toString())
        // US states come from the sources.
        assertEquals(listOf("Ivy Lanes", "Indigo Static", "Night Signal"), w.d.coming("US", "CA", null).artists("shows"))
        assertEquals("CA", w.d.coming("US", "ca", null).getString("region"))
    }

    @Test fun smallCountriesIncludeJustOverTheBorder() {
        val w = World()
        var day = 0
        fun show(artist: String, city: String, cc: String, lat: Double, lon: Double, score: Double): Show {
            day++
            return Show(artist = artist, name = artist, date = "2027-02-%02d".format(day), startsAtSec = w.now / 1000 + day * 86_400L, venue = "Hall",
                city = city, country = cc, lat = lat, lon = lon, score = score)
        }
        w.d.putList(CountryList("BE", w.now, listOf(show("Brussels Act", "Brussels", "BE", 50.85, 4.35, 0.5)), nearby = false))
        w.d.putList(CountryList("FR", w.now, listOf(show("Lille Act", "Lille", "FR", 50.63, 3.06, 0.6), show("Lyon Act", "Lyon", "FR", 45.76, 4.83, 0.9)), nearby = true))
        w.d.putList(CountryList("NL", w.now, listOf(show("Amsterdam Act", "Amsterdam", "NL", 52.37, 4.90, 0.4)), nearby = true))
        assertEquals(listOf("Lille Act", "Brussels Act", "Amsterdam Act"), w.d.coming("BE", null, null).artists("shows")) // Lyon is 560 km away
        assertEquals(listOf("Brussels Act"), w.d.coming("BE", null, "country").artists("shows"))
        val s = w.d.suggest("BE", "l", null)
        assertEquals(listOf("Lille Act"), s.artists("near"))
        assertEquals(listOf("Lyon Act"), s.artists("worldwide"))
    }

    @Test fun keepsOnlyTheBiggest() = runBlocking<Unit> {
        val all = World().also { it.d.refresh("NZ") }.d.coming("NZ", null, "country", 200).getJSONArray("shows").objects()
        val w = World(configure = { it.copy(maxShows = 2) })
        w.d.refresh("NZ")
        val kept = w.d.coming("NZ", null, "country", 200).getJSONArray("shows").objects()
        assertEquals(all.take(2).map { it.getString("id") }, kept.map { it.getString("id") })
    }

    @Test fun aQuietCountryCostsNothing() = runBlocking<Unit> {
        val w = World()
        assertFalse(w.d.refreshDue())
        assertEquals(0, w.urls.size)
        w.d.ask("NZ")
        assertTrue(w.d.refreshDue()) // New Zealand's full list
        assertTrue(w.urls.any { "countryCode=NZ" in it })
        val n = w.urls.size
        // An hour on: New Zealand isn't due for 6 hours, but its neighbour Australia gets a short list.
        w.now += 3_600_000L
        assertTrue(w.d.refreshDue())
        assertEquals(1, w.urls.size - n)
        assertTrue("countryCode=AU" in w.urls.last())
        assertFalse(w.d.refreshDue())
        // Six hours on, New Zealand is refreshed again.
        w.now += 6 * 3_600_000L
        val k = w.urls.size
        assertTrue(w.d.refreshDue())
        assertTrue("countryCode=NZ" in w.urls[k])
        // Nobody asks for a week: nothing more is refreshed.
        w.now += 8 * 24 * 3_600_000L
        val m = w.urls.size
        assertFalse(w.d.refreshDue())
        assertEquals(m, w.urls.size)
    }

    @Test fun memoryStaysBoundedWhenManyCountriesAreAskedAbout() = runBlocking<Unit> {
        val w = World(sg = false, bit = false, configure = { it.copy(maxCountries = 2) })
        listOf("NZ", "JP", "BR").forEach { c ->
            w.now += 120_000L
            w.d.ask(c)
            w.d.refresh(c)
        }
        // New Zealand was asked about longest ago: it gave way, and its list left memory (it stays on the volume).
        assertEquals(setOf("JP", "BR"), w.d.loaded())
        assertTrue(File(w.dir, "discover/lists/NZ.json").isFile)
        w.now += 120_000L
        assertTrue(w.d.coming("NZ", null, null).getBoolean("ready")) // asked again: read back from the volume
    }

    @Test fun staysWithinEachSourcesDailyBudget() = runBlocking<Unit> {
        val w = World(sg = false, bit = false, configure = { it.copy(tmPerDay = 7) })
        w.tmPages = 9
        w.d.refresh("NZ")
        assertEquals(5, w.d.callsToday("ticketmaster")) // 5 pages of 200: as deep as Ticketmaster goes
        w.d.refresh("AU")
        assertEquals(7, w.d.callsToday("ticketmaster"))
        assertFalse(w.d.refresh("GB")) // no budget left: no call, and no empty list passed off as ready
        assertEquals(7, w.urls.size)
        assertFalse(w.d.coming("GB", null, null).getBoolean("ready"))
        // A restart doesn't hand out a fresh day...
        assertEquals(7, w.discover().callsToday("ticketmaster"))
        // ...the next day (UTC) does.
        w.now += 24 * 3_600_000L
        w.d.refresh("NZ")
        assertEquals(5, w.d.callsToday("ticketmaster"))
    }

    @Test fun aFailedRefreshKeepsTheLastList() = runBlocking<Unit> {
        val w = World(sg = false, bit = false)
        w.d.ask("NZ")
        w.d.refresh("NZ")
        val before = w.d.coming("NZ", null, "country").getInt("total")
        val broken = Discover(w.config, fetch = { null }, clock = { w.now + 7 * 3_600_000L }, sleep = {})
        assertFalse(broken.refresh("NZ"))
        assertEquals(before, broken.coming("NZ", null, "country").getInt("total"))
    }
}

/** Members only: both endpoints are keyed services (ROADMAP.md, Moshpoint+). */
class DiscoverGateTest {
    private val open = EntitlementCheck.fromEnv { if (it == "MOSHPOINT_DISCOVER_OPEN") "1" else null }

    @Test fun nobodyIsAMemberYet() = testApplication {
        val w = World()
        application { moshpoint(testRelay(), discover = w.d, entitlements = EntitlementCheck.fromEnv { null }) }
        listOf("/v1/discover/suggest?country=NZ&q=i", "/v1/discover/coming?country=NZ").forEach {
            val r = client.get(it)
            assertEquals(HttpStatusCode.Forbidden, r.status)
            assertEquals("members only", r.bodyAsText())
        }
        assertEquals(0, w.urls.size)
    }

    @Test fun theOpenFlagIsExactlyOne() {
        assertSame(EntitlementCheck.EVERYONE, open)
        listOf(null, "", "0", "true", "yes", "on").forEach { v -> assertSame(EntitlementCheck.NOBODY, EntitlementCheck.fromEnv { v }) }
    }

    @Test fun theOpenFlagLetsInternalTestersInWithoutASourceCall() = testApplication {
        val w = World()
        w.d.refresh("NZ")
        val calls = w.d.sourceCalls.get()
        application { moshpoint(testRelay(), discover = w.d, entitlements = open) }
        listOf("i", "iv", "ivy", "ivy%20l", "k", "%C5%8D", "x").forEach {
            assertEquals(HttpStatusCode.OK, client.get("/v1/discover/suggest?country=NZ&q=$it&region=north").status)
        }
        val s = JSONObject(client.get("/v1/discover/suggest?country=nz&q=i&region=Auckland").bodyAsText())
        assertEquals("Ivy Lanes", s.getJSONArray("near").getJSONObject(0).getString("artist"))
        val c = client.get("/v1/discover/coming?country=NZ&region=north&limit=2")
        assertEquals(HttpStatusCode.OK, c.status)
        assertEquals(2, JSONObject(c.bodyAsText()).getJSONArray("shows").length())
        assertEquals(HttpStatusCode.OK, client.get("/v1/discover/coming?country=NZ&scope=travel").status)
        assertEquals(calls, w.d.sourceCalls.get()) // answered from the lists alone
        listOf("country=XX&q=i", "country=NZL&q=i", "q=i", "country=NZ", "country=NZ&q=", "country=NZ&q=%20!").forEach {
            assertEquals(HttpStatusCode.BadRequest, client.get("/v1/discover/suggest?$it").status, it)
        }
        assertEquals(HttpStatusCode.BadRequest, client.get("/v1/discover/coming?country=").status)
    }

    @Test fun aRelayWithoutKeysIsNotConfigured() = testApplication {
        val w = World(tm = false, sg = false, bit = false)
        application { moshpoint(testRelay(), discover = w.d, entitlements = open) }
        listOf("/v1/discover/suggest?country=NZ&q=i", "/v1/discover/coming?country=NZ").forEach {
            val r = client.get(it)
            assertEquals(HttpStatusCode.ServiceUnavailable, r.status)
            assertEquals("not configured", r.bodyAsText())
        }
    }
}
