package nz.waveformlabs.moshpoint.core

import java.time.LocalDateTime
import java.time.ZoneId
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Discover and hype (docs/DISCOVER_APP.md): the ticket tick, the signed ticket link, the countdown and the one nudge. */
class HypeTest {
    private val nz = ZoneId.of("Pacific/Auckland")
    private fun at(text: String, zone: ZoneId = nz) = LocalDateTime.parse(text).atZone(zone).toInstant()
    private val now = at("2026-11-16T10:00").epochSecond
    private val gig = at("2027-03-13T19:30").epochSecond
    private val owner = CrewKeys.generate()
    private val crew = GigGroup.createOwned("Ivory Tide", now * 1000, owner.pub, startsAtSec = gig, venue = "Tidewater Arena, Auckland")
    private val jo = CrewKeys.generate()
    private val sam = CrewKeys.generate()
    private val link = "https://tickets.example.com/ivory-tide/akl-2027?id=42"

    // ---- The tick ----

    @Test fun aTickOpensWithWhoSentItAndFitsOneBluetoothPacket() {
        val blob = crew.sealTicket(GigGroup.Ticket(now, has = true), jo)
        val t = assertNotNull(crew.openTicket(blob))
        assertEquals(jo.tag, t.sender)
        assertEquals(now, t.timeSec)
        assertTrue(t.has)
        assertNotEquals(0L, t.id)
        assertTrue(blob.size <= MessagePacket.MAX_PAYLOAD, "${blob.size}")
        assertEquals(0, blob.size % 16, "padded like every envelope")
        val off = assertNotNull(crew.openTicket(crew.sealTicket(GigGroup.Ticket(now + 5, has = false), jo)))
        assertFalse(off.has)
    }

    @Test fun aTickIsOnlyForItsCrewAndCantBeAltered() {
        val blob = crew.sealTicket(GigGroup.Ticket(now, true), jo)
        val other = GigGroup.create("Other", now * 1000)
        assertNull(other.openTicket(blob))
        // Flip a bit anywhere: the envelope's seal fails.
        for (i in blob.indices step 7) {
            val bad = blob.copyOf().also { it[i] = (it[i].toInt() xor 1).toByte() }
            assertNull(crew.openTicket(bad), "byte $i")
        }
        // Other messages aren't ticks, and a tick isn't any of them.
        assertNull(crew.openTicket(crew.sealHere(GigGroup.Here(now, 20, -36.8, 174.7), jo)))
        assertNull(crew.openHere(blob))
        assertNull(crew.openPing(blob))
    }

    @Test fun aCrewMateCantSignATickAsSomeoneElse() {
        // Sam's key in the body, Jo's signature: refused.
        val env = crew.openEnvelope(crew.sealTicket(GigGroup.Ticket(now, true), jo))!!
        val body = env.body.copyOf()
        sam.pub.copyInto(body, 2)
        assertNull(crew.ticketOf(GigGroup.Envelope(env.type, body, env.timeSec)))
        // And a re-dated copy of Jo's tick doesn't check out either.
        assertNull(crew.ticketOf(GigGroup.Envelope(env.type, env.body, env.timeSec + 60)))
    }

    @Test fun theIdIsTheSameForEveryCopyAndUnderANewKey() {
        val t = GigGroup.Ticket(now, true)
        val a = crew.openTicket(crew.sealTicket(t, jo))!!
        val b = crew.openTicket(crew.sealTicket(t, jo))!!
        assertEquals(a.id, b.id)
        val moved = crew.moved(ByteArray(32) { 3 })
        assertEquals(a.id, moved.openTicket(moved.sealTicket(t, jo))!!.id)
        assertNotEquals(a.id, crew.openTicket(crew.sealTicket(t.copy(has = false), jo))!!.id)
    }

    // ---- Newest per mate ----

