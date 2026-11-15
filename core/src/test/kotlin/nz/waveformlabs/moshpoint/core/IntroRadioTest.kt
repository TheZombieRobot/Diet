package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class IntroRadioTest {
    private val off = Triple(false, false, 0) // what Android reports with Bluetooth off
    private val on = Triple(true, true, 251) // a typical Bluetooth 5 phone

    private fun IntroRadio.round(s: Triple<Boolean, Boolean, Int>) = round(s.first, s.second, s.third)

    @Test fun startedWithBluetoothOffGoesOnAirOnceItIsOn() {
        val radio = IntroRadio(follower = false)
        assertEquals(IntroRadio.QUIET, radio.round(off))
        assertEquals(IntroRadio.QUIET, radio.round(off))
        // Bluetooth comes on: revive the dead advert set and scan, listen, and advertise.
        assertEquals(IntroRadio.Round(revive = true, listen = true, advertise = true), radio.round(on))
        // From then on, every round advertises, with nothing more to revive.
        assertEquals(IntroRadio.Round(revive = false, listen = true, advertise = true), radio.round(on))
    }

    @Test fun bluetoothOffAndOnAgainRevivesOnce() {
        val radio = IntroRadio(follower = false)
        assertFalse(radio.round(on).revive) // on from the start: nothing died
        assertEquals(IntroRadio.QUIET, radio.round(off))
        assertTrue(radio.round(on).revive)
        assertFalse(radio.round(on).revive)
    }

    @Test fun roomForTheBiggestIntro() {
        val radio = IntroRadio(follower = false)
        val need = GigGroup.MAX_INTRO2_BYTES + IntroRadio.ADVERT_HEADER
        assertTrue(radio.round(true, true, need).advertise)
        assertFalse(radio.round(true, true, need - 1).advertise)
        assertTrue(radio.round(true, true, need - 1).listen) // still hears others
        assertTrue(IntroRadio.fits(251)) // every Bluetooth 5 phone's minimum for extended adverts
        assertFalse(IntroRadio.fits(31)) // a legacy advert
    }

    @Test fun noExtendedAdvertsNoBluetoothIntros() {
        assertEquals(IntroRadio.QUIET, IntroRadio(follower = false).round(true, false, 31))
    }

    @Test fun followersNeverUseBluetooth() {
        val radio = IntroRadio(follower = true)
        assertEquals(IntroRadio.QUIET, radio.round(off))
        assertEquals(IntroRadio.QUIET, radio.round(on))
    }
}
