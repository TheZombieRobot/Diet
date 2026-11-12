package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class MessageRulesTest {
    private val now = 1_800_000_000L
    private val group = GigGroup.create("Laneway", now * 1000)
    private val jo = CrewKeys.generate()

    // ---- One id per message ----

    @Test fun idSurvivesReSealing() {
        val p = GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", now, text = "Bar's quiet right now")
        val first = assertNotNull(group.openPing(group.sealPing(p, jo)))
        // A retry seals and signs again: different bytes, same message.
        val second = assertNotNull(group.openPing(group.sealPing(p, jo)))
        assertNotEquals(0L, first.id)
        assertEquals(first.id, second.id)
        // ...and the copy in someone's History bundle has it too.
        val line = GigGroup.HistoryLine(first.kind, first.from, first.sender, first.timeSec, first.text, first.minutes, 0, 0, first.pub, first.sig)
        assertEquals(first.id, line.id)
        assertTrue(group.verifyLine(line))
    }

    @Test fun idTellsMessagesApart() {
        fun id(kind: Int, t: Long, text: String, who: CrewKeys.Signer = jo, name: String = "Jo", lat: Double? = null) =
            group.openPing(group.sealPing(GigGroup.Ping(kind, name, t, lat, lat?.let { 174.76 }, text = text), who))!!.id
        val base = id(GigGroup.Ping.CHAT, now, "hi")
        assertNotEquals(base, id(GigGroup.Ping.CHAT, now + 1, "hi"))
        assertNotEquals(base, id(GigGroup.Ping.CHAT, now, "hi!"))
        assertNotEquals(base, id(GigGroup.Ping.CHAT, now, "hi", who = CrewKeys.generate()))
        // The old key (sender|time|text) couldn't tell a quick ping from a "joined" line in the same second.
        assertNotEquals(id(GigGroup.Ping.COMING, now, ""), id(GigGroup.Ping.JOIN, now, ""))
        // Where it was sent from is part of it; the display name is not.
        assertNotEquals(id(GigGroup.Ping.NEED_HELP, now, ""), id(GigGroup.Ping.NEED_HELP, now, "", lat = -36.85))
        assertEquals(base, id(GigGroup.Ping.CHAT, now, "hi", name = "Joanna"))
    }

    @Test fun idSurvivesTheCrewMovingToANewKey() {
        // After a rekey the author signs again under the new key; whoever already has it must see one message.
        val fresh = GigGroup(ByteArray(32) { 9 }, group.name, group.createdAtMs)
        val p = GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", now, text = "Gate C in 5")
        val old = group.openPing(group.sealPing(p, jo))!!
        val again = fresh.openPing(fresh.sealPing(p, jo))!!
        assertEquals(old.id, again.id)
        assertNull(fresh.openPing(group.sealPing(p, jo))) // but the old bytes don't open under the new key
    }

    @Test fun unsignedPingHasNoId() {
        assertEquals(0L, group.openPing(group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", now, text = "hi")))!!.id)
    }

    // ---- Signed meet-up pin ----

    @Test fun signedPinOpensAndSaysWhoSetIt() {
        val pin = GigGroup.Rally(-41.2865, 174.7762, "Sound desk", now)
        val blob = group.sealRally(pin, jo)
        val opened = assertNotNull(group.openRally(blob))
        assertEquals(jo.tag, opened.sender)
        assertNotEquals(0L, opened.id)
        assertEquals("Sound desk", opened.name)
        assertEquals(now, opened.timeSec)
        // Small enough for one crowd-relay packet.
        assertTrue(blob.size <= MessagePacket.MAX_PAYLOAD, "${blob.size}")
        // An older build's unsigned pin still opens, with no sender.
        assertEquals(0L, group.openRally(group.sealRally(pin))!!.sender)
        assertNull(GigGroup.create("other", 0).openRally(blob))
    }

    @Test fun pinSignedBySomeoneElseForADifferentSpotIsDropped() {
        // Take Jo's signature and try to hang it on a different pin: sealing needs the crew
        // key, which an insider has, so the signature is what stops it.
        val real = GigGroup.Rally(-41.2865, 174.7762, "Sound desk", now)
        val a = group.openRally(group.sealRally(real, jo))!!
        val b = group.openRally(group.sealRally(real.copy(name = "Car park"), jo))!!
        assertNotEquals(a.id, b.id)
        // A pin signed for another crew doesn't open here even with the same signer.
        val other = GigGroup.create("other", 0)
        assertNull(group.openRally(other.sealRally(real, jo)))
    }

    @Test fun aPinOffTheGlobeIsDropped() {
        // Only a hostile crew mate makes one, and the map throws drawing it: it never gets there.
        assertNull(group.openRally(group.sealRally(GigGroup.Rally(Double.NaN, 174.7762, "x", now), jo)))
        assertNull(group.openRally(group.sealRally(GigGroup.Rally(91.0, 174.7762, "x", now), jo)))
        assertNull(group.openRally(group.sealRally(GigGroup.Rally(-41.2865, 181.0, "x", now), jo)))
        assertNull(group.openRally(group.sealRally(GigGroup.Rally(-41.2865, Double.POSITIVE_INFINITY, "x", now), jo)))
        // The edges are real places, and a cleared pin (0, 0) still opens.
        assertNotNull(group.openRally(group.sealRally(GigGroup.Rally(-90.0, 180.0, "x", now), jo)))
        assertNotNull(group.openRally(group.sealRally(GigGroup.Rally(0.0, 0.0, "", now), jo)))
    }

    @Test fun aFarFuturePinCannotLockTheCrewsPin() {
        // Was: newest time wins, no cap. One pin dated years ahead won forever.
        assertFalse(PinRule.accepts(incomingSec = now + 10 * 365 * 86_400L, currentSec = now - 60, nowSec = now))
        assertTrue(PinRule.accepts(incomingSec = now + 30, currentSec = now - 60, nowSec = now)) // clocks a little apart
        assertFalse(PinRule.accepts(incomingSec = now - 120, currentSec = now - 60, nowSec = now)) // older
        // A lock saved by an older build is cut back when loaded, and the next pin beats it.
        val saved = PinRule.capped(now + 10 * 365 * 86_400L, now)
        assertTrue(PinRule.accepts(PinRule.stamp(now + 400, saved), saved, now + 400))
        // A phone with a slow clock can still move the pin: stamped just after the one it replaces.
        assertEquals(now + 1, PinRule.stamp(nowSec = now - 90, currentSec = now))
    }

    // ---- New envelope ----

    @Test fun envelopeRoundTripAndPadding() {
        for (n in listOf(0, 1, 9, 16, 40, 150)) {
            val body = ByteArray(n) { (it * 3).toByte() }
            val blob = group.sealEnvelope(GigGroup.ENV_RECEIPT, body, now)
            assertEquals(0, blob.size % 16, "size ${blob.size} for a $n-byte body")
            val e = assertNotNull(group.openEnvelope(blob))
            assertEquals(GigGroup.ENV_RECEIPT, e.type)
            assertContentEquals(body, e.body)
            assertEquals(now, e.timeSec)
        }
    }

    @Test fun olderBuildsCannotMistakeAnEnvelopeForAPing() {
        // Older builds try openPing, openHistory, openRally and openDirect on what they fetch.
        val blob = group.sealEnvelope(GigGroup.ENV_HAVE, ByteArray(40), now)
        assertNull(group.openPing(blob))
        assertNull(group.openRally(blob))
        assertNull(group.openHistory(blob))
        assertNull(group.openDirect(blob, jo))
        assertNull(GigGroup.create("other", 0).openEnvelope(blob))
        // And the other way round.
        assertNull(group.openEnvelope(group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", now, text = "hi"), jo)))
    }

    // ---- Intro without the constant prefix ----

    @Test fun introSecondFormHidesTheCrewPassPrefix() {
        val pass = ByteArray(32) { (it + 40).toByte() }
        val intro = group.signedIntro(pass, "Jo", jo)
        val ms = now * 1000
        val old = group.sealIntro(intro, ms)
        // The first form carries the first 4 bytes of the pass in the clear, all night.
        assertContentEquals(pass.copyOf(4), old.copyOfRange(12, 16))
        val a = group.sealIntro(intro, ms, form2 = true)
        val b = group.sealIntro(intro, ms + 1000, form2 = true)
        assertFalse(a.copyOfRange(12, 20).contentEquals(b.copyOfRange(12, 20)), "the salt changes every time")
        assertFalse(a.copyOfRange(12, 16).contentEquals(pass.copyOf(4)))
        assertTrue(a.size <= GigGroup.MAX_INTRO2_BYTES)
        val opened = assertNotNull(group.openIntro(a, ms))
        assertTrue(opened.form2)
        assertEquals(intro, opened)
        assertNotNull(opened.sig)
        assertFalse(group.openIntro(old, ms)!!.form2)
        assertNull(GigGroup.create("other", ms).openIntro(a, ms))
        a[a.size - 2] = (a[a.size - 2].toInt() xor 1).toByte()
        assertNull(group.openIntro(a, ms))
    }

    // A member's intro as another phone hears it, in either form; [own] = sealed by the member (signed), not passed on.
    private fun heardIntro(pass: ByteArray, name: String, form2: Boolean, own: Boolean = true): GigGroup.Intro {
        val ms = now * 1000
        val intro = if (own) group.signedIntro(pass, name, CrewKeys.generate()) else GigGroup.Intro(pass, name, CrewKeys.generate().pub)
        return assertNotNull(group.openIntro(group.sealIntro(intro, ms, form2), ms))
    }

    @Test fun theOldIntroFormStaysOnAirUntilEveryCrewMateReadsTheNewOne() {
        val forms = IntroForms()
        val jo = ByteArray(32) { 1 }
        val sam = ByteArray(32) { 2 }
        val crew = listOf(jo, sam)
        // Nobody known to read the new form: our own intro takes turns, so older builds still hear it.
        assertFalse(forms.newOnly(crew))
        assertEquals(listOf(false, true, false, true), (0..3).map { forms.ownForm2(it, crew) })
        // Jo's own intro in the new form: Jo's phone writes it, so reads it.
        assertTrue(forms.heard(heardIntro(jo, "Jo", form2 = true)))
        assertFalse(forms.heard(heardIntro(jo, "Jo", form2 = true)), "nothing new the second time")
        assertTrue(forms.reads(jo))
        assertFalse(forms.newOnly(crew), "Sam hasn't shown it yet")
        // Sam's intro in the old form, or passed on by someone else in the new one, proves nothing about Sam's phone.
        assertFalse(forms.heard(heardIntro(sam, "Sam", form2 = false)))
        assertFalse(forms.heard(heardIntro(sam, "Sam", form2 = true, own = false)))
        assertFalse(forms.newOnly(crew))
        assertTrue(forms.heard(heardIntro(sam, "Sam", form2 = true)))
        // Everyone reads it: the form with the constant prefix goes off the air.
        assertTrue(forms.newOnly(crew))
        assertEquals(listOf(true, true, true, true), (0..3).map { forms.ownForm2(it, crew) })
    }

    @Test fun someoneNewOnAnOlderBuildBringsTheOldIntroFormBack() {
        val forms = IntroForms()
        val jo = ByteArray(32) { 1 }
        forms.heard(heardIntro(jo, "Jo", form2 = true))
        assertTrue(forms.newOnly(listOf(jo)))
        val newcomer = ByteArray(32) { 9 }
        assertFalse(forms.newOnly(listOf(jo, newcomer)))
        assertFalse(forms.ownForm2(0, listOf(jo, newcomer)), "back to taking turns")
        // A crew of one (waiting for the others to join) never drops the old form.
        assertFalse(forms.newOnly(emptyList()))
    }

    @Test fun whoReadsTheNewIntroFormIsRememberedWithoutKeepingTheirPass() {
        val forms = IntroForms()
        val jo = ByteArray(32) { 1 }
        forms.heard(heardIntro(jo, "Jo", form2 = true))
        val saved = forms.snapshot()
        assertFalse(saved.contains(jo.joinToString("") { "%02x".format(it) }.take(16)), "a hash, not the pass")
        val again = IntroForms(saved)
        assertTrue(again.reads(jo))
        assertFalse(again.reads(ByteArray(32) { 2 }))
        assertTrue(IntroForms("not,a,real,list").snapshot().isEmpty())
        // The list is capped: the oldest entries go first.
        val small = IntroForms(max = 2)
        (1..3).forEach { small.heard(heardIntro(ByteArray(32) { _ -> it.toByte() }, "M$it", form2 = true)) }
        assertFalse(small.reads(ByteArray(32) { 1 }))
        assertTrue(small.reads(ByteArray(32) { 3 }))
    }

    // ---- States only move forward ----

    @Test fun aMessagesStateOnlyMovesForward() {
        val s = OutboxState
        // The path: sending, waiting, sent nearby, sent.
        assertTrue(s.mayMove(s.SENDING, s.WAITING))
        assertTrue(s.mayMove(s.WAITING, s.NEARBY))
        assertTrue(s.mayMove(s.NEARBY, s.SENT))
        assertTrue(s.mayMove(s.SENDING, s.SENT))
        // Never back: a late "waiting" can't undo "sent nearby", and nothing undoes "sent".
        assertFalse(s.mayMove(s.NEARBY, s.WAITING))
        assertFalse(s.mayMove(s.SENT, s.NEARBY))
        assertFalse(s.mayMove(s.SENT, s.WAITING))
        assertFalse(s.mayMove(s.SENT, s.FAILED))
        assertFalse(s.mayMove(s.NEARBY, s.FAILED), "a crew phone has it: that isn't a failure")
        assertFalse(s.mayMove(s.SENT, s.SENT))
        // Giving up, and trying again.
        assertTrue(s.mayMove(s.WAITING, s.FAILED))
        assertTrue(s.mayMove(s.FAILED, s.SENDING))
        assertTrue(s.mayMove(s.FAILED, s.SENT))
        // The numbers saved chats already hold keep their meaning.
        assertEquals(listOf(0, 1, 2), listOf(s.SENT, s.SENDING, s.FAILED))
    }

    // ---- Clocks and order ----

    @Test fun aReplyNeverSortsAboveWhatItAnswers() {
        // C's clock is 3 minutes slow. D asks at 21:01:30; C answers.
        val dAsks = now + 90
        val cClock = now + 120 - 180
        val cReplies = MessageClock.stamp(cClock, newestSeenSec = dAsks)
        assertTrue(cReplies > dAsks)
        // Normal case: the phone's own clock.
        assertEquals(now, MessageClock.stamp(now, newestSeenSec = now - 40))
        // A wildly wrong clock in the crew isn't followed (or every later message would drift to it).
        assertEquals(now, MessageClock.stamp(now, newestSeenSec = now + 3600))
        // Two quick messages never share a second.
        assertEquals(now + 1, MessageClock.stamp(now, newestSeenSec = 0, lastOwnSec = now))
    }

    @Test fun aMessageFromTheFutureSortsWhenItArrived() {
        assertEquals(now, MessageClock.sortTime(timeSec = now + 3600, arrivedSec = now))
        assertEquals(now + 60, MessageClock.sortTime(timeSec = now + 60, arrivedSec = now)) // clocks a little apart: keep it
        assertEquals(now - 600, MessageClock.sortTime(timeSec = now - 600, arrivedSec = now)) // carried and late: its own time
    }

    @Test fun everyPhoneShowsTheSameOrder() {
        val msgs = listOf(now to 7L, now to -3L, now - 5 to 9L, now + 2 to 1L)
        val sorted = { l: List<Pair<Long, Long>> -> l.sortedWith { a, b -> MessageClock.compare(a.first, a.second, b.first, b.second) } }
        assertEquals(sorted(msgs), sorted(msgs.reversed()))
        assertEquals(sorted(msgs), sorted(msgs.shuffled(java.util.Random(4))))
        assertEquals(now - 5, sorted(msgs).first().first)
    }

    // ---- Pings by kind and age ----

    @Test fun needHelpIsNeverDropped() {
        // Was: anything older than 20 minutes vanished, Need help included.
        for (age in listOf(0L, 19 * 60L, 21 * 60L, 3 * 3600L, 11 * 3600L)) {
            val v = PingPolicy.onArrival(GigGroup.Ping.NEED_HELP, now - age, 0, now)
            assertTrue(v.show && v.alert, "Need help ${age / 60} min old")
            assertEquals(age > 20 * 60, v.late)
        }
        // A day later it's still shown, just not as an alarm.
        val old = PingPolicy.onArrival(GigGroup.Ping.NEED_HELP, now - 30 * 3600L, 0, now)
        assertTrue(old.show && !old.alert && old.late)
        assertEquals(RelayUse.SAFETY, PingPolicy.use(GigGroup.Ping.NEED_HELP))
        assertTrue(PingPolicy.alsoHeld(GigGroup.Ping.NEED_HELP))
        assertTrue(PingPolicy.crowdSec(GigGroup.Ping.NEED_HELP) > PingPolicy.crowdSec(GigGroup.Ping.COMING))
    }

    @Test fun otherLatePingsStillShowButDoNotBuzz() {
        val fresh = PingPolicy.onArrival(GigGroup.Ping.COMING, now - 60, 0, now)
        assertTrue(fresh.show && fresh.alert && !fresh.late)
        val late = PingPolicy.onArrival(GigGroup.Ping.COMING, now - 45 * 60, 0, now)
        assertTrue(late.show && !late.alert && late.late)
        // A flare is live for as long as it says, whenever it arrives.
        assertTrue(PingPolicy.onArrival(GigGroup.Ping.FLARE, now - 25 * 60, 30, now).alert)
        assertFalse(PingPolicy.onArrival(GigGroup.Ping.FLARE, now - 31 * 60, 30, now).alert)
    }

    @Test fun aPingStampedInTheFutureCountsFromWhenItArrived() {
        val v = PingPolicy.onArrival(GigGroup.Ping.NEED_HELP, now + 5 * 3600L, 0, now)
        assertTrue(v.show && v.alert)
        assertEquals(now, v.timeSec)
        assertEquals(now + 30, PingPolicy.onArrival(GigGroup.Ping.ALL_GOOD, now + 30, 0, now).timeSec)
    }

    @Test fun kindsThisBuildDoesNotKnowAreIgnoredNotAnnounced() {
        // Older builds announce any unknown kind as "pinged the crew".
        for (kind in listOf(0, 13, 15, 40, 200)) {
            val v = PingPolicy.onArrival(kind, now, 0, now)
            assertFalse(v.show || v.alert, "kind $kind")
        }
        for (kind in listOf(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14)) assertTrue(PingPolicy.group(kind) != PingPolicy.Group.UNKNOWN, "kind $kind")
    }
}
