package nz.waveformlabs.moshpoint.server

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.concurrent.ConcurrentHashMap

/**
 * "Find a gig", for any country. The app asks us; we ask whichever listing services cover that
 * country, merge, drop duplicates and return the soonest first. The services' keys live here
 * (environment variables), never in the app, where anyone could pull them out.
 *
 * Sources (each one switched on by its key being set):
 * - Ticketmaster Discovery (TICKETMASTER_KEY): North America, UK/Ireland, most of Europe,
 *   Australia, New Zealand, Mexico, parts of the Middle East and more.
 * - Bandsintown (BANDSINTOWN_APP_ID): an artist's tour dates anywhere in the world; the
 *   worldwide fallback when the search looks like an artist name.
 * - SeatGeek (SEATGEEK_CLIENT_ID): US and Canada.
 * Anywhere none of them covers, people type the gig in by hand (the app always offers that).
 */
class GigSearch(
    private val env: (String) -> String? = System::getenv,
    private val fetch: (String) -> String? = ::httpGet,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    data class Gig(
        val name: String,
        val venue: String,
        val city: String,
        val country: String,
        val startsAtSec: Long,
        val localWhen: String,
        val lat: Double?,
        val lon: Double?,
        val source: String,
    ) {
        fun toJson(): JSONObject = JSONObject().put("name", name).put("venue", venue).put("city", city).put("country", country)
            .put("startsAtSec", startsAtSec).put("localWhen", localWhen).put("source", source)
            .apply { if (lat != null && lon != null) put("lat", lat).put("lon", lon) }
    }

    private val cache = ConcurrentHashMap<String, Pair<Long, List<Gig>>>()

    /** Which sources are on (for /healthz-style checks and tests). */
    val sources: List<String> get() = listOfNotNull(
        "ticketmaster".takeIf { !env("TICKETMASTER_KEY").isNullOrBlank() },
        "bandsintown".takeIf { !env("BANDSINTOWN_APP_ID").isNullOrBlank() },
        "seatgeek".takeIf { !env("SEATGEEK_CLIENT_ID").isNullOrBlank() },
    )

    /** Upcoming music gigs matching [query], in [country] (ISO code) when given; soonest first. */
    fun search(query: String, country: String?): List<Gig> {
        val q = query.trim().take(80)
        if (q.length < 2) return emptyList()
        val cc = country?.uppercase()?.takeIf { it.matches(Regex("[A-Z]{2}")) }
        val key = "${q.lowercase()}|$cc"
        val now = clock()
        cache[key]?.let { (at, list) -> if (now - at < CACHE_MS) return list }
        val results = buildList {
            env("TICKETMASTER_KEY")?.takeIf { it.isNotBlank() }?.let { k -> runCatching { addAll(ticketmaster(q, cc, k)) } }
            env("SEATGEEK_CLIENT_ID")?.takeIf { it.isNotBlank() && (cc == null || cc == "US" || cc == "CA") }?.let { k ->
                runCatching { addAll(seatgeek(q, k)) }
            }
            env("BANDSINTOWN_APP_ID")?.takeIf { it.isNotBlank() }?.let { k ->
                runCatching { addAll(bandsintown(q, k).filter { cc == null || it.country.equals(cc, true) || it.country.isBlank() }) }
            }
        }
        val nowSec = now / 1000
        val merged = results
            .filter { it.startsAtSec > nowSec - 6 * 3600 }
            // Same show from two sources: same act, same local date, same city.
            .distinctBy { "${it.name.lowercase().filter(Char::isLetterOrDigit).take(24)}|${it.localWhen.take(10)}|${it.city.lowercase()}" }
            .sortedBy { it.startsAtSec }
            .take(30)
        if (cache.size > 5_000) cache.clear()
        cache[key] = now to merged
        return merged
    }

    fun toJson(gigs: List<Gig>): String = JSONArray(gigs.map { it.toJson() }).toString()

    // ---- Sources ----

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    internal fun ticketmaster(q: String, cc: String?, key: String): List<Gig> {
        val url = "https://app.ticketmaster.com/discovery/v2/events.json?apikey=${enc(key)}&keyword=${enc(q)}" +
            "&classificationName=music&sort=date,asc&size=20" + (cc?.let { "&countryCode=$it" } ?: "")
        val events = JSONObject(fetch(url) ?: return emptyList()).optJSONObject("_embedded")?.optJSONArray("events") ?: return emptyList()
        return (0 until events.length()).mapNotNull { i ->
            val e = events.getJSONObject(i)
            val start = e.optJSONObject("dates")?.optJSONObject("start") ?: return@mapNotNull null
            val epoch = start.optString("dateTime").ifBlank { null }?.let { runCatching { Instant.parse(it).epochSecond }.getOrNull() }
                ?: start.optString("localDate").ifBlank { null }?.let { localEvening(it) } ?: return@mapNotNull null
            val v = e.optJSONObject("_embedded")?.optJSONArray("venues")?.optJSONObject(0)
            val loc = v?.optJSONObject("location")
            Gig(
                e.optString("name"), v?.optString("name").orEmpty(), v?.optJSONObject("city")?.optString("name").orEmpty(),
                v?.optJSONObject("country")?.optString("countryCode").orEmpty(), epoch,
                listOf(start.optString("localDate"), start.optString("localTime").take(5)).filter { it.isNotBlank() }.joinToString(" "),
                loc?.optString("latitude")?.toDoubleOrNull(), loc?.optString("longitude")?.toDoubleOrNull(), "ticketmaster",
            )
        }
    }

    internal fun seatgeek(q: String, clientId: String): List<Gig> {
        val url = "https://api.seatgeek.com/2/events?client_id=${enc(clientId)}&q=${enc(q)}&taxonomies.name=concert&sort=datetime_utc.asc&per_page=20"
        val events = JSONObject(fetch(url) ?: return emptyList()).optJSONArray("events") ?: return emptyList()
        return (0 until events.length()).mapNotNull { i ->
            val e = events.getJSONObject(i)
            val utc = e.optString("datetime_utc").ifBlank { null } ?: return@mapNotNull null
            val epoch = runCatching { java.time.LocalDateTime.parse(utc).toEpochSecond(ZoneOffset.UTC) }.getOrNull() ?: return@mapNotNull null
            val v = e.optJSONObject("venue")
            val loc = v?.optJSONObject("location")
            Gig(
                e.optString("title"), v?.optString("name").orEmpty(), v?.optString("city").orEmpty(), v?.optString("country").orEmpty(),
                epoch, e.optString("datetime_local").replace('T', ' ').take(16),
                loc?.optDouble("lat")?.takeIf { !it.isNaN() }, loc?.optDouble("lon")?.takeIf { !it.isNaN() }, "seatgeek",
            )
        }
    }

    /** Bandsintown is artist-based: [q] is treated as an artist name. */
    internal fun bandsintown(q: String, appId: String): List<Gig> {
        val url = "https://rest.bandsintown.com/artists/${enc(q).replace("+", "%20")}/events?app_id=${enc(appId)}&date=upcoming"
        val body = fetch(url) ?: return emptyList()
        if (!body.trimStart().startsWith("[")) return emptyList() // "not found" comes back as an object
        val events = JSONArray(body)
        return (0 until events.length()).mapNotNull { i ->
            val e = events.getJSONObject(i)
            val dt = e.optString("datetime").ifBlank { null } ?: return@mapNotNull null
            val v = e.optJSONObject("venue")
            val lat = v?.optString("latitude")?.toDoubleOrNull()
            val lon = v?.optString("longitude")?.toDoubleOrNull()
            // Local time without a zone: close enough for sorting; the app shows localWhen.
            val epoch = runCatching { java.time.LocalDateTime.parse(dt).toEpochSecond(ZoneOffset.UTC) }.getOrNull() ?: return@mapNotNull null
            val artist = e.optJSONObject("artist")?.optString("name")?.ifBlank { null } ?: q
            Gig(
                e.optString("title").ifBlank { artist }, v?.optString("name").orEmpty(), v?.optString("city").orEmpty(),
                countryCode(v?.optString("country").orEmpty()), epoch, dt.replace('T', ' ').take(16), lat, lon, "bandsintown",
            )
        }
    }

    private fun localEvening(date: String): Long? = runCatching { LocalDate.parse(date).atTime(19, 0).toEpochSecond(ZoneOffset.UTC) }.getOrNull()

    /** Bandsintown gives country names ("United Kingdom"); turn them into ISO codes. */
    private fun countryCode(name: String): String {
        if (name.length == 2) return name.uppercase()
        return java.util.Locale.getISOCountries().firstOrNull { java.util.Locale("", it).getDisplayCountry(java.util.Locale.ENGLISH).equals(name, true) }.orEmpty()
    }

    companion object {
        private const val CACHE_MS = 10 * 60_000L
        private val http: HttpClient by lazy { HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(6)).build() }

        fun httpGet(url: String): String? = runCatching {
            val r = http.send(HttpRequest.newBuilder(URI(url)).timeout(Duration.ofSeconds(8)).header("Accept", "application/json").GET().build(), HttpResponse.BodyHandlers.ofString())
            if (r.statusCode() == 200) r.body() else null
        }.getOrNull()
    }
}
