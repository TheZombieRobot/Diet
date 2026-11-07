package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNull

class InviteTest {
    private val secret = ByteArray(32) { it.toByte() }
    private val code = FriendRecord.shareCode(secret)

    @Test fun friendInviteInsideAMessage() {
        val msg = "Add me on Moshpoint! Copy this message, open the app, tap Paste invite.\n\n${QrPayload.of(code, "Josh B")}"
        val inv = assertIs<Invite.Friend>(Invite.find(msg))
        assertEquals(code, inv.code)
        assertEquals("Josh B", inv.name)
    }

    @Test fun bareCode() {
        val inv = assertIs<Invite.Friend>(Invite.find("Add me on Moshpoint: $code"))
        assertEquals(code, inv.code)
        assertEquals("", inv.name)
    }

    @Test fun groupInviteWinsAndRoundTrips() {
        val g = GigGroup.create("Foo Fighters", 1_000L)
        val msg = "Join my crew tonight: ${GigGroup.qr(g)} (paste in Moshpoint)"
        val inv = assertIs<Invite.Group>(Invite.find(msg))
        val parsed = GigGroup.parseQr(inv.qrText, 2_000L)
        assertEquals("Foo Fighters", parsed?.name)
    }

    @Test fun nothingInRandomText() {
        assertNull(Invite.find("see you at the bar by the stage left side"))
        assertNull(Invite.find(""))
    }
}
