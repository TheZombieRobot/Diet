package nz.waveformlabs.moshpoint.core

import java.net.URI
import java.util.Locale

/**
 * The receiving end of Text my spot (docs/REMOVE_SAFETY.md, stage 5): our own link for a spot,
 * `https://<relay host>/spot#<lat>,<lon>[,<name>]`.
 *
 * Everything after `#` stays in the phone or browser: browsers never send it to any server, so
 * our relay only ever sees `GET /spot`, never where anyone is. The relay's `/spot` page reads it
 * in the browser and opens the spot in Google Maps (for someone without Moshpoint); a phone
 * with Moshpoint opens it in the app (an App Link). The text keeps the plain coordinates too.
 *
 * A link someone texted is untrusted: [parse] takes valid coordinates only and a short, plain
 * name, and nothing in a link may do anything but show that spot.
 */
object SpotLink {
    /** The name shown on the pin: the sender's first name, at most this many characters. */
    const val MAX_NAME = 24

    /** A spot from a link: where, and whose (null: show "Texted spot"). */
    data class Spot(val lat: Double, val lon: Double, val name: String?)

    /**
     * Our link for a spot, or null with no relay of our own ([server] blank, or not a plain
     * https address): the text then uses the Google Maps link ([SpotText.link]), never a third
     * party's domain for our link. [name]: the sender's name; only its first word goes.
     */
    fun build(server: String, lat: Double, lon: Double, name: String?): String? {
        val host = host(server) ?: return null
        if (!SpotText.usable(lat, lon)) return null
        val first = name?.let { clean(it.trim().split(Regex("\\s+")).firstOrNull().orEmpty()) }?.takeIf { it.isNotEmpty() }
        val where = "%.5f,%.5f".format(Locale.ROOT, lat, lon)
        return "https://$host/spot#$where" + (first?.let { "," + encode(it) } ?: "")
    }

    /**
     * The spot in [url], if it's our link from [server]'s host: `https`, that host exactly, the
     * path `/spot`, and a fragment of two valid coordinates and at most a name. Anything else
     * (another host, a query, extra parts, out-of-range or non-numbers, 0,0): null.
     */
    fun parse(url: String, server: String): Spot? {
        val host = host(server) ?: return null
        if (url.length > 300) return null
        val u = runCatching { URI(url.trim()) }.getOrNull() ?: return null
        if (!"https".equals(u.scheme, ignoreCase = true) || !host.equals(u.host, ignoreCase = true)) return null
        if (u.rawUserInfo != null || (u.port != -1 && u.port != 443) || u.rawQuery != null) return null
        if (u.rawPath != "/spot") return null
        val parts = (u.rawFragment ?: return null).split(',')
        if (parts.size !in 2..3) return null
        val lat = number(parts[0]) ?: return null
        val lon = number(parts[1]) ?: return null
        if (!SpotText.usable(lat, lon)) return null
        val name = parts.getOrNull(2)?.let { decode(it) }?.let(::clean)?.takeIf { it.isNotEmpty() }
        return Spot(lat, lon, name)
    }

    /** The host of a plain `https://host` relay address (no path needed, none used), lower case. */
    private fun host(server: String): String? {
        val u = runCatching { URI(server.trim().trimEnd('/')) }.getOrNull() ?: return null
        if (!"https".equals(u.scheme, ignoreCase = true) || u.rawUserInfo != null) return null
        val h = u.host?.lowercase(Locale.ROOT)?.takeIf { it.isNotBlank() } ?: return null
        return if (u.port == -1 || u.port == 443) h else null
    }

    /** A plain decimal: digits, one dot, an optional minus. No exponents, no hex, no spaces. */
    private fun number(s: String): Double? {
        if (s.isEmpty() || s.length > 12 || !Regex("-?\\d{1,3}(\\.\\d{1,8})?").matches(s)) return null
        return s.toDoubleOrNull()
    }

    /**
     * A name safe to show: letters, digits, spaces, apostrophes and hyphens only (no control or
     * direction-changing characters, nothing that looks like a link), at most [MAX_NAME].
     */
    fun clean(s: String): String {
        val kept = s.filter { it.isLetterOrDigit() || it == ' ' || it == '\'' || it == '-' || Character.getType(it) == Character.NON_SPACING_MARK.toInt() || Character.getType(it) == Character.COMBINING_SPACING_MARK.toInt() }
        return kept.replace(Regex(" +"), " ").trim().take(MAX_NAME).trim()
    }

    /** Percent-encoding for the fragment: UTF-8, everything but letters and digits of ASCII. */
    private fun encode(s: String): String = buildString {
        for (b in s.toByteArray(Charsets.UTF_8)) {
            val c = b.toInt() and 0xFF
            if (c in 'a'.code..'z'.code || c in 'A'.code..'Z'.code || c in '0'.code..'9'.code) append(c.toChar())
            else append('%').append("%02X".format(c))
        }
    }

    /** The reverse; null for a broken escape or bytes that aren't UTF-8. */
    private fun decode(s: String): String? {
        if (s.length > 3 * MAX_NAME * 4) return null
        val out = java.io.ByteArrayOutputStream()
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c == '%') {
                if (i + 2 >= s.length) return null
                val v = s.substring(i + 1, i + 3).toIntOrNull(16) ?: return null
                out.write(v)
                i += 3
            } else {
                if (c.code > 0x7F) return null
                out.write(c.code)
                i++
            }
        }
        val bytes = out.toByteArray()
        val decoder = Charsets.UTF_8.newDecoder()
        return runCatching { decoder.decode(java.nio.ByteBuffer.wrap(bytes)).toString() }.getOrNull()
    }
}
