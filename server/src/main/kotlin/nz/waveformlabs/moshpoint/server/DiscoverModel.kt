package nz.waveformlabs.moshpoint.server

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.text.Normalizer
import java.util.Locale

/*
 * Discover (docs/DISCOVER_SERVER.md): one upcoming show, the text folding used to match and
 * merge names, and the merging of the same show from different sources.
 */

/** What kind of place a show is in, and its share of the venue signal in [Popularity] (0..1). */
enum class VenueKind(val size: Double) {
    STADIUM(1.0), FESTIVAL(0.9), OUTDOOR(0.85), ARENA(0.8), THEATRE(0.5), UNKNOWN(0.35), CLUB(0.2);

    companion object {
        fun parse(s: String?): VenueKind = entries.firstOrNull { it.name.equals(s, ignoreCase = true) } ?: UNKNOWN

        // Checked in this order against the venue name's words: "Park Theatre" is a theatre and
        // "Eden Park" is outdoors; "Arts Centre" is a theatre and "Bell Centre" an arena.
        private val WORDS = listOf(
            CLUB to setOf("bar", "club", "pub", "tavern", "lounge", "cafe", "bistro", "brewery", "brewing", "cellar", "basement", "saloon", "inn", "hotel", "community", "church"),
            THEATRE to setOf("theatre", "theater", "hall", "opera", "auditorium", "playhouse", "academy", "odeon", "teatro", "civic", "arts", "convention", "ballroom", "palladium"),
            STADIUM to setOf("stadium", "stadion", "stadio", "estadio", "stade", "field", "oval"),
            ARENA to setOf("arena", "dome", "amphitheatre", "amphitheater", "coliseum", "colosseum", "forum", "bowl", "garden", "center", "centre"),
            OUTDOOR to setOf("park", "domain", "showgrounds", "showground", "gardens", "racecourse", "raceway", "beach", "grounds", "winery", "vineyard"),
        )
        private val FESTIVAL_WORDS = setOf("festival", "festivals", "fest", "fiesta", "festivalen", "festivali")

        /** This many acts on one bill is a festival, whatever it's called. */
        const val FESTIVAL_ACTS = 5

        /** The kind, from the venue's name (a festival is a festival wherever it is). */
        fun of(venue: String, festival: Boolean = false): VenueKind {
            if (festival) return FESTIVAL
            val words = Fold.text(venue).split(' ').toSet()
            return WORDS.firstOrNull { (_, w) -> words.any { it in w } }?.first ?: UNKNOWN
        }

        /** "Rhythm and Vines Festival", "Splore Fest": a festival by its name. */
        fun festivalName(name: String): Boolean = Fold.text(name).split(' ').any { it in FESTIVAL_WORDS }
    }
}

/**
 * One upcoming music show in a country list. Sources fill what they know; [ShowMerge] joins the
 * same show from several of them; [Popularity] gives it its [score].
 */
