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

    fun isVisible(c: Context) = prefs(c).getBoolean("visible", false)
    fun setVisible(c: Context, v: Boolean) = prefs(c).edit().putBoolean("visible", v).apply()

    /** "Leave visibility always on": restart after reboot if it was on. */
    fun alwaysOn(c: Context) = prefs(c).getBoolean("always_on", false)
    fun setAlwaysOn(c: Context, v: Boolean) = prefs(c).edit().putBoolean("always_on", v).apply()

    /** Your display name, suggested to mates when they scan your QR. */
    fun myName(c: Context): String = prefs(c).getString("name", "") ?: ""
    fun setMyName(c: Context, v: String) = prefs(c).edit().putString("name", v.trim()).apply()

    fun mySecret(c: Context): ByteArray {
        val p = prefs(c)
        p.getString("secret", null)?.let { return Base64.decode(it, Base64.NO_WRAP) }
        val s = ByteArray(32).also { SecureRandom().nextBytes(it) }
        p.edit().putString("secret", Base64.encodeToString(s, Base64.NO_WRAP)).apply()
        return s
    }
}
