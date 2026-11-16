package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MomentRulesTest {
    @Test fun aSealedFileThatLooksLikeAJpegIsSealedAgainOnce() {
        assertTrue(Reseal.again(400, 1), "the 1-in-2.5-million false match: a new nonce, once more")
        assertFalse(Reseal.again(400, 2), "a second 400 is a real refusal")
        for (code in listOf(200, 204, 408, 413, 429, 500, 503, 0)) assertFalse(Reseal.again(code, 1), "$code isn't about the bytes")
    }
}

class MomentFetchTest {
    private val max = 12_000_000L

    @Test fun inTheBackgroundOnMobileDataOnlyWhatShowsAMomentExists() {
        assertTrue(MomentFetch.now(300_000L, opened = false, unmetered = false, maxFile = max), "a photo comes")
        assertTrue(MomentFetch.now(1_900_000L, opened = false, unmetered = false, maxFile = max), "a big photo comes")
        assertFalse(MomentFetch.now(8_000_000L, opened = false, unmetered = false, maxFile = max), "a clip waits")
        assertTrue(MomentFetch.now(-1L, opened = false, unmetered = false, maxFile = max), "no length given: start, and stop at the limit")
        assertTrue(MomentFetch.limit(opened = false, unmetered = false, maxFile = max) == MomentFetch.SMALL_BYTES)
        assertFalse(MomentFetch.retryLeftOver(opened = false, unmetered = false), "a clip left over isn't asked for again on mobile data")
    }

    @Test fun fullClipsWhenTappedOrOnWifi() {
        assertTrue(MomentFetch.now(11_900_000L, opened = true, unmetered = false, maxFile = max), "the Story is open: the clip comes")
        assertTrue(MomentFetch.now(11_900_000L, opened = false, unmetered = true, maxFile = max), "on Wi-Fi in the background: the clip comes")
        assertFalse(MomentFetch.now(12_500_000L, opened = true, unmetered = true, maxFile = max), "never over the relay's biggest file")
        assertTrue(MomentFetch.retryLeftOver(opened = true, unmetered = false))
        assertTrue(MomentFetch.retryLeftOver(opened = false, unmetered = true))
    }
}
