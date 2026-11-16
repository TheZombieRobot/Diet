package nz.waveformlabs.moshpoint.server

import kotlin.math.ln
import kotlin.math.log10
import kotlin.math.roundToLong

/**
 * "Biggest first": one score from 0 to 1 per show, from signals the sources give everywhere in
 * the world (docs/DISCOVER_SERVER.md, "Popularity"):
 *
 * | Signal | Weight | Scale |
 * |---|---|---|
 * | Followers (Bandsintown trackers) | 40% | log: 1 k = 0.43, 100 k = 0.71, 1 M = 0.86, 10 M or more = 1 |
 * | Venue size or kind | 30% | stadium 1, festival 0.9, park or showground 0.85, arena 0.8, theatre 0.5, unknown 0.35, club 0.2; a known capacity overrides the name |
 * | Tour dates (the act's upcoming shows) | 15% | log: 1 = 0.15, 10 = 0.52, 30 = 0.74, 100 or more = 1 |
 * | The source's own order | 15% | its first result 1, falling to 0 at its 1,000th |
 *
 * A signal a show doesn't have (an act Bandsintown doesn't know, a show only Bandsintown lists)
 * is left out and the others share its weight, so a missing signal neither helps nor hurts.
 */
object Popularity {
    const val FOLLOWERS = 0.40
    const val VENUE = 0.30
    const val TOUR = 0.15
    const val ORDER = 0.15

    fun followers(n: Int): Double? = if (n < 0) null else (log10(1.0 + n) / 7.0).coerceIn(0.0, 1.0)

    fun venue(kind: VenueKind, capacity: Int): Double = when {
        kind == VenueKind.FESTIVAL -> kind.size // a festival site's capacity is rarely given right
        capacity >= 40_000 -> 1.0
        capacity >= 15_000 -> 0.85
        capacity >= 5_000 -> 0.65
        capacity >= 2_000 -> 0.5
        capacity >= 800 -> 0.35
        capacity > 0 -> 0.2
        else -> kind.size
    }

    fun tourDates(n: Int): Double? = if (n <= 0) null else (ln(1.0 + n) / ln(101.0)).coerceIn(0.0, 1.0)

    fun order(relevance: Double): Double? = if (relevance < 0) null else relevance.coerceAtMost(1.0)

    /** The source's order as 0..1: its first result 1, its [outOf]th 0. */
    fun rank(index: Int, outOf: Int = 1_000): Double = (1.0 - index.toDouble() / outOf).coerceIn(0.0, 1.0)

    fun score(s: Show): Double {
        var sum = VENUE * venue(s.kind, s.capacity)
        var weight = VENUE
        followers(s.followers)?.let { sum += FOLLOWERS * it; weight += FOLLOWERS }
        tourDates(s.tourDates)?.let { sum += TOUR * it; weight += TOUR }
        order(s.relevance)?.let { sum += ORDER * it; weight += ORDER }
        return (sum / weight * 1000).roundToLong() / 1000.0
    }
}
