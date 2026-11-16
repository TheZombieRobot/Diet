package nz.waveformlabs.moshpoint.moderation

import android.content.Context
import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.chat.CrewChat
import nz.waveformlabs.moshpoint.core.BlockList
import nz.waveformlabs.moshpoint.core.Blocked
import nz.waveformlabs.moshpoint.core.CrewKeys
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.moments.Moments

/**
 * The people blocked on this phone (docs/REPORT_BLOCK.md). The rules are core [BlockList]; this
 * keeps it in the app's preferences and as Compose state, so every screen that shows what people
 * write redraws when someone is blocked or unblocked.
 *
 * Blocking hides a person's crew chat, photos, clips and private messages on this phone, and
 * their new private messages are dropped on arrival ([nz.waveformlabs.moshpoint.privatemsg.PrivateMessages]).
 * Nothing is sent and nothing changes for anyone else: they stay in the crew.
 */
object Blocks {
    /** Read while drawing: the screens filter with it. */
    val list = mutableStateOf(BlockList.EMPTY)

    @Volatile private var loaded = false

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("moderation", Context.MODE_PRIVATE)

    /** At app start (MoshpointApp), before anything is shown or arrives. */
    fun init(c: Context) {
        if (loaded) return
        list.value = BlockList.parse(prefs(c).getString("blocked", "").orEmpty())
        loaded = true
    }

    /** The list now, loading it first if a background start got here before the app did. */
    fun now(c: Context): BlockList {
        if (!loaded) init(c)
        return list.value
    }

    private fun save(c: Context, l: BlockList) {
        list.value = l
        prefs(c).edit().putString("blocked", l.encode()).apply()
    }

    fun block(c: Context, who: Person) {
        save(c, now(c).with(Blocked(who.tag, who.pub?.let { BlockList.hex(it) }.orEmpty(), who.name, who.crewId, who.crewName, System.currentTimeMillis() / 1000)))
        // Anything of theirs already on screen or in the shade goes.
        nz.waveformlabs.moshpoint.privatemsg.PrivateMessages.blockedChanged(c, who.crewId, who.tag)
    }

    fun unblock(c: Context, id: String) {
        val l = now(c)
        val e = l.entries.firstOrNull { it.id == id } ?: return
        save(c, l.without(id))
        nz.waveformlabs.moshpoint.privatemsg.PrivateMessages.blockedChanged(c, e.crew, e.tag)
    }

    /** Unblocks whoever's entry covers [who] (by key, or by name when no key is known). */
    fun unblockPerson(c: Context, who: Person) {
        now(c).entries.firstOrNull { e ->
            if (who.tag != 0L) e.tag == who.tag
            else e.crew == who.crewId && BlockList.sameName(e.name) == BlockList.sameName(who.name)
        }?.let { unblock(c, it.id) }
    }

    /** The crew moved to a new key (CrewRekey): its blocks follow, as its chat does. */
    fun migrate(c: Context, old: GigGroup, fresh: GigGroup) {
        val l = now(c)
        val moved = l.migrate(GigArchive.idFor(old), GigArchive.idFor(fresh))
        if (moved !== l) save(c, moved)
    }

    /** Chat lines to show (read while drawing). The same list when nobody is blocked. */
    fun visibleLines(lines: List<CrewChat.Line>): List<CrewChat.Line> {
        val l = list.value
        if (l.isEmpty) return lines
        return lines.filterNot { l.hidesLine(it.sender, it.kind, it.mine) }
    }

    /** Is this crew chat line hidden? (Not read while drawing: no redraw is asked for.) */
    fun hidesLine(c: Context, line: CrewChat.Line): Boolean = now(c).hidesLine(line.sender, line.kind, line.mine)

    /** Tonight's photos and clips to show (read while drawing). The same list when nobody is blocked. */
    fun visibleMoments(items: List<Moments.Item>): List<Moments.Item> {
        val l = list.value
        if (l.isEmpty) return items
        val crew = GroupSync.group.value?.let(GigArchive::idFor) ?: return items
        return items.filterNot { l.hidesMoment(crew, it.from, it.mine) }
    }

    /** A past gig's photos and clips ([gigId]: its archive id, the crew's id). */
    fun visibleMoments(items: List<Moments.Item>, gigId: String): List<Moments.Item> {
        val l = list.value
        if (l.isEmpty) return items
        return items.filterNot { l.hidesMoment(gigId, it.from, it.mine) }
    }
}

/**
 * Someone whose content can be blocked or reported: their signing key's [tag] and [pub] in the
 * crew [crewId] (0 / null when only a name is known: a photo whose sender we can't match), and
 * the name they're shown under there.
 */
class Person(
    val name: String,
    val tag: Long,
    val pub: ByteArray?,
    val crewId: String,
    val crewName: String,
) {
    companion object {
        /** A crew mate from the home screen or the finder (their key comes with their intro). */
        fun ofFriend(f: Friend): Person? {
            val g = GroupSync.group.value ?: return null
            val pub = GroupSync.pubOf(f.secret)
            return Person(f.name, pub?.let(CrewKeys::tagOf) ?: 0L, pub, GigArchive.idFor(g), g.name)
        }

        /** Whoever wrote a crew chat line in crew [g]. */
        fun ofLine(c: Context, g: GigGroup, line: CrewChat.Line): Person? {
            if (line.mine || line.sender == 0L || line.kind == CrewChat.NOTE) return null
            val pub = CrewChat.knownKeys(c, g).firstOrNull { CrewKeys.tagOf(it) == line.sender }
            return Person(line.from, line.sender, pub, GigArchive.idFor(g), g.name)
        }

        /**
         * Whoever shared a photo or clip in tonight's crew. A moment carries only a name, so the
         * key is the crew mate's of that name, if exactly one has it.
         */
        fun ofMoment(c: Context, m: Moments.Item): Person? {
            if (m.mine) return null
            val g = GroupSync.group.value ?: return null
            val same = FriendsRepository.friends.filter { it.name.trim().equals(m.from.trim(), ignoreCase = true) }
            val pub = same.singleOrNull()?.let { GroupSync.pubOf(it.secret) }
            return Person(m.from, pub?.let(CrewKeys::tagOf) ?: 0L, pub, GigArchive.idFor(g), g.name)
        }
    }
}
