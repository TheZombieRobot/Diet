package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

/** Only a crew's owner (its creator) removes people; anyone can leave (see [RekeyPolicy] rule 6). */
class CrewOwnerTest {
    private val now = 1_800_000_000_000L
    private val owner = CrewKeys.generate()
    private val jo = CrewKeys.generate()
    private val sam = CrewKeys.generate()
    private val me = CrewKeys.generate()
    private val crew = GigGroup.createOwned("Laneway", now, owner.pub)
    private val members = setOf(owner.tag, jo.tag, sam.tag, me.tag)
    private val enc = java.util.Base64.getUrlEncoder().withoutPadding()

    /** A third-form notice from [from]: the crew moves to a key bound to [nextOwner], removing [removed]. */
    private fun move(
        from: CrewKeys.Signer,
        nextOwner: ByteArray,
        removed: List<ByteArray>,
        salt: ByteArray = ByteArray(32) { 7 },
        key: ByteArray = GigGroup.ownedKey(nextOwner, salt),
    ) = assertNotNull(RekeyPolicy.parse3(from.pub, RekeyPolicy.payload3(key, salt, nextOwner, removed, "Jo")))

    private fun choose(vararg n: RekeyPolicy.Notice) = RekeyPolicy.choose(n.toList(), members, me.tag, crew.key, crew.ownerPub)

    @Test fun aNewCrewIsBoundToItsCreator() {
        assertTrue(crew.owned)
        assertEquals(owner.tag, crew.ownerTag)
        assertFalse(GigGroup.create("made before owners", now).owned)
        // Changing the owner without changing the key doesn't make an owned crew.
        assertFalse(GigGroup(crew.key, crew.name, now, ownerPub = jo.pub, ownerSalt = crew.ownerSalt).owned)
    }

    @Test fun theOwnerTravelsInTheInviteAndCantBeSwapped() {
        val qr = GigGroup.qr(crew)
        val joined = assertNotNull(GigGroup.parseQr(qr, now))
        assertTrue(joined.owned)
        assertContentEquals(owner.pub, joined.ownerPub)
        // Someone forwarding the invite names themselves as owner: it no longer matches the key.
        assertNull(GigGroup.parseQr(qr.replace(enc.encodeToString(owner.pub), enc.encodeToString(jo.pub)), now))
        // A different salt: the same.
        assertNull(GigGroup.parseQr(qr.replace(enc.encodeToString(crew.ownerSalt), enc.encodeToString(ByteArray(32) { 1 })), now))
        // Half the owner fields: damaged, not joined.
        assertNull(GigGroup.parseQr(qr.replace(Regex("&os=[^&]+"), ""), now))
        // A crew made before owners still opens, with no owner.
        assertFalse(assertNotNull(GigGroup.parseQr(GigGroup.qr(GigGroup.create("old", now)), now)).owned)
    }

    @Test fun theOwnerCanRemoveSomeone() {
        val n = move(owner, owner.pub, listOf(jo.pub))
        assertSame(n, choose(n))
        val fresh = crew.moved(n.newKey, n.ownerPub, n.salt)
        assertTrue(fresh.owned)
        assertEquals(owner.tag, fresh.ownerTag)
        assertEquals(crew.name, fresh.name)
    }

    @Test fun nobodyElseCanRemoveEvenWithAKeyBoundToTheOwner() {
        assertNull(choose(move(sam, owner.pub, listOf(jo.pub)), move(sam, sam.pub, listOf(jo.pub))))
    }

    @Test fun aRemovedMemberCantTakeTheCrewOver() {
        // Jo's own "removal" of the owner reaches the relay first: it's ignored, and the owner's is followed.
        val jos = move(jo, jo.pub, listOf(owner.pub))
        val owners = move(owner, owner.pub, listOf(jo.pub))
        assertSame(owners, choose(jos, owners))
    }

    @Test fun theOwnerMustBindTheNewKeyToAnOwner() {
        assertNull(choose(move(owner, owner.pub, listOf(jo.pub), key = ByteArray(32) { 9 })))
        // The older forms carry no owner, so an owned crew ignores them, even from the owner.
        val second = assertNotNull(RekeyPolicy.parse(owner.pub, RekeyPolicy.payload(ByteArray(32) { 9 }, listOf(jo.pub), "Jo")))
        val first = RekeyPolicy.parseOld(owner.pub, RekeyPolicy.payloadOld(ByteArray(32) { 9 }, "Jo", twin = false))!!
        assertNull(choose(second, first))
    }

    @Test fun theOwnerLeavesByHandingTheCrewToAMember() {
        val n = assertNotNull(choose(move(owner, sam.pub, listOf(owner.pub))))
        assertEquals(sam.tag, crew.moved(n.newKey, n.ownerPub, n.salt).ownerTag)
        // Handed to us: fine too.
        assertNotNull(choose(move(owner, me.pub, listOf(owner.pub))))
        // Not to a stranger, nor to someone removed in the same move.
        assertNull(choose(move(owner, CrewKeys.generate().pub, listOf(owner.pub))))
        assertNull(choose(move(owner, jo.pub, listOf(owner.pub, jo.pub))))
        // And the owner can't remove themselves while staying the owner.
        assertNull(choose(move(owner, owner.pub, listOf(owner.pub))))
    }

    @Test fun aNoticeCantRemoveItsReader() {
        assertNull(choose(move(owner, owner.pub, listOf(me.pub))))
    }

    @Test fun aCrewWithNoOwnerKeepsTheOldRules() {
        val legacy = GigGroup.create("old", now)
        val bySam = assertNotNull(RekeyPolicy.parse(sam.pub, RekeyPolicy.payload(ByteArray(32) { 3 }, listOf(jo.pub), "Jo")))
        assertSame(bySam, RekeyPolicy.choose(listOf(bySam), members, me.tag, legacy.key, legacy.ownerPub))
    }

    @Test fun theThirdFormReadsBackExactly() {
        val salt = ByteArray(32) { 5 }
        val key = GigGroup.ownedKey(owner.pub, salt)
        val n = assertNotNull(RekeyPolicy.parse3(owner.pub, RekeyPolicy.payload3(key, salt, owner.pub, listOf(jo.pub, sam.pub), "Jo")))
        assertContentEquals(key, n.newKey)
        assertContentEquals(salt, n.salt)
        assertContentEquals(owner.pub, n.ownerPub)
        assertEquals(setOf(jo.tag, sam.tag), n.removedTags)
        assertEquals("Jo", n.removedName)
        assertEquals(owner.tag, n.fromTag)
        assertNull(RekeyPolicy.parse3(owner.pub, ByteArray(10)))
    }
}
