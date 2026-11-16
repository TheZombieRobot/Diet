package nz.waveformlabs.moshpoint.server

import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The listing services' country-wide answers for Discover, read into [Show]s. Each reader is a
 * pure function of the response body, so recorded samples pin them (DiscoverSourcesTest). The
 * keys go only into the URLs built here, which are never logged (and LogPrivacy hides keys in
 * any URL that is).
 *
 * - **Ticketmaster Discovery** `events.json`: a country's music events for the next 12 months,
 *   most relevant first, [TM_PAGE] a page, no deeper than its [TM_DEEPEST]th result.
 * - **SeatGeek** `events`: US and Canada, by SeatGeek's own score, [SG_PAGE] a page.
 * - **Bandsintown**: per act, not per country: followers and tour size (`/artists/{name}`), and
 *   tour dates anywhere in the world (`/artists/{name}/events`).
 */
object DiscoverSources {
    const val TICKETMASTER = "ticketmaster"
    const val SEATGEEK = "seatgeek"
    const val BANDSINTOWN = "bandsintown"

    const val TM_PAGE = 200
    const val TM_DEEPEST = 1_000
    const val SG_PAGE = 100

    /** SeatGeek lists events in the US and Canada. */
    val SEATGEEK_COUNTRIES = setOf("US", "CA")

    /** One page of a country's shows, and how many pages the source says there are. */
    data class Page(val shows: List<Show>, val pages: Int)

    /** An act on Bandsintown. */
    data class Act(val name: String, val followers: Int, val upcoming: Int, val image: String)