data class Show(
    val artist: String,
    val name: String,
    /** The local date at the venue (YYYY-MM-DD) and local time (HH:mm, "" when not announced). */
    val date: String,
    val time: String = "",
    /** When it starts, roughly (a source without a time zone is read as UTC): for sorting and the 12-month window only. */
    val startsAtSec: Long,
    val venue: String = "",
    val city: String = "",
    /** The region id ([Regions]): "north" or "south" in New Zealand, else the source's state or region. */
    val region: String = "",
    val regionName: String = "",
    /** ISO 3166-1 alpha-2. */
    val country: String,
    val lat: Double? = null,
    val lon: Double? = null,
    /** The official ticket page: the seller's own, or Bandsintown's link to it. */
    val tickets: String = "",
    val image: String = "",
    val kind: VenueKind = VenueKind.UNKNOWN,
    /** Signals for [Popularity]: capacity (0 = unknown), followers (-1 = unknown), the act's upcoming shows, the source's order (-1 = none). */
    val capacity: Int = 0,
    val followers: Int = -1,
    val tourDates: Int = 0,
    val relevance: Double = -1.0,
    val sources: List<String> = emptyList(),
    val score: Double = 0.0,
) {
    /** The same for the same show from any source, and from one refresh to the next. */
    val id: String get() = hash("$country|${Fold.key(artist)}|$date|${Fold.text(city)}")

    /** Kilometres from [p] (lat, lon), or null without coordinates. */
    fun kmFrom(p: DoubleArray): Double? = if (lat != null && lon != null) Regions.km(lat, lon, p[0], p[1]) else null

    /** What the app gets. */
    fun toApi(): JSONObject = JSONObject().put("id", id).put("artist", artist).put("name", name).put("date", date)
        .apply { if (time.isNotEmpty()) put("time", time) }
        .put("startsAtSec", startsAtSec).put("venue", venue).put("city", city).put("region", region).put("country", country)
        .apply { if (lat != null && lon != null) put("lat", lat).put("lon", lon) }
        .put("tickets", tickets).put("image", image).put("kind", kind.name.lowercase(Locale.ROOT)).put("score", score)

    /** Everything, for the list on the volume. */
    fun toStored(): JSONObject = JSONObject().put("a", artist).put("n", name).put("d", date).put("t", time).put("s", startsAtSec)
        .put("v", venue).put("c", city).put("r", region).put("rn", regionName).put("cc", country)
        .apply { if (lat != null && lon != null) put("lat", lat).put("lon", lon) }
        .put("tk", tickets).put("im", image).put("k", kind.name).put("cap", capacity).put("f", followers).put("td", tourDates)
        .put("rel", relevance).put("src", JSONArray(sources)).put("sc", score)

    companion object {
        fun fromStored(o: JSONObject): Show? = runCatching {
            Show(
                artist = o.getString("a"), name = o.optString("n"), date = o.getString("d"), time = o.optString("t"),
                startsAtSec = o.getLong("s"), venue = o.optString("v"), city = o.optString("c"), region = o.optString("r"),
                regionName = o.optString("rn"), country = o.getString("cc"),
                lat = if (o.has("lat")) o.getDouble("lat") else null, lon = if (o.has("lon")) o.getDouble("lon") else null,
                tickets = o.optString("tk"), image = o.optString("im"), kind = VenueKind.parse(o.optString("k")),
                capacity = o.optInt("cap"), followers = o.optInt("f", -1), tourDates = o.optInt("td"), relevance = o.optDouble("rel", -1.0),
                sources = o.optJSONArray("src")?.let { a -> (0 until a.length()).map { a.getString(it) } }.orEmpty(),
                score = o.optDouble("sc", 0.0),
            )
        }.getOrNull()

        private fun hash(s: String): String =
            MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).take(8).joinToString("") { "%02x".format(it) }
    }
}

/** Text folded for matching: what people type against what the sources call things. */
object Fold {
    private val MARKS = Regex("\\p{M}+")
    private val SEPARATORS = Regex("[^\\p{L}\\p{N}]+")
    private val TRAILING_THE = Regex("(?i)^(.+?),\\s*the$")

    /** Lower case, accents off, letters and digits only, single spaces: "Beyoncé & Co." is "beyonce co". */
    fun text(s: String): String {
        val n = Normalizer.normalize(s, Normalizer.Form.NFKD).replace(MARKS, "").lowercase(Locale.ROOT)
        val sb = StringBuilder(n.length)
        for (c in n) {
            when (c) {
                'ø' -> sb.append('o')
                'æ' -> sb.append("ae")
                'œ' -> sb.append("oe")
                'ß' -> sb.append("ss")
                'ł' -> sb.append('l')
                'đ', 'ð' -> sb.append('d')
                'þ' -> sb.append("th")
                'ı' -> sb.append('i')
                else -> sb.append(c)
            }
        }
        return sb.toString().replace(SEPARATORS, " ").trim()
    }

    /** An act's name for matching and merging: [text], with "Beatles, The" read as "the beatles". */
    fun key(name: String): String = text(TRAILING_THE.find(name.trim())?.let { "the " + it.groupValues[1] } ?: name)

