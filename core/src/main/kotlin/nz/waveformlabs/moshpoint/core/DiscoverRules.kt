package nz.waveformlabs.moshpoint.core

import java.text.Normalizer
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.util.Locale

/*
 * Discover (docs/DISCOVER_APP.md): what the phone does with the relay's answers
 * (RELAY_API.md section 12). The phone sends its country and at most its region, never where
 * it is: the region is worked out here, from a coarse position that never leaves the phone.
 */

/** One show from a Discover answer. */
data class DiscoverShow(
    val id: String,
    val artist: String,
    val name: String,
    /** Local to the venue: "2027-03-13" and "19:30" (blank when the time isn't announced). */
    val date: String,
    val time: String,
    /** Approximate, for sorting (the relay says so). */
    val startsAtSec: Long,
    val venue: String,
    val city: String,
    val region: String,
    val country: String,
    val lat: Double? = null,
    val lon: Double? = null,
    /** The official ticket page, as the relay gave it (clean it with [TicketLink.clean] before it goes anywhere). */
    val tickets: String = "",
    val kind: String = "unknown",
    val score: Double = 0.0,
    /** Worth travelling for: how far it is from the region's middle, in km; 0 otherwise. */
    val km: Int = 0,
)

/** One act in a suggestion group: how many shows it has there, and the soonest. */
data class Suggestion(val artist: String, val score: Double, val shows: Int, val countryShows: Int, val next: DiscoverShow?)

/** `GET /v1/discover/suggest`: acts near you, elsewhere in the country, and worldwide. */
data class SuggestAnswer(
    val country: String,
    val q: String,
    val region: String?,
    /** False while the country's list is still being built: say "Getting the list…" and ask again in about 30 seconds. */
    val ready: Boolean,
    val near: List<Suggestion>,
    val elsewhere: List<Suggestion>,
    val worldwide: List<Suggestion>,
) {
    val empty: Boolean get() = near.isEmpty() && elsewhere.isEmpty() && worldwide.isEmpty()
}

/** A region of a country, with its middle (so the phone can pick its own). */
data class DiscoverRegion(val id: String, val name: String, val shows: Int, val lat: Double, val lon: Double)

/** `GET /v1/discover/coming`: the next 12 months, biggest first. */
data class ComingAnswer(
    val country: String,
    val scope: String,
    val region: String?,
    val ready: Boolean,
    val total: Int,
    val shows: List<DiscoverShow>,
    val regions: List<DiscoverRegion>,
)

/** What the phone tells the relay about where it is: the country and at most the region. */
object DiscoverPlace {
    const val NORTH = "north"
    const val SOUTH = "south"

    /**
     * New Zealand by island, the relay's rule (Regions.kt): Cook Strait runs north-west to
     * south-east, so the line goes from 40.0°S 172.0°E to 42.0°S 175.6°E and south-west of it is
     * the South Island (Nelson is south, though it's further north than Wellington).
     */
    fun nzIsland(lat: Double, lon: Double): String {
        val east = if (lon < 0) lon + 360 else lon
        val lineLat = -40.0 - (east - 172.0) * (2.0 / 3.6)
        return if (lat < lineLat) SOUTH else NORTH
    }

    /**
     * The region to send for [country]: in New Zealand the island of [me]; elsewhere the region
     * whose middle is nearest [me], from [regions] (a Coming up answer's list). Null when there's
     * no position or no list: then the relay answers for the whole country.
     */
    fun region(country: String, me: LatLon?, regions: List<DiscoverRegion>): String? {
        me ?: return null
        if (country.equals("NZ", ignoreCase = true)) return nzIsland(me.lat, me.lon)
        return regions.minByOrNull { Geo.distanceM(me, LatLon(it.lat, it.lon)) }?.id
    }
}

/** When a picked show starts, for its planned crew. */
object ShowStart {
    /** When a show's time isn't announced yet. The planner can change it before starting the crew. */
    val DEFAULT_TIME: LocalTime = LocalTime.of(20, 0)

    /**
     * A show in the phone's own country: its local date and time read in the phone's time zone
     * (exact wherever the country has one zone, and the time the planner sees either way).
     * Abroad: the relay's own start, as the phone can't know the venue's zone; its local time
     * if the relay gave none.
     */
    fun of(show: DiscoverShow, phoneCountry: String, zone: ZoneId): Long {
        val local = runCatching {
            LocalDate.parse(show.date).atTime(show.time.takeIf { it.isNotBlank() }?.let { LocalTime.parse(it) } ?: DEFAULT_TIME)
        }.getOrNull()
        val here = local?.atZone(zone)?.toEpochSecond()
        if (show.country.equals(phoneCountry, ignoreCase = true) && here != null) return here
        return show.startsAtSec.takeIf { it > 0 } ?: here ?: 0L
    }
}

/**
 * Where what was typed matches an act's name, to draw that part in cyan: the start of the name
 * or of any word in it, case and accents aside (as the relay matches). Null when it doesn't.
 */
object TypedMatch {
    fun range(name: String, typed: String): IntRange? {
        val t = fold(typed.trim())
        if (t.isEmpty()) return null
        val folded = StringBuilder()
        val from = ArrayList<Int>()
        name.forEachIndexed { i, ch -> fold(ch.toString()).forEach { folded.append(it); from += i } }
        val f = folded.toString()
        for (i in f.indices) {
            if ((i == 0 || !f[i - 1].isLetterOrDigit()) && f.startsWith(t, i)) return from[i]..from[i + t.length - 1]
        }
        return null
    }

    private fun fold(s: String): String = Normalizer.normalize(s, Normalizer.Form.NFD).replace(Regex("\\p{M}+"), "").lowercase(Locale.ROOT)
}
