package nz.waveformlabs.moshpoint.core

import java.net.URLDecoder
import java.net.URLEncoder

/**
 * What's inside a Moshpoint QR code: `moshpoint:add?code=<share code>&name=<your name>`.
 * The `moshpoint:` prefix means scanning some random QR code can't add a "friend".
 */
object QrPayload {
    private const val PREFIX = "moshpoint:add?code="

    fun of(code: String, name: String) = "$PREFIX$code&name=${URLEncoder.encode(name.trim(), "UTF-8")}"

    /** Returns (code, suggested name), or null if it isn't a valid Moshpoint QR. */
    fun parse(text: String): Pair<String, String>? {
        val t = text.trim()
        if (!t.startsWith(PREFIX)) return null
        val rest = t.removePrefix(PREFIX)
        val code = rest.substringBefore('&')
        if (FriendRecord.secretFromCode(code) == null) return null
        val name = rest.substringAfter("&name=", "")
            .let { runCatching { URLDecoder.decode(it, "UTF-8") }.getOrDefault("") }
            .take(40)
        return code to name
    }
}
