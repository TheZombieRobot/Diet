package nz.waveformlabs.moshpoint

import android.content.Context
import android.content.Intent
import android.net.Uri

/**
 * Help that reaches beyond the crew: a text to your emergency contact with where you are
 * (it goes as a normal SMS, so it works without data), and a one-tap 111 call.
 * Nothing is sent without you pressing Send in your messages app.
 */
object Safety {
    /** New Zealand's emergency number. */
    const val EMERGENCY_NUMBER = "111"

    data class Contact(val name: String, val number: String)

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("safety", Context.MODE_PRIVATE)

    fun contact(c: Context): Contact? {
        val p = prefs(c)
        val n = p.getString("number", "").orEmpty()
        return if (n.isBlank()) null else Contact(p.getString("name", "").orEmpty().ifBlank { "Emergency contact" }, n)
    }

    fun setContact(c: Context, name: String, number: String) {
        val clean = number.filter { it.isDigit() || it == '+' }
        prefs(c).edit().putString("name", name.trim()).putString("number", clean).apply()
    }

    fun clearContact(c: Context) = prefs(c).edit().clear().apply()

    /** "I need help. I'm here: maps link" (or without the link if there's no fix). */
    fun helpText(lat: Double?, lon: Double?): String {
        if (lat == null || lon == null) return Txt.s(R.string.crew_help_sms)
        val link = "https://maps.google.com/?q=%.5f,%.5f".format(java.util.Locale.ROOT, lat, lon)
        return Txt.s(R.string.crew_help_sms_where, link)
    }

    /** Opens the messages app with the help text ready; you press Send. */
    fun textContact(c: Context): Boolean {
        val who = contact(c) ?: return false
        val loc = CrewStatus.myLocation(c)
        val i = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:${who.number}"))
            .putExtra("sms_body", helpText(loc?.latitude, loc?.longitude))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        return runCatching { c.startActivity(i) }.isSuccess
    }

    /** Opens the dialler with 111 ready (no call permission needed; you press Call). */
    fun callEmergency(c: Context) {
        runCatching {
            c.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$EMERGENCY_NUMBER")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }
}
