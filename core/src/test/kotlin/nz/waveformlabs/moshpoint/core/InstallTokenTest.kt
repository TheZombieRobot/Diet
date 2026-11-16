package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class InstallTokenTest {
    private val ours = "https://relay.example.org"
    private val other = "https://other.example.org"
    private val good = "AQ" + "x".repeat(40) + "-_"
    private val hour = 3_600_000L

    @Test fun askedAtFirstStartThenKept() {
        val t = InstallToken()
        assertTrue(t.shouldAsk(ours, 1_000L))
        t.asking(1_000L)
        assertFalse(t.shouldAsk(ours, 2_000L), "not twice at once")
        t.answered(ours, 200, good + "\n", 3_000L)
        assertEquals(good, t.tokenFor(ours))
        assertFalse(t.shouldAsk(ours, 10 * hour), "kept: never asked again while it's good")
        // It survives a restart.
        val back = InstallToken(t.save())
        assertEquals(good, back.tokenFor(ours))
        assertFalse(back.shouldAsk(ours, 10 * hour))
    }

    @Test fun neverForThePublicRelayAndOnlySentToTheRelayThatIssuedIt() {
        val t = InstallToken()
        assertFalse(t.shouldAsk("", 0L), "the free fallback has no tokens")
        t.asking(0L)
        t.answered(ours, 200, good, 0L)
        assertNull(t.tokenFor(""))
        assertNull(t.tokenFor(other), "never sent to another relay")
        // A phone moved to another relay (a test build's Settings) asks that one straight away.
        assertTrue(t.shouldAsk(other, 1_000L))
    }

    @Test fun refusedOrOldRelayAsksAgainAtMostOnceAnHour() {
        val t = InstallToken()
        t.asking(0L)
        t.answered(ours, 429, "slow down", 0L) // asking is limited per address
        assertNull(t.tokenFor(ours))
        assertFalse(t.shouldAsk(ours, hour - 1))
        assertTrue(t.shouldAsk(ours, hour))
        t.asking(hour)
        t.answered(ours, 404, "", hour) // an older relay: no /v1/install
        assertFalse(t.shouldAsk(ours, 2 * hour - 1))
        assertTrue(t.shouldAsk(ours, 2 * hour))
        // Survives a restart: a crash loop can't turn into an ask every start.
        assertFalse(InstallToken(t.save()).shouldAsk(ours, 2 * hour - 1))
    }

    @Test fun noAnswerTriesAgainAfterAMinute() {
        val t = InstallToken()
        t.asking(0L)
        t.noAnswer(5_000L)
        assertFalse(t.shouldAsk(ours, 60_000L))
        assertTrue(t.shouldAsk(ours, 65_000L), "a first start with no signal still gets one soon after")
    }

    @Test fun invalidDropsItAndAsksAgainAtMostOnceAnHour() {
        val t = InstallToken()
        t.asking(0L)
        t.answered(ours, 200, good, 0L)
        assertFalse(t.invalid(other), "another relay's word doesn't drop ours")
        assertEquals(good, t.tokenFor(ours))
        assertTrue(t.invalid(ours))
        assertNull(t.tokenFor(ours))
        assertFalse(t.invalid(ours), "already dropped")
        // Issued 20 minutes ago: the next ask waits for the hour.
        assertFalse(t.shouldAsk(ours, 20 * 60_000L))
        assertTrue(t.shouldAsk(ours, hour))
        assertNull(InstallToken(t.save()).tokenFor(ours), "dropped for good, not back after a restart")
    }

    @Test fun onlyAWellFormedTokenIsKept() {
        for (body in listOf("", "short", "x".repeat(45), "x".repeat(43) + "\r", "x".repeat(42) + "\n\n", "<html>" + "x".repeat(38))) {
            val t = InstallToken()
            t.asking(0L)
            t.answered(ours, 200, body, 0L)
            assertNull(t.tokenFor(ours), "kept ${body.length} bytes of junk")
            assertFalse(t.shouldAsk(ours, hour - 1), "junk counts as an answer")
        }
        // A damaged saved line is ignored rather than sent.
        assertNull(InstallToken("1\n$ours\nnot a token\n$ours\n0").tokenFor(ours))
        assertNull(InstallToken("garbage").tokenFor(ours))
        assertTrue(InstallToken("garbage").shouldAsk(ours, 0L))
    }

    @Test fun aClockThatWentBackDoesNotBlockAsking() {
        val t = InstallToken()
        t.asking(10 * hour)
        t.answered(ours, 429, "", 10 * hour)
        assertTrue(t.shouldAsk(ours, 2 * hour))
    }
}
