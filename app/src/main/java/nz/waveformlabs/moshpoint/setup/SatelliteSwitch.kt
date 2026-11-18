package nz.waveformlabs.moshpoint.setup

import android.content.Context
import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.core.SatelliteRule
import nz.waveformlabs.moshpoint.watch.Entitlements

/**
 * "Use satellite when there's no signal" (Moshpoint+, docs/REMOVE_SAFETY.md, stage 4): the
 * Settings switch. Off until a member turns it on; free users don't see it. What it lets through
 * is core [SatelliteRule]: with it on, a member's crew messages and locations still go when the
 * only network is a satellite one (Android 16, carriers that allow it), in the relay's batch at
 * most every two minutes ([nz.waveformlabs.moshpoint.locate.RelayClient]); with it off, a
 * satellite network counts as no signal at all ([NetState]).
 */
object SatelliteSwitch {
    /** The switch (Compose state). Off until someone turns it on. */
    val on = mutableStateOf(false)

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("satellite_data", Context.MODE_PRIVATE)

    /** At every start, before anything uses the network ([NetState.init] calls it). */
    fun init(c: Context) {
        on.value = prefs(c).getBoolean("on", false)
    }

    fun set(c: Context, value: Boolean) {
        on.value = value
        prefs(c).edit().putBoolean("on", value).apply()
        NetState.refresh()
    }

    /** May anything go over a satellite network? A Moshpoint+ member who switched it on. */
    fun allowed(c: Context): Boolean = SatelliteRule.allowed(on.value, Entitlements.plus(c))
}
