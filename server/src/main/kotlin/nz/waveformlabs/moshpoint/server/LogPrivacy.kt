package nz.waveformlabs.moshpoint.server

import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.pattern.CompositeConverter

/**
 * The relay never logs request bodies, URLs, mailbox ids, tokens or client addresses. As a second
 * line of defence, every log line (exceptions included) goes through [mask], which hides anything
 * that looks like one of them: `%masked(...)` in logback.xml.
 */
object LogPrivacy {
    private val HEX_ID = Regex("(?<![0-9A-Za-z])[0-9a-fA-F]{16,}(?![0-9A-Za-z])")
    private val TOKEN = Regex("(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{40,}(?![A-Za-z0-9_-])")
    private val IPV4 = Regex("(?<![0-9.])\\d{1,3}(\\.\\d{1,3}){3}(?![0-9.])")
    private val HEX_COLON = Regex("(?<![0-9A-Za-z:])[0-9a-fA-F:]{3,}(?![0-9A-Za-z:])")

    fun mask(s: String): String {
        var t = HEX_ID.replace(s, "[id]")
        t = TOKEN.replace(t, "[token]")
        t = IPV4.replace(t, "[address]")
        // IPv6: hex and colons with at least two colons, and "::" or a letter (so 12:30:05 stays).
        t = HEX_COLON.replace(t) { m ->
            val v = m.value
            if (v.count { it == ':' } >= 2 && (v.contains("::") || v.any { it.isLetter() })) "[address]" else v
        }
        return t
    }
}

/** logback: `%masked(%msg%n%ex)` writes its contents through [LogPrivacy.mask]. */
class MaskedConverter : CompositeConverter<ILoggingEvent>() {
    override fun transform(event: ILoggingEvent, input: String): String = LogPrivacy.mask(input)
}
