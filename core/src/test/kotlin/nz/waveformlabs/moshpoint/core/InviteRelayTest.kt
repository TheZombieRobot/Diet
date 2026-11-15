package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class InviteRelayTest {
    private val g = GigGroup.create("Foo Fighters", 1_000L)
    private val own = "https://relay.moshpoint.example"
    private val stranger = "https://evil.example:8443/x"

    @Test fun anInviteCarriesTheRelayAndStillParses() {
        val qr = InviteRelay.attach(GigGroup.qr(g), stranger)
        assertEquals(stranger, InviteRelay.named(qr))
        // The crew itself is untouched: the relay sits before the name, where parseQr ignores it.
        assertEquals("Foo Fighters", GigGroup.parseQr(qr, 2_000L)?.name)
        assertTrue(GigGroup.parseQr(qr, 2_000L)!!.key.contentEquals(g.key))
    }

    @Test fun noRelayNamed() {
        assertNull(InviteRelay.named(GigGroup.qr(g)))
        assertEquals(GigGroup.qr(g), InviteRelay.attach(GigGroup.qr(g), ""))
    }

    @Test fun releaseBuildsNeverSwitch() {
        assertNull(InviteRelay.switchTo(stranger, testBuild = false, inUse = own))
        assertNull(InviteRelay.switchTo(own, testBuild = false, inUse = own))
        assertNull(InviteRelay.switchTo(stranger, testBuild = false, inUse = ""))
    }

    @Test fun testBuildsSwitchOnlyToAValidOtherHttpsRelay() {
        assertEquals(stranger, InviteRelay.switchTo(stranger, testBuild = true, inUse = own))
        assertNull(InviteRelay.switchTo(own, testBuild = true, inUse = "$own/"))
        assertNull(InviteRelay.switchTo("http://plain.example", testBuild = true, inUse = own))
        assertNull(InviteRelay.switchTo("https://bad host", testBuild = true, inUse = own))
        assertNull(InviteRelay.switchTo(null, testBuild = true, inUse = own))
    }

    @Test fun invitesNeverPassOnAStrangersRelay() {
        // Release: always the built-in relay, whatever is stored.
        assertEquals(own, InviteRelay.forInvites(own, stranger, fromInvite = true, testBuild = false))
        assertEquals(own, InviteRelay.forInvites(own, stranger, fromInvite = false, testBuild = false))
        assertEquals("", InviteRelay.forInvites("", stranger, fromInvite = false, testBuild = false))
        // Test builds: a relay typed into Settings travels; one from an invite doesn't.
        assertEquals(stranger, InviteRelay.forInvites(own, stranger, fromInvite = false, testBuild = true))
        assertEquals(own, InviteRelay.forInvites(own, stranger, fromInvite = true, testBuild = true))
        assertEquals("", InviteRelay.forInvites("", stranger, fromInvite = true, testBuild = true))
        assertEquals(own, InviteRelay.forInvites("$own/", "", fromInvite = false, testBuild = true))
    }

    @Test fun validAddresses() {
        assertTrue(InviteRelay.valid("https://relay.example"))
        assertTrue(InviteRelay.valid("https://relay.example:8443/moshpoint"))
        assertFalse(InviteRelay.valid("http://relay.example"))
        assertFalse(InviteRelay.valid("https://relay.example?x=1"))
        assertFalse(InviteRelay.valid("javascript:alert(1)"))
    }
}
