package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class QrPayloadTest {
    private val code = FriendRecord.shareCode(ByteArray(32) { it.toByte() })

    @Test fun roundTrip() {
        assertEquals(code to "Sam & Jo 🤘", QrPayload.parse(QrPayload.of(code, " Sam & Jo 🤘 ")))
    }

    @Test fun noName() {
        assertEquals(code to "", QrPayload.parse(QrPayload.of(code, "")))
    }

    @Test fun rejectsOtherQrCodes() {
        assertNull(QrPayload.parse("https://example.com"))
        assertNull(QrPayload.parse("moshpoint:add?code=notacode&name=x"))
    }
}
