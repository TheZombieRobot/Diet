package nz.waveformlabs.moshpoint.core

/**
 * One row of a field recording (CSV). Fixed columns so a spreadsheet or a script can
 * read any recording:
 *
 * `t_ms,event,friend,method,distance_m,bearing_deg,rssi_dbm,heading_deg,lat,lon,accuracy_m,confidence,note`
 */
object RecordLine {
    const val HEADER = "t_ms,event,friend,method,distance_m,bearing_deg,rssi_dbm,heading_deg,lat,lon,accuracy_m,confidence,note"

    fun of(
        tMs: Long,
        event: String,
        friend: String? = null,
        method: String? = null,
        distanceM: Double? = null,
        bearingDeg: Double? = null,
        rssiDbm: Int? = null,
        headingDeg: Double? = null,
        lat: Double? = null,
        lon: Double? = null,
        accuracyM: Double? = null,
        confidence: Double? = null,
        note: String? = null,
    ): String = listOf(
        tMs.toString(), event, friend, method,
        distanceM?.f(2), bearingDeg?.f(1), rssiDbm?.toString(), headingDeg?.f(1),
        lat?.f(7), lon?.f(7), accuracyM?.f(1), confidence?.f(3), note,
    ).joinToString(",") { csv(it) }

    private fun Double.f(decimals: Int) = "%.${decimals}f".format(java.util.Locale.ROOT, this)

    /** Quote fields containing commas, quotes or newlines. */
    fun csv(v: String?): String {
        if (v == null) return ""
        if (v.none { it == ',' || it == '"' || it == '\n' || it == '\r' }) return v
        return "\"" + v.replace("\"", "\"\"") + "\""
    }
}
