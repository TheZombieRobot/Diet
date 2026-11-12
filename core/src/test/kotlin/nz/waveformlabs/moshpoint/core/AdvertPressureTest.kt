package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Pressure in the Bluetooth advert: two extra bytes that older versions never notice. */
class AdvertPressureTest {
    private val secret = ByteArray(32) { (it * 7 + 1).toByte() }
    private val id = EphemeralId(secret).currentId(1_700_000_000_000L)
    private val controlee = Advert.UwbInfo(Advert.UwbRole.CONTROLEE, byteArrayOf(0x12, 0x34))
    private val controller = Advert.UwbInfo(Advert.UwbRole.CONTROLLER, byteArrayOf(0x0A, 0x0B), channel = 9, preamble = 11)
    private val pressure = Baro.toUnits(1013.26)!!

    @Test fun roundTripsWithEveryUwbBlock() {
        for (uwb in listOf(null, controlee, controller)) {
            val a = Advert.decode(secret, Advert.encode(secret, id, uwb, looking = true, pressure = pressure))!!
            assertEquals(pressure, a.pressure)
            assertEquals(uwb, a.uwb)
            assertTrue(a.looking)
        }
    }

    @Test fun addsExactlyTwoBytesAndStillFitsALegacyAdvert() {
        assertEquals(19, Advert.encode(secret, id, null, pressure = pressure).size)
        assertEquals(21, Advert.encode(secret, id, controlee, pressure = pressure).size)
        val biggest = Advert.encode(secret, id, controller, looking = true, beacon = true, askLight = true, pressure = pressure)
        assertEquals(23, biggest.size)
        // flags AD (3) + service data header (4) + payload must fit in 31.
        assertTrue(3 + 4 + biggest.size <= 31)
    }

    @Test fun noPressureMeansTheOldBytesExactly() {
        // A phone without the sensor sends what every earlier version sent.
        assertEquals(17, Advert.encode(secret, id, null).size)
        assertNull(Advert.decode(secret, Advert.encode(secret, id, controlee))!!.pressure)
        assertEquals(Advert.encode(secret, id, controller, looking = true).toList(), Advert.encode(secret, id, controller, looking = true, pressure = null).toList())
    }

    @Test fun olderVersionsStillReadTheUwbBlock() {
        // An older app reads the flags it knows and the first 2 or 4 bytes after the id, and
        // ignores the rest. Those bytes are byte-for-byte what they were before: cutting the two
        // new bytes off leaves exactly the old advert, apart from the one new flag bit.
        for (uwb in listOf(controlee, controller)) {
            val with = Advert.encode(secret, id, uwb, looking = true, pressure = pressure)
            val without = Advert.encode(secret, id, uwb, looking = true)
            assertEquals(without.drop(1), with.dropLast(2).drop(1))
            assertEquals(without[0].toInt() and 0x7F, with[0].toInt() and 0x7F)
            assertEquals(0x80, with[0].toInt() and 0x80)
            assertEquals(0, without[0].toInt() and 0x80)
        }
    }

    @Test fun pressureIsScrambled() {
        val a = Advert.encode(secret, id, null, pressure = pressure)
        val sent = ((a[17].toInt() and 0xFF) shl 8) or (a[18].toInt() and 0xFF)
        assertFalse(sent == pressure)
        // The wrong key gives a different number (not ours), never a crash.
        val wrong = Advert.decode(ByteArray(32) { 9 }, a)!!.pressure
        assertFalse(wrong == pressure)
    }

    @Test fun outOfRangeOrTruncatedIsIgnored() {
        assertNull(Advert.decode(secret, Advert.encode(secret, id, null, pressure = 70_000))!!.pressure)
        assertNull(Advert.decode(secret, Advert.encode(secret, id, null, pressure = -1))!!.pressure)
        // The flag says pressure but a byte is missing: no pressure, UWB still fine.
        val cut = Advert.encode(secret, id, controlee, pressure = pressure).dropLast(1).toByteArray()
        val a = Advert.decode(secret, cut)!!
        assertNull(a.pressure)
        assertEquals(controlee, a.uwb)
    }
}
