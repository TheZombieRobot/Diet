package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/** The separate small record that carries pressure over the relay. */
class FloorBoxTest {
    private val secret = ByteArray(32) { (it + 11).toByte() }
    private val nowMs = 1_700_000_000_000L
    private val epoch = EphemeralId(secret).epochAt(nowMs)
    private val id = FloorBox.idFor(secret, epoch)
    private val reading = FloorBox.Reading(Baro.toUnits(998.44)!!, nowMs / 1000)

    @Test fun roundTrip() {
        val sealed = FloorBox.seal(secret, id, reading)
        assertEquals(FloorBox.SEALED_BYTES, sealed.size)
        assertEquals(19, sealed.size)
        assertEquals(reading, FloorBox.open(secret, id, sealed))
        assertEquals(998.44, assertNotNull(FloorBox.open(secret, id, sealed)).hPa, 0.011)
    }

    @Test fun itsMailboxIsNotTheLocationsMailbox() {
        // Older versions look up the rotating id and nothing else: they never meet this record.
        assertFalse(id.contentEquals(EphemeralId(secret).idForEpoch(epoch)))
        assertEquals(EphemeralId.ID_BYTES, id.size)
        // It rotates with the epoch, and is the same for every friend who holds the secret.
        assertFalse(id.contentEquals(FloorBox.idFor(secret, epoch + 1)))
        assertContentEquals(id, FloorBox.idFor(secret.copyOf(), epoch))
    }

    @Test fun cannotBeMistakenForALocation() {
        val sealed = FloorBox.seal(secret, id, reading)
        // Wrong size for a location box, and sealed with a different key: never opens as one.
        assertNull(LocationBox.open(secret, id, sealed))
        assertNull(LocationBox.open(secret, EphemeralId(secret).idForEpoch(epoch), sealed))
        // And a location never opens as a pressure.
        val rotating = EphemeralId(secret).idForEpoch(epoch)
        assertNull(FloorBox.open(secret, rotating, LocationBox.seal(secret, rotating, SharedLocation(-36.8, 174.7, nowMs / 1000, 10))))
    }

    @Test fun wrongSecretMailboxOrTamperingFails() {
        val sealed = FloorBox.seal(secret, id, reading)
        assertNull(FloorBox.open(ByteArray(32) { 1 }, id, sealed))
        assertNull(FloorBox.open(secret, FloorBox.idFor(secret, epoch + 1), sealed))
        assertNull(FloorBox.open(secret, id, sealed.copyOf().also { it[6] = (it[6].toInt() xor 1).toByte() }))
        assertNull(FloorBox.open(secret, id, sealed.copyOf().also { it[0] = (it[0].toInt() xor 1).toByte() })) // the clear time
        assertNull(FloorBox.open(secret, id, sealed.copyOf(18)))
    }

    @Test fun fitsTheRelayServersRecordSizes() {
        // The server takes records of 16..255 bytes.
        assert(FloorBox.SEALED_BYTES in 16..255)
    }
}
