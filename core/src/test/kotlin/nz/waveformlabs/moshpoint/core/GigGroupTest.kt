package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class GigGroupTest {
    private val now = 1_700_000_000_000L
    private val group = GigGroup.create("Foo Fighters night", now)
    private val me = GigGroup.Intro(ByteArray(32) { (it * 7).toByte() }, "Josh")

    @Test fun qrRoundTrip() {
        val joined = assertNotNull(GigGroup.parseQr(GigGroup.qr(group), now))
        assertContentEquals(group.key, joined.key)
        assertEquals("Foo Fighters night", joined.name)
        assertNull(GigGroup.parseQr("moshpoint:add?code=abc", now))
        assertNull(GigGroup.parseQr("moshpoint:group?key=short", now))
    }

    @Test fun membersCanOpenIntros() {
        val blob = group.sealIntro(me, now)
        assertTrue(blob.size <= GigGroup.MAX_INTRO_BYTES)
        val other = GigGroup(group.key, group.name, now) // another member's copy
        assertEquals(me, other.openIntro(blob, now + 60_000))
    }

    @Test fun outsidersCannot() {
        val blob = group.sealIntro(me, now)
        assertNull(GigGroup.create("other", now).openIntro(blob, now))
    }

    @Test fun tamperingRejected() {
        val blob = group.sealIntro(me, now)
        blob[blob.size - 3] = (blob[blob.size - 3].toInt() xor 1).toByte()
        assertNull(group.openIntro(blob, now))
    }

    @Test fun tagRotatesButStillMatchesNearby() {
        val t0 = group.tagAt(now)
        val t1 = group.tagAt(now + EphemeralId.DEFAULT_ROTATION_MS)
        assertFalse(t0.contentEquals(t1))
        assertTrue(group.matchesTag(t0, now + EphemeralId.DEFAULT_ROTATION_MS))
        assertFalse(group.matchesTag(t0, now + 10 * EphemeralId.DEFAULT_ROTATION_MS))
    }

    @Test fun longNamesTrimmedSafely() {
        val long = GigGroup.Intro(me.secret, "🤘".repeat(20))
        val opened = assertNotNull(group.openIntro(group.sealIntro(long, now), now))
        // Cut at a whole emoji: nothing but complete 🤘s left.
        assertTrue(opened.name.isNotEmpty() && opened.name.replace("🤘", "").isEmpty(), opened.name)
        assertTrue(group.sealIntro(long, now).size <= GigGroup.MAX_INTRO_BYTES)
    }
}