    @Test fun theNewestTickFromEachMateWinsAndUntickingIsJustNewer() {
        val book = TicketBook()
        assertTrue(book.offer(GigGroup.Ticket(now, true, jo.tag), now))
        assertTrue(book.has(jo.tag))
        assertFalse(book.has(sam.tag))
        assertTrue(book.offer(GigGroup.Ticket(now + 60, false, jo.tag), now + 60))
        assertFalse(book.has(jo.tag), "unticked")
        // An older copy arriving late changes nothing.
        assertFalse(book.offer(GigGroup.Ticket(now, true, jo.tag), now + 70))
        assertFalse(book.has(jo.tag))
        // A far-future tick can't lock it.
        assertFalse(book.offer(GigGroup.Ticket(now + 86_400 * 365, true, jo.tag), now + 70))
        // Unsigned: nobody.
        assertFalse(book.offer(GigGroup.Ticket(now, true, 0L), now))
        assertEquals(mapOf(jo.tag to false), book.all())
    }

    @Test fun ourNextTickIsAlwaysStampedAfterOurLast() {
        assertEquals(now + 11, TicketRule.stamp(now, now + 10))
        assertEquals(now, TicketRule.stamp(now, now - 10))
        // A saved time far ahead (an old clock) can't push ours into the future for good.
        assertTrue(TicketRule.stamp(now, now + 999_999) <= now + TicketRule.FUTURE_SLACK_SEC + 1)
    }

    @Test fun theBookSurvivesARestartAndDropsMatesWhoLeft() {
        val book = TicketBook()
        book.offer(GigGroup.Ticket(now, true, jo.tag), now)
        book.offer(GigGroup.Ticket(now, false, sam.tag), now)
        val back = TicketBook.load(book.save(), now)
        assertTrue(back.has(jo.tag))
        assertFalse(back.has(sam.tag))
        assertEquals(now, back.timeOf(sam.tag))
        back.keepOnly(setOf(sam.tag))
        assertEquals(setOf(sam.tag), back.all().keys)
        // Rubbish and far-future times are cleaned up when loaded.
        val odd = TicketBook.load("x\n0:1:5\n7:1:${now + 999_999}\n8:1", now)
        assertEquals(setOf(7L), odd.all().keys)
        assertEquals(now + TicketRule.FUTURE_SLACK_SEC, odd.timeOf(7L))
        assertTrue(TicketBook.load(null, now).all().isEmpty())
    }

    @Test fun ourTickIsPostedAgainOnceADayUntilTheGig() {
        // Never posted: due.
        assertTrue(TicketRule.repostDue(0L, now, gig))
        // Posted earlier today (UTC): not yet.
        val day = Math.floorDiv(now, 86_400L) * 86_400L
        assertFalse(TicketRule.repostDue(day + 10, day + 3_600, gig))
        // Posted yesterday: due again.
        assertTrue(TicketRule.repostDue(day - 10, day + 3_600, gig))
        // After the gig has started: never (the hype group is over).
        assertFalse(TicketRule.repostDue(0L, gig + 1, gig))
    }

    // ---- The nudge ----

    @Test fun theMakerIsNudgedOnceWhenEveryoneHasATicket() {
        val book = TicketBook()
        val everyone = setOf(owner.tag, jo.tag, sam.tag)
        book.offer(GigGroup.Ticket(now, true, owner.tag), now)
        book.offer(GigGroup.Ticket(now, true, jo.tag), now)
        assertFalse(TicketNudge.due(isMaker = true, alreadyNudged = false, crew = everyone, book = book), "Sam hasn't got one")
        book.offer(GigGroup.Ticket(now + 1, true, sam.tag), now + 1)
        assertTrue(TicketNudge.due(isMaker = true, alreadyNudged = false, crew = everyone, book = book))
        assertFalse(TicketNudge.due(isMaker = false, alreadyNudged = false, crew = everyone, book = book), "only the maker")
        assertFalse(TicketNudge.due(isMaker = true, alreadyNudged = true, crew = everyone, book = book), "only once")
        assertFalse(TicketNudge.due(isMaker = true, alreadyNudged = false, crew = setOf(owner.tag), book = book), "a crew of one")
    }

    // ---- The countdown ----

