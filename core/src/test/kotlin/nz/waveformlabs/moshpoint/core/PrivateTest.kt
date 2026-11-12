package nz.waveformlabs.moshpoint.core

import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Private messages (docs/PRIVATE_MESSAGES.md): sealing to one person, what everyone else sees, the mailbox, the book of threads. */
class PrivateTest {
    private val now = 1_800_000_000L
    private val group = GigGroup.create("Laneway", now * 1000)
    private val jo = CrewKeys.generate()
    private val sam = CrewKeys.generate()
    private val alex = CrewKeys.generate()

    private fun seal(text: String, from: CrewKeys.Signer = jo, to: CrewKeys.Signer = sam, t: Long = now, g: GigGroup = group): ByteArray =
        assertNotNull(g.sealPrivate(from, to.pub, text, t))

    private fun bodyOf(blob: ByteArray, g: GigGroup = group): ByteArray = assertNotNull(g.openEnvelope(blob)).body

    // ---- Sealed to one person ----

    @Test fun onlyTheRecipientCanOpenIt() {
        val blob = seal("meet at the sound desk")
        val p = assertNotNull(group.openPrivate(blob, sam))
        assertEquals("meet at the sound desk", p.text)
        assertEquals(GigGroup.privateId(bodyOf(blob)), p.id)
        assertEquals(now, p.timeSec)
        assertEquals(GigGroup.Private.TEXT, p.kind)
        assertEquals(jo.tag, p.sender)
        assertEquals(sam.tag, p.recipient)
        assertContentEquals(jo.pub, p.fromPub)
        // Another crew mate holds the crew key and still can't open it.
        assertNull(group.openPrivate(blob, alex))
        // Nor can its sender: the key it was sealed with is gone.
        assertNull(group.openPrivate(blob, jo))
        // Nor anyone outside the crew, not even the envelope.
        val other = GigGroup.create("other", now * 1000)
        assertNull(other.openEnvelope(blob))
        assertNull(other.openPrivate(blob, sam))
    }

    @Test fun everyPrivateMessageIsTheSameSizeWhateverItSays() {
        val texts = listOf("", "ok", "where r u", "x".repeat(140), "🤘".repeat(40), "é".repeat(140))
        for (t in texts) {
            val blob = seal(t)
            assertEquals(GigGroup.PRIVATE_BYTES, blob.size, "'$t'")
            // Two Bluetooth packets, like most crew chat lines.
            assertEquals(2, MessagePacket.split(blob, 0).size)
        }
        // Long text is cut at 160 bytes, never in half a character.
        val long = assertNotNull(group.openPrivate(seal("🤘".repeat(60)), sam))
        assertTrue(long.text.toByteArray().size <= GigGroup.Private.MAX_TEXT_BYTES)
        assertEquals("🤘".repeat(40), long.text)
    }

    @Test fun theCrewSeesAnIdAndATimeButNeverWhoItsFromOrFor() {
        val blob = seal("are you with Jo??")
        // Any crew phone can open the envelope, to carry it.
        val env = assertNotNull(group.openEnvelope(blob))
        assertEquals(GigGroup.ENV_PRIVATE, env.type)
        val outer = assertNotNull(group.privateOuterOf(env))
        assertEquals(group.openPrivate(blob, sam)!!.id, outer.id)
        assertEquals(now, outer.timeSec)
        // But nothing in what it can read names either person: no key, no tag.
        val body = env.body
        for (k in listOf(jo.pub, sam.pub)) {
            assertFalse(contains(body, k), "a key is in the clear")
            assertFalse(contains(body, k.copyOf(8)), "part of a key is in the clear")
        }
        for (tag in listOf(jo.tag, sam.tag)) assertFalse(contains(body, ByteBuffer.allocate(8).putLong(tag).array()), "a tag is in the clear")
        // Nor when it says it was sent: that's inside, signed. (The envelope's own time is only what carriers go by.)
        assertFalse(contains(body, ByteBuffer.allocate(4).putInt(now.toInt()).array()))
        // The same words sealed again share nothing at all: a fresh ephemeral key each time.
        val again = bodyOf(seal("are you with Jo??"))
        assertFalse(body.copyOfRange(1, 34).contentEquals(again.copyOfRange(1, 34)))
        assertFalse(body.copyOfRange(34, body.size).contentEquals(again.copyOfRange(34, again.size)))
        // A message for Sam and one for Alex look the same from outside: same size, same layout, and neither opens for the other.
        val forAlex = assertNotNull(group.openEnvelope(seal("are you with Jo??", to = alex))).body
        assertEquals(body.size, forAlex.size)
        assertNull(group.privateOf(env, alex))
        assertNull(group.privateOf(group.openEnvelope(seal("x", to = alex))!!, sam))
    }

