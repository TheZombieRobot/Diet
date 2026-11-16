package nz.waveformlabs.moshpoint.server

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Where a show is, for "Coming up near you" (docs/DISCOVER_SERVER.md, "Regions"). The phone
 * never sends its location: it sends its country and, at most, its region.
 *
 * - **New Zealand:** the North or South Island ([nzIsland]).
 * - **Small countries** ([SMALL]): no regions. "Near" is the whole country plus shows just over
 *   the border, within [NEAR_KM] of the country's middle.
 * - **Everywhere else:** the source's state or region: a code where it gives one ("CA", "NSW"),
 *   else its name. A country whose sources give neither has only "whole country".
 * - **Worth travelling for:** big shows abroad within [TRAVEL_KM] (about 3–4 hours' flight).
 */
object Regions {
    const val NORTH = "north"
    const val SOUTH = "south"

    /** Near enough for an evening out from a small country: a couple of hours by road or rail. */
    const val NEAR_KM = 250.0

    /** About 3–4 hours' flight: a jet covers ~800 km an hour, plus getting up and down. */
    const val TRAVEL_KM = 3_000.0

    data class Region(val id: String, val name: String) {
        companion object {
            val NONE = Region("", "")
        }
    }

    /**
     * New Zealand by island. Cook Strait runs from north-west to south-east, so a plain line of
     * latitude doesn't work: Nelson (41.27°S) is further north than Wellington (41.29°S). The
     * line runs from 40.0°S 172.0°E (west of Farewell Spit) to 42.0°S 175.6°E (south-east of
     * Cape Palliser); south-west of it is the South Island. (The Chatham Islands count as north.)
     */
    fun nzIsland(lat: Double, lon: Double): String {
        val east = if (lon < 0) lon + 360 else lon
        val lineLat = -40.0 - (east - 172.0) * (2.0 / 3.6)
        return if (lat < lineLat) SOUTH else NORTH
    }

    // New Zealand's regions by island, for a venue without coordinates or a phone that sends its
    // region's name (Android's adminArea).
    private val NZ_NORTH = setOf(
        "north", "north island", "te ika a maui", "northland", "auckland", "waikato", "bay of plenty", "gisborne",
        "hawke s bay", "hawkes bay", "taranaki", "manawatu whanganui", "manawatu wanganui", "wellington",
    )
    private val NZ_SOUTH = setOf("south", "south island", "te waipounamu", "tasman", "nelson", "marlborough", "west coast", "canterbury", "otago", "southland")

    private fun nzByName(s: String?): String? = when (Fold.text(s.orEmpty())) {
        in NZ_NORTH -> NORTH
        in NZ_SOUTH -> SOUTH
        else -> null
    }

    /** Countries small enough that "near you" is the whole country plus what's just over the border. */
    val SMALL = setOf(
        "AD", "AE", "AT", "BE", "BH", "CH", "CY", "CZ", "DK", "EE", "HK", "HR", "HU", "IE", "IL", "IS", "KW", "LB", "LI",
        "LT", "LU", "LV", "MC", "ME", "MK", "MO", "MT", "NL", "PT", "QA", "SG", "SI", "SK", "SM",
    )

    /** The region a venue is in, from its coordinates (New Zealand) or the source's state or region. */
    fun of(country: String, lat: Double?, lon: Double?, code: String?, name: String?): Region {
        if (country == "NZ") {
            val island = if (lat != null && lon != null) nzIsland(lat, lon) else nzByName(name) ?: nzByName(code) ?: return Region.NONE
            return Region(island, if (island == NORTH) "North Island" else "South Island")
        }
        if (country in SMALL) return Region.NONE
        val c = code?.trim().orEmpty()
        val n = name?.trim().orEmpty()
        if (c.length in 1..3 && c.all { it.isLetterOrDigit() }) return Region(c.uppercase(), n.ifBlank { c.uppercase() })
        if (n.length in 1..3 && n.all { it.isLetterOrDigit() }) return Region(n.uppercase(), n.uppercase())
        if (n.isNotBlank()) return Region(Fold.text(n).replace(' ', '-'), n)
        return Region.NONE
    }

    /** The region the phone sent, or null for the whole country. New Zealand also takes region names ("Auckland" is north). */
    fun asked(country: String, region: String?): String? {
        val r = region?.trim()?.take(60).orEmpty()
        if (r.isEmpty() || Fold.text(r) in setOf("all", "country", "whole country")) return null
        if (country == "NZ") return nzByName(r) ?: Fold.text(r)
        return r
    }

    /** Great-circle distance in kilometres. */
    fun km(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val p1 = Math.toRadians(lat1)
        val p2 = Math.toRadians(lat2)
        val dp = p2 - p1
        val dl = Math.toRadians(lon2 - lon1)
        val h = sin(dp / 2) * sin(dp / 2) + cos(p1) * cos(p2) * sin(dl / 2) * sin(dl / 2)
        return 2 * 6371.0 * asin(sqrt(h.coerceIn(0.0, 1.0)))
    }

    /**
     * Each country's middle, leaning towards where people live (the US's is in Missouri, not
     * Kansas; Australia's is between Sydney and Melbourne). Used for travel distances and small
     * countries' neighbours. A country not listed uses the middle of its shows.
     */
    private val CENTRES: Map<String, DoubleArray> = (
        "AD 42.5 1.55, AE 24.9 55.1, AR -34.0 -61.0, AT 47.9 14.6, AU -33.5 147.5, BE 50.8 4.4, BG 42.7 25.0, BH 26.1 50.5, " +
            "BR -20.0 -46.0, CA 45.5 -79.0, CH 47.1 8.2, CL -33.5 -70.7, CN 31.0 113.0, CO 5.5 -74.5, CY 35.0 33.2, CZ 49.9 15.3, " +
            "DE 51.0 9.6, DK 55.8 10.8, EE 59.0 25.0, EG 30.0 31.2, ES 40.0 -3.7, FI 61.5 25.0, FR 47.0 2.5, GB 52.6 -1.6, " +
            "GR 38.6 23.2, HK 22.35 114.15, HR 45.5 16.2, HU 47.3 19.3, ID -6.6 107.5, IE 53.3 -7.6, IL 32.0 34.9, IN 22.0 79.0, " +
            "IS 64.1 -21.9, IT 43.0 12.0, JP 35.6 138.0, KR 36.8 127.4, KW 29.3 47.9, LB 33.9 35.6, LI 47.15 9.55, LT 55.2 24.0, " +
            "LU 49.7 6.1, LV 56.9 24.4, MC 43.74 7.42, ME 42.7 19.3, MK 41.6 21.7, MO 22.2 113.55, MT 35.9 14.45, MX 20.5 -100.0, " +
            "MY 3.5 102.0, NL 52.2 5.3, NO 60.5 10.0, NZ -39.0 175.0, PE -12.0 -77.0, PH 13.0 121.5, PL 52.0 19.5, PT 39.8 -8.4, " +
            "QA 25.3 51.3, RO 45.6 25.3, RS 44.2 20.8, SA 24.0 45.0, SE 59.3 15.6, SG 1.35 103.82, SI 46.1 14.8, SK 48.7 19.4, " +
            "SM 43.94 12.46, TH 14.5 100.5, TR 40.0 31.0, TW 24.0 121.0, US 37.5 -92.0, VN 16.0 107.0, ZA -27.0 27.5"
        ).split(", ").associate { e -> e.split(' ').let { it[0] to doubleArrayOf(it[1].toDouble(), it[2].toDouble()) } }

    fun centre(country: String): DoubleArray? = CENTRES[country]

    /** Countries whose middle is within [withinKm] of [country]'s (not [country] itself). */
    fun around(country: String, withinKm: Double): List<String> {
        val c = CENTRES[country] ?: return emptyList()
        return CENTRES.filter { (k, p) -> k != country && km(c[0], c[1], p[0], p[1]) <= withinKm }.keys.sorted()
    }
}