    @Test fun theCountdownCountsCalendarDays() {
        // The mock-up: 16 Nov 2026 to Sat 13 Mar 2027 is 117 days.
        assertEquals(117, Countdown.daysUntil(gig, now * 1000, nz))
        // Late the night before an 8 pm gig: tomorrow, though it's less than a day away.
        val gigDay = at("2027-03-13T20:00").epochSecond
        assertEquals(1, Countdown.daysUntil(gigDay, at("2027-03-12T23:30").toEpochMilli(), nz))
        assertEquals(0, Countdown.daysUntil(gigDay, at("2027-03-13T00:10").toEpochMilli(), nz))
        // Over the clocks going back (NZ, 4 Apr 2027): still whole days.
        assertEquals(3, Countdown.daysUntil(at("2027-04-05T20:00").epochSecond, at("2027-04-02T21:00").toEpochMilli(), nz))
        // Never negative.
        assertEquals(0, Countdown.daysUntil(gigDay, at("2027-03-14T10:00").toEpochMilli(), nz))
        // By this phone's calendar: the same moment is a day further for someone in London.
        val london = ZoneId.of("Europe/London")
        assertEquals(118, Countdown.daysUntil(gig, now * 1000, london))
    }

    // ---- The ticket link ----

    @Test fun onlyPlainHttpsLinksCountAndKeysAreDropped() {
        assertEquals(link, TicketLink.clean(link))
        assertEquals(link, TicketLink.clean("  $link "))
        assertNull(TicketLink.clean("http://tickets.example.com/x"))
        assertNull(TicketLink.clean("javascript:alert(1)"))
        assertNull(TicketLink.clean("intent://scan/#Intent;scheme=zxing;end"))
        assertNull(TicketLink.clean("file:///sdcard/x.html"))
        assertNull(TicketLink.clean("https://user:pass@tickets.example.com/"))
        assertNull(TicketLink.clean("https://tickets example.com/"))
        assertNull(TicketLink.clean("https://localhost/x"))
        assertNull(TicketLink.clean("https://" + "a".repeat(300) + ".com"))
        assertNull(TicketLink.clean(""))
        // A listing service's key never travels with the crew.
        assertEquals(
            "https://www.bandsintown.com/t/1001?came_from=267&utm_medium=api",
            TicketLink.clean("https://www.bandsintown.com/t/1001?app_id=SECRETAPP&came_from=267&utm_medium=api"),
        )
        assertEquals("https://t.example.com/e/1#seats", TicketLink.clean("https://t.example.com/e/1?apikey=abc&API_KEY=d#seats"))
    }

    @Test fun theMakersSignedLinkTravelsWithTheInvite() {
        val g = crew.withTickets(link, owner)
        assertEquals(link, g.ticketLink)
        val joined = assertNotNull(GigGroup.parseQr(GigGroup.qr(g), now * 1000))
        assertEquals(link, joined.ticketLink)
        // Saved and loaded fields, and a move to a new key, keep it.
        assertEquals(link, GigGroup(g.key, g.name, g.createdAtMs, g.startsAtSec, g.venue, null, null, g.ownerPub, g.ownerSalt, g.tickets, g.ticketsSig).ticketLink)
        assertEquals(link, g.moved(GigGroup.ownedKey(owner.pub, ByteArray(32) { 5 }), owner.pub, ByteArray(32) { 5 }).ticketLink)
        // A crew without one has none, and its invite says nothing about tickets.
        assertNull(crew.ticketLink)
        assertFalse(GigGroup.qr(crew).contains("&tk="))
    }

    @Test fun aSwappedLinkInAForwardedInviteIsDroppedButTheInviteStillWorks() {
        val qr = GigGroup.qr(crew.withTickets(link, owner))
        val forged = qr.replace(java.net.URLEncoder.encode(link, "UTF-8"), java.net.URLEncoder.encode("https://evil.example.net/pay", "UTF-8"))
        assertNotEquals(qr, forged)
        val joined = assertNotNull(GigGroup.parseQr(forged, now * 1000))
        assertNull(joined.ticketLink)
        assertTrue(joined.key.contentEquals(crew.key), "same crew")
        // A crew mate who isn't the owner can't set one.
        assertNull(crew.withTickets(link, jo).ticketLink)
        // Nor can anyone on a crew with no owner.
        val plain = GigGroup.create("Plain", now * 1000)
        assertNull(plain.withTickets(link, jo).ticketLink)
        // A link that isn't https is no link.
        assertNull(crew.withTickets("http://tickets.example.com/x", owner).ticketLink)
        // The maker's key-carrying link is cleaned before it's signed.
        assertEquals("https://www.bandsintown.com/t/9", crew.withTickets("https://www.bandsintown.com/t/9?app_id=K", owner).ticketLink)
    }
}
