package nz.waveformlabs.moshpoint

import android.content.Context
import androidx.compose.runtime.mutableStateMapOf
import nz.waveformlabs.moshpoint.core.SharedLocation
import org.json.JSONObject

/**
 * Where each friend was last seen (from their shared GPS), kept so the map can show
 * "Bevan, 12 km away, 20 min ago" even after they stop sharing, like Snap Map does.
 * Stored on this phone only, and dropped after [KEEP_MS].
 */
object LocationBook {
    data class Seen(
        val lat: Double,
        val lon: Double,
        val timeSec: Long,
        val accuracyM: Int,
        val batteryPct: Int? = null,
        /** Their phone was dying when it sent this. */
        val lastGasp: Boolean = false,
    )

    /** Friend id -> last seen. Compose state, so the map updates live. */
    val seen = mutableStateMapOf<String, Seen>()

    private const val KEEP_MS = 24L * 3600_000
    private var app: Context? = null

    fun init(c: Context) {
        if (app != null) return
        app = c.applicationContext
        val raw = prefs()?.getString("seen", null) ?: return
        runCatching {
            val o = JSONObject(raw)
            val cutoff = (System.currentTimeMillis() - KEEP_MS) / 1000
            for (k in o.keys()) {
                val v = o.getJSONObject(k)
                val s = Seen(
                    v.getDouble("a"), v.getDouble("o"), v.getLong("t"), v.optInt("c", 50),
                    v.optInt("b", -1).takeIf { it >= 0 }, v.optBoolean("g", false),
                )
                if (s.timeSec >= cutoff) seen[k] = s
            }
        }
    }

    /** A fresh shared location for [friendId]; ignored if we already have a newer one. */
    fun update(friendId: String, loc: SharedLocation) {
        val prev = seen[friendId]
        if (prev != null && prev.timeSec >= loc.timeSec) return
        seen[friendId] = Seen(loc.lat, loc.lon, loc.timeSec, loc.accuracyM, loc.batteryPct, loc.lastGasp)
        save()
    }

    fun forget(friendId: String) {
        if (seen.remove(friendId) != null) save()
    }

    private var lastSave = 0L

    private fun save() {
        val now = System.currentTimeMillis()
        if (now - lastSave < 10_000) return // a few times a minute at most
        lastSave = now
        val o = JSONObject()
        for ((k, s) in seen) {
            o.put(k, JSONObject().put("a", s.lat).put("o", s.lon).put("t", s.timeSec).put("c", s.accuracyM).put("b", s.batteryPct ?: -1).put("g", s.lastGasp))
        }
        prefs()?.edit()?.putString("seen", o.toString())?.apply()
    }

    private fun prefs() = app?.getSharedPreferences("location_book", Context.MODE_PRIVATE)
}
