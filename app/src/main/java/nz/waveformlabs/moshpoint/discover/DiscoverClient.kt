package nz.waveformlabs.moshpoint.discover

import android.content.Context
import android.telephony.TelephonyManager
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.core.ComingAnswer
import nz.waveformlabs.moshpoint.core.DiscoverPlace
import nz.waveformlabs.moshpoint.core.DiscoverRegion
import nz.waveformlabs.moshpoint.core.DiscoverShow
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.SuggestAnswer
import nz.waveformlabs.moshpoint.core.Suggestion
import nz.waveformlabs.moshpoint.locate.RelayClient
import org.json.JSONArray
import org.json.JSONObject

/**
 * Discover on the relay (RELAY_API.md section 12, docs/DISCOVER_APP.md): smart-search
 * suggestions and Coming up, for Moshpoint+ members. The relay holds the listing services' keys
 * and answers from its cached country lists; the app holds no key (docs/SECRETS.md). The phone
 * sends its country and at most its region, never where it is.
 */
object DiscoverClient {
    /** What a request came to. */
    sealed interface Answer<out T> {
        class Ok<T>(val value: T) : Answer<T>

        /** 403 (not a member) or 503 (a relay with no listing keys): quietly back to typing it in. */
        object Closed : Answer<Nothing>

        /** No internet, a timeout or a garbled answer: try again later. */
        object Failed : Answer<Nothing>
    }

    private val server get() = RelayClient.shareableServer

    /** Only through our relay (it holds the keys); none built in, no Discover. */
    val available: Boolean get() = server.isNotBlank()

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("discover", Context.MODE_PRIVATE)

    /** The relay said no (403 or 503) in the last day: don't offer Discover, so nothing flashes up and goes away. */
    fun closedRecently(c: Context): Boolean = System.currentTimeMillis() < prefs(c).getLong("closedUntil", 0L)

    /** Note a 403 or 503 for a day (a member whose purchase lands, or a relay given keys, is asked again tomorrow). */
    fun noteClosed(c: Context) {
        prefs(c).edit().putLong("closedUntil", System.currentTimeMillis() + 24 * 3600_000L).apply()
    }

    /** Acts whose name (or a word in it) starts with [q]: near you, elsewhere in [country], worldwide. */
    suspend fun suggest(country: String, q: String, region: String?, limit: Int = 8): Answer<SuggestAnswer> =
        get("/v1/discover/suggest?country=${enc(country)}&q=${enc(q.trim())}" + (region?.let { "&region=${enc(it)}" } ?: "") + "&limit=$limit") { parseSuggest(it) }

    /** The next 12 months: [scope] is `near`, `country` or `travel`. */
    suspend fun coming(country: String, region: String?, scope: String, limit: Int = 30): Answer<ComingAnswer> =
        get("/v1/discover/coming?country=${enc(country)}&scope=${enc(scope)}" + (region?.let { "&region=${enc(it)}" } ?: "") + "&limit=$limit") { parseComing(it) }

    private fun enc(s: String) = URLEncoder.encode(s, "UTF-8")

    /** One GET, on the IO threads; cancelling the caller interrupts the wait for it. */
    private suspend fun <T> get(path: String, parse: (String) -> T): Answer<T> = withContext(Dispatchers.IO) {
        if (!available) return@withContext Answer.Closed
        runCatching {
            runInterruptible {
                val c = URL(server.trimEnd('/') + path).openConnection() as HttpURLConnection
                try {
                    c.connectTimeout = 8_000
                    c.readTimeout = 10_000
                    when (c.responseCode) {
                        200 -> Answer.Ok(parse(c.inputStream.bufferedReader().use { it.readText() }))
                        403, 503 -> Answer.Closed
                        else -> Answer.Failed
                    }
                } finally {
                    c.disconnect()
                }
            }
        }.getOrElse { if (it is kotlinx.coroutines.CancellationException) throw it else Answer.Failed }
    }

    // ---- Reading the answers ----

    internal fun parseShow(o: JSONObject) = DiscoverShow(
        id = o.optString("id"), artist = o.optString("artist"), name = o.optString("name"),
        date = o.optString("date"), time = o.optString("time"), startsAtSec = o.optLong("startsAtSec"),
        venue = o.optString("venue"), city = o.optString("city"), region = o.optString("region"), country = o.optString("country"),
        lat = o.optDouble("lat").takeIf { o.has("lat") && !it.isNaN() }, lon = o.optDouble("lon").takeIf { o.has("lon") && !it.isNaN() },
        tickets = o.optString("tickets"), kind = o.optString("kind", "unknown"), score = o.optDouble("score", 0.0).takeIf { !it.isNaN() } ?: 0.0,
        km = o.optInt("km", 0),
    )

