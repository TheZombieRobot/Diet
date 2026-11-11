package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** "Remove Jo" must stick, and Jo must not be able to answer with a rekey of their own. */
class RekeyPolicyTest {
    private val sam = CrewKeys.generate() // removes Jo
    private val jo = CrewKeys.generate() // removed
    private val me = CrewKeys.generate()
    private val alex = CrewKeys.generate()
    private val members = setOf(sam.tag, jo.tag, me.tag, alex.tag)
    private val oldKey = ByteArray(32) { 1 }
    private val samsKey = ByteArray(32) { 2 }
    private val josKey = ByteArray(32) { 3 }

    private fun sams() = RekeyPolicy.parse(sam.pub, RekeyPolicy.payload(samsKey, listOf(jo.pub), "Jo"))!!
    private fun jos() = RekeyPolicy.parse(jo.pub, RekeyPolicy.payload(josKey, listOf(sam.pub), "Sam"))!!

    @Test fun noticeCarriesTheRemovedKey() {
        val n = sams()
        assertContentEquals(samsKey, n.newKey)
        assertEquals(setOf(jo.tag), n.removedTags)
        assertEquals("Jo", n.removedName)
        assertEquals(sam.tag, n.fromTag)
        // "Reset invite": nobody removed.
        val reset = RekeyPolicy.parse(sam.pub, RekeyPolicy.payload(samsKey, emptyList(), null))!!
        assertTrue(reset.removedTags.isEmpty())
        assertNull(reset.removedName)
        assertNull(RekeyPolicy.parse(sam.pub, ByteArray(10)))
        assertNull(RekeyPolicy.parse(sam.pub, samsKey + byteArrayOf(3) + ByteArray(40))) // says 3 keys, has 1 and a bit
    }

    /** The removed member, still holding the old key, sends a rekey of their own afterwards. */
    @Test fun aRemovedMembersLaterRekeyIsNotFollowed() {
        // Arrival order at the relay: Sam's first, then Jo's answer.
        val chosen = assertNotNull(RekeyPolicy.choose(listOf(sams(), jos()), members, me.tag, oldKey))
        assertContentEquals(samsKey, chosen.newKey)
        // Before: the app read the newest record first, so Jo's later one won.
        assertContentEquals(samsKey, RekeyPolicy.choose(listOf(sams(), jos(), jos()), members, me.tag, oldKey)!!.newKey)
    }

    @Test fun aKeyWeNeverKnewCannotRekey() {
        // Jo makes a fresh key pair to dodge "removed": it was never in the crew.
        val sock = CrewKeys.generate()
        val forged = RekeyPolicy.parse(sock.pub, RekeyPolicy.payload(josKey, emptyList(), null))!!
        assertNull(RekeyPolicy.choose(listOf(forged), members, me.tag, oldKey))
        assertContentEquals(samsKey, RekeyPolicy.choose(listOf(forged, sams()), members, me.tag, oldKey)!!.newKey)
    }

    @Test fun nonsenseNoticesAreSkipped() {
        fun n(from: CrewKeys.Signer, key: ByteArray, removed: List<ByteArray> = emptyList()) = RekeyPolicy.parse(from.pub, RekeyPolicy.payload(key, removed, null))!!
        assertNull(RekeyPolicy.choose(listOf(n(sam, oldKey)), members, me.tag, oldKey), "the key we already have")
        assertNull(RekeyPolicy.choose(listOf(n(me, samsKey)), members, me.tag, oldKey), "from ourselves")
        assertNull(RekeyPolicy.choose(listOf(n(sam, samsKey, listOf(me.pub))), members, me.tag, oldKey), "sent to us yet removing us")
        assertNull(RekeyPolicy.choose(listOf(n(sam, samsKey, listOf(sam.pub))), members, me.tag, oldKey), "removing the sender")
        assertNull(RekeyPolicy.choose(emptyList(), members, me.tag, oldKey))
    }

    @Test fun afterwardsOldKeyMessagesAreReadFromTheAllowlistOnly() {
        val followed = sams()
        val allow = RekeyPolicy.allowlist(members, followed)
        assertTrue(alex.tag in allow && sam.tag in allow)
        assertFalse(jo.tag in allow)
        // A list of who's allowed, not who isn't: a key Jo makes afterwards isn't on it either.
        assertFalse(CrewKeys.generate().tag in allow)
    }

    @Test fun olderBuildsStillGetAFormTheyUnderstand() {
        // Kind 3 as before, plus an invisible mark that tells newer builds to wait for the fuller one.
        val old = RekeyPolicy.parseOld(sam.pub, RekeyPolicy.payloadOld(samsKey, "Jo", twin = true))!!
        assertTrue(old.superseded)
        assertEquals("Jo", old.removedName)
        // What an older build shows: the name, with nothing visible after it.
        val shown = String(RekeyPolicy.payloadOld(samsKey, "Jo", twin = true), 32, 2 + RekeyPolicy.TWIN_MARK.toByteArray().size)
        assertEquals("Jo", shown.filter { it.isLetterOrDigit() })
        // A newer build skips the marked one and follows the fuller one...
        assertContentEquals(samsKey, RekeyPolicy.choose(listOf(old, sams()), members, me.tag, oldKey)!!.newKey)
        assertEquals(setOf(jo.tag), RekeyPolicy.choose(listOf(old, sams()), members, me.tag, oldKey)!!.removedTags)
        assertNull(RekeyPolicy.choose(listOf(old), members, me.tag, oldKey))
        // ...but still follows a plain kind 3 from a phone that hasn't updated.
        val plain = RekeyPolicy.parseOld(alex.pub, RekeyPolicy.payloadOld(josKey, "Jo", twin = false))!!
        assertFalse(plain.superseded)
        assertContentEquals(josKey, RekeyPolicy.choose(listOf(plain), members, me.tag, oldKey)!!.newKey)
    }
}
