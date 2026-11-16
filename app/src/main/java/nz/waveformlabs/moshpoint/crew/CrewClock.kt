package nz.waveformlabs.moshpoint.crew

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import nz.waveformlabs.moshpoint.core.ClockCheck

/**
 * "Now", for deciding a crew is over: the phone's clock, unless it has just jumped forward
 * (core [ClockCheck]). A clock set days ahead by mistake used to end the crew on the spot and
 * delete its chat and keys (reliability P2).
 */
object CrewClock {
    fun now(c: Context): Long {
        val app = c.applicationContext
        val p = app.getSharedPreferences("clock", Context.MODE_PRIVATE)
        val boot = runCatching { Settings.Global.getInt(app.contentResolver, Settings.Global.BOOT_COUNT) }.getOrDefault(-1)
        val r = ClockCheck.check(ClockCheck.Anchor.parse(p.getString("anchor", null)), System.currentTimeMillis(), SystemClock.elapsedRealtime(), boot)
        p.edit().putString("anchor", r.anchor.save()).apply()
        return r.trustedNowMs
    }
}
