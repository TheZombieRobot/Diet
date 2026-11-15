package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class InviteRelayTest {
    private val g = GigGroup.create("Foo Fighters", 1_000L)
    private val own = "https://relay.moshpoint.example"
    private val free = "https://free.moshpoint.example" // a second own relay (the free tier, later)
    private val stranger = "https://evil.example:8443/x"
    private val owns = listOf(own, free)

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

    @Test fun releaseBuildsFollowOnlyTheirOwnRelays() {
        assertNull(InviteRelay.switchTo(stranger, testBuild = false, inUse = own, own = owns))
        assertNull(InviteRelay.switchTo(stranger, testBuild = false, inUse = "", own = owns))
        assertNull(InviteRelay.switchTo(own, testBuild = false, inUse = "$own/", own = owns)) // already on it
        assertEquals(free, InviteRelay.switchTo(free, testBuild = false, inUse = own, own = owns))
        assertEquals(own, InviteRelay.switchTo("$own/", testBuild = false, inUse = "", own = owns))
        // A build with no relay of its own follows none.
        assertNull(InviteRelay.switchTo(own, testBuild = false, inUse = "", own = emptyList()))
    }

    @Test fun testBuildsSwitchToAnyValidOtherHttpsRelay() {
        assertEquals(stranger, InviteRelay.switchTo(stranger, testBuild = true, inUse = own, own = owns))
        assertNull(InviteRelay.switchTo(own, testBuild = true, inUse = "$own/", own = owns))
        assertNull(InviteRelay.switchTo("http://plain.example", testBuild = true, inUse = own, own = owns))
        assertNull(InviteRelay.switchTo("https://bad host", testBuild = true, inUse = own, own = owns))
        assertNull(InviteRelay.switchTo(null, testBuild = true, inUse = own, own = owns))
    }

    @Test fun releaseBuildsNeverUseAStrangersRelay() {
        // A stranger's relay saved by an older version is ignored: the built-in one, or public.
        assertEquals(own, InviteRelay.inUse(own, stranger, testBuild = false, own = owns))
        assertEquals("", InviteRelay.inUse("", stranger, testBuild = false, own = emptyList()))
        // One of its own, chosen by an invite, is used.
        assertEquals(free, InviteRelay.inUse(own, "$free/", testBuild = false, own = owns))
        assertEquals(own, InviteRelay.inUse(own, "", testBuild = false, own = owns))
        // Test builds use whatever was chosen.
        assertEquals(stranger, InviteRelay.inUse(own, stranger, testBuild = true, own = owns))
    }

    @Test fun invitesNeverPassOnAStrangersRelay() {
        // Release: the relay in use, always one of its own.
        assertEquals(own, InviteRelay.forInvites(own, stranger, fromInvite = true, testBuild = false, own = owns))
        assertEquals(own, InviteRelay.forInvites(own, stranger, fromInvite = false, testBuild = false, own = owns))
        assertEquals(free, InviteRelay.forInvites(own, free, fromInvite = true, testBuild = false, own = owns))
        assertEquals("", InviteRelay.forInvites("", stranger, fromInvite = false, testBuild = false, own = emptyList()))
        // Test builds: a relay typed into Settings travels; one from an invite doesn't.
        assertEquals(stranger, InviteRelay.forInvites(own, stranger, fromInvite = false, testBuild = true, own = owns))
        assertEquals(own, InviteRelay.forInvites(own, stranger, fromInvite = true, testBuild = true, own = owns))
        assertEquals("", InviteRelay.forInvites("", stranger, fromInvite = true, testBuild = true, own = owns))
        assertEquals(own, InviteRelay.forInvites("$own/", "", fromInvite = false, testBuild = true, own = owns))
    }

    @Test fun validAddressesAndOwnRelays() {
        assertTrue(InviteRelay.valid("https://relay.example"))
        assertTrue(InviteRelay.valid("https://relay.example:8443/moshpoint"))
        assertFalse(InviteRelay.valid("http://relay.example"))
        assertFalse(InviteRelay.valid("https://relay.example?x=1"))
        assertFalse(InviteRelay.valid("javascript:alert(1)"))
        assertTrue(InviteRelay.isOwn(" $own/ ", owns))
        assertFalse(InviteRelay.isOwn("", listOf("")))
        assertFalse(InviteRelay.isOwn(stranger, owns))
    }
}
