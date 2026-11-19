package nz.waveformlabs.moshpoint.server

/**
 * The privacy policy as a page: `GET /privacy` (docs/RELAY_API.md section 14).
 *
 * The page is docs/PRIVACY.md, built into `privacy.html` (this module's resources) by
 * tools/privacy_page.py; CI fails when it's out of date (`--check`), and the same file is the
 * GitHub Pages copy in docs/site/. The one thing filled in here is the contact: the owner's
 * `MOSHPOINT_CONTACT` (a Fly secret, also given to Nominatim) goes where the page says
 * [PLACEHOLDER]. Unset, the placeholder stays, so a missing contact is plain to see (and the
 * Deploy server workflow warns about it).
 *
 * Static: built once at start, no script, nothing loaded from anywhere else, nothing about the
 * reader kept.
 */
class PrivacyPage(contact: String?, template: String = template()) {
    val html: String = render(template, contact)

    companion object {
        const val PLACEHOLDER = "INSERTCONTACTEMAILHERE"

        /** No script at all; its own inline style only. */
        const val SECURITY = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

        /** How tools/privacy_page.py writes the contact: the link and its text are both replaced. */
        private const val LINK = "<a class=\"contact\" href=\"mailto:$PLACEHOLDER\">$PLACEHOLDER</a>"

        private val EMAIL = Regex("[^@\\s<>\"'&]+@[^@\\s<>\"'&]+\\.[^@\\s<>\"'&]+")
        private val WEB = Regex("https://[^\\s<>\"']+")

        fun template(): String =
            PrivacyPage::class.java.getResource("/privacy.html")?.readText(Charsets.UTF_8)
                ?: error("privacy.html is missing from the relay's resources (tools/privacy_page.py builds it)")

        fun fromEnv(env: (String) -> String? = System::getenv): PrivacyPage = PrivacyPage(env("MOSHPOINT_CONTACT"))

        /**
         * [template] with [contact] in place of every [PLACEHOLDER]: an email address becomes a
         * mailto link, an https address a link, anything else plain text. Always escaped, so the
         * setting can't add markup. Blank: the template as it is.
         */
        fun render(template: String, contact: String?): String {
            val c = contact?.trim().orEmpty()
            if (c.isEmpty()) return template
            val text = escape(c)
            val element = when {
                EMAIL.matches(c) -> "<a class=\"contact\" href=\"mailto:$text\">$text</a>"
                WEB.matches(c) -> "<a class=\"contact\" href=\"$text\">$text</a>"
                else -> "<span class=\"contact\">$text</span>"
            }
            return template.replace(LINK, element).replace(PLACEHOLDER, text)
        }

        private fun escape(s: String) = buildString {
            s.forEach {
                when (it) {
                    '&' -> append("&amp;")
                    '<' -> append("&lt;")
                    '>' -> append("&gt;")
                    '"' -> append("&quot;")
                    '\'' -> append("&#39;")
                    else -> append(it)
                }
            }
        }
    }
}
