package nz.waveformlabs.moshpoint.core

/**
 * Who may move a crew to a new key, and which of several attempts a phone follows.
 *
 * A crew is its key. "Remove Jo" makes a new key and sends it privately to everyone else.
 * Before this, a phone followed whichever rekey it happened to read first, from any key it
 * had ever seen in the crew, and the notice named the removed person only by display name.
 * So a removed member, who still holds the old key and is still "known", could send their
 * own rekey and take the rest of the crew with them.
 *
 * The rules (the app's CrewRekey applies them):
 *  1. Only from the relay. A rekey is never accepted over Bluetooth: next to an offline
 *     phone, the removed member would always get there first.
 *  2. In the order they reached the relay, oldest first. Nobody can backdate that.
 *  3. Only from a key this phone already knew in the crew before any of these rekeys.
 *  4. The notice says whose keys were removed, and those keys are dropped everywhere.
 *  5. For a day after, old-key messages are still read from the relay, but only from the
 *     members known at the time of the rekey minus the removed: a list of who's allowed,
 *     never a list of who isn't (the removed member can make new keys at will).
 *
 * What this doesn't settle: with no crew owner, "A removed B" and "B removed A" look the
 * same. The first to reach the relay wins and the crew converges on it.
 */
object RekeyPolicy {
    /** One rekey addressed to this phone, opened. */
    class Notice(
        /** Signing tag of whoever sent it. */
        val fromTag: Long,
        val newKey: ByteArray,
        /** Public keys removed by it (empty for "reset invite", or for an older build's notice). */
        val removedPubs: List<ByteArray>,
        /** The removed person's display name, for the chat note; null if none. */
        val removedName: String?,
        /** An older-form notice that says a newer-form twin exists: skip it and wait for the twin. */
        val superseded: Boolean = false,
    ) {
        val removedTags: Set<Long> get() = removedPubs.map { CrewKeys.tagOf(it) }.toSet()
    }

    /** Older form (direct kind 3): `newKey:32, name`. Newer builds add [TWIN_MARK] when they also send kind 4. */
    fun parseOld(fromPub: ByteArray, payload: ByteArray): Notice? {
        if (payload.size < 32) return null
        val text = String(payload, 32, payload.size - 32, Charsets.UTF_8)
        return Notice(
            CrewKeys.tagOf(fromPub), payload.copyOfRange(0, 32), emptyList(),
            text.removeSuffix(TWIN_MARK).ifBlank { null }, superseded = text.endsWith(TWIN_MARK),
        )
    }

    /** Newer form (direct kind 4): `newKey:32, count:1, removedPub:33 x count, name`. */
    fun parse(fromPub: ByteArray, payload: ByteArray): Notice? {
        if (payload.size < 33) return null
        val n = payload[32].toInt() and 0xFF
        val at = 33 + n * CrewKeys.PUB_BYTES
        if (n > MAX_REMOVED || payload.size < at) return null
        val pubs = List(n) { payload.copyOfRange(33 + it * CrewKeys.PUB_BYTES, 33 + (it + 1) * CrewKeys.PUB_BYTES) }
        return Notice(CrewKeys.tagOf(fromPub), payload.copyOfRange(0, 32), pubs, String(payload, at, payload.size - at, Charsets.UTF_8).ifBlank { null })
    }

    fun payloadOld(newKey: ByteArray, removedName: String?, twin: Boolean): ByteArray =
        newKey + ((removedName ?: "").take(40) + if (twin) TWIN_MARK else "").toByteArray(Charsets.UTF_8)

    fun payload(newKey: ByteArray, removedPubs: List<ByteArray>, removedName: String?): ByteArray {
        require(newKey.size == 32 && removedPubs.size <= MAX_REMOVED && removedPubs.all { it.size == CrewKeys.PUB_BYTES })
        return newKey + byteArrayOf(removedPubs.size.toByte()) + removedPubs.fold(ByteArray(0)) { a, b -> a + b } +
            (removedName ?: "").take(40).toByteArray(Charsets.UTF_8)
    }

    /**
     * Which rekey to follow. [notices] must be in the order they reached the relay, oldest
     * first. [members] are the signing tags this phone knew in the crew beforehand; [me] is
     * our own. Null = none of them is acceptable.
     */
    fun choose(notices: List<Notice>, members: Set<Long>, me: Long, currentKey: ByteArray): Notice? {
        for (n in notices) {
            if (n.superseded) continue
            if (n.newKey.size != 32 || n.newKey.contentEquals(currentKey)) continue
            if (n.fromTag == me || n.fromTag !in members) continue
            // A notice sent to us can't also remove us, and nobody removes themselves.
            if (me in n.removedTags || n.fromTag in n.removedTags) continue
            return n
        }
        return null
    }

    /** Who old-key messages are still read from after following [followed]: the members known then, minus the removed. */
    fun allowlist(members: Set<Long>, followed: Notice): Set<Long> = members - followed.removedTags

    /** Invisible: older builds show the removed person's name with nothing after it. */
    const val TWIN_MARK = "⁣"
    const val MAX_REMOVED = 8
    /** How long old-key messages are still read (from the allowlist only) after a rekey. */
    const val GRACE_MS = 24 * 3600_000L
}
