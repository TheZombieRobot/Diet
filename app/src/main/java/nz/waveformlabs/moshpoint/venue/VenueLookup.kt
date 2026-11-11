package nz.waveformlabs.moshpoint.venue

import android.content.Context
import android.os.SystemClock
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.VenueQuery
import nz.waveformlabs.moshpoint.locate.RelayClient
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Where is a venue that was typed in by hand? Asked once, when the crew is made, so the
 * position can travel in the invite (docs/VENUE_MAP.md, "Venue lookup").
 *
 * The answer comes from OpenStreetMap's Nominatim, used within its usage policy:
 *  - through our own relay server when there is one (it queues everyone's requests at one a
 *    second, caches, and can be pointed at another service without an app update);
 *  - otherwise straight from the phone: one request per typed venue, never while typing, at
 *    least 1.1 s apart, identified as Moshpoint, answers kept for 30 days, and never again
 *    once Nominatim turns us away (403 or 429).
 */
object VenueLookup {
    sealed interface Result {
        data class Found(val at: LatLon, val name: String) : Result

        /** Asked and there's no such place: don't ask again for a day. */
        data object NotFound : Result

        /** Couldn't ask (no internet, service down): worth trying again later. */
        data object Failed : Result
    }

    private const val NOMINATIM = "https://nominatim.openstreetmap.org/search"
    private const val FOUND_KEEP_MS = 30L * 24 * 3600 * 1000
    private const val NOT_FOUND_KEEP_MS = 24L * 3600 * 1000
    private const val MIN_GAP_MS = 1_100L

    private val oneAtATime = Mutex()
    private var lastAskedAt = 0L

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("venue_lookup", Context.MODE_PRIVATE)

    /** [near]: roughly where the phone is, to prefer the nearby "Town Hall" over the famous one. */
    suspend fun find(c: Context, text: String, near: LatLon?): Result {
        if (!VenueQuery.usable(text)) return Result.NotFound
        val key = VenueQuery.cacheKey(text)
        val p = prefs(c)
        val now = System.currentTimeMillis()
        p.getString("q:$key", null)?.let { saved ->
            runCatching {
                val o = JSONObject(saved)
                val age = now - o.getLong("t")
                if (o.has("lat") && age < FOUND_KEEP_MS) return Result.Found(LatLon(o.getDouble("lat"), o.getDouble("lon")), o.optString("name"))
                if (!o.has("lat") && age < NOT_FOUND_KEEP_MS) return Result.NotFound
            }
        }
        val result = oneAtATime.withLock {
            // One request a second at the very most, whoever is asking.
            val wait = MIN_GAP_MS - (SystemClock.elapsedRealtime() - lastAskedAt)
            if (lastAskedAt != 0L && wait > 0) delay(wait)
            lastAskedAt = SystemClock.elapsedRealtime()
            withContext(Dispatchers.IO) {
                if (RelayClient.ownServer) viaServer(VenueQuery.normalise(text), near) else direct(c, VenueQuery.normalise(text), near)
            }
        }
        when (result) {
            is Result.Found -> p.edit().putString(
                "q:$key", JSONObject().put("t", now).put("lat", result.at.lat).put("lon", result.at.lon).put("name", result.name).toString(),
            ).apply()
            Result.NotFound -> p.edit().putString("q:$key", JSONObject().put("t", now).toString()).apply()
            Result.Failed -> Unit
        }
        DebugStatus.log("Venue lookup \"$text\": " + when (result) {
            is Result.Found -> "found (%.4f, %.4f)".format(result.at.lat, result.at.lon)
            Result.NotFound -> "not found"
            Result.Failed -> "couldn't ask"
        })
        return result
    }

    /** Our relay asks for us: `GET /v1/venue?q=...&box=left,top,right,bottom` -> `{"lat":..,"lon":..,"name":".."}`, or 404. */
    private fun viaServer(q: String, near: LatLon?): Result = runCatching {
        val base = RelayClient.shareableServer
        val box = VenueQuery.viewbox(near)?.let { "&box=" + URLEncoder.encode(it, "UTF-8") }.orEmpty()
        val c = URL("$base/v1/venue?q=${URLEncoder.encode(q, "UTF-8")}$box").openConnection() as HttpURLConnection
        c.connectTimeout = 5_000
        c.readTimeout = 8_000
        val code = c.responseCode
        if (code == 404) return@runCatching Result.NotFound
        if (code != 200) return@runCatching Result.Failed
        val o = JSONObject(c.inputStream.bufferedReader().use { it.readText() })
        c.disconnect()
        Result.Found(LatLon(o.getDouble("lat"), o.getDouble("lon")), o.optString("name"))
    }.getOrDefault(Result.Failed)

    private fun direct(context: Context, q: String, near: LatLon?): Result {
        val p = prefs(context)
        if (p.getBoolean("turned_away", false)) return Result.Failed
        return runCatching {
            val box = VenueQuery.viewbox(near)?.let { "&viewbox=" + URLEncoder.encode(it, "UTF-8") + "&bounded=0" }.orEmpty()
            val c = URL("$NOMINATIM?format=jsonv2&limit=1&q=${URLEncoder.encode(q, "UTF-8")}$box").openConnection() as HttpURLConnection
            c.connectTimeout = 5_000
            c.readTimeout = 8_000
            // Nominatim asks every app to say who it is.
            c.setRequestProperty("User-Agent", "Moshpoint/${BuildConfig.VERSION_NAME} (${BuildConfig.APPLICATION_ID})")
            val code = c.responseCode
            if (code == 403 || code == 429) {
                // That is how Nominatim turns an app away. Stop for good (until a new version).
                p.edit().putBoolean("turned_away", true).apply()
                DebugStatus.log("Venue lookup: Nominatim said no ($code); not asking it again")
                return@runCatching Result.Failed
            }
            if (code != 200) return@runCatching Result.Failed
            val arr = JSONArray(c.inputStream.bufferedReader().use { it.readText() })
            c.disconnect()
            parse(arr)
        }.getOrDefault(Result.Failed)
    }

    /** Nominatim's answer: a list, best match first, with `lat` and `lon` as text. */
    internal fun parse(arr: JSONArray): Result {
        val o = arr.optJSONObject(0) ?: return Result.NotFound
        val lat = o.optString("lat").toDoubleOrNull() ?: return Result.NotFound
        val lon = o.optString("lon").toDoubleOrNull() ?: return Result.NotFound
        if (lat !in -90.0..90.0 || lon !in -180.0..180.0) return Result.NotFound
        return Result.Found(LatLon(lat, lon), o.optString("display_name").take(120))
    }
}
