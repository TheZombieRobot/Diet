package nz.waveformlabs.moshpoint.discover

import android.content.Context
import androidx.compose.runtime.mutableStateMapOf
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.chat.CrewChat
import nz.waveformlabs.moshpoint.chat.OfflineMessages
import nz.waveformlabs.moshpoint.core.CrewKeys
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.TicketBook
import nz.waveformlabs.moshpoint.core.TicketNudge
import nz.waveformlabs.moshpoint.core.TicketRule
import nz.waveformlabs.moshpoint.crew.CrewNotifications
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.profile.Identity

/**
 * "Got my ticket" in a planned crew's hype group (docs/DISCOVER_APP.md): who in each crew has a
 * ticket, our own tick, and the one nudge for the crew's maker when everyone has one.
 *
 * The rules are core's ([TicketBook], [TicketRule], [TicketNudge]); the message is
 * [GigGroup.Ticket], carried by the courier like chat ([OfflineMessages]). Runs on the main
 * thread, like the courier and the chat.
 */
object HypeTickets {
    /** Crew id → (mate's signing tag → has a ticket). Compose state: the hype group redraws as ticks arrive. */
    val ticks = mutableStateMapOf<String, Map<Long, Boolean>>()
    private val books = HashMap<String, TicketBook>()

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("hype", Context.MODE_PRIVATE)
    private fun nowSec() = System.currentTimeMillis() / 1000

    private fun book(c: Context, id: String): TicketBook = books.getOrPut(id) {
        TicketBook.load(prefs(c).getString("book_$id", null), nowSec()).also { ticks[id] = it.all() }
    }

    /** Who in crew [g] has a ticket, by signing tag. Reads Compose state. */
    fun of(c: Context, g: GigGroup): Map<Long, Boolean> {
        val id = GigArchive.idFor(g)
        book(c, id)
        return ticks[id].orEmpty()
    }

    /** Have we ticked "I've got my ticket" in crew [g]? */
    fun mine(c: Context, g: GigGroup): Boolean = of(c, g)[Identity.tag(c, g)] == true

    /** Our toggle: tick or untick, signed and handed to the courier. */
    fun set(c: Context, g: GigGroup, has: Boolean) {
        val app = c.applicationContext
        val me = Identity.tag(app, g)
        post(app, g, GigGroup.Ticket(TicketRule.stamp(nowSec(), book(app, GigArchive.idFor(g)).timeOf(me)), has))
    }

    private fun post(c: Context, g: GigGroup, t: GigGroup.Ticket) {
        val id = GigArchive.idFor(g)
        val signer = Identity.signer(c, g)
        val sent = OfflineMessages.post(c, g, g.sealTicket(t, signer)) != null
        // Shown at once either way; if it couldn't be queued, the next chat fetch tries again.
        prefs(c).edit().putBoolean("set_$id", true).putLong("posted_$id", if (sent) nowSec() else 0L).apply()
        took(c, g, GigGroup.Ticket(t.timeSec, t.has, signer.tag))
    }

    /** A crew mate's tick (or untick) arrived, by the relay or by Bluetooth. */
    fun arrived(c: Context, g: GigGroup, t: GigGroup.Ticket) = took(c.applicationContext, g, t)

    private fun took(c: Context, g: GigGroup, t: GigGroup.Ticket) {
        val id = GigArchive.idFor(g)
        val b = book(c, id)
        if (!b.offer(t, nowSec())) return
        prefs(c).edit().putString("book_$id", b.save()).apply()
        ticks[id] = b.all()
        checkNudge(c, g, b)
    }

    /**
     * With each chat fetch: our latest tick goes again once a day until the gig, so mates whose
     * phones were off when we ticked still see it (the relay keeps a chat mailbox 72 hours).
     */
    fun repost(c: Context, crews: List<GigGroup>) {
        val app = c.applicationContext
        val now = nowSec()
        crews.forEach { g ->
            val id = GigArchive.idFor(g)
            val p = prefs(app)
            if (!p.getBoolean("set_$id", false) || !TicketRule.repostDue(p.getLong("posted_$id", 0L), now, g.startsAtSec)) return@forEach
            val b = book(app, id)
            val me = Identity.tag(app, g)
            post(app, g, GigGroup.Ticket(TicketRule.stamp(now, b.timeOf(me)), b.has(me)))
        }
    }

    /**
     * Everyone in crew [g] we know of, us included, by signing tag: whoever has said hello in its
     * chat (every member does, see CrewChat.announceJoin) and, for the main crew, its mates.
     */
    private fun everyone(c: Context, g: GigGroup): Set<Long> {
        val tags = CrewChat.knownKeys(c, g).map { CrewKeys.tagOf(it) }.toMutableSet()
        tags += Identity.tag(c, g)
        if (GroupSync.group.value?.key?.contentEquals(g.key) == true) {
            FriendsRepository.friends.filter { it.gigGroupOnly }.forEach { f -> GroupSync.pubOf(f.secret)?.let { tags += CrewKeys.tagOf(it) } }
        }
        return tags
    }

    /** The crew's maker hears it once when everyone has a ticket (owner's answer 4). */
    private fun checkNudge(c: Context, g: GigGroup, b: TicketBook) {
        val id = GigArchive.idFor(g)
        val p = prefs(c)
        val isMaker = g.ownerTag != null && g.ownerTag == Identity.tag(c, g)
        if (!TicketNudge.due(isMaker, p.getBoolean("nudged_$id", false), everyone(c, g), b)) return
        p.edit().putBoolean("nudged_$id", true).apply()
        runCatching {
            CrewNotifications.post(c, title = Txt.s(R.string.hype_nudge_title), text = Txt.s(R.string.hype_nudge_text, g.name), openMap = false)
        }
    }

    /** The crew moved to a new key: its ticks, our tick and the nudge move with it, and ours goes again under the new key. */
    fun migrate(c: Context, old: GigGroup, fresh: GigGroup) {
        val from = GigArchive.idFor(old)
        val to = GigArchive.idFor(fresh)
        if (from == to) return
        val p = prefs(c)
        p.edit()
            .putString("book_$to", p.getString("book_$from", null))
            .putBoolean("set_$to", p.getBoolean("set_$from", false))
            .putLong("posted_$to", 0L)
            .putBoolean("nudged_$to", p.getBoolean("nudged_$from", false))
            .remove("book_$from").remove("set_$from").remove("posted_$from").remove("nudged_$from")
            .apply()
        books.remove(from)
        books.remove(to)
        ticks.remove(from)
        book(c, to)
    }

    /** The crew ended or was left: its ticks go with it. */
    fun forget(c: Context, g: GigGroup) {
        val id = GigArchive.idFor(g)
        prefs(c).edit().remove("book_$id").remove("set_$id").remove("posted_$id").remove("nudged_$id").apply()
        books.remove(id)
        ticks.remove(id)
    }
}
