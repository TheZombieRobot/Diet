package nz.waveformlabs.moshpoint.server

import java.net.URI
import java.net.URLDecoder
import java.util.Locale

/**
 * Links the relay hands to phones: a show's ticket page and picture (Discover). Some listing
 * services put the caller's key in the links they return (Bandsintown's carry
 * `app_id=<our app id>`), and phones copy a ticket link into every crew invite, so a key left in
 * one would end up anywhere. [clean] keeps plain https links only and drops every key-like query
 * parameter, plus any part holding one of this relay's own keys ([secrets]), whatever it's
 * called. The app cleans ticket links again before they go anywhere (TicketLink in core).
 * docs/SECRETS.md, "What stops a leak".
 */
object PublicLink {
    /** Longer links are dropped (the app refuses ticket links over 300 characters anyway). */
    const val MAX_CHARS = 1_000

    /** Query parameters that carry a key or a token (the same names LogPrivacy hides). */
    private val KEY_PARAMS = setOf(
        "apikey", "api_key", "appid", "app_id", "app_secret", "key", "client_id", "client_secret",
        "access_token", "token", "secret", "password",
    )

    /** This relay's own listing keys (added by [Discover] at start), so a link holding one is cleaned whatever the parameter is called. */
    @Volatile var secrets: Set<String> = emptySet()
        private set

    fun addSecrets(keys: Collection<String?>) {
        val add = keys.mapNotNull { it?.trim() }.filter { it.isNotEmpty() }
        if (add.isNotEmpty()) synchronized(this) { secrets = secrets + add }
    }

    /** For tests: forget the keys added. */
    internal fun resetSecrets() = synchronized(this) { secrets = emptySet() }

    /** [url] safe to hand to a phone, or "" if it isn't a plain https link or a key can't be taken out of it. */
    fun clean(url: String): String {
        val t = url.trim()
        if (t.isEmpty() || t.length > MAX_CHARS || t.any { it.isWhitespace() || it.isISOControl() }) return ""
        val uri = runCatching { URI(t) }.getOrNull() ?: return ""
        if (!"https".equals(uri.scheme, ignoreCase = true) || uri.rawUserInfo != null || uri.host.isNullOrBlank()) return ""
        val base = t.substring(0, t.indexOfFirst { it == '?' || it == '#' }.let { if (it < 0) t.length else it })
        // A key in the address itself can't be cut out cleanly: no link at all.
        if (holdsKey(base) || holdsKey(decode(base))) return ""
        val query = uri.rawQuery?.split('&')?.filter { p ->
            p.isNotEmpty() && decode(p.substringBefore('=')).lowercase(Locale.ROOT) !in KEY_PARAMS &&
                !holdsKey(p) && !holdsKey(decode(p))
        }.orEmpty()
        val fragment = uri.rawFragment?.takeIf { !holdsKey(it) && !holdsKey(decode(it)) }
        return base + (if (query.isEmpty()) "" else "?" + query.joinToString("&")) + (fragment?.let { "#$it" } ?: "")
    }

    /** Does [s] hold one of our keys? (A short key must match a whole value, so it can't wipe ordinary links.) */
    private fun holdsKey(s: String): Boolean = secrets.any { k ->
        s == k || s.endsWith("=$k") || (k.length >= 8 && s.contains(k))
    }

    private fun decode(s: String): String = runCatching { URLDecoder.decode(s, "UTF-8") }.getOrDefault(s)
}