    private val DATE = Regex("^\\d{4}-\\d{2}-\\d{2}$")
    private val TIME = Regex("^\\d{2}:\\d{2}$")

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    private fun utc(sec: Long): String = DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochSecond(sec))

    // ---- Ticketmaster ----

    fun ticketmasterUrl(key: String, country: String, page: Int, fromSec: Long, toSec: Long): String =
        "https://app.ticketmaster.com/discovery/v2/events.json?apikey=${enc(key)}&countryCode=$country&classificationName=music" +
            "&startDateTime=${enc(utc(fromSec))}&endDateTime=${enc(utc(toSec))}&sort=relevance,desc&size=$TM_PAGE&page=$page"

    /** One page; [first] is the page's first result's position in the whole answer (its relevance). */
    fun ticketmaster(body: String, first: Int): Page {
        val o = JSONObject(body)
        val pages = o.optJSONObject("page")?.optInt("totalPages", 0) ?: 0
        val events = o.optJSONObject("_embedded")?.optJSONArray("events") ?: return Page(emptyList(), pages)
        val shows = (0 until events.length()).mapNotNull { i ->
            val e = events.optJSONObject(i) ?: return@mapNotNull null
            val dates = e.optJSONObject("dates") ?: return@mapNotNull null
            if (dates.optJSONObject("status")?.optString("code").orEmpty().lowercase() in setOf("cancelled", "canceled", "postponed")) return@mapNotNull null
            val start = dates.optJSONObject("start") ?: return@mapNotNull null
            if (start.optBoolean("dateTBD") || start.optBoolean("dateTBA")) return@mapNotNull null
            val date = start.optString("localDate").takeIf { DATE.matches(it) } ?: return@mapNotNull null
            val time = start.optString("localTime").take(5).takeIf { TIME.matches(it) && !start.optBoolean("timeTBA") }.orEmpty()
            val epoch = start.optString("dateTime").ifBlank { null }?.let { runCatching { Instant.parse(it).epochSecond }.getOrNull() }
                ?: localEpoch(date, time) ?: return@mapNotNull null
            val embedded = e.optJSONObject("_embedded")
            val v = embedded?.optJSONArray("venues")?.optJSONObject(0)
            val acts = embedded?.optJSONArray("attractions")
            val artist = acts?.optJSONObject(0)?.optString("name")?.ifBlank { null } ?: e.optString("name").ifBlank { null } ?: return@mapNotNull null
            val country = v?.optJSONObject("country")?.optString("countryCode").orEmpty().uppercase()
            val loc = v?.optJSONObject("location")
            val (lat, lon) = coords(loc?.optString("latitude"), loc?.optString("longitude"))
            val state = v?.optJSONObject("state")
            val region = Regions.of(country, lat, lon, state?.optString("stateCode"), state?.optString("name"))
            val festival = (acts?.length() ?: 0) >= VenueKind.FESTIVAL_ACTS || VenueKind.festivalName(e.optString("name"))
            val venue = v?.optString("name").orEmpty()
            Show(
                artist = artist, name = e.optString("name"), date = date, time = time, startsAtSec = epoch, venue = venue,
                city = v?.optJSONObject("city")?.optString("name").orEmpty(), region = region.id, regionName = region.name,
                country = country, lat = lat, lon = lon, tickets = PublicLink.clean(e.optString("url")),
                image = PublicLink.clean(tmImage(e.optJSONArray("images")) ?: tmImage(acts?.optJSONObject(0)?.optJSONArray("images")).orEmpty()),
                kind = VenueKind.of(venue, festival), relevance = Popularity.rank(first + i, TM_DEEPEST), sources = listOf(TICKETMASTER),
            )
        }
        return Page(shows, pages)
    }

    /** A wide picture for a card: the smallest 16:9 at least 600 px wide, else the biggest there is. */
    private fun tmImage(images: JSONArray?): String? {
        if (images == null) return null
        val all = (0 until images.length()).mapNotNull { images.optJSONObject(it) }.filter { it.optString("url").startsWith("https://") }
        val wide = all.filter { it.optString("ratio") == "16_9" && !it.optBoolean("fallback") }
        return (wide.filter { it.optInt("width") >= 600 }.minByOrNull { it.optInt("width") } ?: wide.maxByOrNull { it.optInt("width") }
            ?: all.maxByOrNull { it.optInt("width") })?.optString("url")
    }

    // ---- SeatGeek ----

    fun seatgeekUrl(clientId: String, country: String, page: Int, fromSec: Long, toSec: Long): String {
        fun t(sec: Long) = enc(LocalDateTime.ofEpochSecond(sec, 0, ZoneOffset.UTC).toString())
        return "https://api.seatgeek.com/2/events?client_id=${enc(clientId)}&venue.country=$country&taxonomies.name=concert" +
            "&datetime_utc.gte=${t(fromSec)}&datetime_utc.lte=${t(toSec)}&sort=score.desc&per_page=$SG_PAGE&page=${page + 1}"
    }

    fun seatgeek(body: String, first: Int): Page {
        val o = JSONObject(body)
        val meta = o.optJSONObject("meta")
        val perPage = meta?.optInt("per_page", SG_PAGE)?.coerceAtLeast(1) ?: SG_PAGE
        val pages = ((meta?.optInt("total", 0) ?: 0) + perPage - 1) / perPage
        val events = o.optJSONArray("events") ?: return Page(emptyList(), pages)
        val shows = (0 until events.length()).mapNotNull { i ->
            val e = events.optJSONObject(i) ?: return@mapNotNull null
            if (e.optBoolean("date_tbd")) return@mapNotNull null
            val utc = e.optString("datetime_utc").ifBlank { null } ?: return@mapNotNull null
            val epoch = runCatching { LocalDateTime.parse(utc).toEpochSecond(ZoneOffset.UTC) }.getOrNull() ?: return@mapNotNull null
            val local = e.optString("datetime_local")
            val date = local.take(10).takeIf { DATE.matches(it) } ?: utc.take(10)
            val time = if (e.optBoolean("time_tbd")) "" else local.drop(11).take(5).takeIf { TIME.matches(it) }.orEmpty()
            val performers = e.optJSONArray("performers")
            val acts = (0 until (performers?.length() ?: 0)).mapNotNull { performers?.optJSONObject(it) }
            val act = acts.firstOrNull { it.optBoolean("primary") } ?: acts.firstOrNull()
            val artist = act?.optString("name")?.ifBlank { null } ?: e.optString("title").ifBlank { null } ?: return@mapNotNull null
            val v = e.optJSONObject("venue")
            val loc = v?.optJSONObject("location")
            val (lat, lon) = coords(loc?.opt("lat")?.toString(), loc?.opt("lon")?.toString())
            val country = v?.optString("country").orEmpty().uppercase()
            val region = Regions.of(country, lat, lon, v?.optString("state"), null)
            val taxonomies = e.optJSONArray("taxonomies")
            val festival = e.optString("type") == "music_festival" || acts.size >= VenueKind.FESTIVAL_ACTS ||
                (0 until (taxonomies?.length() ?: 0)).any { taxonomies?.optJSONObject(it)?.optString("name") == "music_festival" }
            val venue = v?.optString("name").orEmpty()
            Show(
                artist = artist, name = e.optString("title").ifBlank { artist }, date = date, time = time, startsAtSec = epoch,
                venue = venue, city = v?.optString("city").orEmpty(), region = region.id, regionName = region.name, country = country,
                lat = lat, lon = lon, tickets = PublicLink.clean(e.optString("url")),
                image = PublicLink.clean(act?.optString("image")?.ifBlank { null } ?: act?.optJSONObject("images")?.optString("huge").orEmpty()),
                kind = VenueKind.of(venue, festival), capacity = v?.optInt("capacity", 0) ?: 0,
                tourDates = act?.optInt("num_upcoming_events", 0) ?: 0, relevance = Popularity.rank(first + i), sources = listOf(SEATGEEK),
            )
        }
        return Page(shows, pages)
    }

    // ---- Bandsintown ----

    /** Bandsintown wants "/", "?" and "*" in a name encoded twice, and '"' as %27C. */
    private fun artistPath(name: String): String = enc(name).replace("+", "%20").replace("%2F", "%252F")
        .replace("%3F", "%253F").replace("*", "%252A").replace("%22", "%27C")

    fun bandsintownActUrl(appId: String, name: String): String = "https://rest.bandsintown.com/artists/${artistPath(name)}?app_id=${enc(appId)}"

    fun bandsintownEventsUrl(appId: String, name: String): String =
        "https://rest.bandsintown.com/artists/${artistPath(name)}/events?app_id=${enc(appId)}&date=upcoming"

    /** The act, or null if Bandsintown doesn't know it (an error object, or nothing). */
    fun bandsintownAct(body: String): Act? {
        val t = body.trim()
        if (!t.startsWith("{")) return null
        val o = JSONObject(t)
        val name = o.optString("name")
        if (o.has("error") || name.isBlank()) return null
        return Act(name, o.optInt("tracker_count", -1), o.optInt("upcoming_event_count", 0), PublicLink.clean(o.optString("thumb_url").ifBlank { o.optString("image_url") }))
    }

    /** The act's upcoming shows, anywhere in the world. */
    fun bandsintownEvents(body: String, act: Act): List<Show> {
        val t = body.trim()
        if (!t.startsWith("[")) return emptyList() // "not found" comes back as an object
        val events = JSONArray(t)
        return (0 until events.length()).mapNotNull { i ->
            val e = events.optJSONObject(i) ?: return@mapNotNull null
            val dt = e.optString("datetime").ifBlank { e.optString("starts_at") }
            val date = dt.take(10).takeIf { DATE.matches(it) } ?: return@mapNotNull null
            val time = dt.drop(11).take(5).takeIf { TIME.matches(it) }.orEmpty()
            // Local time without a zone: close enough for sorting and the 12-month window.
            val epoch = localEpoch(date, time) ?: return@mapNotNull null
            val v = e.optJSONObject("venue")
            val (lat, lon) = coords(v?.optString("latitude"), v?.optString("longitude"))
            val country = countryCode(v?.optString("country").orEmpty())
            if (country.isEmpty()) return@mapNotNull null
            val regionField = v?.optString("region").orEmpty()
            val region = Regions.of(country, lat, lon, regionField.takeIf { it.length <= 3 }, regionField.takeIf { it.length > 3 })
            val offers = e.optJSONArray("offers")
            val ticketPage = (0 until (offers?.length() ?: 0)).mapNotNull { offers?.optJSONObject(it) }
                .firstOrNull { it.optString("type").equals("tickets", ignoreCase = true) && it.optString("url").startsWith("https://") }
                ?.optString("url") ?: e.optString("url")
            // Bandsintown's links carry the caller's app_id: it never reaches a phone (PublicLink).
            val tickets = PublicLink.clean(ticketPage)
            val lineup = e.optJSONArray("lineup")?.length() ?: 0
            val title = e.optString("title")
            val festival = e.optString("festival_start_date").isNotBlank() || lineup >= VenueKind.FESTIVAL_ACTS || VenueKind.festivalName(title)
            val venue = v?.optString("name").orEmpty()
            Show(
                artist = act.name, name = title.ifBlank { act.name }, date = date, time = time, startsAtSec = epoch, venue = venue,
                city = v?.optString("city").orEmpty(), region = region.id, regionName = region.name, country = country, lat = lat, lon = lon,
                tickets = tickets, image = act.image, kind = VenueKind.of(venue, festival), followers = act.followers,
                tourDates = maxOf(act.upcoming, events.length()), sources = listOf(BANDSINTOWN),
            )
        }
    }

    // ---- Shared ----

    private fun coords(lat: String?, lon: String?): Pair<Double?, Double?> {
        val a = lat?.trim()?.toDoubleOrNull()
        val o = lon?.trim()?.toDoubleOrNull()
        if (a == null || o == null || a !in -90.0..90.0 || o !in -180.0..180.0 || (a == 0.0 && o == 0.0)) return null to null
        return a to o
    }

    /** A local date and time read as UTC (an evening if there's no time). */
    private fun localEpoch(date: String, time: String): Long? = runCatching {
        LocalDate.parse(date).atTime(if (time.isEmpty()) LocalTime.of(19, 0) else LocalTime.parse(time)).toEpochSecond(ZoneOffset.UTC)
    }.getOrNull()

    private val ALIASES = mapOf(
        "usa" to "US", "us" to "US", "united states of america" to "US", "uk" to "GB", "great britain" to "GB", "england" to "GB",
        "scotland" to "GB", "wales" to "GB", "northern ireland" to "GB", "czech republic" to "CZ", "turkey" to "TR", "hong kong" to "HK",
        "macau" to "MO", "macao" to "MO", "korea" to "KR", "south korea" to "KR", "republic of korea" to "KR", "russia" to "RU",
        "vietnam" to "VN", "ivory coast" to "CI", "holland" to "NL", "the netherlands" to "NL", "uae" to "AE", "taiwan" to "TW",
    )
    private val NAMES: Map<String, String> by lazy {
        Locale.getISOCountries().associateBy { Fold.text(Locale("", it).getDisplayCountry(Locale.ENGLISH)) } + ALIASES
    }

    /** Bandsintown gives country names ("New Zealand"); ISO codes ("NZ") for everything else here. */
    fun countryCode(name: String): String {
        val t = name.trim()
        ALIASES[Fold.text(t)]?.let { return it }
        if (t.length == 2) return t.uppercase().takeIf { it in ISO }.orEmpty()
        return NAMES[Fold.text(t)].orEmpty()
    }

    private val ISO: Set<String> by lazy { Locale.getISOCountries().toSet() }
}