    @Test fun theFormatIsWhatTheNoteSays() {
        // Built by hand from docs/PRIVATE_MESSAGES.md, it opens like one from sealPrivate.
        val blob = handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, text = "by hand", time = now)
        val p = assertNotNull(group.openPrivate(blob, sam))
        assertEquals("by hand", p.text)
        assertEquals(jo.tag, p.sender)
        assertEquals(GigGroup.PRIVATE_BYTES, blob.size)
    }

    // ---- Forged, altered, replayed ----

    @Test fun nobodyCanSendOneAsSomeoneElse() {
        // Alex claims to be Jo, but can only sign as Alex.
        assertNull(group.openPrivate(handMade(group, signer = alex, claimedPub = jo.pub, toPub = sam.pub, text = "it's Jo", time = now), sam))
        // Jo sent Alex something; Alex re-seals it to Sam as if Jo had written to Sam. The signature names its recipient.
        assertNull(group.openPrivate(handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, signedTo = alex.pub, text = "secret", time = now), sam))
        // Signed for one time, claiming another.
        assertNull(group.openPrivate(handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, signedTime = now - 86_400, text = "old", time = now), sam))
        // Everyone has a different signing key in every crew: in another crew, Sam's phone can't open what Jo sealed to Sam here.
        val other = GigGroup.create("other", now * 1000)
        val samThere = CrewKeys.generate()
        assertNull(other.openPrivate(other.wrapPrivate(bodyOf(seal("hi")), now), samThere))
        // A message to yourself isn't one: refused both ways.
        assertNull(group.sealPrivate(jo, jo.pub, "me", now))
        assertNull(group.openPrivate(handMade(group, signer = sam, claimedPub = sam.pub, toPub = sam.pub, text = "me", time = now), sam))
    }

    @Test fun anythingAlteredIsRefused() {
        val blob = seal("gate C")
        val env = assertNotNull(group.openEnvelope(blob))
        val id = group.openPrivate(blob, sam)!!.id
        // Re-wrapped with another time on the envelope (to make an old one look new): it's the same
        // message, with the same id and the time its sender signed. Only carriers go by the envelope's.
        val rewrapped = assertNotNull(group.openPrivate(group.wrapPrivate(env.body, now + 600), sam))
        assertEquals(id, rewrapped.id)
        assertEquals(now, rewrapped.timeSec)
        // Its version byte changed.
        val newVer = env.body.copyOf().also { it[0] = 2 }
        assertNull(group.openPrivate(group.wrapPrivate(newVer, now), sam))
        // Its ephemeral key swapped.
        val newEph = env.body.copyOf().also { CrewKeys.generate().pub.copyInto(it, 1) }
        assertNull(group.openPrivate(group.wrapPrivate(newEph, now), sam))
        // Any byte of the sealed part.
        for (i in listOf(34, 100, 200, env.body.size - 1)) {
            val flipped = env.body.copyOf().also { it[i] = (it[i].toInt() xor 1).toByte() }
            assertNull(group.openPrivate(group.sealEnvelope(GigGroup.ENV_PRIVATE, flipped, now), sam), "byte $i")
        }
        // Any byte of the envelope, the clear time included.
        for (i in listOf(0, 3, 12, blob.size - 1)) {
            val flipped = blob.copyOf().also { it[i] = (it[i].toInt() xor 1).toByte() }
            assertNull(group.openPrivate(flipped, sam), "envelope byte $i")
        }
        // Cut short, or longer.
        assertNull(group.openPrivate(group.sealEnvelope(GigGroup.ENV_PRIVATE, env.body.copyOf(env.body.size - 1), now), sam))
        assertNull(group.openPrivate(group.sealEnvelope(GigGroup.ENV_PRIVATE, env.body + byteArrayOf(0), now), sam))
        // The untouched one still opens.
        assertNotNull(group.openPrivate(blob, sam))
    }

    @Test fun aReplayIsShownOnceAndAnOldOneNotAtAll() {
        val book = PrivateBook()
        val blob = seal("same again")
        val p = assertNotNull(group.openPrivate(blob, sam))
        assertTrue(book.offer(p, mate = true, viewing = false, nowSec = now).shown)
        // The same bytes again, by another route.
        assertFalse(book.offer(assertNotNull(group.openPrivate(blob, sam)), mate = true, viewing = false, nowSec = now + 5).shown)
        // The same message in a new envelope, dated later on the outside (new bytes, same id).
        assertFalse(book.offer(assertNotNull(group.openPrivate(group.wrapPrivate(bodyOf(blob), now + 3600), sam)), mate = true, viewing = false, nowSec = now + 9).shown)
        assertEquals(1, book.thread(jo.tag).size)
        // After a restart too.
        val restored = PrivateBook().also { it.restore(book.save()) }
        assertFalse(restored.offer(p, mate = true, viewing = false, nowSec = now + 60).shown)
        // Older than the relay keeps anything: a replay, or a clock days out.
        val old = assertNotNull(group.openPrivate(seal("from last week", t = now - PrivateRule.MAX_AGE_SEC - 1), sam))
        assertFalse(book.offer(old, mate = true, viewing = false, nowSec = now).shown)
        val justInTime = assertNotNull(group.openPrivate(seal("from three days ago", t = now - PrivateRule.MAX_AGE_SEC + 60), sam))
        assertTrue(book.offer(justInTime, mate = true, viewing = false, nowSec = now).shown)
    }

    // ---- Ids ----

    @Test fun oneIdForEveryCopyAndAfterTheCrewMovesToANewKey() {
        val body = assertNotNull(group.privateBody(jo, sam.pub, "hello", now))
        val id = GigGroup.privateId(body)
        // Two copies (one by Bluetooth, one off the relay, say): different envelopes, one id.
        val a = group.wrapPrivate(body, now)
        val b = group.wrapPrivate(body, now)
        assertFalse(a.contentEquals(b))
        assertEquals(id, group.openPrivate(a, sam)!!.id)
        assertEquals(id, group.openPrivate(b, sam)!!.id)
        // What carriers see is that same id.
        assertEquals(id, group.privateOuterOf(group.openEnvelope(a)!!)!!.id)
        // The crew moves to a new key; signing keys stay, and the same body goes in the new key's envelope.
        val fresh = group.moved(ByteArray(32) { 9 })
        val again = fresh.wrapPrivate(body, now)
        assertEquals(id, fresh.openPrivate(again, sam)!!.id)
        assertEquals(id, fresh.privateOuterOf(fresh.openEnvelope(again)!!)!!.id)
        // An old-key copy isn't a new-key message.
        assertNull(fresh.openPrivate(a, sam))
        // The same words sealed again are another message.
        assertNotEquals(id, group.openPrivate(seal("hello"), sam)!!.id)
        assertNotEquals(0L, id)
    }

    @Test fun nobodyCanMakeSomethingElseThatClaimsAMessagesId() {
        // The id is a hash of the whole body, so a crew mate can't post junk under a real message's
        // id to make the recipient's phone think it already has it.
        val real = bodyOf(seal("the real one"))
        val id = GigGroup.privateId(real)
        val r = java.util.Random(4)
        repeat(500) {
            val altered = real.copyOf().also { b -> val i = r.nextInt(b.size); b[i] = (b[i].toInt() xor (1 + r.nextInt(255))).toByte() }
            assertNotEquals(id, GigGroup.privateId(altered))
            assertNull(group.openPrivate(group.wrapPrivate(altered, now), sam))
        }
    }

    // ---- The mailbox ----

    @Test fun thePrivateMailboxIsItsOwnAndChangesDaily() {
        val day = now / 86_400
        val box = group.privateIdForDay(day)
        assertEquals(16, box.size)
        assertContentEquals(box, group.privateIdForDay(day))
        val others = listOf(
            group.chatIdForDay(day), group.rallyIdForDay(day), group.momentsIdForDay(day),
            group.pingIdForEpoch(day), group.rosterIdForEpoch(day), group.privateIdForDay(day - 1), group.privateIdForDay(day + 1),
            GigGroup.create("other", now * 1000).privateIdForDay(day), group.moved(ByteArray(32) { 4 }).privateIdForDay(day),
        )
        others.forEach { assertFalse(it.contentEquals(box)) }
        // Nothing in it is the chat mailbox's id, or any part of the crew key.
        assertFalse(contains(box, group.chatIdForDay(day).copyOf(4)))
        assertFalse(contains(group.key, box.copyOf(4)))
    }

    // ---- Older builds ----

    @Test fun olderBuildsCantMisreadIt() {
        val blob = seal("only for Sam")
        // Everything older builds try on what they fetch or hear.
        assertNull(group.openPing(blob))
        assertNull(group.openRally(blob))
        assertNull(group.openHistory(blob))
        assertNull(group.openIntro(blob, now * 1000))
        assertNull(group.openMoment(blob))
        assertNull(group.openDirect(blob, sam))
        assertNull(group.openHere(blob))
        // Builds with the envelope see a type they don't act on (control types are 1, 2 and 3).
        val env = assertNotNull(group.openEnvelope(blob))
        assertTrue(env.type !in setOf(GigGroup.ENV_HAVE, GigGroup.ENV_RECEIPT, GigGroup.ENV_RETIRED, GigGroup.ENV_HERE))
        // And "keep as friend" messages are still what they were: a private message isn't one, and theirs isn't a private message.
        val direct = assertNotNull(group.sealDirect(jo, sam.pub, 1, ByteArray(40), now))
        assertNotNull(group.openDirect(direct, sam))
        assertNull(group.openPrivate(direct, sam))
        assertNull(group.openEnvelope(direct))
    }

    @Test fun otherEnvelopesAndGarbageAreNotPrivateMessages() {
        assertNull(group.openPrivate(group.sealHere(GigGroup.Here(now, 20, 1.0, 2.0), jo), sam))
        assertNull(group.openPrivate(group.sealEnvelope(GigGroup.ENV_RECEIPT, ByteArray(10), now), sam))
        val r = java.util.Random(3)
        var carried = 0
        repeat(2_000) {
            val body = ByteArray(r.nextInt(400)).also { r.nextBytes(it) }
            val env = assertNotNull(group.openEnvelope(group.sealEnvelope(GigGroup.ENV_PRIVATE, body, now)))
            assertNull(group.privateOf(env, sam))
            if (group.privateOuterOf(env) != null) carried++
        }
        // Random bytes almost never even look like one (they'd need a real ephemeral key).
        assertTrue(carried < 20, "$carried")
    }

    @Test fun aLaterVersionIsCarriedButNotOpenedAndLaterFieldsAreRead() {
        // Version 2 (some future layout): carried by this build, not opened by it.
        val v2 = handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, text = "v2", time = now, ver = 2)
        assertNotNull(group.privateOuterOf(group.openEnvelope(v2)!!))
        assertNull(group.openPrivate(v2, sam))
        // Version 1 with a field this build doesn't know after the text: read, still checked by the signature.
        val more = handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, text = "hi", time = now, extra = byteArrayOf(1, 2, 3))
        assertEquals("hi", group.openPrivate(more, sam)!!.text)
        // A kind this build doesn't know opens, and the book doesn't show it.
        val reaction = assertNotNull(group.openPrivate(handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, text = "🔥", time = now, kind = 7), sam))
        assertFalse(PrivateBook().offer(reaction, mate = true, viewing = false, nowSec = now).shown)
    }

    // ---- The book of threads ----

    private fun from(who: CrewKeys.Signer, text: String, t: Long = now): GigGroup.Private =
        assertNotNull(group.openPrivate(seal(text, from = who, to = sam, t = t), sam))

    @Test fun eachMateHasAThreadInTheOrderEveryPhoneShows() {
        val book = PrivateBook()
        assertTrue(book.offer(from(jo, "second", t = now + 10), mate = true, viewing = false, nowSec = now + 20).alert)
        val first = from(jo, "first", t = now)
        assertTrue(book.offer(first, mate = true, viewing = false, nowSec = now + 20).alert)
        // Same second: by id, so every phone agrees.
        val also = from(jo, "also first", t = now)
        book.offer(also, mate = true, viewing = false, nowSec = now + 20)
        book.offer(from(alex, "hey Sam"), mate = true, viewing = false, nowSec = now + 20)
        val sameSecond = if (java.lang.Long.compareUnsigned(first.id, also.id) < 0) listOf("first", "also first") else listOf("also first", "first")
        assertEquals(sameSecond + "second", book.thread(jo.tag).map { it.text })
        assertEquals(listOf("hey Sam"), book.thread(alex.tag).map { it.text })
        assertEquals(setOf(jo.tag, alex.tag), book.mates())
        assertEquals(3, book.unread(jo.tag))
        assertEquals(4, book.totalUnread())
        assertTrue(book.markRead(jo.tag))
        assertEquals(0, book.unread(jo.tag))
        assertFalse(book.markRead(jo.tag))
        // Their key is learnt from what they sent, for replying.
        assertContentEquals(jo.pub, book.pubOf(jo.tag))
        // A clock far ahead sorts at arrival, not at the bottom for hours.
        book.offer(from(jo, "from the future", t = now + 7200), mate = true, viewing = false, nowSec = now + 30)
        book.offer(from(jo, "after it", t = now + 40), mate = true, viewing = false, nowSec = now + 45)
        assertEquals(listOf("from the future", "after it"), book.thread(jo.tag).takeLast(2).map { it.text })
        // Our next message is stamped after the newest (a stamp that far ahead is ignored there: see MessageClock).
        assertEquals(now + 7200, book.newest(jo.tag))
    }

    @Test fun onScreenItIsNeitherUnreadNorAnnounced() {
        val book = PrivateBook()
        val v = book.offer(from(jo, "you there?"), mate = true, viewing = true, nowSec = now)
        assertTrue(v.shown)
        assertFalse(v.alert)
        assertEquals(0, book.unread(jo.tag))
    }

    @Test fun aMutedMateStillArrivesButNeverNotifies() {
        val book = PrivateBook()
        book.offer(from(jo, "one"), mate = true, viewing = false, nowSec = now)
        book.mute(jo.tag, true)
        assertTrue(book.isMuted(jo.tag))
        assertEquals(0, book.unread(jo.tag), "muting clears the count")
        // A second later, as a phone stamps its next message (MessageClock): in the same second the
        // order would be by id, which is a hash of a freshly keyed body, so either way round.
        val v = book.offer(from(jo, "two", t = now + 1), mate = true, viewing = false, nowSec = now + 1)
        assertTrue(v.shown)
        assertFalse(v.alert)
        assertEquals(0, book.unread(jo.tag))
        assertEquals(listOf("one", "two"), book.thread(jo.tag).map { it.text })
        // Only Jo: Alex still notifies.
        assertTrue(book.offer(from(alex, "hi"), mate = true, viewing = false, nowSec = now).alert)
        // Kept through a restart, and undone by unmuting.
        val restored = PrivateBook().also { it.restore(book.save()) }
        assertTrue(restored.isMuted(jo.tag))
        restored.mute(jo.tag, false)
        assertTrue(restored.offer(from(jo, "three"), mate = true, viewing = false, nowSec = now).alert)
    }

    @Test fun someoneNotYetKnownWaitsAndAppearsWhenTheyAre() {
        val book = PrivateBook()
        // A mate who joined a minute ago: their phone hasn't introduced itself to ours yet.
        val early = from(alex, "hi it's Alex, just joined")
        val v = book.offer(early, mate = false, viewing = false, nowSec = now)
        assertFalse(v.shown)
        assertTrue(book.thread(alex.tag).isEmpty())
        assertTrue(book.waitingFrom(alex.tag))
        assertEquals(setOf(alex.tag), book.waitingSenders())
        // The same message again while it waits (by another route): still once.
        assertFalse(book.offer(early, mate = false, viewing = false, nowSec = now + 5).shown)
        assertFalse(book.offer(early, mate = true, viewing = false, nowSec = now + 5).shown)
        assertEquals(0, book.known(jo.tag, jo.pub, viewing = false).size)
        val shown = book.known(alex.tag, alex.pub, viewing = false)
        assertEquals(listOf("hi it's Alex, just joined"), shown.map { it.text })
        assertEquals(1, book.unread(alex.tag))
        assertFalse(book.waitingFrom(alex.tag))
        assertTrue(book.known(alex.tag, alex.pub, viewing = false).isEmpty())
        // Someone who never turns out to be a crew mate (following from home, say) is never shown.
        book.offer(from(jo, "I'm only following"), mate = false, viewing = false, nowSec = now)
        assertTrue(book.thread(jo.tag).isEmpty())
    }

    @Test fun someoneRemovedLosesTheirThreadAndIsNotShownAgain() {
        val book = PrivateBook()
        book.offer(from(jo, "hey"), mate = true, viewing = false, nowSec = now)
        book.offer(from(alex, "waiting"), mate = false, viewing = false, nowSec = now)
        book.own(jo.tag, jo.pub, 900L, now + 5, "hey back", OutboxState.WAITING, now + 5)
        book.drop(setOf(jo.tag, alex.tag))
        assertTrue(book.thread(jo.tag).isEmpty())
        assertNull(book.ownLine(900L))
        assertFalse(book.waitingFrom(alex.tag))
        assertTrue(book.known(alex.tag, alex.pub, viewing = false).isEmpty())
        // Anything later from them is not from a crew mate.
        assertFalse(book.offer(from(jo, "let me back in"), mate = false, viewing = false, nowSec = now).shown)
    }

    @Test fun ourOwnMessagesOnlyMoveForward() {
        val book = PrivateBook()
        book.own(jo.tag, jo.pub, 70L, now, "on my way", OutboxState.SENDING, now)
        assertEquals(jo.tag, book.setState(70L, OutboxState.WAITING))
        assertEquals(jo.tag, book.setState(70L, OutboxState.NEARBY))
        assertNull(book.setState(70L, OutboxState.WAITING), "never back from sent nearby")
        assertEquals(jo.tag, book.setState(70L, OutboxState.SENT))
        assertNull(book.setState(70L, OutboxState.NEARBY))
        assertEquals(OutboxState.SENT, book.thread(jo.tag).single().state)
        // Not sent, then a tap tries again: the message as it was sealed is kept until the relay has it.
        val body = ByteArray(GigGroup.PRIVATE_BYTES - 31) { 5 }
        book.own(jo.tag, jo.pub, 71L, now, "hello?", OutboxState.WAITING, now, body)
        assertEquals(jo.tag, book.setState(71L, OutboxState.FAILED))
        assertEquals(jo.tag, book.setState(71L, OutboxState.SENDING))
        // The line and who it went to, for sealing it again.
        val (to, line) = assertNotNull(book.ownLine(71L))
        assertEquals(jo.tag, to)
        assertEquals("hello?", line.text)
        assertContentEquals(body, line.body)
        assertContentEquals(body, PrivateBook().also { it.restore(book.save()) }.ownLine(71L)?.second?.body)
        book.setState(71L, OutboxState.SENT)
        assertNull(book.ownLine(71L)!!.second.body, "let go once the relay has it")
        assertContentEquals(jo.pub, book.pubOf(jo.tag))
        // Ours are never counted as unread, and their ids are remembered (an echo isn't new).
        assertEquals(0, book.unread(jo.tag))
        assertNull(book.setState(12345L, OutboxState.SENT))
        // A key that isn't theirs is never kept for them.
        book.own(alex.tag, jo.pub, 72L, now, "x", OutboxState.SENT, now)
        assertNull(book.pubOf(alex.tag))
    }

    @Test fun everythingSurvivesARestartAndGarbageLoadsAsNothing() {
        val book = PrivateBook()
        book.offer(from(jo, "one"), mate = true, viewing = false, nowSec = now)
        book.offer(from(alex, "pending"), mate = false, viewing = false, nowSec = now)
        book.own(jo.tag, jo.pub, 80L, now + 1, "two", OutboxState.NEARBY, now + 1)
        val restored = PrivateBook().also { it.restore(book.save()) }
        assertEquals(listOf("one", "two"), restored.thread(jo.tag).map { it.text })
        assertEquals(OutboxState.NEARBY, restored.thread(jo.tag).last().state)
        assertEquals(1, restored.unread(jo.tag))
        assertContentEquals(jo.pub, restored.pubOf(jo.tag))
        assertTrue(restored.waitingFrom(alex.tag))
        assertFalse(restored.dirty)
        val r = java.util.Random(2)
        repeat(200) {
            val junk = ByteArray(r.nextInt(300)).also { r.nextBytes(it) }
            PrivateBook().restore(junk) // never throws
        }
        PrivateBook().restore(null)
        // A thread keeps its newest 300.
        val big = PrivateBook()
        repeat(320) { i -> big.own(jo.tag, jo.pub, 10_000L + i, now + i, "m$i", OutboxState.SENT, now + i) }
        assertEquals(300, big.thread(jo.tag).size)
        assertEquals("m319", big.thread(jo.tag).last().text)
    }

    // ---- Helpers ----

    private fun contains(hay: ByteArray, needle: ByteArray): Boolean =
        (0..hay.size - needle.size).any { i -> needle.indices.all { hay[i + it] == needle[it] } }

    private fun hmac(key: ByteArray, msg: ByteArray): ByteArray =
        Mac.getInstance("HmacSHA256").apply { init(SecretKeySpec(key, "HmacSHA256")) }.doFinal(msg)

    /**
     * A private message built by hand from the format in docs/PRIVATE_MESSAGES.md: what a tampered
     * or hostile app could send. [claimedPub] is the sender key written inside; [signer] signs;
     * [signedTo] and [signedTime] are what the signature names.
     */
    private fun handMade(
        g: GigGroup,
        signer: CrewKeys.Signer,
        claimedPub: ByteArray,
        toPub: ByteArray,
        text: String,
        time: Long,
        signedTo: ByteArray = toPub,
        signedTime: Long = time,
        extra: ByteArray = ByteArray(0),
        kind: Int = GigGroup.Private.TEXT,
        ver: Int = 1,
    ): ByteArray {
        val t = text.toByteArray()
        val fields = byteArrayOf(kind.toByte(), t.size.toByte()) + t + extra
        val time4 = { x: Long -> ByteBuffer.allocate(4).putInt(x.toInt()).array() }
        val sig = CrewKeys.sign(signer, "mp-pm1".toByteArray() + time4(signedTime) + signedTo + fields)
        val inner = ByteBuffer.allocate(33 + 64 + 4 + 2 + 168).put(claimedPub).put(sig).put(time4(time)).putShort(fields.size.toShort()).put(fields).array()
        val eph = CrewKeys.generate()
        val z = assertNotNull(CrewKeys.agree(eph, toPub, "mp-pm1"))
        val key = SecretKeySpec(hmac(z, "mp-pm1 key".toByteArray() + eph.pub + toPub).copyOf(16), "AES")
        val nonce = hmac(z, "mp-pm1 nonce".toByteArray()).copyOf(12)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, nonce))
        c.updateAAD("mp-pm1".toByteArray() + byteArrayOf(ver.toByte()) + eph.pub)
        val body = byteArrayOf(ver.toByte()) + eph.pub + c.doFinal(inner)
        return g.wrapPrivate(body, time)
    }

    @Test fun theNoteSaysWhatTheMailboxIsCalled() {
        // Pinned so a rename can't quietly move every crew to another mailbox.
        val k = ByteArray(32) { it.toByte() }
        val g = GigGroup(k, "x", 0L)
        val expect = hmac(k, "moshpoint-group-private".toByteArray() + ByteBuffer.allocate(8).putLong(20_000L).array()).copyOf(16)
        assertContentEquals(expect, g.privateIdForDay(20_000L))
        assertNotEquals(0, expect.size)
    }
}
