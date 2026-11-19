package nz.waveformlabs.moshpoint.core

import java.util.Locale
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SpotTextTest {
    private val line = "Here's my spot:"
    private val noFix = "My phone can't tell where I am right now."

    @Test fun aSpotIsALineALinkAndThePlainCoordinates() {
        assertEquals(
            "Here's my spot:\nhttps://maps.google.com/?q=-36.84850,174.76330\n-36.84850, 174.76330",
            SpotText.message(line, noFix, -36.8485, 174.7633),
        )
    }

    /** With a relay of our own built in, the link is ours: it opens in Moshpoint (docs/SPOT_LINKS.md). */
    @Test fun withOurRelayTheLinkOpensInMoshpoint() {
        assertEquals(
            "Here's my spot:\nhttps://moshpoint-relay.fly.dev/spot#-36.84850,174.76330,Sam\n-36.84850, 174.76330",
            SpotText.message(line, noFix, -36.8485, 174.7633, server = "https://moshpoint-relay.fly.dev", name = "Sam Smith"),
        )
        assertEquals(
            "Here's my spot:\nhttps://moshpoint-relay.fly.dev/spot#-36.84850,174.76330\n-36.84850, 174.76330",
            SpotText.message(line, noFix, -36.8485, 174.7633, server = "https://moshpoint-relay.fly.dev/", name = ""),
            "no name yet: the spot alone",
        )
    }

    /** No relay built in (or not a plain https one): Google Maps, as before. The coordinates stay either way. */
    @Test fun withoutOneGoogleMaps() {
        val maps = "Here's my spot:\nhttps://maps.google.com/?q=-36.84850,174.76330\n-36.84850, 174.76330"
        assertEquals(maps, SpotText.message(line, noFix, -36.8485, 174.7633, server = "", name = "Sam"))
        assertEquals(maps, SpotText.message(line, noFix, -36.8485, 174.7633, server = "http://192.168.1.20:8080", name = "Sam"))
        assertEquals(noFix, SpotText.message(line, noFix, null, null, server = "https://moshpoint-relay.fly.dev", name = "Sam"))
    }

    @Test fun fiveDecimalsRounded() {
        assertEquals("51.50073, -0.12463", SpotText.coordinates(51.500729, -0.124628))
        assertEquals("https://maps.google.com/?q=0.00001,-0.00001", SpotText.link(0.000006, -0.000006))
        assertEquals("-90.00000, 180.00000", SpotText.coordinates(-90.0, 180.0))
    }

    /** A phone set to German or French must never write a decimal comma into the link. */
    @Test fun theSameWhateverThePhonesLanguage() {
        val before = Locale.getDefault()
        try {
            for (l in listOf(Locale.GERMANY, Locale.FRANCE, Locale.forLanguageTag("ar-EG"), Locale.forLanguageTag("hi-IN"))) {
                Locale.setDefault(l)
                assertEquals("https://maps.google.com/?q=-41.28650,174.77620", SpotText.link(-41.2865, 174.7762), "$l")
                assertEquals("-41.28650, 174.77620", SpotText.coordinates(-41.2865, 174.7762), "$l")
            }
        } finally {
            Locale.setDefault(before)
        }
    }

    @Test fun noFixSaysSoPlainly() {
        assertEquals(noFix, SpotText.message(line, noFix, null, null))
        assertEquals(noFix, SpotText.message(line, noFix, -36.8, null))
        assertEquals(noFix, SpotText.message(line, noFix, 0.0, 0.0), "0, 0 is how the app writes no position")
        assertEquals(noFix, SpotText.message(line, noFix, Double.NaN, 174.7))
        assertEquals(noFix, SpotText.message(line, noFix, 91.0, 174.7))
        assertEquals(noFix, SpotText.message(line, noFix, -36.8, -181.0))
    }

    @Test fun realPlacesNearTheLinesAreUsable() {
        assertTrue(SpotText.usable(0.0, 32.5))
        assertTrue(SpotText.usable(-89.99, -179.99))
        assertFalse(SpotText.usable(Double.POSITIVE_INFINITY, 0.0))
    }
}
