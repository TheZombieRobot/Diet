package nz.waveformlabs.moshpoint.core

/*
 * Block, community rules and report (docs/REPORT_BLOCK.md): Google Play's User Generated Content
 * policy. The rules every phone must apply the same way live here, where tests can fail a build;
 * the app only stores them and draws them.
 */

/**
 * Someone blocked on this phone.
 *
 * [tag] is the tag of their crew signing key ([CrewKeys.tagOf]): the stable key that signs
 * everything they write in that crew (chat, private messages), kept across a rekey. [pub] is the
 * key itself as hex when we know it ("" if not). A person has a different key in every crew (by
 * design: nobody can be followed from one gig to the next), so a block is for the crew it was
 * made in. [crew] is that crew's id (the app's GigArchive id; it moves with a rekey, see
 * [BlockList.migrate]); [name] is the name they were shown under there, which is all a photo or
 * clip carries (moments aren't signed). [tag] 0 = only a name is known.
 */
data class Blocked(
    val tag: Long,
    val pub: String,
    val name: String,
    val crew: String,
    val crewName: String,
    val atSec: Long,
) {
    /** Unblock and the Settings list refer to an entry by this. */
    val id: String get() = if (tag != 0L) "%016x".format(tag) else "$crew/${BlockList.sameName(name)}"
}

/**
 * The people blocked on this phone. Immutable: [with] and [without] return a new list.
 *
 * Blocking hides what they write on this phone (crew chat, photos and clips, private messages)
 * and drops their private messages on arrival. It changes nothing for anyone else and nothing
 * is sent: they aren't told, and they stay in the crew (only the crew's owner can remove them).
 */
class BlockList private constructor(val entries: List<Blocked>) {

    val isEmpty: Boolean get() = entries.isEmpty()

    /** Blocked by their signing key's [tag] (0 never is: unsigned content has no key). */
    fun blocksTag(tag: Long): Boolean = tag != 0L && entries.any { it.tag == tag }

    /** Blocked by their signing key ([pub], 33 bytes compressed). */
    fun blocksKey(pub: ByteArray?): Boolean = pub != null && blocksTag(CrewKeys.tagOf(pub))

    /**
     * Is a crew chat line hidden? Lines are signed, so it's by key ([sender]'s tag). Everything
     * from a blocked person is hidden except **Need help**: blocking is for what people write,
     * never for a safety alert. Our own lines never are.
     */
    fun hidesLine(sender: Long, kind: Int, mine: Boolean): Boolean =
        !mine && kind != GigGroup.Ping.NEED_HELP && blocksTag(sender)

    /**
     * Is a photo or clip hidden? A moment carries only its sender's name (moments aren't signed),
     * so it's by name, and only in the crew the block was made in: another crew's "Jo" is
     * someone else. Our own never are.
     */
    fun hidesMoment(crew: String, from: String, mine: Boolean): Boolean {
        if (mine) return false
        val n = sameName(from)
        if (n.isEmpty()) return false
        return entries.any { it.crew == crew && sameName(it.name) == n }
    }

    /** Is the person with this key in this crew blocked, by key or (no key known) by name? */
    fun blocksPerson(tag: Long, crew: String, name: String): Boolean =
        blocksTag(tag) || (tag == 0L && hidesMoment(crew, name, mine = false))

    /** Blocks [b]: replaces an earlier entry for the same person. */
    fun with(b: Blocked): BlockList {
        val clean = b.copy(name = b.name.trim().take(MAX_NAME), crewName = b.crewName.trim().take(MAX_NAME))
        val rest = entries.filterNot { it.id == clean.id }
        return BlockList((rest + clean).takeLast(MAX_ENTRIES))
    }

    /** Unblocks the entry with this [id] ([Blocked.id]). */
    fun without(id: String): BlockList = BlockList(entries.filterNot { it.id == id })

    /** The crew moved to a new key ([CrewRekey]): its blocks go with it (names match by crew). */
    fun migrate(oldCrew: String, newCrew: String): BlockList =
        if (entries.none { it.crew == oldCrew }) this
        else BlockList(entries.map { if (it.crew == oldCrew) it.copy(crew = newCrew) else it })

    /** Newest first, for Settings → Blocked people. */
    fun newestFirst(): List<Blocked> = entries.sortedByDescending { it.atSec }

    /** One line per person, tab-separated (names can't hold a tab or a line break here). */
    fun encode(): String = entries.joinToString("\n") { e ->
        listOf("%016x".format(e.tag), e.pub.ifEmpty { "-" }, e.crew, e.atSec.toString(), flat(e.name), flat(e.crewName)).joinToString("\t")
    }

    override fun equals(other: Any?): Boolean = other is BlockList && other.entries == entries
    override fun hashCode(): Int = entries.hashCode()

    companion object {
        /** Plenty for one phone; the oldest go first past it. */
        const val MAX_ENTRIES = 500
        const val MAX_NAME = 40

        val EMPTY = BlockList(emptyList())

        /** Reads [encode]'s text; a damaged line is skipped, never the whole list. */
        fun parse(text: String): BlockList = BlockList(
            text.lineSequence().mapNotNull { line ->
                val f = line.split('\t')
                if (f.size < 6) return@mapNotNull null
                val tag = f[0].toULongOrNull(16)?.toLong() ?: return@mapNotNull null
                val at = f[3].toLongOrNull() ?: return@mapNotNull null
                if (f[2].isBlank() || (tag == 0L && f[4].isBlank())) return@mapNotNull null
                Blocked(tag, if (f[1] == "-") "" else f[1], f[4], f[2], f[5], at)
            }.toList(),
        )

        /** Names compare like this: trimmed, any run of spaces as one, case ignored. */
        fun sameName(s: String): String = s.trim().replace(Regex("\\s+"), " ").lowercase(java.util.Locale.ROOT)

        private fun flat(s: String) = s.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ')

        /** The key as hex, as [Blocked.pub] keeps it. */
        fun hex(pub: ByteArray): String = pub.joinToString("") { "%02x".format(it) }
    }
}
