package nz.waveformlabs.moshpoint

import android.content.Context
import android.telephony.TelephonyManager
import java.util.Locale

/**
 * The emergency number where you are right now, for "Need help → Call …".
 *
 * Uses the mobile network's country first (right when you're travelling to a festival abroad),
 * then the SIM's, then the phone's region. Where a country splits services (Japan: police 110,
 * ambulance 119), both are offered. 112 is the fallback: it works on most mobile networks
 * worldwide, even where the local number is different.
 */
object EmergencyNumbers {
    enum class Kind { ALL, POLICE, AMBULANCE }

    data class Number(val digits: String, val kind: Kind)

    private fun all(n: String) = listOf(Number(n, Kind.ALL))
    private fun split(police: String, ambulance: String) = listOf(Number(police, Kind.POLICE), Number(ambulance, Kind.AMBULANCE))

    /** ISO country -> numbers to offer (most useful first). Unlisted countries get 112. */
    private val byCountry: Map<String, List<Number>> = buildMap {
        // One number for everything.
        listOf("US", "CA", "MX", "PR", "GU", "VI", "AR", "PY", "UY", "SV", "GT", "HN", "PA", "CR", "DO", "JM", "TT", "BB", "BS", "PH", "SA", "KW", "JO").forEach { put(it, all("911")) }
        listOf("GB", "HK", "MO", "MY", "BH", "QA", "AE", "BW", "ZW", "GH", "MU", "SZ", "KE", "UG", "TZ", "BD", "PL").forEach { put(it, all(if (it == "PL") "112" else "999")) }
        put("IE", all("112"))
        put("AU", all("000"))
        put("NZ", all("111"))
        put("SG", split("999", "995"))
        put("IN", all("112"))
        put("ID", all("112"))
        put("TR", all("112"))
        put("RU", all("112"))
        put("UA", all("112"))
        put("NG", all("112"))
        put("ZA", listOf(Number("112", Kind.ALL), Number("10111", Kind.POLICE), Number("10177", Kind.AMBULANCE)))
        // Separate police and ambulance numbers.
        put("JP", split("110", "119"))
        put("KR", split("112", "119"))
        put("TW", split("110", "119"))
        put("CN", split("110", "120"))
        put("TH", split("191", "1669"))
        put("VN", split("113", "115"))
        put("BR", split("190", "192"))
        put("CL", split("133", "131"))
        put("CO", all("123"))
        put("PE", split("105", "106"))
        put("EG", split("122", "123"))
        put("IL", split("100", "101"))
        put("MA", split("19", "15"))
        put("LK", split("119", "1990"))
        put("PK", split("15", "1122"))
        put("NP", split("100", "102"))
        put("IR", split("110", "115"))
    }

    /** Where we are: the network's country, else the SIM's, else the phone's region. */
    fun country(c: Context): String {
        val tm = c.applicationContext.getSystemService(TelephonyManager::class.java)
        val fromNetwork = runCatching { tm?.networkCountryIso }.getOrNull()
        val fromSim = runCatching { tm?.simCountryIso }.getOrNull()
        return listOf(fromNetwork, fromSim, Locale.getDefault().country)
            .firstOrNull { !it.isNullOrBlank() && it.length == 2 }?.uppercase(Locale.ROOT) ?: ""
    }

    /** The numbers to offer in [country] (EU and anywhere unlisted: 112). */
    fun forCountry(country: String): List<Number> = byCountry[country.uppercase(Locale.ROOT)] ?: all("112")

    fun here(c: Context): List<Number> = forCountry(country(c))
}
