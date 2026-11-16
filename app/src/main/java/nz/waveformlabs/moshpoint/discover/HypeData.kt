package nz.waveformlabs.moshpoint.discover

import android.content.Context
import android.content.Intent
import android.net.Uri
import java.text.DateFormat
import java.util.Date
import java.util.Locale
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.chat.CrewChat
import nz.waveformlabs.moshpoint.core.Countdown
import nz.waveformlabs.moshpoint.core.CrewKeys
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.TicketLink
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.ui.home.HypeView

/** Builds the hype group's view of the main crew (docs/DISCOVER_APP.md) and opens its ticket link. */
object HypeData {
    /** "Sat 13 Mar · 7:30 pm" in the phone's own format. */
    fun whenText(startsAtSec: Long): String {
        val d = Date(startsAtSec * 1000)
        val day = java.text.SimpleDateFormat(android.text.format.DateFormat.getBestDateTimePattern(Locale.getDefault(), "EEEdMMM"), Locale.getDefault()).format(d)
        return "$day · " + DateFormat.getTimeInstance(DateFormat.SHORT, Locale.getDefault()).format(d)
    }

    /** The hype group for the main crew [g] at [nowMs]. Reads Compose state (ticks, chat lines). */
    fun view(c: Context, g: GigGroup, nowMs: Long): HypeView {
        val ticks = HypeTickets.of(c, g)
        val byFriend = FriendsRepository.friends.mapNotNull { f ->
            GroupSync.pubOf(f.secret)?.let { pub -> f.id to (ticks[CrewKeys.tagOf(pub)] == true) }
        }.toMap()
        // The newest chat line, when the chat on record is this crew's (it is, unless another crew's chat is open).
        val line = if (CrewChat.viewing.value?.key?.contentEquals(g.key) == true) CrewChat.lines.lastOrNull { it.kind == GigGroup.Ping.CHAT } else null
        val from = line?.let { if (it.mine) Txt.s(R.string.crew_you) else CrewChat.displayName(c, g, it.sender, it.from) }
        val face = line?.takeIf { !it.mine }?.let { l ->
            FriendsRepository.friends.firstOrNull { f -> GroupSync.pubOf(f.secret)?.let { CrewKeys.tagOf(it) } == l.sender && l.sender != 0L }
                ?: FriendsRepository.friends.firstOrNull { it.name == l.from }
        }
        return HypeView(
            days = Countdown.daysUntil(g.startsAtSec, nowMs, java.time.ZoneId.systemDefault()),
            name = g.name,
            venue = g.venue,
            whenText = whenText(g.startsAtSec),
            ticketLink = g.ticketLink,
            ticks = byFriend,
            mine = ticks[nz.waveformlabs.moshpoint.profile.Identity.tag(c, g)] == true,
            chatFrom = from,
            chatText = line?.text?.replace('\n', ' '),
            chatFace = face,
        )
    }

    /** Get tickets: the crew's link in the browser. Checked again first: only a plain https link opens. */
    fun openTickets(c: Context, url: String) {
        val safe = TicketLink.clean(url) ?: return
        runCatching {
            c.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(safe)).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
