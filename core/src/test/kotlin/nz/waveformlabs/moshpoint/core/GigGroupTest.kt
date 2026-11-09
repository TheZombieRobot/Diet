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

    @Test fun chatFlareAndPlanCarryText() {
        val chat = GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", 1_700_000_000, text = "At the bar, want one? 🍺")
        assertEquals(chat, group.openPing(group.sealPing(chat)))
        val flare = GigGroup.Ping(GigGroup.Ping.FLARE, "Jo", 1_700_000_000, -36.85, 174.76, 30, "Lost 😅")
        val opened = assertNotNull(group.openPing(group.sealPing(flare)))
        assertEquals("Lost 😅", opened.text)
        assertEquals(30, opened.minutes)
        // Long text is cut on a character boundary, never mid-emoji.
        val long = GigGroup.Ping(GigGroup.Ping.PLAN, "Jo", 1_700_000_000, text = "🎸".repeat(100))
        val cut = assertNotNull(group.openPing(group.sealPing(long))).text
        assertTrue(cut.isNotEmpty())
        assertEquals("🎸".repeat(cut.length / 2), cut)
        // Plain pings still have no text.
        assertEquals("", assertNotNull(group.openPing(group.sealPing(GigGroup.Ping(1, "Jo", 1_700_000_000)))).text)
    }

    @Test fun bluetoothShownAsBands() {
        assertEquals("Right here", ArrowStyle.bandLabel(2.0))
        assertEquals("Close", ArrowStyle.bandLabel(8.0))
        assertEquals("Nearby", ArrowStyle.bandLabel(20.0))
        assertEquals("In range", ArrowStyle.bandLabel(45.0))
    }

    @Test fun senderTagTellsSameNamesApart() {
        val a = GigGroup.Ping(GigGroup.Ping.CHAT, "Mate", 1_700_000_000, text = "hi", sender = 42L)
        val b = GigGroup.Ping(GigGroup.Ping.CHAT, "Mate", 1_700_000_000, text = "hi", sender = 43L)
        assertEquals(42L, assertNotNull(group.openPing(group.sealPing(a))).sender)
        assertEquals(43L, assertNotNull(group.openPing(group.sealPing(b))).sender)
        // A sender with no text still round-trips.
        val ping = GigGroup.Ping(GigGroup.Ping.COMING, "Mate", 1_700_000_000, sender = 7L)
        assertEquals(ping, group.openPing(group.sealPing(ping)))
    }

    @Test fun historyBundlesFitAndRoundTrip() {
        val lines = (0 until 300).map { GigGroup.HistoryLine(GigGroup.Ping.CHAT, "Jo", 9L, 1_700_000_000L + it, "message number $it, who's keen? 🎸") }
        val plan = GigGroup.HistoryLine(GigGroup.Ping.PLAN, "Alex", 3L, 1_699_000_000L, "Pre-drinks at Jo's, 5pm")
        val blob = assertNotNull(group.sealHistory(GigGroup.History(lines, plan), 1_700_000_500L))
        assertTrue(blob.size <= GigGroup.MAX_HISTORY_BYTES)
        val h = assertNotNull(group.openHistory(blob))
        assertEquals(plan, h.plan)
        assertTrue(h.lines.size in 20..300)
        assertEquals(lines.last(), h.lines.last()) // the newest are kept
        assertNull(GigGroup.create("Other", now).openHistory(blob))
    }
}
