package nz.waveformlabs.moshpoint.wear

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import nz.waveformlabs.moshpoint.core.watch.CrewGlance

/**
 * The tile and the watch-face complication (docs/WATCH.md, problem 6). Both are drawn from
 * the last crew status the phone pushed, and redrawn only when a new one arrives: no timers,
 * no polling. Each also carries its own expiry, so an old status stops claiming anyone is
 * live without anything having to wake up and check.
 */
object Glance {
    /** The phone pushed a new status: ask both to redraw. */
    fun requestRedraw(context: Context) {
        val c = context.applicationContext
        runCatching { TileService.getUpdater(c).requestUpdate(CrewTileService::class.java) }
        // Watch faces ask to be updated no more than about once every five minutes, so the
        // complication only moves when what it says has changed and that long has passed.
        // (It is allowed to be a few minutes behind; the tile and the app are not.)
        val prefs = c.getSharedPreferences("glance", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val says = line(c, CrewGlance.of(CrewStore.state.value, now / 1000))
        if (says == prefs.getString("said", null) || now - prefs.getLong("at", 0L) < COMPLICATION_EVERY_MS) return
        prefs.edit().putString("said", says).putLong("at", now).apply()
        runCatching {
            ComplicationDataSourceUpdateRequester.create(c, ComponentName(c, CrewComplicationService::class.java)).requestUpdateAll()
        }
    }

    /** One line that says it all: "Sam · 40 m", "4 of 5 live", or what's in the way. */
    fun line(context: Context, glance: CrewGlance): String = when (glance) {
        CrewGlance.NoPhone -> context.getString(R.string.crew_no_phone)
        CrewGlance.Locked -> context.getString(R.string.plus_title)
        CrewGlance.NoCrew -> context.getString(R.string.crew_empty)
        is CrewGlance.Stale -> context.getString(R.string.crew_stale)
        is CrewGlance.Nearest -> context.getString(R.string.glance_nearest, glance.name, distanceText(context.resources, glance.distanceM))
        is CrewGlance.LiveCount -> context.getString(R.string.glance_live_count, glance.live, glance.total)
    }

    const val COMPLICATION_EVERY_MS = 5 * 60_000L

    /** How long a complication may keep showing one status before it falls back to "out of reach". */
    const val COMPLICATION_KEEPS_SEC = 10 * 60L
}
