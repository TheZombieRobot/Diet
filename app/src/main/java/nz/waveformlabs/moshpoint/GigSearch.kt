package nz.waveformlabs.moshpoint

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Gig finder: type "iron" and get upcoming Iron Maiden shows (Ticketmaster Discovery API).
 * Needs a free key in gradle.properties (moshpoint.tm.key); without one the app lets you
 * type the gig and date in by hand.
 */
object GigSearch {
    data class Gig(val name: String, val venue: String, val city: String, val startsAtSec: Long, val localWhen: String, val lat: Double?, val lon: Double?)

    val available get() = BuildConfig.TICKETMASTER_KEY.isNotBlank()

    /** Upcoming music events matching [query], soonest first. Null = no internet / no key. */
    suspend fun search(query: String, countryCode: String? = java.util.Locale.getDefault().country.takeIf { it.length == 2 }): List<Gig>? =
        withContext(Dispatchers.IO) {
            if (!available || query.isBlank()) return@withContext null
            runCatching {
                val q = URLEncoder.encode(query.trim(), "UTF-8")
                val country = countryCode?.let { "&countryCode=$it" }.orEmpty()
                val url = "https://app.ticketmaster.com/discovery/v2/events.json?apikey=${BuildConfig.TICKETMASTER_KEY}" +
                    "&keyword=$q&classificationName=music&sort=date,asc&size=20$country"
                val c = URL(url).openConnection() as HttpURLConnection
                c.connectTimeout = 8_000
                c.readTimeout = 8_000
                if (c.responseCode != 200) return@runCatching null
                val body = c.inputStream.bufferedReader().use { it.readText() }
                c.disconnect()
                parse(body)
            }.getOrNull()
        }

    internal fun parse(json: String): List<Gig> {
        val events = JSONObject(json).optJSONObject("_embedded")?.optJSONArray("events") ?: return emptyList()
        return (0 until events.length()).mapNotNull { i ->
            val e = events.getJSONObject(i)
            val start = e.optJSONObject("dates")?.optJSONObject("start") ?: return@mapNotNull null
            val iso = start.optString("dateTime").ifBlank { null }
            val epoch = iso?.let { runCatching { java.time.Instant.parse(it).epochSecond }.getOrNull() }
                ?: start.optString("localDate").ifBlank { null }?.let {
                    runCatching { java.time.LocalDate.parse(it).atTime(19, 0).atZone(java.time.ZoneId.systemDefault()).toEpochSecond() }.getOrNull()
                } ?: return@mapNotNull null
            val v = e.optJSONObject("_embedded")?.optJSONArray("venues")?.optJSONObject(0)
            val loc = v?.optJSONObject("location")
            Gig(
                name = e.optString("name"),
                venue = v?.optString("name").orEmpty(),
                city = v?.optJSONObject("city")?.optString("name").orEmpty(),
                startsAtSec = epoch,
                localWhen = listOf(start.optString("localDate"), start.optString("localTime").take(5)).filter { it.isNotBlank() }.joinToString(" "),
                lat = loc?.optString("latitude")?.toDoubleOrNull(),
                lon = loc?.optString("longitude")?.toDoubleOrNull(),
            )
        }
    }
}
