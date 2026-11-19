package nz.waveformlabs.moshpoint.watch

import android.content.Context
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.core.Membership

/**
 * The one Moshpoint+ check (docs/WATCH.md, problem 9).
 *
 * There is no billing yet, and until there is everyone is a member in every store build, whatever
 * is saved (core [Membership], tested there): with nothing to buy, nothing is held back and the
 * watch must not say "Unlock" (Play's Minimum Functionality policy, and any paywall must use Play
 * Billing; docs/WAVE2_PLAY.md, item 10). A test build's debug panel can still save a "no" to show
 * the free screens. Billing plugs in here and nowhere else: set [Membership.BILLING] to true, and
 * when a purchase is confirmed (or lapses) call [set]; the phone and the watch both follow.
 */
object Entitlements {
    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("entitlements", Context.MODE_PRIVATE)

    /** Is this person a Moshpoint+ member? */
    fun plus(c: Context): Boolean {
        val p = prefs(c)
        return Membership.plus(stored = if (p.contains("plus")) p.getBoolean("plus", false) else null, testBuild = BuildConfig.TEST_BUILD)
    }

    /** For billing: record the answer and let the watch know. */
    fun set(c: Context, plus: Boolean) {
        prefs(c).edit().putBoolean("plus", plus).apply()
        WatchSync.publishSoon(c)
    }
}
