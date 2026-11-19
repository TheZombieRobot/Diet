package nz.waveformlabs.moshpoint.core

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class SpotLinkTest {
    private val relay = "https://moshpoint-relay.fly.dev"

    @Test fun theSpotRidesAfterTheHash() {
        assertEquals("https://moshpoint-relay.fly.dev/spot#-36.84850,174.76330,Sam", SpotLink.build(relay, -36.8485, 174.7633, "Sam Smith"))
        assertEquals("https://moshpoint-relay.fly.dev/spot#-36.84850,174.76330", SpotLink.build("$relay/", -36.8485, 174.7633, null))
        assertEquals("https://moshpoint-relay.fly.dev/spot#-36.84850,174.76330", SpotLink.build(relay, -36.8485, 174.7633, "  "))
    }

    @Test fun noRelayOfOurOwnNoLink() {
        assertNull(SpotLink.build("", -36.8485, 174.7633, "Sam"), "then the text has the Google Maps link")
        assertNull(SpotLink.build("http://relay.example", -36.8485, 174.7633, "Sam"), "https only")
        assertNull(SpotLink.build(relay, 0.0, 0.0, "Sam"), "no position, no link")
    }

    @Test fun namesAreEncodedAndComeBackTheSame() {
        for (name in listOf("Zoë", "Jo-Anne", "O'Neil", "Иван", "सोनम", "さくら", "مريم")) {
            val link = SpotLink.build(relay, 51.50073, -0.12463, name)!!
            assertEquals(SpotLink.Spot(51.50073, -0.12463, name), SpotLink.parse(link, relay), link)
        }
    }

    @Test fun theSameWhateverThePhonesLanguage() {
        val before = Locale.getDefault()
        try {
            Locale.setDefault(Locale.GERMANY)
            assertEquals("https://moshpoint-relay.fly.dev/spot#-41.28650,174.77620", SpotLink.build(relay, -41.2865, 174.7762, null))
        } finally {
            Locale.setDefault(before)
        }
    }

    @Test fun aTextedLinkOpensAsASpot() {
        assertEquals(SpotLink.Spot(-36.8485, 174.7633, "Sam"), SpotLink.parse("https://moshpoint-relay.fly.dev/spot#-36.84850,174.76330,Sam", relay))
        assertEquals(SpotLink.Spot(-36.8485, 174.7633, null), SpotLink.parse("https://MOSHPOINT-relay.fly.dev/spot#-36.8485,174.7633", relay))
    }

    @Test fun onlyOurLinkFromOurHost() {
        assertNull(SpotLink.parse("https://evil.example/spot#-36.8,174.7", relay))
        assertNull(SpotLink.parse("https://moshpoint-relay.fly.dev.evil.example/spot#-36.8,174.7", relay))
        assertNull(SpotLink.parse("http://moshpoint-relay.fly.dev/spot#-36.8,174.7", relay))
        assertNull(SpotLink.parse("https://user@moshpoint-relay.fly.dev/spot#-36.8,174.7", relay))
        assertNull(SpotLink.parse("https://moshpoint-relay.fly.dev:8443/spot#-36.8,174.7", relay))
        assertNull(SpotLink.parse("https://moshpoint-relay.fly.dev/spot?join=abc#-36.8,174.7", relay), "a query is never ours")
        assertNull(SpotLink.parse("https://moshpoint-relay.fly.dev/v1/spot#-36.8,174.7", relay))
        assertNull(SpotLink.parse("https://moshpoint-relay.fly.dev/spot#-36.8,174.7", ""), "no relay built in: no links")
    }

    @Test fun validCoordinatesOnly() {
        for (bad in listOf("", "-36.8", "-36.8,174.7,Sam,extra", "91,10", "10,181", "0,0", "1e2,10", "0x10,10", " 10,10", "10, 10", "NaN,10", "-36.123456789,10")) {
            assertNull(SpotLink.parse("https://moshpoint-relay.fly.dev/spot#$bad", relay), bad)
        }
    }

    /** Opening the same link again keeps it once, as the newest; the oldest go past MAX_KEPT. */
    @Test fun keptOnceAndNotTooMany() {
        val sam = SpotLink.Spot(-36.8485, 174.7633, "Sam")
        val jo = SpotLink.Spot(-36.8470, 174.7700, "Jo")
        val nameless = SpotLink.Spot(-36.8485, 174.7633, null)
        assertEquals(listOf(jo, sam), SpotLink.keep(listOf(sam, jo), sam) { it })
        assertEquals(listOf(sam, jo, nameless), SpotLink.keep(listOf(sam, jo), nameless) { it }, "same place, no name: another spot")
        val many = (1..30).map { SpotLink.Spot(-36.0 - it / 1000.0, 174.0, null) }
        val kept = many.fold(emptyList<SpotLink.Spot>()) { list, s -> SpotLink.keep(list, s) { it } }
        assertEquals(many.takeLast(SpotLink.MAX_KEPT), kept)
        // The app keeps its own records (an id, a time); only the spot in each decides.
        data class Saved(val id: Int, val spot: SpotLink.Spot)
        assertEquals(listOf(Saved(2, jo), Saved(3, sam)), SpotLink.keep(listOf(Saved(1, sam), Saved(2, jo)), Saved(3, sam)) { it.spot })
    }

    @Test fun theNameIsShortAndPlain() {
        val long = "A".repeat(80)
        assertEquals("A".repeat(SpotLink.MAX_NAME), SpotLink.parse("https://moshpoint-relay.fly.dev/spot#1,2,$long", relay)?.name)
        // Direction overrides, control characters and markup are dropped; a link can't pass for a name.
        assertEquals("Sam", SpotLink.parse("https://moshpoint-relay.fly.dev/spot#1,2,%E2%80%AESam%0A", relay)?.name)
        assertEquals("scriptalert1script", SpotLink.parse("https://moshpoint-relay.fly.dev/spot#1,2,%3Cscript%3Ealert(1)%3C%2Fscript%3E", relay)?.name)
        assertEquals("httpsevilexample", SpotLink.parse("https://moshpoint-relay.fly.dev/spot#1,2,https%3A%2F%2Fevil.example", relay)?.name)
        assertNull(SpotLink.parse("https://moshpoint-relay.fly.dev/spot#1,2,%E2%80%AE", relay)?.name, "nothing left: Texted spot")
        assertNull(SpotLink.parse("https://moshpoint-relay.fly.dev/spot#1,2,%ZZ", relay)?.name, "a broken escape: no name, the spot still opens")
        assertEquals(SpotLink.Spot(1.0, 2.0, null), SpotLink.parse("https://moshpoint-relay.fly.dev/spot#1,2,%FF", relay), "not UTF-8: no name")
    }
}
