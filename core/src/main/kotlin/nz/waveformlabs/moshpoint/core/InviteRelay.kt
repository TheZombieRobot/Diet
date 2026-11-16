package nz.waveformlabs.moshpoint.core

/**
 * The relay server a crew invite may name (`r=` in `moshpoint:group?...`), and which relay a
 * phone uses and passes on. docs/WAVE2_PLAY.md, item 4.
 *
 * **Release builds** only ever use the build's own relays (`own`: today the production relay,
 * `MOSHPOINT_SERVER`; a free relay will join it with billing), else the public relay. An invite
 * naming one of them is followed; one naming any other host is ignored. So no invite can move a
 * release build's traffic (Need help included) to a stranger's server, and a stranger's relay
 * saved by an older version is never used either.
 *
 * **Test builds** keep the option, for testers trying a relay of their own: once the person has
 * confirmed the invite, they switch to whatever https relay it names. They never pass on a relay
 * that came in someone else's invite: theirs carry the build's own relay, or one typed into
 * Settings on that phone ([forInvites]), so a stranger's relay can't spread from phone to phone.
 */
object InviteRelay {
    private val HTTPS = Regex("^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]*)?$")

    /** A relay address the app will use: https, a plain host name, an optional port and path. */
    fun valid(url: String): Boolean = HTTPS.matches(url)

    /** How addresses are compared: no surrounding spaces, no trailing slash. */
    fun normal(url: String): String = url.trim().trimEnd('/')

    /** Is [url] one of the build's own relays ([own])? Blank never is. */
    fun isOwn(url: String, own: Collection<String>): Boolean {
        val u = normal(url)
        return u.isNotEmpty() && own.any { normal(it) == u }
    }

    /** The relay [qrText] names (decoded, without a trailing slash), or null if it names none. */
    fun named(qrText: String): String? =
        qrText.substringBefore("&name=").split('&').firstOrNull { it.startsWith("r=") }?.removePrefix("r=")
            ?.let { runCatching { java.net.URLDecoder.decode(it, "UTF-8") }.getOrNull() }
            ?.let(::normal)?.takeIf { it.isNotEmpty() }

    /**
     * The relay to switch to when the person accepts an invite naming [named], or null to stay on
     * [inUse]. Release builds switch only to one of their [own] relays; test builds to any valid
     * https relay.
     */
    fun switchTo(named: String?, testBuild: Boolean, inUse: String, own: Collection<String>): String? {
        if (named == null || !valid(named)) return null
        if (!testBuild && !isOwn(named, own)) return null
        return normal(named).takeIf { it != normal(inUse) }
    }

    /**
     * The relay this phone uses (blank = the public relay): the one chosen on it ([chosen]: from
     * Settings in a test build, or from an invite), else [builtIn]. A release build ignores a
     * chosen relay that isn't one of its [own].
     */
    fun inUse(builtIn: String, chosen: String, testBuild: Boolean, own: Collection<String>): String {
        val c = normal(chosen)
        val use = if (c.isNotEmpty() && (testBuild || isOwn(c, own))) c else builtIn
        return normal(use)
    }

    /**
     * The relay invites from this phone carry (blank = none, the public relay). Release: the one
     * in use, which is always one of its own. Test builds: the one typed into Settings on this
     * phone, else [builtIn]; never one that came from someone else's invite ([fromInvite]).
     */
    fun forInvites(builtIn: String, chosen: String, fromInvite: Boolean, testBuild: Boolean, own: Collection<String>): String =
        if (testBuild) normal(if (normal(chosen).isNotEmpty() && !fromInvite) chosen else builtIn)
        else inUse(builtIn, chosen, testBuild = false, own = own)

    /** [qrText] with [relay] in it (before `name`, where older versions ignore it), or unchanged if blank. */
    fun attach(qrText: String, relay: String): String {
        if (relay.isBlank() || !qrText.contains("&name=")) return qrText
        return qrText.replaceFirst("&name=", "&r=${java.net.URLEncoder.encode(relay, "UTF-8")}&name=")
    }
}
