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
    private var nextId = 41L

    private fun seal(text: String, from: CrewKeys.Signer = jo, to: CrewKeys.Signer = sam, t: Long = now, id: Long = nextId++, g: GigGroup = group): ByteArray =
        assertNotNull(g.sealPrivate(from, to.pub, text, t, id))

    // ---- Sealed to one person ----

    @Test fun onlyTheRecipientCanOpenIt() {
        val blob = seal("meet at the sound desk", id = 77L)
        val p = assertNotNull(group.openPrivate(blob, sam))
        assertEquals("meet at the sound desk", p.text)
        assertEquals(77L, p.id)
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
        val blob = seal("are you with Jo??", id = 1234L)
        // Any crew phone can open the envelope, to carry it.
        val env = assertNotNull(group.openEnvelope(blob))
        assertEquals(GigGroup.ENV_PRIVATE, env.type)
        val outer = assertNotNull(group.privateOuterOf(env))
        assertEquals(1234L, outer.id)
        assertEquals(now, outer.timeSec)
        // But nothing in what it can read names either person: no key, no tag.
        val body = env.body
        for (k in listOf(jo.pub, sam.pub)) {
            assertFalse(contains(body, k), "a key is in the clear")
            assertFalse(contains(body, k.copyOf(8)), "part of a key is in the clear")
        }
        for (tag in listOf(jo.tag, sam.tag)) assertFalse(contains(body, ByteBuffer.allocate(8).putLong(tag).array()), "a tag is in the clear")
        // Sealed twice, the same message shares nothing but its id: a fresh ephemeral key each time.
        val again = assertNotNull(group.openEnvelope(seal("are you with Jo??", id = 1234L))).body
        assertFalse(body.copyOfRange(9, 42).contentEquals(again.copyOfRange(9, 42)))
        assertFalse(body.copyOfRange(42, body.size).contentEquals(again.copyOfRange(42, again.size)))
        // A message for Sam and one for Alex look the same from outside: same size, same layout, and neither opens for the other.
        val forAlex = assertNotNull(group.openEnvelope(seal("are you with Jo??", to = alex))).body
        assertEquals(body.size, forAlex.size)
        assertNull(group.privateOf(env, alex))
        assertNull(group.privateOf(group.openEnvelope(seal("x", to = alex))!!, sam))
    }

    @Test fun theFormatIsWhatTheNoteSays() {
        // Built by hand from docs/PRIVATE_MESSAGES.md, it opens like one from sealPrivate.
        val blob = handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, text = "by hand", time = now, id = 5L)
        val p = assertNotNull(group.openPrivate(blob, sam))
        assertEquals("by hand", p.text)
        assertEquals(jo.tag, p.sender)
        assertEquals(GigGroup.PRIVATE_BYTES, blob.size)
    }

    // ---- Forged, altered, replayed ----

    @Test fun nobodyCanSendOneAsSomeoneElse() {
        // Alex claims to be Jo, but can only sign as Alex.
        assertNull(group.openPrivate(handMade(group, signer = alex, claimedPub = jo.pub, toPub = sam.pub, text = "it's Jo", time = now, id = 6L), sam))
        // Jo sent Alex something; Alex re-seals it to Sam as if Jo had written to Sam. The signature names its recipient.
        assertNull(group.openPrivate(handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, signedTo = alex.pub, text = "secret", time = now, id = 7L), sam))
        // Signed in another crew (same people, a different crew key): it only counts where it was signed.
        val other = GigGroup.create("other", now * 1000)
        assertNull(group.openPrivate(handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, signedCrew = other, text = "hi", time = now, id = 8L), sam))
        // A message to yourself isn't one: refused both ways.
        assertNull(group.sealPrivate(jo, jo.pub, "me", now, 9L))
        assertNull(group.openPrivate(handMade(group, signer = sam, claimedPub = sam.pub, toPub = sam.pub, text = "me", time = now, id = 9L), sam))
    }

    @Test fun anythingAlteredIsRefused() {
        val blob = seal("gate C", id = 99L)
        val env = assertNotNull(group.openEnvelope(blob))
        // Re-wrapped with another time (to make an old one look new): the sealed part names its time.
        assertNull(group.openPrivate(group.sealEnvelope(GigGroup.ENV_PRIVATE, env.body, now + 600), sam))
        // Its id changed (to slip a second copy past the duplicate check): bound too.
        val newId = env.body.copyOf().also { it[8] = (it[8] + 1).toByte() }
        assertNull(group.openPrivate(group.sealEnvelope(GigGroup.ENV_PRIVATE, newId, now), sam))
        // Its ephemeral key swapped.
        val newEph = env.body.copyOf().also { CrewKeys.generate().pub.copyInto(it, 9) }
        assertNull(group.openPrivate(group.sealEnvelope(GigGroup.ENV_PRIVATE, newEph, now), sam))
        // Any byte of the sealed part.
        for (i in listOf(42, 100, 200, env.body.size - 1)) {
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
        val blob = seal("same again", id = 500L)
        val p = assertNotNull(group.openPrivate(blob, sam))
        assertTrue(book.offer(p, mate = true, viewing = false, nowSec = now).shown)
        // The same bytes again, by another route.
        assertFalse(book.offer(assertNotNull(group.openPrivate(blob, sam)), mate = true, viewing = false, nowSec = now + 5).shown)
        // A copy sealed again (new bytes, same id).
        assertFalse(book.offer(assertNotNull(group.openPrivate(seal("same again", id = 500L), sam)), mate = true, viewing = false, nowSec = now + 9).shown)
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
        val a = seal("hello", id = 31L)
        val b = seal("hello", id = 31L)
        assertFalse(a.contentEquals(b))
        assertEquals(31L, group.openPrivate(a, sam)!!.id)
        assertEquals(31L, group.openPrivate(b, sam)!!.id)
        // What carriers see is that same id.
        assertEquals(31L, group.privateOuterOf(group.openEnvelope(a)!!)!!.id)
        // The crew moves to a new key; signing keys stay, and the author seals it again with its id.
        val fresh = group.moved(ByteArray(32) { 9 })
        val again = assertNotNull(fresh.sealPrivate(jo, sam.pub, "hello", now, 31L))
        assertEquals(31L, fresh.openPrivate(again, sam)!!.id)
        // An old-key copy isn't a new-key message.
        assertNull(fresh.openPrivate(a, sam))
        // New ids are random and never 0.
        val r = java.util.Random(1)
        val ids = (1..1000).map { PrivateRule.newId(r) }
        assertEquals(1000, ids.toSet().size)
        assertFalse(0L in ids)
        assertNull(group.sealPrivate(jo, sam.pub, "no id", now, 0L))
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
        val v2 = handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, text = "v2", time = now, id = 12L, ver = 2)
        assertNotNull(group.privateOuterOf(group.openEnvelope(v2)!!))
        assertNull(group.openPrivate(v2, sam))
        // Version 1 with a field this build doesn't know after the text: read, still checked by the signature.
        val more = handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, text = "hi", time = now, id = 13L, extra = byteArrayOf(1, 2, 3))
        assertEquals("hi", group.openPrivate(more, sam)!!.text)
        // A kind this build doesn't know opens, and the book doesn't show it.
        val reaction = assertNotNull(group.openPrivate(handMade(group, signer = jo, claimedPub = jo.pub, toPub = sam.pub, text = "🔥", time = now, id = 14L, kind = 7), sam))
        assertFalse(PrivateBook().offer(reaction, mate = true, viewing = false, nowSec = now).shown)
    }

    // ---- The book of threads ----

    private fun from(who: CrewKeys.Signer, text: String, t: Long = now, id: Long = nextId++): GigGroup.Private =
        assertNotNull(group.openPrivate(seal(text, from = who, to = sam, t = t, id = id), sam))

    @Test fun eachMateHasAThreadInTheOrderEveryPhoneShows() {
        val book = PrivateBook()
        assertTrue(book.offer(from(jo, "second", t = now + 10, id = 2), mate = true, viewing = false, nowSec = now + 20).alert)
        assertTrue(book.offer(from(jo, "first", t = now, id = 9), mate = true, viewing = false, nowSec = now + 20).alert)
        // Same second: by id, so every phone agrees.
        book.offer(from(jo, "also first", t = now, id = 3), mate = true, viewing = false, nowSec = now + 20)
        book.offer(from(alex, "hey Sam", id = 4), mate = true, viewing = false, nowSec = now + 20)
        assertEquals(listOf("also first", "first", "second"), book.thread(jo.tag).map { it.text })
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
        book.offer(from(jo, "from the future", t = now + 7200, id = 1), mate = true, viewing = false, nowSec = now + 30)
        book.offer(from(jo, "after it", t = now + 40, id = 5), mate = true, viewing = false, nowSec = now + 45)
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
        val v = book.offer(from(jo, "two"), mate = true, viewing = false, nowSec = now)
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
        // Not sent, then a tap tries again.
        book.own(jo.tag, jo.pub, 71L, now, "hello?", OutboxState.WAITING, now)
        assertEquals(jo.tag, book.setState(71L, OutboxState.FAILED))
        assertEquals(jo.tag, book.setState(71L, OutboxState.SENDING))
        // The line and who it went to, for sealing it again.
        val (to, line) = assertNotNull(book.ownLine(71L))
        assertEquals(jo.tag, to)
        assertEquals("hello?", line.text)
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
     * [signedTo] and [signedCrew] are what the signature names.
     */
    private fun handMade(
        g: GigGroup,
        signer: CrewKeys.Signer,
        claimedPub: ByteArray,
        toPub: ByteArray,
        text: String,
        time: Long,
        id: Long,
        signedTo: ByteArray = toPub,
        signedCrew: GigGroup = g,
        extra: ByteArray = ByteArray(0),
        kind: Int = GigGroup.Private.TEXT,
        ver: Int = 1,
    ): ByteArray {
        val t = text.toByteArray()
        val fields = byteArrayOf(kind.toByte(), t.size.toByte()) + t + extra
        val idB = ByteBuffer.allocate(8).putLong(id).array()
        val time4 = ByteBuffer.allocate(4).putInt(time.toInt()).array()
        val signTag = hmac(signedCrew.key, "moshpoint-group-sig".toByteArray()).copyOf(8)
        val sig = CrewKeys.sign(signer, "mp-pm1".toByteArray() + signTag + time4 + idB + signedTo + fields)
        val inner = ByteBuffer.allocate(33 + 64 + 2 + 168).put(claimedPub).put(sig).putShort(fields.size.toShort()).put(fields).array()
        val eph = CrewKeys.generate()
        val z = assertNotNull(CrewKeys.agree(eph, toPub, "mp-pm1"))
        val key = SecretKeySpec(hmac(z, "mp-pm1 key".toByteArray() + idB + eph.pub + toPub).copyOf(16), "AES")
        val nonce = hmac(z, "mp-pm1 nonce".toByteArray() + idB).copyOf(12)
        val crewTag = hmac(g.key, "moshpoint-group-sig".toByteArray()).copyOf(8)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(128, nonce))
        c.updateAAD("mp-pm1".toByteArray() + crewTag + time4 + byteArrayOf(ver.toByte()) + idB + eph.pub)
        val body = byteArrayOf(ver.toByte()) + idB + eph.pub + c.doFinal(inner)
        return g.sealEnvelope(GigGroup.ENV_PRIVATE, body, time)
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
