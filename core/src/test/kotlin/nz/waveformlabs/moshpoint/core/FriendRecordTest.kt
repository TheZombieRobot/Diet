package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNull

class FriendRecordTest {
    private val now = 1_700_000_000_000L
    private val sam = FriendRecord("a1", "Sam \"the\" \t legend 🤘", 0xFF1E88E5.toInt(), ByteArray(32) { it.toByte() }, false, now - 1000)
    private val jo = FriendRecord("b2", "Jo", 0xFF43A047.toInt(), ByteArray(32) { 9 }, true, now - 1000)

    @Test fun roundTrip() {
        assertEquals(listOf(sam, jo), FriendRecord.parse(FriendRecord.serialize(listOf(sam, jo)), now))
    }

    @Test fun oldGigGroupMembersExpire() {
        val old = jo.copy(addedAtMs = now - FriendRecord.GIG_GROUP_TTL_MS - 1)
        val oldFriend = sam.copy(addedAtMs = 0)
        assertEquals(listOf(oldFriend), FriendRecord.parse(FriendRecord.serialize(listOf(oldFriend, old)), now))
    }

    @Test fun badLinesSkipped() {
        val text = FriendRecord.serialize(listOf(sam)) + "\ngarbage\nv1\tbroken"
        assertEquals(listOf(sam), FriendRecord.parse(text, now))
    }

    @Test fun shareCodes() {
        val code = FriendRecord.shareCode(sam.secret)
        assertContentEquals(sam.secret, FriendRecord.secretFromCode(" $code\n"))
        assertContentEquals(sam.secret, FriendRecord.secretFromCode("Add me on Moshpoint: $code"))
        assertNull(FriendRecord.secretFromCode("abc"))
        assertNull(FriendRecord.secretFromCode(""))
        assertNull(FriendRecord.secretFromCode("!!!not base64"))
    }
}
