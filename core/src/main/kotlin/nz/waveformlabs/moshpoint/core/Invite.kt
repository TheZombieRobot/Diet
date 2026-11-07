package nz.waveformlabs.moshpoint.core

/**
 * Invites without a camera: finds a Moshpoint invite anywhere in a pasted or shared message
 * (Messenger, SMS, WhatsApp...). Accepts what the QR codes hold, `moshpoint:group?...` and
 * `moshpoint:add?...`, plus a bare share code.
 */
sealed interface Invite {
    /** A gig group; [qrText] is what the group QR holds (pass to GigGroup.parseQr). */
    data class Group(val qrText: String) : Invite

    /** A person: their share code and suggested name (may be blank). */
    data class Friend(val code: String, val name: String) : Invite

    companion object {
        private const val GROUP = "moshpoint:group?"
        private const val ADD = "moshpoint:add?"

        /** The first invite in [text], groups first. Null if there isn't one. */
        fun find(text: String): Invite? {
            tokenAt(text, GROUP)?.let { return Group(it) }
            tokenAt(text, ADD)?.let { t -> QrPayload.parse(t)?.let { return Friend(it.first, it.second) } }
            // A bare code: a long token that decodes to a secret.
            return text.split(Regex("[\\s,;]+"))
                .map { it.trim('"', '\'', '.', '(', ')', '<', '>') }
                .firstOrNull { it.length >= 22 && !it.contains(':') && FriendRecord.secretFromCode(it) != null }
                ?.let { Friend(it, "") }
        }

        private fun tokenAt(text: String, prefix: String): String? {
            val i = text.indexOf(prefix)
            if (i < 0) return null
            return text.substring(i).split(Regex("\\s+")).first().trimEnd('.', ')', '"', '\'')
        }
    }
}
