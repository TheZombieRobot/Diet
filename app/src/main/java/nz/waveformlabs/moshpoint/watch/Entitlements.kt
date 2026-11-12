package nz.waveformlabs.moshpoint.watch

import android.content.Context
import nz.waveformlabs.moshpoint.BuildConfig

/**
 * The one Moshpoint+ check (docs/WATCH.md, problem 9).
 *
 * There is no billing yet. Until there is, the answer is a saved value that defaults to "yes"
 * in test builds and "no" in release builds. Billing plugs in here and nowhere else: when a
 * purchase is confirmed (or lapses) it calls [set], and the phone and the watch both follow.
 *
 * "Need help" from the wrist never asks this: see [WatchPings].
 */
object Entitlements {
    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("entitlements", Context.MODE_PRIVATE)

    /** Is this person a Moshpoint+ member? */
    fun plus(c: Context): Boolean = prefs(c).getBoolean("plus", BuildConfig.TEST_BUILD)

    /** For billing: record the answer and let the watch know. */
    fun set(c: Context, plus: Boolean) {
        prefs(c).edit().putBoolean("plus", plus).apply()
        WatchSync.publishSoon(c)
    }
}
