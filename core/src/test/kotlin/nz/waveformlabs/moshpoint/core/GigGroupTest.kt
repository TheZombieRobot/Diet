package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GigGroupTest {
    private val now = 1_700_000_000_000L
    private val group = GigGroup.create("Foo Fighters night", now)
    private val me = GigGroup.Intro(ByteArray(32) { (it * 7).toByte() }, "Josh")

    @Test fun qrRoundTrip() {
        val joined = assertNotNull(GigGroup.parseQr(GigGroup.qr(group), now))
        assertContentEquals(group.key, joined.key)
        assertEquals("Foo Fighters night", joined.name)
        assertNull(GigGroup.parseQr("moshpoint:add?code=abc", now))
        assertNull(GigGroup.parseQr("moshpoint:group?key=short", now))
    }

    @Test fun membersCanOpenIntros() {
        val blob = group.sealIntro(me, now)
        assertTrue(blob.size <= GigGroup.MAX_INTRO_BYTES)
        val other = GigGroup(group.key, group.name, now) // another member's copy
        assertEquals(me, other.openIntro(blob, now + 60_000))
    }

    @Test fun outsidersCannot() {
        val blob = group.sealIntro(me, now)
        assertNull(GigGroup.create("other", now).openIntro(blob, now))
    }

    @Test fun tamperingRejected() {
        val blob = group.sealIntro(me, now)
        blob[blob.size - 3] = (blob[blob.size - 3].toInt() xor 1).toByte()
        assertNull(group.openIntro(blob, now))
    }

    @Test fun tagRotatesButStillMatchesNearby() {
        val t0 = group.tagAt(now)
        val t1 = group.tagAt(now + EphemeralId.DEFAULT_ROTATION_MS)
        assertFalse(t0.contentEquals(t1))
        assertTrue(group.matchesTag(t0, now + EphemeralId.DEFAULT_ROTATION_MS))
        assertFalse(group.matchesTag(t0, now + 10 * EphemeralId.DEFAULT_ROTATION_MS))
    }

    @Test fun longNamesTrimmedSafely() {
        val long = GigGroup.Intro(me.secret, "🤘".repeat(20))
        val opened = assertNotNull(group.openIntro(group.sealIntro(long, now), now))
        // Cut at a whole emoji: nothing but complete 🤘s left.
        assertTrue(opened.name.isNotEmpty() && opened.name.replace("🤘", "").isEmpty(), opened.name)
        assertTrue(group.sealIntro(long, now).size <= GigGroup.MAX_INTRO_BYTES)
    }

    @Test fun chatFlareAndPlanCarryText() {
        val chat = GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", 1_700_000_000, text = "At the bar, want one? 🍺")
        assertEquals(chat, group.openPing(group.sealPing(chat)))
        val flare = GigGroup.Ping(GigGroup.Ping.FLARE, "Jo", 1_700_000_000, -36.85, 174.76, 30, "Lost 😅")
        val opened = assertNotNull(group.openPing(group.sealPing(flare)))
        assertEquals("Lost 😅", opened.text)
        assertEquals(30, opened.minutes)
        // Long text is cut on a character boundary, never mid-emoji.
        val long = GigGroup.Ping(GigGroup.Ping.PLAN, "Jo", 1_700_000_000, text = "🎸".repeat(100))
        val cut = assertNotNull(group.openPing(group.sealPing(long))).text
        assertTrue(cut.isNotEmpty())
        assertEquals("🎸".repeat(cut.length / 2), cut)
        // Plain pings still have no text.
        assertEquals("", assertNotNull(group.openPing(group.sealPing(GigGroup.Ping(1, "Jo", 1_700_000_000)))).text)
    }

    @Test fun bluetoothShownAsBands() {
        assertEquals("Right here", ArrowStyle.bandLabel(2.0))
        assertEquals("Close", ArrowStyle.bandLabel(8.0))
        assertEquals("Nearby", ArrowStyle.bandLabel(20.0))
        assertEquals("In range", ArrowStyle.bandLabel(45.0))
    }

    @Test fun signedMessagesNameTheirSigner() {
        val a = CrewKeys.generate()
        val b = CrewKeys.generate()
        val pa = assertNotNull(group.openPing(group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "Mate", 1_700_000_000, text = "hi"), a)))
        val pb = assertNotNull(group.openPing(group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "Mate", 1_700_000_000, text = "hi"), b)))
        assertEquals(a.tag, pa.sender)
        assertEquals(b.tag, pb.sender)
        assertTrue(pa.sender != pb.sender) // two people called Mate stay two people
        // Unsigned: no sender at all.
        assertEquals(0L, assertNotNull(group.openPing(group.sealPing(GigGroup.Ping(GigGroup.Ping.COMING, "Mate", 1_700_000_000)))).sender)
    }

    @Test fun forgedSignatureIsDropped() {
        val real = CrewKeys.generate()
        val blob = group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", 1_700_000_000, text = "meet at gate C"), real)
        // A crew member re-seals Jo's message with different words but Jo's key and signature.
        val opened = assertNotNull(group.openPing(blob))
        val forged = group.sealPing(opened.copy(text = "meet at gate A", sender = 0L, pub = null, sig = null))
        assertEquals(0L, assertNotNull(group.openPing(forged)).sender) // unsigned, so not "Jo's"
        // Tamper inside the signed tail: rejected outright.
        assertNull(group.openPing(forgeTail(blob)))
    }

    /** Re-seal [blob]'s plaintext with one byte of the text changed, keeping the signature. */
    private fun forgeTail(blob: ByteArray): ByteArray {
        val c = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
        val key = javax.crypto.spec.SecretKeySpec(
            javax.crypto.Mac.getInstance("HmacSHA256").apply { init(javax.crypto.spec.SecretKeySpec(group.key, "HmacSHA256")) }
                .doFinal("moshpoint-group-rally-aes".toByteArray()).copyOf(16), "AES",
        )
        c.init(javax.crypto.Cipher.DECRYPT_MODE, key, javax.crypto.spec.GCMParameterSpec(96, blob.copyOfRange(0, 12)))
        c.updateAAD("ping".toByteArray())
        val plain = c.doFinal(blob, 12, blob.size - 12)
        val i = 1 + 4 + 4 + 1 + 2 + 2 + 1 + 2 // into the text ("meet…")
        plain[i] = (plain[i].toInt() xor 1).toByte()
        val e = javax.crypto.Cipher.getInstance("AES/GCM/NoPadding")
        e.init(javax.crypto.Cipher.ENCRYPT_MODE, key, javax.crypto.spec.GCMParameterSpec(96, blob.copyOfRange(0, 12)))
        e.updateAAD("ping".toByteArray())
        return blob.copyOfRange(0, 12) + e.doFinal(plain)
    }

    @Test fun historyBundlesFitAndOnlyCarryCheckedLines() {
        val jo = CrewKeys.generate()
        fun signed(i: Int, text: String) = group.openPing(group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", 1_700_000_000L + i, text = text), jo))!!
            .let { GigGroup.HistoryLine(it.kind, it.from, it.sender, it.timeSec, it.text, it.minutes, 0, 0, it.pub, it.sig) }
        val lines = (0 until 60).map { signed(it, "message number $it, who's keen? 🎸") }
        val blob = assertNotNull(group.sealHistory(GigGroup.History(lines, null), 1_700_000_500L))
        assertTrue(blob.size <= GigGroup.MAX_HISTORY_BYTES)
        val h = assertNotNull(group.openHistory(blob))
        assertTrue(h.lines.size in 10..60)
        assertEquals(lines.last(), h.lines.last()) // the newest are kept
        assertTrue(h.lines.all { it.sender == jo.tag })
        // A line with words changed is dropped on the way in.
        val fake = lines.last().copy(text = "something Jo never said")
        val h2 = assertNotNull(group.openHistory(assertNotNull(group.sealHistory(GigGroup.History(listOf(fake, lines[0]), null), 1_700_000_600L))))
        assertEquals(listOf(lines[0]), h2.lines)
        assertNull(GigGroup.create("Other", now).openHistory(blob))
    }

    @Test fun directMessagesOnlyForTheirReader() {
        val sam = CrewKeys.generate()
        val jo = CrewKeys.generate()
        val other = CrewKeys.generate()
        val blob = assertNotNull(group.sealDirect(sam, jo.pub, 1, "my forever key".toByteArray(), 1_700_000_000))
        val d = assertNotNull(group.openDirect(blob, jo))
        assertEquals("my forever key", String(d.payload))
        assertContentEquals(sam.pub, d.fromPub)
        assertNull(group.openDirect(blob, other)) // another crew member can't read it
        assertNull(GigGroup.create("Other", now).openDirect(blob, jo))
    }

    @Test fun invitesExpireWithTheCrew() {
        val qr = GigGroup.qr(group, GigGroup.Intro(ByteArray(32) { 1 }, "Sam", CrewKeys.generate().pub))
        assertNotNull(GigGroup.parseQr(qr, now))
        assertNull(GigGroup.parseQr(qr, group.expiresAtMs + 60_000))
        assertNull(GigGroup.parseQr(qr.replace(Regex("&exp=[0-9]+"), ""), now)) // old-style: no
        assertEquals(group.expiresAtMs, assertNotNull(GigGroup.parseQr(qr, now + 3_600_000)).expiresAtMs)
        assertNotNull(GigGroup.hostOf(qr)?.pub)
    }

    @Test fun introsCarryTheSigningKeyAndAreSigned() {
        val k = CrewKeys.generate()
        val intro = group.signedIntro(ByteArray(32) { 5 }, "Jo", k)
        val blob = group.sealIntro(intro, now)
        assertTrue(blob.size <= GigGroup.MAX_INTRO_BYTES)
        val opened = assertNotNull(group.openIntro(blob, now))
        assertEquals(intro, opened)
        assertNotNull(opened.sig)
        // Someone else's pass with Jo's key and signature: the signature doesn't hold.
        val stolen = group.sealIntro(intro.copy(secret = ByteArray(32) { 6 }), now)
        assertNull(assertNotNull(group.openIntro(stolen, now)).sig)
    }

    @Test fun keysSignVerifyAndAgree() {
        val a = CrewKeys.generate()
        val b = CrewKeys.generate()
        val sig = CrewKeys.sign(a, "x".toByteArray())
        assertTrue(CrewKeys.verify(a.pub, "x".toByteArray(), sig))
        assertFalse(CrewKeys.verify(b.pub, "x".toByteArray(), sig))
        assertContentEquals(CrewKeys.agree(a, b.pub), CrewKeys.agree(b, a.pub))
        val restored = assertNotNull(CrewKeys.restore(a.encodedPrivate(), a.pub))
        assertTrue(CrewKeys.verify(a.pub, "y".toByteArray(), CrewKeys.sign(restored, "y".toByteArray())))
        assertNull(CrewKeys.publicKey(ByteArray(33) { 9 }))
    }
}
