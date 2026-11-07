package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull

class AvatarBoxTest {
    private val secret = ByteArray(32) { 3 }
    private val photo = ByteArray(9000) { (it % 251).toByte() }

    @Test fun friendCanOpenOthersCannot() {
        val sealed = AvatarBox.seal(secret, photo)
        assertContentEquals(photo, AvatarBox.open(secret, sealed))
        assertNull(AvatarBox.open(ByteArray(32) { 4 }, sealed))
    }

    @Test fun tamperingDetected() {
        val sealed = AvatarBox.seal(secret, photo)
        sealed[100] = (sealed[100].toInt() xor 1).toByte()
        assertNull(AvatarBox.open(secret, sealed))
    }

    @Test fun idChangesWeeklyAndDiffersPerPerson() {
        val w = AvatarBox.weekAt(1_700_000_000_000L)
        assertFalse(AvatarBox.idFor(secret, w).contentEquals(AvatarBox.idFor(secret, w + 1)))
        assertFalse(AvatarBox.idFor(secret, w).contentEquals(AvatarBox.idFor(ByteArray(32) { 4 }, w)))
        assertContentEquals(AvatarBox.idFor(secret, w), AvatarBox.idFor(secret.copyOf(), w))
    }

    @Test fun refusesHugePhotos() {
        assertFailsWith<IllegalArgumentException> { AvatarBox.seal(secret, ByteArray(AvatarBox.MAX_PHOTO_BYTES + 1)) }
    }
}
