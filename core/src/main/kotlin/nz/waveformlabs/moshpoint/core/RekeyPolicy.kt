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
 * Crews made since crews had owners ([GigGroup.owned]) add one more rule, which settles who
 * removes whom:
 *  6. Only the owner moves the crew, and the new key must be bound to an owner too (the same
 *     one, or, when the owner leaves, a member they hand the crew to). The owner can't remove
 *     themselves except by handing over. A removed member can't send one at all: they aren't
 *     the owner, and they can't make a key bound to the owner (it's a hash of the owner's key).
 *     Older forms of notice (kinds 3 and 4) carry no owner, so an owned crew ignores them.
 *
 * In a crew with no owner (made before owners), "A removed B" and "B removed A" look the same:
 * the first to reach the relay wins and the crew converges on it.
 *
 * Known limit: an invite with the owner fields cut out reads as a crew with no owner. Only a
 * crew member hand-editing an invite can do that, and it affects only the people they invite
 * with it (they'd follow anyone's rekey). A changed owner can't get through: it fails the key.
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
        /** Third form only (owned crews): who owns the crew under [newKey], and the salt that binds them to it. */
        val ownerPub: ByteArray? = null,
        val salt: ByteArray? = null,
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

    /** Third form (direct kind 5, owned crews): `newKey:32, salt:32, ownerPub:33, count:1, removedPub:33 x count, name`. */
    fun parse3(fromPub: ByteArray, payload: ByteArray): Notice? {
        val head = 32 + 32 + CrewKeys.PUB_BYTES + 1
        if (payload.size < head) return null
        val n = payload[head - 1].toInt() and 0xFF
        val at = head + n * CrewKeys.PUB_BYTES
        if (n > MAX_REMOVED || payload.size < at) return null
        val pubs = List(n) { payload.copyOfRange(head + it * CrewKeys.PUB_BYTES, head + (it + 1) * CrewKeys.PUB_BYTES) }
        return Notice(
            CrewKeys.tagOf(fromPub), payload.copyOfRange(0, 32), pubs,
            String(payload, at, payload.size - at, Charsets.UTF_8).ifBlank { null },
            salt = payload.copyOfRange(32, 64), ownerPub = payload.copyOfRange(64, 64 + CrewKeys.PUB_BYTES),
        )
    }

    fun payload3(newKey: ByteArray, salt: ByteArray, ownerPub: ByteArray, removedPubs: List<ByteArray>, removedName: String?): ByteArray {
        require(newKey.size == 32 && salt.size == 32 && ownerPub.size == CrewKeys.PUB_BYTES)
        require(removedPubs.size <= MAX_REMOVED && removedPubs.all { it.size == CrewKeys.PUB_BYTES })
        return newKey + salt + ownerPub + byteArrayOf(removedPubs.size.toByte()) + removedPubs.fold(ByteArray(0)) { a, b -> a + b } +
            (removedName ?: "").take(40).toByteArray(Charsets.UTF_8)
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
     * our own; [owner] is the crew's owner (null for a crew with no owner). Null = none of
     * them is acceptable.
     */
    fun choose(notices: List<Notice>, members: Set<Long>, me: Long, currentKey: ByteArray, owner: ByteArray? = null): Notice? {
        for (n in notices) {
            if (n.superseded) continue
            if (n.newKey.size != 32 || n.newKey.contentEquals(currentKey)) continue
            if (n.fromTag == me || n.fromTag !in members) continue
            // A notice sent to us can't also remove us.
            if (me in n.removedTags) continue
            if (owner != null) {
                if (ownedMove(n, owner, members, me)) return n
                continue
            }
            // Nobody removes themselves.
            if (n.fromTag in n.removedTags) continue
            return n
        }
        return null
    }

    /** Rule 6: is [n] a move of an owned crew that its owner ([owner]) is allowed to make? */
    private fun ownedMove(n: Notice, owner: ByteArray, members: Set<Long>, me: Long): Boolean {
        val ownerTag = CrewKeys.tagOf(owner)
        if (n.fromTag != ownerTag) return false
        val nextOwner = n.ownerPub ?: return false
        val salt = n.salt ?: return false
        if (nextOwner.size != CrewKeys.PUB_BYTES || salt.size != 32) return false
        // The new key must be bound to an owner, so nobody else can move it later either.
        if (!GigGroup.ownedKey(nextOwner, salt).contentEquals(n.newKey)) return false
        val nextTag = CrewKeys.tagOf(nextOwner)
        val handover = nextTag != ownerTag
        if (handover) {
            // Only to someone already in the crew, and not to someone being removed.
            if (nextTag !in members && nextTag != me) return false
            if (nextTag in n.removedTags) return false
        } else if (ownerTag in n.removedTags) {
            // The owner only leaves their own crew by handing it over.
            return false
        }
        return true
    }

    /** Who old-key messages are still read from after following [followed]: the members known then, minus the removed. */
    fun allowlist(members: Set<Long>, followed: Notice): Set<Long> = members - followed.removedTags

    /** Invisible: older builds show the removed person's name with nothing after it. */
    const val TWIN_MARK = "⁣"
    const val MAX_REMOVED = 8
    /** How long old-key messages are still read (from the allowlist only) after a rekey. */
    const val GRACE_MS = 24 * 3600_000L
}
