package nz.waveformlabs.moshpoint.core

import java.util.Locale

/**
 * "Text my spot" (Moshpoint+, docs/REMOVE_SAFETY.md, stage 3): the text the phone's own texting
 * app opens with. The person picks a mate and presses Send; Moshpoint never sends a text itself.
 *
 * A short line, a maps link, and the plain coordinates, which still make sense with no data (and
 * to a phone texting by satellite). Built the way Need help's text to an emergency contact was
 * (`Safety.helpText` at 75fe2fb): the same Google Maps link, 5 decimals (about a metre), in
 * [Locale.ROOT], so a phone set to German never writes a decimal comma into the link.
 */
object SpotText {
    /** Five decimals of a degree: about 1.1 m at the equator, finer than any phone's fix. */
    fun link(lat: Double, lon: Double): String = "https://maps.google.com/?q=%.5f,%.5f".format(Locale.ROOT, lat, lon)

    /** "-36.84850, 174.76330": readable, and pasteable into any map. */
    fun coordinates(lat: Double, lon: Double): String = "%.5f, %.5f".format(Locale.ROOT, lat, lon)

    /**
     * A fix worth texting: real numbers, on the globe, and not exactly 0, 0 (which is how the
     * app writes "no position" everywhere else).
     */
    fun usable(lat: Double?, lon: Double?): Boolean =
        lat != null && lon != null && lat.isFinite() && lon.isFinite() &&
            lat in -90.0..90.0 && lon in -180.0..180.0 && !(lat == 0.0 && lon == 0.0)

    /**
     * The whole text. [line] opens it ("Here's my spot:"); with no usable fix it's [noFix]
     * alone ("My phone can't tell where I am right now."), said plainly, so the person can still
     * text and say where they are in their own words.
     */
    fun message(line: String, noFix: String, lat: Double?, lon: Double?): String {
        if (!usable(lat, lon)) return noFix
        return "$line\n${link(lat!!, lon!!)}\n${coordinates(lat, lon)}"
    }
}
