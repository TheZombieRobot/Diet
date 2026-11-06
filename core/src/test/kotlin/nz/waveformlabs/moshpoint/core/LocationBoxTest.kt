package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class LocationBoxTest {
    private val secret = ByteArray(32) { (it + 5).toByte() }
    private val id = EphemeralId(secret).currentId(1_700_000_000_000L)
    private val loc = SharedLocation(-36.8484597, 174.7633315, 1_700_000_000L, 12)

    @Test fun roundTrip() {
        val sealed = LocationBox.seal(secret, id, loc)
        assertEquals(LocationBox.SEALED_BYTES, sealed.size)
        val out = assertNotNull(LocationBox.open(secret, id, sealed))
        assertTrue(abs(out.lat - loc.lat) < 1e-6 && abs(out.lon - loc.lon) < 1e-6)
        assertEquals(loc.timeSec, out.timeSec)
        assertEquals(12, out.accuracyM)
    }

    @Test fun wrongSecretOrIdFails() {
        val sealed = LocationBox.seal(secret, id, loc)
        assertNull(LocationBox.open(ByteArray(32) { 1 }, id, sealed))
        assertNull(LocationBox.open(secret, ByteArray(16) { 2 }, sealed))
    }

    @Test fun tamperingDetected() {
        val sealed = LocationBox.seal(secret, id, loc)
        sealed[10] = (sealed[10].toInt() xor 1).toByte()
        assertNull(LocationBox.open(secret, id, sealed))
        val sealed2 = LocationBox.seal(secret, id, loc)
        sealed2[0] = (sealed2[0].toInt() xor 1).toByte() // change the clear timestamp
        assertNull(LocationBox.open(secret, id, sealed2))
    }

    @Test fun accuracyCapped() {
        val out = LocationBox.open(secret, id, LocationBox.seal(secret, id, loc.copy(accuracyM = 5000)))!!
        assertEquals(255, out.accuracyM)
    }
}
