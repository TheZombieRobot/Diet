package nz.waveformlabs.moshpoint.server

import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** A recorded sample response (made-up acts, in each source's documented shape) from test resources. */
fun discoverSample(name: String): String = Show::class.java.getResource("/discover/$name")!!.readText()

/** Each source's answer read from a recorded sample (docs/DISCOVER_SERVER.md, "Sources"). */
class DiscoverSourcesTest {
    private val act = DiscoverSources.Act("Ivy Lanes", 1_250_000, 52, "https://photos.bandsintown.com/thumb/sample-ivy-lanes.jpeg")

    @Test fun ticketmaster() {
        val page = DiscoverSources.ticketmaster(discoverSample("ticketmaster-nz.json"), 0)
        assertEquals(1, page.pages)
        // Eight events, one of them cancelled.
        assertEquals(listOf("Ivy Lanes", "Ivy Lanes", "Ivy Lanes", "Harbour Kites", "Kōtuku Sound", "Iron Harbour", "Inkwell"), page.shows.map { it.artist })
        val s = page.shows[0]
        assertEquals("Ivy Lanes: The Long Way Home Tour", s.name)
        assertEquals("2027-03-13", s.date)
        assertEquals("19:30", s.time)
        assertEquals(Instant.parse("2027-03-13T06:30:00Z").epochSecond, s.startsAtSec)
        assertEquals("Spark Arena", s.venue)
        assertEquals("Auckland", s.city)
        assertEquals("north", s.region)
        assertEquals("North Island", s.regionName)
        assertEquals("NZ", s.country)
        assertEquals(-36.84794, s.lat!!, 1e-9)
        assertEquals(174.77783, s.lon!!, 1e-9)
        assertEquals("https://www.ticketmaster.co.nz/ivy-lanes-the-long-way-home-tour-auckland-13-03-2027/event/sample01", s.tickets)
        // A 16:9 picture big enough for a card, not the biggest there is.
        assertEquals("https://s1.ticketm.net/dam/a/sample/ivy-lanes_RETINA_PORTRAIT_16_9.jpg", s.image)
        assertEquals(VenueKind.ARENA, s.kind)
        assertEquals(1.0, s.relevance)
        assertEquals(listOf("ticketmaster"), s.sources)
        assertEquals("south", page.shows[1].region) // Christchurch
        assertEquals("", page.shows[2].time) // the VIP package: no time announced
        assertEquals(VenueKind.FESTIVAL, page.shows[3].kind) // six acts on one bill
        page.shows[4].let { // no coordinates: the region from the state's name
            assertNull(it.lat)
            assertEquals("north", it.region)
            assertEquals(VenueKind.CLUB, it.kind)
        }
        page.shows[5].let {
            assertEquals(VenueKind.STADIUM, it.kind)
            assertEquals("https://s1.ticketm.net/dam/a/sample/iron-harbour_ARTIST_PAGE_3_2.jpg", it.image) // the only picture
            assertEquals(0.994, it.relevance, 1e-9) // the 7th result
        }
        assertEquals("south", page.shows[6].region) // Nelson is further north than Wellington, but on the South Island
        assertEquals(VenueKind.THEATRE, page.shows[6].kind)
        // A page further in starts further down the source's order.
        assertEquals(0.8, DiscoverSources.ticketmaster(discoverSample("ticketmaster-nz.json"), 200).shows[0].relevance, 1e-9)
    }

    @Test fun seatgeek() {
        val page = DiscoverSources.seatgeek(discoverSample("seatgeek-us.json"), 0)
        assertEquals(1, page.pages)
        assertEquals(listOf("Ivy Lanes", "Indigo Static", "Night Signal"), page.shows.map { it.artist }) // one date still to be announced
        val s = page.shows[0]
        assertEquals("2027-06-11", s.date)
        assertEquals("19:00", s.time)
        assertEquals(LocalDateTime.parse("2027-06-12T02:00:00").toEpochSecond(ZoneOffset.UTC), s.startsAtSec)
        assertEquals("Crypto.com Arena", s.venue)
        assertEquals("CA", s.region)
        assertEquals("US", s.country)
        assertEquals(20_000, s.capacity)
        assertEquals(48, s.tourDates)
        assertEquals(VenueKind.ARENA, s.kind)
        assertEquals("https://seatgeek.com/images/performers-landscape/ivy-lanes-sample/huge.jpg", s.image)
        assertEquals("Harbour Sound Weekend", page.shows[1].name)
        assertEquals(VenueKind.FESTIVAL, page.shows[1].kind) // at a polo club, but a festival
        assertEquals("", page.shows[2].time)
        assertEquals(350, page.shows[2].capacity)
    }

    @Test fun bandsintown() {
        val a = assertNotNull(DiscoverSources.bandsintownAct(discoverSample("bandsintown-act.json")))
        assertEquals(act, a)
        assertNull(DiscoverSources.bandsintownAct("""{"error":"Not Found"}"""))
        assertNull(DiscoverSources.bandsintownAct(""))
        val shows = DiscoverSources.bandsintownEvents(discoverSample("bandsintown-events.json"), a)
        assertEquals(listOf("NZ", "AU", "JP", "US"), shows.map { it.country })
        val s = shows[0]
        assertEquals("Ivy Lanes", s.artist)
        assertEquals("2027-03-13", s.date)
        assertEquals("19:30", s.time)
        assertEquals("north", s.region)
        assertEquals("https://www.bandsintown.com/t/1028760001?came_from=267&utm_medium=api&utm_source=public_api&utm_campaign=ticket", s.tickets)
        assertEquals(1_250_000, s.followers)
        assertEquals(52, s.tourDates)
        assertEquals(-1.0, s.relevance) // Bandsintown has no order of its own
        assertEquals("NSW", shows[1].region)
        assertEquals(VenueKind.FESTIVAL, shows[2].kind)
        assertEquals("niigata", shows[2].region)
        assertTrue(shows[2].tickets.startsWith("https://www.bandsintown.com/e/1028760003")) // no ticket offer: the event page
        assertEquals("CA", shows[3].region)
        assertEquals(emptyList(), DiscoverSources.bandsintownEvents("""{"errorMessage":"[NotFound] The artist was not found"}""", a))
    }

    @Test fun countriesAndAddresses() {
        assertEquals("NZ", DiscoverSources.countryCode("New Zealand"))
        assertEquals("US", DiscoverSources.countryCode("United States"))
        assertEquals("GB", DiscoverSources.countryCode("UK"))
        assertEquals("CZ", DiscoverSources.countryCode("Czech Republic"))
        assertEquals("", DiscoverSources.countryCode("Atlantis"))
        val tm = DiscoverSources.ticketmasterUrl("k", "NZ", 2, 0, 3600)
        listOf("countryCode=NZ", "classificationName=music", "sort=relevance,desc", "size=200", "page=2", "startDateTime=1970-01-01T00%3A00%3A00Z")
            .forEach { assertTrue(it in tm, tm) }
        assertTrue("venue.country=US" in DiscoverSources.seatgeekUrl("k", "US", 0, 0, 3600))
        // Bandsintown wants a slash in a name encoded twice.
        assertTrue(DiscoverSources.bandsintownActUrl("k", "AC/DC").startsWith("https://rest.bandsintown.com/artists/AC%252FDC?"))
        assertTrue(DiscoverSources.bandsintownEventsUrl("k", "Ivy Lanes").startsWith("https://rest.bandsintown.com/artists/Ivy%20Lanes/events?"))
    }
}

/** The same show from several sources, or twice from one, becomes one. */
class ShowMergeTest {
    private val act = DiscoverSources.Act("Ivy Lanes", 1_250_000, 52, "https://photos.bandsintown.com/thumb/sample-ivy-lanes.jpeg")
    private val tm = DiscoverSources.ticketmaster(discoverSample("ticketmaster-nz.json"), 0).shows
    private val bit = DiscoverSources.bandsintownEvents(discoverSample("bandsintown-events.json"), act)

    @Test fun acrossSources() {
        val merged = ShowMerge.merge(tm + bit)
        val auckland = merged.filter { it.artist == "Ivy Lanes" && it.date == "2027-03-13" }
        assertEquals(1, auckland.size) // Ticketmaster's show, its VIP package, and Bandsintown's
        val s = auckland[0]
        assertEquals(listOf("ticketmaster", "bandsintown"), s.sources)
        assertTrue(s.tickets.startsWith("https://www.ticketmaster.co.nz/")) // the seller's own page first
        assertEquals("19:30", s.time)
        assertEquals("Ivy Lanes: The Long Way Home Tour", s.name)
        assertEquals(1_250_000, s.followers) // from Bandsintown
        assertEquals(1.0, s.relevance) // from Ticketmaster
        // Everything else stays apart: other dates, other countries.
        assertEquals(6 + 3, merged.size)
    }

    @Test fun sameDayDifferentPlacesStayApart() {
        val a = tm[0]
        val far = a.copy(city = "Christchurch", lat = -43.5419, lon = 172.6091)
        val near = a.copy(city = "Auckland Central", lat = -36.8500, lon = 174.7600, sources = listOf("seatgeek")) // a few hundred metres
        val noPlace = a.copy(city = "", lat = null, lon = null, sources = listOf("bandsintown"))
        val merged = ShowMerge.merge(listOf(a, far, near, noPlace))
        assertEquals(2, merged.size)
        assertEquals(listOf("ticketmaster", "seatgeek", "bandsintown"), merged.first { it.city == "Auckland" }.sources)
        // The same act's id stays put however its name is written.
        assertEquals(a.id, a.copy(artist = "IVY LANES").id)
    }
}

/** One score from signals that work everywhere (docs/DISCOVER_SERVER.md, "Popularity"). */
class PopularityTest {
    private val base = Show(artist = "A", name = "A", date = "2027-03-13", startsAtSec = 0, country = "NZ")

    @Test fun documentedExamples() {
        // Ivy Lanes at Spark Arena: 1.25 M followers, an arena, 52 dates, Ticketmaster's first result.
        assertEquals(0.867, Popularity.score(base.copy(followers = 1_250_000, kind = VenueKind.ARENA, tourDates = 52, relevance = 1.0)))
        // Iron Harbour at Sky Stadium, unknown to Bandsintown: the other signals share the followers' weight.
        assertEquals(0.786, Popularity.score(base.copy(kind = VenueKind.STADIUM, tourDates = 1, relevance = Popularity.rank(6))))
    }

    @Test fun biggerIsBigger() {
        val kinds = listOf(VenueKind.STADIUM, VenueKind.FESTIVAL, VenueKind.OUTDOOR, VenueKind.ARENA, VenueKind.THEATRE, VenueKind.UNKNOWN, VenueKind.CLUB)
        val byKind = kinds.map { Popularity.score(base.copy(kind = it, tourDates = 10, relevance = 0.5)) }
        assertEquals(byKind.sortedDescending(), byKind)
        assertTrue(byKind.zipWithNext().all { (a, b) -> a > b })
        val byFollowers = listOf(10_000_000, 100_000, 1_000, 0).map { Popularity.score(base.copy(followers = it)) }
        assertTrue(byFollowers.zipWithNext().all { (a, b) -> a > b })
        val byDates = listOf(100, 30, 10, 1).map { Popularity.score(base.copy(tourDates = it)) }
        assertTrue(byDates.zipWithNext().all { (a, b) -> a > b })
        // A known capacity beats the venue's name; a festival's site capacity is ignored.
        assertEquals(0.85, Popularity.venue(VenueKind.ARENA, 20_000))
        assertEquals(0.2, Popularity.venue(VenueKind.ARENA, 350))
        assertEquals(0.9, Popularity.venue(VenueKind.FESTIVAL, 300))
    }

    @Test fun staysBetweenZeroAndOne() {
        assertEquals(1.0, Popularity.score(base.copy(followers = Int.MAX_VALUE, kind = VenueKind.STADIUM, tourDates = 10_000, relevance = 1.0)))
        assertTrue(Popularity.score(base.copy(followers = 0, kind = VenueKind.CLUB, tourDates = 0, relevance = 0.0)) in 0.0..0.1)
        assertEquals(0.0, Popularity.rank(5_000))
        assertNull(Popularity.followers(-1))
        assertNull(Popularity.tourDates(0))
    }
}

/** What people type against what the sources call things. */
class PrefixTest {
    private fun matches(name: String, typed: String) = Fold.prefixMatch(Fold.key(name), Fold.text(typed))

    @Test fun oneLetter() {
        assertTrue(matches("Ivy Lanes", "i"))
        assertTrue(matches("Ivy Lanes", "I"))
        assertTrue(matches("Ivy Lanes", "l")) // a word in it
        assertFalse(matches("Ivy Lanes", "v"))
        assertFalse(matches("Ivy Lanes", ""))
        assertFalse(matches("Ivy Lanes", "!"))
    }

    @Test fun accents() {
        assertTrue(matches("Kōtuku Sound", "ko"))
        assertTrue(matches("Kōtuku Sound", "KŌ"))
        assertTrue(matches("Beyoncé", "beyonce"))
        assertTrue(matches("Beyonce", "Beyoncé"))
        assertTrue(matches("Mötley Crüe", "motley cr"))
        assertTrue(matches("Sigur Rós", "ros"))
        assertTrue(matches("Søren Juul", "so"))
        assertTrue(matches("Ólafur Arnalds", "ola"))
        assertTrue(matches("米津玄師", "米")) // no spaces to split on: from the start
        assertTrue(matches("아이유", "ㅇ")) // a Korean first consonant matches its syllables
    }

    @Test fun theBands() {
        assertTrue(matches("The Beatles", "beat"))
        assertTrue(matches("The Beatles", "the b"))
        assertTrue(matches("The Beatles", "The Beat"))
        assertFalse(matches("The Beatles", "eat"))
        assertEquals("the beatles", Fold.key("Beatles, The"))
        assertTrue(matches("Beatles, The", "the bea"))
    }

    @Test fun moreThanOneWord() {
        assertTrue(matches("Red Hot Chili Peppers", "red hot"))
        assertTrue(matches("Red Hot Chili Peppers", "hot chili"))
        assertFalse(matches("Red Hot Chili Peppers", "red chili"))
        assertTrue(matches("AC/DC", "acdc"))
        assertTrue(matches("AC/DC", "ac"))
        assertTrue(matches("Guns N' Roses", "guns n"))
    }
}

/** New Zealand by island, other countries by state or region, small countries with their neighbours. */
class RegionsTest {
    @Test fun newZealandByIsland() {
        mapOf(
            "Auckland" to (-36.85 to 174.76), "Hamilton" to (-37.79 to 175.28), "New Plymouth" to (-39.06 to 174.08),
            "Wellington" to (-41.29 to 174.78), "Cape Palliser" to (-41.61 to 175.29), "Gisborne" to (-38.66 to 178.02),
        ).forEach { (place, p) -> assertEquals(Regions.NORTH, Regions.nzIsland(p.first, p.second), place) }
        mapOf(
            "Picton" to (-41.29 to 174.00), "Nelson" to (-41.27 to 173.28), "Blenheim" to (-41.51 to 173.95),
            "Farewell Spit" to (-40.51 to 172.69), "Christchurch" to (-43.53 to 172.64), "Dunedin" to (-45.87 to 170.50),
            "Queenstown" to (-45.03 to 168.66), "Invercargill" to (-46.41 to 168.35),
        ).forEach { (place, p) -> assertEquals(Regions.SOUTH, Regions.nzIsland(p.first, p.second), place) }
        assertEquals(Regions.Region("south", "South Island"), Regions.of("NZ", null, null, null, "Canterbury"))
        assertEquals("north", Regions.of("NZ", null, null, null, "Hawke's Bay").id)
        assertEquals(Regions.Region.NONE, Regions.of("NZ", null, null, null, null))
    }

    @Test fun elsewhereTheSourcesStateOrRegion() {
        assertEquals(Regions.Region("CA", "California"), Regions.of("US", 34.0, -118.2, "CA", "California"))
        assertEquals(Regions.Region("NSW", "NSW"), Regions.of("AU", null, null, "nsw", null))
        assertEquals(Regions.Region("new-south-wales", "New South Wales"), Regions.of("AU", null, null, null, "New South Wales"))
        assertEquals(Regions.Region.NONE, Regions.of("BE", 50.85, 4.35, "VLG", "Flanders")) // small: no regions
        assertEquals(Regions.Region.NONE, Regions.of("GB", 51.5, -0.1, null, null)) // nothing given: whole country only
    }

    @Test fun whatThePhoneSends() {
        assertEquals("north", Regions.asked("NZ", "Auckland"))
        assertEquals("south", Regions.asked("NZ", "South Island"))
        assertEquals("south", Regions.asked("NZ", "Otago"))
        assertNull(Regions.asked("NZ", "all"))
        assertNull(Regions.asked("US", "  "))
        assertEquals("CA", Regions.asked("US", " CA "))
    }

    @Test fun distances() {
        assertEquals(2_155.0, Regions.km(-36.85, 174.76, -33.87, 151.21), 25.0) // Auckland to Sydney
        assertEquals(listOf("AU"), Regions.around("NZ", Regions.TRAVEL_KM))
        val fromIreland = Regions.around("IE", Regions.TRAVEL_KM)
        listOf("GB", "FR", "ES", "DE").forEach { assertTrue(it in fromIreland, it) }
        assertFalse("US" in fromIreland)
        assertTrue("BE" in Regions.SMALL && "NZ" !in Regions.SMALL)
    }
}
