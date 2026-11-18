package nz.waveformlabs.moshpoint.watch

import android.content.Context
import nz.waveformlabs.moshpoint.BuildConfig

/**
 * The one Moshpoint+ check (docs/WATCH.md, problem 9).
 *
 * There is no billing yet. Until there is, the answer is a saved value that defaults to "yes" in
 * every build: with nothing to buy, the watch must not say "Unlock" (Play's Minimum
 * Functionality policy, and any paywall must use Play Billing; docs/WAVE2_PLAY.md, item 10).
 * Billing plugs in here and nowhere else: set [BILLING] to true, and when a purchase is confirmed
 * (or lapses) call [set]; the phone and the watch both follow.
 */
object Entitlements {
    /** Moshpoint+ can be bought (Play Billing is in). Until then everyone has it. */
    private const val BILLING = false

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("entitlements", Context.MODE_PRIVATE)

    /** Is this person a Moshpoint+ member? */
    fun plus(c: Context): Boolean = prefs(c).getBoolean("plus", BuildConfig.TEST_BUILD || !BILLING)

    /** For billing: record the answer and let the watch know. */
    fun set(c: Context, plus: Boolean) {
        prefs(c).edit().putBoolean("plus", plus).apply()
        WatchSync.publishSoon(c)
    }
}
