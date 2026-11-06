package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AdvertTest {
    private val secret = ByteArray(32) { (it * 3).toByte() }
    private val id = EphemeralId(secret).currentId(1_700_000_000_000L)

    @Test fun plainAdvertIs17Bytes() {
        val bytes = Advert.encode(secret, id, null)
        assertEquals(17, bytes.size)
        assertEquals(Advert(id, null), Advert.decode(secret, bytes))
    }

    @Test fun controleeRoundTrip() {
        val uwb = Advert.UwbInfo(Advert.UwbRole.CONTROLEE, byteArrayOf(0x12, 0x34))
        val bytes = Advert.encode(secret, id, uwb)
        assertEquals(19, bytes.size)
        assertEquals(uwb, Advert.decode(secret, bytes)!!.uwb)
    }

    @Test fun controllerRoundTripAndFitsLegacyAdvert() {
        val uwb = Advert.UwbInfo(Advert.UwbRole.CONTROLLER, byteArrayOf(0x0A, 0x0B), channel = 9, preamble = 11)
        val bytes = Advert.encode(secret, id, uwb)
        assertEquals(21, bytes.size)
        // flags AD (3) + service data header (len, type, 16-bit uuid = 4) + payload must fit in 31.
        assertTrue(3 + 4 + bytes.size <= 31)
        assertEquals(uwb, Advert.decode(secret, bytes)!!.uwb)
        assertContentEquals(id, Advert.idOf(bytes))
    }

    @Test fun uwbBlockIsEncrypted() {
        val uwb = Advert.UwbInfo(Advert.UwbRole.CONTROLLER, byteArrayOf(0x0A, 0x0B), channel = 9, preamble = 11)
        val bytes = Advert.encode(secret, id, uwb)
        assertFalse(bytes.copyOfRange(17, 21).contentEquals(byteArrayOf(0x0A, 0x0B, 9, 11)))
        // Wrong key decodes to garbage, not our address.
        val wrong = Advert.decode(ByteArray(32) { 1 }, bytes)!!.uwb!!
        assertFalse(wrong.address.contentEquals(byteArrayOf(0x0A, 0x0B)) && wrong.channel == 9)
    }

    @Test fun shortDataRejected() {
        assertNull(Advert.decode(secret, ByteArray(5)))
    }
}

class UwbSessionKeysTest {
    private val s = ByteArray(32) { it.toByte() }

    @Test fun deterministicAndAddressDependent() {
        val a = byteArrayOf(1, 2)
        assertEquals(UwbSessionKeys.sessionId(s, a), UwbSessionKeys.sessionId(s, a))
        assertNotEquals(UwbSessionKeys.sessionId(s, a), UwbSessionKeys.sessionId(s, byteArrayOf(2, 1)))
        assertTrue(UwbSessionKeys.sessionId(s, a) >= 0)
        assertEquals(8, UwbSessionKeys.sessionKey(s, a).size)
    }
}
