package nz.waveformlabs.moshpoint.server

import org.json.JSONArray
import org.json.JSONObject
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.concurrent.ConcurrentHashMap

/**
 * "Where is this venue?", for gigs typed in by hand. The app asks us once per typed gig; we
 * ask OpenStreetMap's Nominatim, inside its usage policy:
 *
 * - **At most one request a second, for all our users together.** Every phone's question goes
 *   through here and is queued at least [GAP_MS] apart; if the queue is too long we say "try
 *   later" rather than hurry.
 * - **Say who we are:** a User-Agent naming Moshpoint and a contact (set MOSHPOINT_CONTACT).
 * - **Cache:** answers are kept a month, "no such place" a day, so nobody asks twice.
 * - **No auto-complete:** the app only asks when someone taps "Start crew".
 * - **Be able to switch service without an app update:** MOSHPOINT_GEOCODER names the search
 *   address (anything that speaks Nominatim's `/search`), and MOSHPOINT_GEOCODER=off turns
 *   lookups off; the app then saves the map around people when they arrive instead.
 */
class VenueLookup(
    private val env: (String) -> String? = System::getenv,
    private val fetch: (url: String, userAgent: String) -> Fetched = ::httpGetAs,
    private val clock: () -> Long = System::currentTimeMillis,
    private val sleep: (Long) -> Unit = { Thread.sleep(it) },
) {
    data class Place(val lat: Double, val lon: Double, val name: String) {
        fun toJson(): JSONObject = JSONObject().put("lat", lat).put("lon", lon).put("name", name)
    }

    sealed interface Result {
        data class Found(val place: Place) : Result
        data object NotFound : Result

        /** Couldn't ask right now (off, busy, or the service is down): the app tries again later. */
        data object Unavailable : Result
    }

    /** What came back from the search service: the body of a 200, or just the status. */
    data class Fetched(val status: Int, val body: String?)

    private val cache = ConcurrentHashMap<String, Pair<Long, Place?>>()
    private val gate = Any()
    private var nextAskAt = 0L

    @Volatile private var turnedAwayUntil = 0L

    fun find(query: String, box: String?): Result {
        val q = query.trim().replace(Regex("\\s+"), " ").take(80)
        if (q.length < 3) return Result.NotFound
        val base = env("MOSHPOINT_GEOCODER")?.trim().orEmpty().ifBlank { DEFAULT }
        if (base.equals("off", ignoreCase = true) || !base.startsWith("https://")) return Result.Unavailable
        val viewbox = box?.takeIf { BOX.matches(it) }
        val key = q.lowercase() + "|" + viewbox.orEmpty()
        val now = clock()
        cache[key]?.let { (at, place) ->
            if (place != null && now - at < FOUND_KEEP_MS) return Result.Found(place)
            if (place == null && now - at < NOT_FOUND_KEEP_MS) return Result.NotFound
        }
        if (now < turnedAwayUntil) return Result.Unavailable
        // One at a time, a second apart. Whoever would wait too long is told to come back.
        val waitMs = synchronized(gate) {
            val wait = (nextAskAt - now).coerceAtLeast(0L)
            if (wait > MAX_WAIT_MS) return Result.Unavailable
            nextAskAt = now + wait + GAP_MS
            wait
        }
        if (waitMs > 0) sleep(waitMs)
        val url = base + "?format=jsonv2&limit=1&q=" + URLEncoder.encode(q, "UTF-8") +
            (viewbox?.let { "&viewbox=" + URLEncoder.encode(it, "UTF-8") + "&bounded=0" } ?: "")
        val contact = env("MOSHPOINT_CONTACT")?.trim().orEmpty().ifBlank { "nz.waveformlabs.moshpoint" }
        val got = fetch(url, "Moshpoint-relay/1.0 ($contact)")
        if (got.status == 403 || got.status == 429) {
            // That is how the service turns an app away. Leave it alone for a day.
            turnedAwayUntil = clock() + NOT_FOUND_KEEP_MS
            return Result.Unavailable
        }
        val body = got.body?.takeIf { got.status == 200 } ?: return Result.Unavailable
        val place = runCatching { parse(JSONArray(body)) }.getOrElse { return Result.Unavailable }
        if (cache.size >= MAX_CACHE) cache.entries.minByOrNull { it.value.first }?.let { cache.remove(it.key) }
        cache[key] = clock() to place
        return if (place != null) Result.Found(place) else Result.NotFound
    }

    /** Nominatim's answer: a list, best match first, with `lat` and `lon` as text. */
    private fun parse(arr: JSONArray): Place? {
        val o = arr.optJSONObject(0) ?: return null
        val lat = o.optString("lat").toDoubleOrNull() ?: return null
        val lon = o.optString("lon").toDoubleOrNull() ?: return null
        if (lat !in -90.0..90.0 || lon !in -180.0..180.0) return null
        return Place(lat, lon, o.optString("display_name").take(120))
    }

    companion object {
        const val DEFAULT = "https://nominatim.openstreetmap.org/search"
        const val GAP_MS = 1_100L
        const val MAX_WAIT_MS = 4_000L
        private const val FOUND_KEEP_MS = 30L * 24 * 3600 * 1000
        private const val NOT_FOUND_KEEP_MS = 24L * 3600 * 1000
        private const val MAX_CACHE = 20_000

        /** left,top,right,bottom in whole degrees: all the app ever sends. */
        private val BOX = Regex("^-?\\d{1,3},-?\\d{1,2},-?\\d{1,3},-?\\d{1,2}$")

        private val http: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()

        fun httpGetAs(url: String, userAgent: String): Fetched = runCatching {
            val r = http.send(
                HttpRequest.newBuilder(URI(url)).timeout(Duration.ofSeconds(8)).header("Accept", "application/json").header("User-Agent", userAgent).GET().build(),
                HttpResponse.BodyHandlers.ofString(),
            )
            Fetched(r.statusCode(), r.body())
        }.getOrDefault(Fetched(0, null))
    }
}
