package nz.waveformlabs.moshpoint.core

/**
 * The relay server a crew invite may name (`r=` in `moshpoint:group?...`), and what the app
 * does with it. docs/WAVE2_PLAY.md, item 4.
 *
 * Release builds use only the relay built into them, whatever an invite says: an `r=` naming any
 * other host is ignored, and one naming the built-in host changes nothing. So no invite can move a
 * release build's traffic (Need help included) to someone else's server.
 *
 * Test builds keep the option, for testers trying a relay of their own: once the person has
 * confirmed the invite, they switch to the relay it names. They never pass that relay on: the
 * invites a phone sends carry only the build's own relay, or one typed into Settings on that
 * phone ([forInvites]), so a stranger's relay can't spread from phone to phone.
 */
object InviteRelay {
    private val HTTPS = Regex("^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]*)?$")

    /** A relay address the app will use: https, a plain host name, an optional port and path. */
    fun valid(url: String): Boolean = HTTPS.matches(url)

    /** The relay [qrText] names (decoded, without a trailing slash), or null if it names none. */
    fun named(qrText: String): String? =
        qrText.substringBefore("&name=").split('&').firstOrNull { it.startsWith("r=") }?.removePrefix("r=")
            ?.let { runCatching { java.net.URLDecoder.decode(it, "UTF-8") }.getOrNull() }
            ?.trim()?.trimEnd('/')?.takeIf { it.isNotEmpty() }

    /**
     * The relay to switch to when the person accepts an invite naming [named], or null to stay on
     * [inUse]. Release builds ([testBuild] false) never switch.
     */
    fun switchTo(named: String?, testBuild: Boolean, inUse: String): String? {
        if (!testBuild || named == null || !valid(named)) return null
        return named.takeIf { it != inUse.trim().trimEnd('/') }
    }

    /**
     * The relay invites from this phone should carry (blank = none, the public relay). Release:
     * the built-in one. Test builds: the one typed into Settings on this phone, else the built-in
     * one; never one that came from someone else's invite ([fromInvite]).
     */
    fun forInvites(builtIn: String, chosen: String, fromInvite: Boolean, testBuild: Boolean): String {
        val own = if (testBuild && chosen.isNotBlank() && !fromInvite) chosen else builtIn
        return own.trim().trimEnd('/')
    }

    /** [qrText] with [relay] in it (before `name`, where older versions ignore it), or unchanged if blank. */
    fun attach(qrText: String, relay: String): String {
        if (relay.isBlank() || !qrText.contains("&name=")) return qrText
        return qrText.replaceFirst("&name=", "&r=${java.net.URLEncoder.encode(relay, "UTF-8")}&name=")
    }
}
