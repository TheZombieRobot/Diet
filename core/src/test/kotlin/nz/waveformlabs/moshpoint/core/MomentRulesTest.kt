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
