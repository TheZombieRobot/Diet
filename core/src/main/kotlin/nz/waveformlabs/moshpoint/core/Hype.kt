package nz.waveformlabs.moshpoint.core

import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit

/*
 * Discover and hype (docs/DISCOVER_APP.md): the rules a planned crew's hype group has to apply
 * the same way on every phone, where tests can fail a build. The countdown, the ticket ticks
 * ("Got my ticket ✓"), the one nudge for the crew's maker, and what counts as a ticket link.
 * The messages themselves are GigGroup.Ticket and the crew's signed GigGroup.ticketLink.
 */

/** What counts as a crew's ticket link: a plain https page, short enough for an invite. */
object TicketLink {
    /** Longer links are refused: every invite carries the link, and the crew QR has to stay scannable. */
    const val MAX_CHARS = 300

    /**
     * Query parameters that carry a key or a token. A listing service can hand back a ticket
     * link with its caller's key in it (Bandsintown's carry `app_id`), and the link travels with
     * every invite, so these are dropped before it goes anywhere.
     */
    private val KEY_PARAMS = setOf(
        "apikey", "api_key", "appid", "app_id", "app_secret", "key", "client_id", "client_secret",
        "access_token", "token", "secret", "password", "sig", "signature",
    )

    /**
     * [url] made safe to carry, or null if it isn't a ticket link: https only (no `http:`,
     * `javascript:`, `intent:` or file links), a real host name, no user name or password in it,
     * no spaces or control characters, at most [MAX_CHARS], with key-like query parameters removed.
     */
    fun clean(url: String): String? {
        val t = url.trim()
        if (t.isEmpty() || t.length > MAX_CHARS || t.any { it.isWhitespace() || it.isISOControl() }) return null
        val uri = runCatching { java.net.URI(t) }.getOrNull() ?: return null
        if (!"https".equals(uri.scheme, ignoreCase = true) || uri.rawUserInfo != null) return null
        val host = uri.host ?: return null
        if (!host.contains('.') || host.startsWith('.') || host.endsWith('.')) return null
        val base = t.substring(0, t.indexOfFirst { it == '?' || it == '#' }.let { if (it < 0) t.length else it })
        val query = uri.rawQuery?.split('&')?.filter { p ->
            p.isNotEmpty() && java.net.URLDecoder.decode(p.substringBefore('='), "UTF-8").lowercase() !in KEY_PARAMS
        }.orEmpty()
        return base + (if (query.isEmpty()) "" else "?" + query.joinToString("&")) + (uri.rawFragment?.let { "#$it" } ?: "")
    }
}

/** Ticket ticks: the newest from each crew mate wins, so unticking is just a newer message. */
object TicketRule {
    /** A tick stamped further ahead of this phone's clock than this is refused (it would win "newest" for good). */
    const val FUTURE_SLACK_SEC = PinRule.FUTURE_SLACK_SEC

    /** Should a tick stamped [incomingSec] replace the newest one seen from that mate, [currentSec] (0 = none)? */
    fun accepts(incomingSec: Long, currentSec: Long, nowSec: Long): Boolean = PinRule.accepts(incomingSec, currentSec, nowSec)

    /** The time to stamp on our next tick or untick: now, but always after our last one (so it wins on every phone). */
    fun stamp(nowSec: Long, lastOwnSec: Long): Long = PinRule.stamp(nowSec, lastOwnSec)

    /**
     * Should we post our own tick again now? The relay keeps a crew's chat mailbox for a few
     * days and phones read today's and yesterday's, so our latest tick goes again once each
     * (UTC) day while the gig is still to come. A mate whose phone was off for a week still sees
     * it the first time they open the app. [lastPostedSec] 0 = never posted.
     */
    fun repostDue(lastPostedSec: Long, nowSec: Long, startsAtSec: Long): Boolean =
        startsAtSec > nowSec && Math.floorDiv(lastPostedSec, 86_400L) < Math.floorDiv(nowSec, 86_400L)
}

/**
 * Who in a crew has a ticket: the newest tick per mate, by their signing tag. Plain data, so
 * the app can keep one per crew and save it.
 */
class TicketBook {
    /** Mate's tag → (has a ticket, when they said so). */
    private val ticks = HashMap<Long, Pair<Boolean, Long>>()

    /** Take [t] if it's the newest from its sender; true if what we show changed or got newer. */
    fun offer(t: GigGroup.Ticket, nowSec: Long): Boolean {
        if (t.sender == 0L) return false
        val cur = ticks[t.sender]
        if (!TicketRule.accepts(t.timeSec, cur?.second ?: 0L, nowSec)) return false
        ticks[t.sender] = t.has to t.timeSec
        return true
    }

    fun has(tag: Long): Boolean = ticks[tag]?.first == true

    /** When [tag]'s newest tick or untick was stamped, 0 if never. */
    fun timeOf(tag: Long): Long = ticks[tag]?.second ?: 0L

    /** Everyone in the book (tag → has a ticket). */
    fun all(): Map<Long, Boolean> = ticks.mapValues { it.value.first }

    /** Mates who left or were removed take their ticks with them. */
    fun keepOnly(tags: Set<Long>) {
        ticks.keys.retainAll(tags)
    }

    /** `tag:has:time` lines, for saving. */
    fun save(): String = ticks.entries.joinToString("\n") { (tag, v) -> "$tag:${if (v.first) 1 else 0}:${v.second}" }

    companion object {
        /** A book saved with [save]; bad lines are skipped, and a time far in the future is cut back. */
        fun load(text: String?, nowSec: Long): TicketBook {
            val b = TicketBook()
            text?.lineSequence()?.forEach { line ->
                val parts = line.split(':')
                if (parts.size != 3) return@forEach
                val tag = parts[0].toLongOrNull() ?: return@forEach
                val time = parts[2].toLongOrNull() ?: return@forEach
                if (tag == 0L) return@forEach
                b.ticks[tag] = (parts[1] == "1") to PinRule.capped(time, nowSec)
            }
            return b
        }
    }
}

/**
 * The one nudge: when everyone in a planned crew has a ticket, its maker hears about it once
 * ("Everyone's got a ticket"). Once, even if someone unticks and ticks again.
 */
object TicketNudge {
    /**
     * Is it time? [isMaker]: this phone made the crew. [crew]: everyone in it, us included (by
     * tag). It needs at least two people: a crew of one has nobody to hear about.
     */
    fun due(isMaker: Boolean, alreadyNudged: Boolean, crew: Set<Long>, book: TicketBook): Boolean =
        isMaker && !alreadyNudged && crew.size >= 2 && crew.all { book.has(it) }
}

/** "in 117 days": the hype group's headline. */
object Countdown {
    /**
     * Whole days from today to the gig's day, both by this phone's calendar ([zone]): 0 on the
     * day itself, 1 the day before. Never below 0. Calendar days, not 24-hour blocks, so a gig at
     * 8 pm tomorrow is "tomorrow" at 11 pm tonight too.
     */
    fun daysUntil(startsAtSec: Long, nowMs: Long, zone: ZoneId): Int {
        val today = Instant.ofEpochMilli(nowMs).atZone(zone).toLocalDate()
        val day = Instant.ofEpochSecond(startsAtSec).atZone(zone).toLocalDate()
        return ChronoUnit.DAYS.between(today, day).coerceAtLeast(0L).coerceAtMost(9_999L).toInt()
    }
}
