package nz.waveformlabs.moshpoint.service

import android.content.Context
import android.util.Base64
import java.security.SecureRandom

/**
 * Visibility settings. Visibility is only ever on because the user turned it on.
 *
 * TODO: move [mySecret] into the Android Keystore / EncryptedSharedPreferences, and
 *  support per-group secrets so leaving a gig group revokes that group's access.
 */
object VisibilityPrefs {
    private const val FILE = "visibility"

    private fun prefs(c: Context) = c.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    /**
     * Live is meant to be on: you switched it on, or you're in a crew tonight. Whether it really
     * is running is [VisibilityService.isRunning]; [LiveControl] keeps the two in step.
     */
    fun isVisible(c: Context) = prefs(c).getBoolean("visible", false)
    fun setVisible(c: Context, v: Boolean) = prefs(c).edit().putBoolean("visible", v).putBoolean("user_hid", !v).apply()

    /** Not visible, but not the user's choice (the night ended, or Android refused): fine to go live again later. */
    fun markStopped(c: Context) = prefs(c).edit().putBoolean("visible", false).apply()

    /** This live session: when it began and for which crew (core LiveSession), or null if there's none saved. */
    fun session(c: Context): nz.waveformlabs.moshpoint.core.LiveSession? =
        nz.waveformlabs.moshpoint.core.LiveSession.parse(prefs(c).getString("live_session", null))

    fun setSession(c: Context, s: nz.waveformlabs.moshpoint.core.LiveSession) {
        val text = s.save()
        if (prefs(c).getString("live_session", null) != text) prefs(c).edit().putString("live_session", text).apply()
    }

    /** The crew whose session Live itself ended after about 12 hours ("Still at the gig?"): it doesn't go live by itself again. */
    fun cappedCrew(c: Context): String? = prefs(c).getString("capped_crew", null)
    fun setCappedCrew(c: Context, crewId: String?) = prefs(c).edit().putString("capped_crew", crewId).apply()

    /** The user chose to hide (switch, notification, tile): never go live for them automatically. */
    fun userHid(c: Context) = prefs(c).getBoolean("user_hid", false)

    /** "Leave visibility always on": restart after reboot if it was on. */
    fun alwaysOn(c: Context) = prefs(c).getBoolean("always_on", false)
    fun setAlwaysOn(c: Context, v: Boolean) = prefs(c).edit().putBoolean("always_on", v).apply()

    /** Your display name, suggested to mates when they scan your QR. */
    fun myName(c: Context): String = prefs(c).getString("name", "") ?: ""
    fun setMyName(c: Context, v: String) = prefs(c).edit().putString("name", v.trim()).apply()

    /** Ghost mode: stay findable by Bluetooth up close, but don't put your spot on anyone's map. */
    fun ghost(c: Context) = prefs(c).getBoolean("ghost", false)
    fun setGhost(c: Context, v: Boolean) = prefs(c).edit().putBoolean("ghost", v).apply()

    /** First-run welcome finished. */
    fun onboarded(c: Context) = prefs(c).getBoolean("onboarded", false)
    fun setOnboarded(c: Context) = prefs(c).edit().putBoolean("onboarded", true).apply()

    fun mySecret(c: Context): ByteArray {
        val p = prefs(c)
        p.getString("secret", null)?.let { return Base64.decode(it, Base64.NO_WRAP) }
        val s = ByteArray(32).also { SecureRandom().nextBytes(it) }
        p.edit().putString("secret", Base64.encodeToString(s, Base64.NO_WRAP)).apply()
        return s
    }
}
