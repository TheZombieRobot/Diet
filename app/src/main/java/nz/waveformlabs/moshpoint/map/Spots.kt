package nz.waveformlabs.moshpoint.map

import android.content.Context
import androidx.compose.runtime.mutableStateListOf
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.SpotLink
import org.json.JSONArray
import org.json.JSONObject

/**
 * Your own saved spots ("tent", "car", "the good toilets"): kept on this phone only, so
 * they work with no signal. Shared meet-up pins for the crew live in GroupSync.rally.
 *
 * Spots mates texted you, opened from their link (docs/SPOT_LINKS.md), are kept here too, as
 * saved places: [Spot.texted], with the sender's name (or none).
 */
object Spots {
    /** [texted]: a spot a mate texted; then [name] is theirs, blank when the link had none ([label]). */
    data class Spot(val id: String, val name: String, val lat: Double, val lon: Double, val timeSec: Long, val texted: Boolean = false)

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
                spots += Spot(o.getString("id"), o.getString("n"), o.getDouble("a"), o.getDouble("o"), o.getLong("t"), o.optBoolean("x", false))
            }
        }
    }

    fun add(name: String, lat: Double, lon: Double) {
        spots += Spot(java.util.UUID.randomUUID().toString(), name.trim().ifBlank { Txt.s(R.string.main_my_spot) }.take(30), lat, lon, System.currentTimeMillis() / 1000)
        save()
    }

    /**
     * A spot a mate texted, opened from its link: kept as a saved place and returned. The link
     * was checked already (core SpotLink.parse). The same spot opened again is kept once, as the
     * newest, and only the newest SpotLink.MAX_KEPT texted spots stay (core SpotLink.keep), so
     * links can't fill the phone. Nothing else changes.
     */
    fun addTexted(link: SpotLink.Spot): Spot {
        val opened = Spot(java.util.UUID.randomUUID().toString(), link.name.orEmpty(), link.lat, link.lon, System.currentTimeMillis() / 1000, texted = true)
        val kept = SpotLink.keep(spots.filter { it.texted }, opened) { SpotLink.Spot(it.lat, it.lon, it.name.ifBlank { null }) }
        spots.removeAll { it.texted && it !in kept }
        spots += opened
        save()
        return opened
    }

    /** What a spot is called on the map: its name, or for a texted one with none, "Texted spot". */
    fun label(s: Spot): String = if (s.texted) s.name.ifBlank { Txt.s(R.string.spot_link_texted) } else s.name

    fun remove(id: String) {
        spots.removeAll { it.id == id }
        save()
    }

    private fun save() {
        val a = JSONArray()
        spots.forEach {
            val o = JSONObject().put("id", it.id).put("n", it.name).put("a", it.lat).put("o", it.lon).put("t", it.timeSec)
            if (it.texted) o.put("x", true) // only on texted ones: your own spots are saved exactly as before
            a.put(o)
        }
        prefs()?.edit()?.putString("spots", a.toString())?.apply()
    }

    private fun prefs() = app?.getSharedPreferences("spots", Context.MODE_PRIVATE)
}
