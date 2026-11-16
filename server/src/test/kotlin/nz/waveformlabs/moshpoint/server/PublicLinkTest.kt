package nz.waveformlabs.moshpoint.server

import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals

/** Links the relay hands to phones carry no key (docs/SECRETS.md, "What stops a leak"). All keys here are made up. */
class PublicLinkTest {
    @AfterTest fun forget() = PublicLink.resetSecrets()

    @Test fun bandsintownsAppIdIsTakenOut() {
        assertEquals(
            "https://www.bandsintown.com/t/1028760001?came_from=267&utm_medium=api",
            PublicLink.clean("https://www.bandsintown.com/t/1028760001?app_id=madeUp1&came_from=267&utm_medium=api"),
        )
        assertEquals("https://tickets.example.com/e/9", PublicLink.clean("https://tickets.example.com/e/9?app_id=madeUp1"))
        // Any case, encoded names, and the other usual key names.
        assertEquals("https://a.example.com/x?y=1", PublicLink.clean("https://a.example.com/x?APIKEY=madeUp1&y=1&app%5Fid=madeUp2"))
        assertEquals("https://a.example.com/x#top", PublicLink.clean("https://a.example.com/x?client_id=a&token=b&key=c#top"))
        // A link with nothing to take out is passed on as it is.
        val plain = "https://www.ticketmaster.co.nz/event/2400612BC4E8?brand=tm&lang=en-nz"
        assertEquals(plain, PublicLink.clean(plain))
    }

    @Test fun onlyPlainHttpsLinks() {
        listOf(
            "http://tickets.example.com/e/9", "javascript:alert(1)", "intent://scan/#Intent;scheme=x;end", "file:///sdcard/x",
            "https://user:pass@tickets.example.com/e/9", "https:///no-host", "https://tickets.example.com/e 9", "", "   ",
            "https://tickets.example.com/" + "a".repeat(PublicLink.MAX_CHARS),
        ).forEach { assertEquals("", PublicLink.clean(it), it) }
    }

    @Test fun theRelaysOwnKeysGoWhateverTheyreCalled() {
        PublicLink.addSecrets(listOf("madeUpRelayKey9", null, " "))
        assertEquals("https://tickets.example.com/e/9?ref=1", PublicLink.clean("https://tickets.example.com/e/9?partner=madeUpRelayKey9&ref=1"))
        assertEquals("https://tickets.example.com/e/9", PublicLink.clean("https://tickets.example.com/e/9#k=madeUpRelayKey9"))
        // In the address itself it can't be cut out: no link at all.
        assertEquals("", PublicLink.clean("https://tickets.example.com/madeUpRelayKey9/e/9"))
        // A short key only counts as a whole value, so it can't wipe ordinary links.
        PublicLink.addSecrets(listOf("k1"))
        assertEquals("https://a.example.com/k1/page?q=k12", PublicLink.clean("https://a.example.com/k1/page?q=k12"))
        assertEquals("https://a.example.com/page", PublicLink.clean("https://a.example.com/page?q=k1"))
    }

    @Test fun bandsintownShowsComeOutClean() {
        val act = DiscoverSources.Act("Ivy Lanes", 1_250_000, 52, "https://photos.bandsintown.com/thumb/x.jpeg?app_id=madeUp1")
        val body = """[{"datetime":"2027-03-13T19:30:00","title":"",
            "venue":{"name":"Tidewater Arena","city":"Auckland","region":"","country":"New Zealand","latitude":"-36.85","longitude":"174.76"},
            "offers":[{"type":"Tickets","url":"https://www.bandsintown.com/t/1?app_id=madeUp1&came_from=267"}],
            "url":"https://www.bandsintown.com/e/1?app_id=madeUp1&came_from=267","lineup":["Ivy Lanes"]}]"""
        val show = DiscoverSources.bandsintownEvents(body, act).single()
        assertEquals("https://www.bandsintown.com/t/1?came_from=267", show.tickets)
        // A list saved on the volume before links were cleaned still goes out clean.
        val api = show.copy(tickets = "https://www.bandsintown.com/t/1?app_id=madeUp1&came_from=267").toApi()
        assertEquals("https://www.bandsintown.com/t/1?came_from=267", api.getString("tickets"))
        assertEquals("https://photos.bandsintown.com/thumb/x.jpeg", api.getString("image"))
        val a = DiscoverSources.bandsintownAct("""{"name":"Ivy Lanes","tracker_count":5,"upcoming_event_count":1,"thumb_url":"https://photos.bandsintown.com/thumb/x.jpeg?app_id=madeUp1"}""")
        assertEquals("https://photos.bandsintown.com/thumb/x.jpeg", a?.image)
    }
}
