package nz.waveformlabs.moshpoint.gigs

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Gig finder: type "iron" and get upcoming Iron Maiden shows, through our own relay server, which
 * holds the search sources' API keys (Ticketmaster, SeatGeek, Bandsintown) as server secrets. No
 * key is ever built into the app, where anyone could pull it out (docs/SECRETS.md). Without a
 * server the app lets you type the gig and date in by hand.
 */
object GigSearch {
    data class Gig(val name: String, val venue: String, val city: String, val startsAtSec: Long, val localWhen: String, val lat: Double?, val lon: Double?)

    /**
     * The build's own relay server (blank = none), which does the searching: worldwide sources,
     * keys kept there. Not RelayClient.serverUrl, which is blank when the server is built in.
     */
    private val server get() = nz.waveformlabs.moshpoint.locate.RelayClient.shareableServer

    /** Search works only through our server (it holds the keys). */
    val available get() = server.isNotBlank()

    /** Upcoming music events matching [query], soonest first. Null = no server or no internet. */
    suspend fun search(query: String, countryCode: String? = java.util.Locale.getDefault().country.takeIf { it.length == 2 }): List<Gig>? =
        withContext(Dispatchers.IO) {
            if (!available || query.isBlank()) return@withContext null
            viaServer(query, countryCode)
        }

    private fun viaServer(query: String, countryCode: String?): List<Gig>? = runCatching {
        val base = server.trimEnd('/')
        val url = "$base/v1/gigs/search?q=${URLEncoder.encode(query.trim(), "UTF-8")}" + (countryCode?.let { "&country=$it" } ?: "")
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 8_000
        c.readTimeout = 12_000
        if (c.responseCode != 200) return@runCatching null
        val arr = org.json.JSONArray(c.inputStream.bufferedReader().use { it.readText() })
        c.disconnect()
        (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            Gig(
                o.optString("name"), o.optString("venue"), o.optString("city"), o.optLong("startsAtSec"), o.optString("localWhen"),
                o.optDouble("lat").takeIf { o.has("lat") && !it.isNaN() }, o.optDouble("lon").takeIf { o.has("lon") && !it.isNaN() },
            )
        }
    }.getOrNull()
}
