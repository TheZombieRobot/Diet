package nz.waveformlabs.moshpoint

import android.content.Context
import androidx.compose.runtime.mutableStateListOf
import org.json.JSONArray
import org.json.JSONObject

/**
 * Your own saved spots ("tent", "car", "the good toilets"): kept on this phone only, so
 * they work with no signal. Shared meet-up pins for the crew live in GroupSync.rally.
 */
object Spots {
    data class Spot(val id: String, val name: String, val lat: Double, val lon: Double, val timeSec: Long)

    val spots = mutableStateListOf<Spot>()
    private var app: Context? = null

    fun init(c: Context) {
        if (app != null) return
        app = c.applicationContext
        val raw = prefs()?.getString("spots", null) ?: return
        runCatching {
            val a = JSONArray(raw)
            for (i in 0 until a.length()) {
                val o = a.getJSONObject(i)
                spots += Spot(o.getString("id"), o.getString("n"), o.getDouble("a"), o.getDouble("o"), o.getLong("t"))
            }
        }
    }

    fun add(name: String, lat: Double, lon: Double) {
        spots += Spot(java.util.UUID.randomUUID().toString(), name.trim().ifBlank { Txt.s(R.string.main_my_spot) }.take(30), lat, lon, System.currentTimeMillis() / 1000)
        save()
    }

    fun remove(id: String) {
        spots.removeAll { it.id == id }
        save()
    }

    private fun save() {
        val a = JSONArray()
        spots.forEach { a.put(JSONObject().put("id", it.id).put("n", it.name).put("a", it.lat).put("o", it.lon).put("t", it.timeSec)) }
        prefs()?.edit()?.putString("spots", a.toString())?.apply()
    }

    private fun prefs() = app?.getSharedPreferences("spots", Context.MODE_PRIVATE)
}