    private fun suggestions(a: JSONArray?): List<Suggestion> = (0 until (a?.length() ?: 0)).mapNotNull { i ->
        val o = a?.optJSONObject(i) ?: return@mapNotNull null
        Suggestion(
            o.optString("artist"), o.optDouble("score", 0.0), o.optInt("shows", 0), o.optInt("countryShows", o.optInt("shows", 0)),
            o.optJSONObject("next")?.let { parseShow(it) },
        )
    }.filter { it.artist.isNotBlank() }

    internal fun parseSuggest(text: String): SuggestAnswer {
        val o = JSONObject(text)
        return SuggestAnswer(
            o.optString("country"), o.optString("q"), o.optString("region").takeIf { it.isNotBlank() && it != "null" }, o.optBoolean("ready", true),
            suggestions(o.optJSONArray("near")), suggestions(o.optJSONArray("elsewhere")), suggestions(o.optJSONArray("worldwide")),
        )
    }

    internal fun parseComing(text: String): ComingAnswer {
        val o = JSONObject(text)
        val shows = o.optJSONArray("shows")
        val regions = o.optJSONArray("regions")
        return ComingAnswer(
            o.optString("country"), o.optString("scope"), o.optString("region").takeIf { it.isNotBlank() && it != "null" }, o.optBoolean("ready", true),
            o.optInt("total", 0),
            (0 until (shows?.length() ?: 0)).mapNotNull { i -> shows?.optJSONObject(i)?.let { parseShow(it) } },
            (0 until (regions?.length() ?: 0)).mapNotNull { i ->
                regions?.optJSONObject(i)?.let { r ->
                    DiscoverRegion(r.optString("id"), r.optString("name"), r.optInt("shows", 0), r.optDouble("lat", 0.0), r.optDouble("lon", 0.0))
                }
            }.filter { it.id.isNotBlank() },
        )
    }
}

/**
 * Where this phone is, as far as Discover is told: its country, and at most its region. The
 * exact position is used here, on the phone, to pick the region, and never leaves it.
 */
object DiscoverWhere {
    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("discover", Context.MODE_PRIVATE)

    /** The country of the mobile network the phone is on (right for travellers), else the SIM's, else the language setting's. */
    fun country(c: Context): String {
        val tm = runCatching { c.getSystemService(TelephonyManager::class.java) }.getOrNull()
        val iso = listOfNotNull(
            runCatching { tm?.networkCountryIso }.getOrNull(),
            runCatching { tm?.simCountryIso }.getOrNull(),
            Locale.getDefault().country,
        ).map { it.trim().uppercase(Locale.ROOT) }.firstOrNull { it.length == 2 && it.all { ch -> ch in 'A'..'Z' } }
        return iso ?: "NZ"
    }

    /** The regions a Coming up answer listed for [country] (kept, so search can pick one too). */
    fun regions(c: Context, country: String): List<DiscoverRegion> = runCatching {
        val a = JSONArray(prefs(c).getString("regions_$country", "[]"))
        (0 until a.length()).map { i ->
            val r = a.getJSONObject(i)
            DiscoverRegion(r.getString("id"), r.optString("name"), r.optInt("shows"), r.getDouble("lat"), r.getDouble("lon"))
        }
    }.getOrDefault(emptyList())

    fun rememberRegions(c: Context, country: String, regions: List<DiscoverRegion>) {
        if (regions.isEmpty()) return
        val a = JSONArray()
        regions.forEach { a.put(JSONObject().put("id", it.id).put("name", it.name).put("shows", it.shows).put("lat", it.lat).put("lon", it.lon)) }
        prefs(c).edit().putString("regions_$country", a.toString()).apply()
    }

    /** The region to send: New Zealand's island, or the nearest region we've been told about. Null = the whole country. */
    fun region(c: Context, country: String, me: LatLon?): String? = DiscoverPlace.region(country, me, regions(c, country))

    /** A region's name to show ("North Island"), if we know it. */
    fun regionName(c: Context, country: String, id: String?): String? {
        id ?: return null
        return regions(c, country).firstOrNull { it.id.equals(id, ignoreCase = true) }?.name?.takeIf { it.isNotBlank() }
            ?: when {
                country.equals("NZ", true) && id == DiscoverPlace.NORTH -> "North Island"
                country.equals("NZ", true) && id == DiscoverPlace.SOUTH -> "South Island"
                else -> null
            }
    }
}
