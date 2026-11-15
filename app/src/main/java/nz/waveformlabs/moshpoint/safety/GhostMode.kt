package nz.waveformlabs.moshpoint

import android.content.Context
import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.service.VisibilityPrefs

/**
 * Ghost mode (Snap Map / Zenly style): you stay findable by Bluetooth up close, but your
 * spot isn't shared on anyone's map. Optional timer, e.g. "for 1 hour".
 */
object GhostMode {
    val on = mutableStateOf(false)
    /** When a timed ghost ends (wall clock ms), or 0 for "until I turn it off". */
    val until = mutableStateOf(0L)

    fun init(c: Context) {
        val p = c.getSharedPreferences("ghost", Context.MODE_PRIVATE)
        val end = p.getLong("until", 0L)
        if (VisibilityPrefs.ghost(c) && end != 0L && System.currentTimeMillis() > end) set(c, false)
        on.value = VisibilityPrefs.ghost(c)
        until.value = if (on.value) end else 0L
    }

    /** [forMs] null = until turned off. */
    fun set(c: Context, enabled: Boolean, forMs: Long? = null) {
        VisibilityPrefs.setGhost(c, enabled)
        val end = if (enabled && forMs != null) System.currentTimeMillis() + forMs else 0L
        c.getSharedPreferences("ghost", Context.MODE_PRIVATE).edit().putLong("until", end).apply()
        on.value = enabled
        until.value = end
        DebugStatus.log(if (enabled) "Ghost mode on" else "Ghost mode off")
    }

    /** Checked now and then: a timed ghost switches itself off. */
    fun expireIfDue(c: Context) {
        val end = until.value
        if (on.value && end != 0L && System.currentTimeMillis() > end) set(c, false)
    }
}
