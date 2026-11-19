package nz.waveformlabs.moshpoint.setup

import android.content.Context
import org.maplibre.android.MapLibre

/**
 * MapLibre fetches map tiles, and saves venue maps, over the network by itself. On a satellite
 * network (docs/REMOVE_SAFETY.md, stage 4) it's told there is none: the map draws from what's
 * saved on the phone and downloads nothing until a normal network is back. On any other network
 * MapLibre is left alone, as before.
 */
object MapNet {
    /** MapLibre was told there's no network (we're on a satellite one). Main thread only. */
    private var toldOffline = false

    /** Instead of `MapLibre.getInstance`: MapLibre, told if the network is a satellite one. Main thread. */
    fun init(c: Context): MapLibre = MapLibre.getInstance(c).also { apply() }

    /** [NetState.satellite] changed, or MapLibre just started (main thread). */
    fun apply() {
        val satellite = NetState.satellite
        if (satellite == toldOffline) return
        runCatching {
            if (!MapLibre.hasInstance()) return
            // false: no network at all for MapLibre; null: back to Android's own answer.
            MapLibre.setConnected(if (satellite) false else null)
            toldOffline = satellite
        }
    }
}
