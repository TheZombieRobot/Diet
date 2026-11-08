package nz.waveformlabs.moshpoint.core

import java.util.Base64

/**
 * A saved friend, and the plain-text format we store them in on the phone.
 *
 * One friend per line, tab-separated, every field Base64 so names can hold anything:
 * `v1 \t id \t name \t colour \t secret \t gigGroupOnly \t addedAtMs`
 */
data class FriendRecord(
    val id: String,
    val name: String,
    val color: Int,
    val secret: ByteArray,
    val gigGroupOnly: Boolean,
    val addedAtMs: Long,
) {
    override fun equals(other: Any?) = other is FriendRecord && id == other.id && name == other.name &&
        color == other.color && secret.contentEquals(other.secret) && gigGroupOnly == other.gigGroupOnly &&
        addedAtMs == other.addedAtMs

    override fun hashCode() = id.hashCode()

    companion object {
        /**
         * Safety net for crew members: dropped on load after this. Crews end themselves (the
         * morning after the gig, which can be days away for a planned gig) and clear their
         * members then; this only catches leftovers.
         */
        const val GIG_GROUP_TTL_MS = 8L * 24 * 60 * 60 * 1000

        private val enc = Base64.getUrlEncoder().withoutPadding()
        private val dec = Base64.getUrlDecoder()

        private fun s(v: String) = enc.encodeToString(v.toByteArray(Charsets.UTF_8))
        private fun us(v: String) = String(dec.decode(v), Charsets.UTF_8)

        fun serialize(records: List<FriendRecord>): String = records.joinToString("\n") { r ->
            listOf("v1", s(r.id), s(r.name), r.color.toString(), enc.encodeToString(r.secret),
                r.gigGroupOnly.toString(), r.addedAtMs.toString()).joinToString("\t")
        }

        /** Skips lines it can't read rather than losing the whole list. */
        fun parse(text: String, nowMs: Long): List<FriendRecord> = text.lineSequence()
            .filter { it.isNotBlank() }
            .mapNotNull { line ->
                runCatching {
                    val p = line.split('\t')
                    require(p[0] == "v1" && p.size >= 7)
                    FriendRecord(us(p[1]), us(p[2]), p[3].toInt(), dec.decode(p[4]), p[5].toBooleanStrict(), p[6].toLong())
                }.getOrNull()
            }
            .filter { !it.gigGroupOnly || nowMs - it.addedAtMs < GIG_GROUP_TTL_MS }
            .toList()

        /** The code you share so a mate can add you. Just your secret, URL-safe Base64. */
        fun shareCode(secret: ByteArray): String = enc.encodeToString(secret)

        /** Accepts the bare code or the whole shared message ("Add me on Moshpoint: <code>"). */
        fun secretFromCode(code: String): ByteArray? {
            val token = code.trim().split(Regex("\\s+")).lastOrNull() ?: return null
            return runCatching { dec.decode(token) }.getOrNull()?.takeIf { it.size >= 16 }
        }
    }
}