    /**
     * Does [nameKey] (a [key]) start with [q] (a [text]), or have a word that does? "beat" finds
     * "The Beatles", "hot chili" finds "Red Hot Chili Peppers"; "eat" finds neither.
     */
    fun prefixMatch(nameKey: String, q: String): Boolean {
        if (q.isEmpty()) return false
        if (nameKey.startsWith(q)) return true
        var i = nameKey.indexOf(' ')
        while (i >= 0) {
            if (nameKey.startsWith(q, i + 1)) return true
            i = nameKey.indexOf(' ', i + 1)
        }
        // The same letters without the spaces: "acdc" for AC/DC, "oconnor" for O'Connor.
        val compact = q.replace(" ", "")
        return compact.length >= 2 && nameKey.replace(" ", "").startsWith(compact)
    }
}

/**
 * The same show from several sources, or twice from one (a VIP package listed as its own event),
 * becomes one: same act, same local date, and the same city or venues within [SAME_PLACE_KM].
 */
object ShowMerge {
    const val SAME_PLACE_KM = 30.0

    /** Whose name, venue and city to keep. */
    private val NAMES = listOf("ticketmaster", "seatgeek", "bandsintown")

    /** Whose ticket link and picture to keep: the seller's own page, then Bandsintown's link to the seller. */
    private val LINKS = listOf("ticketmaster", "bandsintown", "seatgeek")

    private fun rank(s: Show, order: List<String>): Int = order.indexOf(s.sources.firstOrNull()).let { if (it < 0) order.size else it }

    fun merge(shows: List<Show>): List<Show> {
        val out = ArrayList<Show>(shows.size)
        shows.groupBy { Fold.key(it.artist) + "|" + it.date }.forEach { (key, group) ->
            if (key.startsWith("|")) return@forEach // no act
            val clusters = ArrayList<MutableList<Show>>()
            for (s in group.sortedWith(compareBy<Show> { rank(it, NAMES) }.thenByDescending { it.relevance })) {
                clusters.firstOrNull { samePlace(it[0], s) }?.add(s) ?: clusters.add(mutableListOf(s))
            }
            clusters.forEach { out += combine(it) }
        }
        return out
    }

    fun samePlace(a: Show, b: Show): Boolean {
        if (a.lat != null && a.lon != null && b.lat != null && b.lon != null) return Regions.km(a.lat, a.lon, b.lat, b.lon) <= SAME_PLACE_KM
        val ca = Fold.text(a.city)
        val cb = Fold.text(b.city)
        return ca.isEmpty() || cb.isEmpty() || ca == cb
    }

    private fun combine(c: List<Show>): Show {
        val first = c[0]
        if (c.size == 1) return first
        fun pick(order: List<String>, f: (Show) -> String) = c.sortedBy { rank(it, order) }.map(f).firstOrNull { it.isNotBlank() }.orEmpty()
        val placed = c.firstOrNull { it.lat != null && it.lon != null }
        val regioned = c.firstOrNull { it.region.isNotBlank() }
        val timed = c.firstOrNull { it.time.isNotBlank() } ?: first
        return first.copy(
            time = timed.time,
            startsAtSec = timed.startsAtSec,
            venue = pick(NAMES) { it.venue },
            city = pick(NAMES) { it.city },
            region = regioned?.region.orEmpty(),
            regionName = regioned?.regionName.orEmpty(),
            lat = placed?.lat,
            lon = placed?.lon,
            tickets = pick(LINKS) { it.tickets },
            image = pick(LINKS) { it.image },
            kind = c.map { it.kind }.filter { it != VenueKind.UNKNOWN }.maxByOrNull { it.size } ?: VenueKind.UNKNOWN,
            capacity = c.maxOf { it.capacity },
            followers = c.maxOf { it.followers },
            tourDates = c.maxOf { it.tourDates },
            relevance = c.maxOf { it.relevance },
            sources = c.flatMap { it.sources }.distinct(),
        )
    }
}
