package nz.waveformlabs.moshpoint

import android.content.Context
import nz.waveformlabs.moshpoint.ui.distanceLabel

/**
 * Your night in numbers, for the recap card when you end the night: how far you walked,
 * how many times you found a mate, moments and pings sent. Kept on this phone only.
 */
object NightStats {
    data class Stats(val startedAtMs: Long, val metres: Double, val finds: Int, val moments: Int, val pings: Int)

    private fun p(c: Context) = c.applicationContext.getSharedPreferences("night", Context.MODE_PRIVATE)

    fun get(c: Context): Stats = p(c).let {
        Stats(it.getLong("start", 0L), it.getFloat("metres", 0f).toDouble(), it.getInt("finds", 0), it.getInt("moments", 0), it.getInt("pings", 0))
    }

    /** Called when a crew starts or is joined (if the night hasn't started yet). */
    fun startIfNeeded(c: Context) {
        if (p(c).getLong("start", 0L) == 0L) p(c).edit().putLong("start", System.currentTimeMillis()).apply()
    }

    fun addMetres(c: Context, m: Double) {
        if (m <= 0 || p(c).getLong("start", 0L) == 0L) return
        p(c).edit().putFloat("metres", (p(c).getFloat("metres", 0f) + m).toFloat()).apply()
    }

    fun found(c: Context) = bump(c, "finds")
    fun moment(c: Context) = bump(c, "moments")
    fun ping(c: Context) = bump(c, "pings")

    private fun bump(c: Context, k: String) {
        startIfNeeded(c)
        p(c).edit().putInt(k, p(c).getInt(k, 0) + 1).apply()
    }

    fun reset(c: Context) = p(c).edit().clear().apply()

    /** "4.2 km walked · found mates 6 times · 3 moments · 5 h 12 min out" */
    fun summary(s: Stats, nowMs: Long): String {
        val parts = mutableListOf<String>()
        if (s.metres >= 100) parts += Txt.s(R.string.crew_stats_walked, distanceLabel(s.metres))
        if (s.finds > 0) parts += Txt.p(R.plurals.crew_stats_finds, s.finds)
        if (s.moments > 0) parts += Txt.p(R.plurals.crew_stats_moments, s.moments)
        if (s.pings > 0) parts += Txt.p(R.plurals.crew_stats_pings, s.pings)
        if (s.startedAtMs > 0) {
            val mins = ((nowMs - s.startedAtMs) / 60_000).toInt()
            parts += if (mins >= 60) Txt.s(R.string.crew_stats_out_hours, mins / 60, mins % 60) else Txt.p(R.plurals.crew_stats_out_mins, mins)
        }
        return parts.joinToString(" · ").ifBlank { Txt.s(R.string.crew_stats_quiet) }
    }
}
