package nz.waveformlabs.moshpoint.core

import java.time.LocalDateTime
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/** Discover (docs/DISCOVER_APP.md): the region the phone sends, a picked show's start, and the typed match. */
class DiscoverRulesTest {
    private val nz = ZoneId.of("Pacific/Auckland")

    @Test fun newZealandGoesByIslandWithCookStraitOnTheSlant() {
        assertEquals("north", DiscoverPlace.nzIsland(-36.85, 174.76)) // Auckland
        assertEquals("north", DiscoverPlace.nzIsland(-41.29, 174.78)) // Wellington
        assertEquals("south", DiscoverPlace.nzIsland(-41.27, 173.28)) // Nelson: further north than Wellington, but south
        assertEquals("south", DiscoverPlace.nzIsland(-41.29, 174.00)) // Picton
        assertEquals("south", DiscoverPlace.nzIsland(-43.53, 172.64)) // Christchurch
        assertEquals("south", DiscoverPlace.nzIsland(-45.87, 170.50)) // Dunedin
        assertEquals("north", DiscoverPlace.nzIsland(-39.49, 176.91)) // Napier
        assertEquals("north", DiscoverPlace.nzIsland(-43.95, -176.56)) // the Chathams count as north
    }

    @Test fun onlyTheRegionIsSentAndOnlyWhenThereIsAPosition() {
        // Middles where the shows are (the relay's are), not the middle of the map.
        val au = listOf(
            DiscoverRegion("NSW", "New South Wales", 40, -33.6, 150.6),
            DiscoverRegion("VIC", "Victoria", 30, -37.8, 145.0),
            DiscoverRegion("QLD", "Queensland", 20, -26.2, 152.6),
        )
        assertEquals("VIC", DiscoverPlace.region("AU", LatLon(-37.81, 144.96), au)) // Melbourne
        assertEquals("QLD", DiscoverPlace.region("AU", LatLon(-27.47, 153.03), au)) // Brisbane
        assertEquals("south", DiscoverPlace.region("nz", LatLon(-43.53, 172.64), emptyList()))
        assertNull(DiscoverPlace.region("AU", null, au))
        assertNull(DiscoverPlace.region("AU", LatLon(-37.81, 144.96), emptyList()), "no list yet: the whole country")
    }

    private fun show(country: String = "NZ", date: String = "2027-03-13", time: String = "19:30", startsAt: Long = 0L) =
        DiscoverShow("1", "Ivory Tide", "Ivory Tide", date, time, startsAt, "Tidewater Arena", "Auckland", "north", country)

    @Test fun aShowAtHomeStartsAtItsLocalTimeHere() {
        val expected = LocalDateTime.parse("2027-03-13T19:30").atZone(nz).toEpochSecond()
        assertEquals(expected, ShowStart.of(show(startsAt = 123L), "NZ", nz), "the relay's start is only approximate")
        // No time announced: 8 pm.
        assertEquals(LocalDateTime.parse("2027-03-13T20:00").atZone(nz).toEpochSecond(), ShowStart.of(show(time = ""), "nz", nz))
    }

    @Test fun aShowAbroadUsesTheRelaysStart() {
        assertEquals(1_806_000_000L, ShowStart.of(show(country = "JP", startsAt = 1_806_000_000L), "NZ", nz))
        // None given: its local time here is the best there is.
        assertEquals(LocalDateTime.parse("2027-03-13T19:30").atZone(nz).toEpochSecond(), ShowStart.of(show(country = "JP"), "NZ", nz))
        // Nonsense in, nothing out.
        assertEquals(0L, ShowStart.of(show(country = "JP", date = "soon"), "NZ", nz))
    }

    @Test fun whatWasTypedIsFoundAtTheStartOfTheNameOrOfAWord() {
        assertEquals(0..0, TypedMatch.range("Ivory Tide", "i"))
        assertEquals(6..7, TypedMatch.range("Ivory Tide", "ti"))
        assertEquals(0..1, TypedMatch.range("Kōtuku Sound", "ko"), "accents aside")
        assertEquals(4..8, TypedMatch.range("The Beatles", "BEATL"), "case aside")
        assertEquals(0..6, TypedMatch.range("Beyoncé", "beyonce"))
        assertEquals(4..12, TypedMatch.range("Red Hot Chili Peppers", "hot chili"))
        assertNull(TypedMatch.range("Ivory Tide", "vory"), "not in the middle of a word")
        assertNull(TypedMatch.range("Ivory Tide", "  "))
    }
}
