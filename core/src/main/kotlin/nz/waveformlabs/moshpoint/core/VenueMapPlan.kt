package nz.waveformlabs.moshpoint.core

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.tan

/*
 * The offline venue map's plan (docs/VENUE_MAP.md, section 1): which area, how many tiles,
 * which font files, when it's deleted, and where to save when nobody knows where the venue is.
 * The downloading itself is in the app (VenueMaps).
 */
object VenueMapPlan {
    /** "2 km around the venue": the saved square reaches this far north, south, east and west. */
    const val RADIUS_M = 2_000.0

    /** Zoom 14 is the most detailed map data there is; closer views are drawn from it. */
    const val MIN_ZOOM = 12
    const val MAX_ZOOM = 14

    /** A sane square needs 15 to 35 tiles. More than this means the position is nonsense. */
    const val MAX_TILES = 120

    /** Kept this long after the gig ends (or after you leave the crew, if that's sooner). */
    const val KEEP_AFTER_MS = 3L * 24 * 3600 * 1000

    /** Old "Save this area" downloads go this long after the update that replaced the button. */
    const val LEGACY_KEEP_MS = 7L * 24 * 3600 * 1000

    /** Venue areas kept at once; the gig furthest in the past goes first. */
    const val MAX_PACKS = 6

    /** Besides the venue's own area, a crew saves at most this many "around you" areas. */
    const val MAX_AROUND_YOU = 2

    private const val M_PER_DEG_LAT = 111_320.0

    data class Box(val south: Double, val west: Double, val north: Double, val east: Double) {
        fun contains(p: LatLon) = p.lat in south..north && p.lon in west..east
    }

    /** The square reaching [radiusM] each way from [centre]. */
    fun box(centre: LatLon, radiusM: Double = RADIUS_M): Box {
        val dLat = radiusM / M_PER_DEG_LAT
        val dLon = radiusM / (M_PER_DEG_LAT * cos(Math.toRadians(centre.lat)).coerceAtLeast(0.01))
        return Box(
            south = (centre.lat - dLat).coerceAtLeast(-85.0),
            west = (centre.lon - dLon).coerceAtLeast(-180.0),
            north = (centre.lat + dLat).coerceAtMost(85.0),
            east = (centre.lon + dLon).coerceAtMost(180.0),
        )
    }

    /** Column of the map tile holding [lon] at [zoom] (standard web-map tiles). */
    fun tileX(lon: Double, zoom: Int): Int {
        val n = 1 shl zoom
        return floor((lon + 180.0) / 360.0 * n).toInt().coerceIn(0, n - 1)
    }

    /** Row of the map tile holding [lat] at [zoom] (0 = far north). */
    fun tileY(lat: Double, zoom: Int): Int {
        val n = 1 shl zoom
        val r = Math.toRadians(lat.coerceIn(-85.05, 85.05))
        return floor((1.0 - ln(tan(r) + 1.0 / cos(r)) / PI) / 2.0 * n).toInt().coerceIn(0, n - 1)
    }

    /** How many tiles [box] needs over [minZoom]..[maxZoom]. */
    fun tileCount(box: Box, minZoom: Int = MIN_ZOOM, maxZoom: Int = MAX_ZOOM): Int = (minZoom..maxZoom).sumOf { z ->
        (tileX(box.east, z) - tileX(box.west, z) + 1) * (tileY(box.south, z) - tileY(box.north, z) + 1)
    }

    /** A valid position we're willing to download around. */
    fun usable(centre: LatLon): Boolean =
        centre.lat.isFinite() && centre.lon.isFinite() && centre.lat in -80.0..80.0 && centre.lon in -180.0..180.0 &&
            !(centre.lat == 0.0 && centre.lon == 0.0) && tileCount(box(centre)) <= MAX_TILES

    /** A name for the area saved around [centre] (also its folder name). */
    fun areaKey(centre: LatLon): String = "%.3f,%.3f".format(java.util.Locale.ROOT, centre.lat, centre.lon)

    /**
     * One saved area per place: two crews at the same venue share it, and a venue position
     * that differs by a block between two sources doesn't download the square twice.
     */
    fun sameArea(a: LatLon, b: LatLon): Boolean = Geo.distanceM(a, b) <= SAME_AREA_M

    const val SAME_AREA_M = 300.0

    /** When a saved area may be deleted. [leftAtMs] is when you left or cancelled the crew, if you did. */
    fun deleteAfterMs(crewEndsAtMs: Long, leftAtMs: Long? = null): Long = minOf(crewEndsAtMs, leftAtMs ?: Long.MAX_VALUE) + KEEP_AFTER_MS

    // ---- Fonts ----
    //
    // A map tile can't be drawn until every font file its labels ask for has answered. So the
    // saved map uses ONE font, and every one of that font's files answers from the phone: real
    // files for the alphabets below, valid empty ones for the rest.

    /** The saved map's one font. A plain name, so its address needs no escaping. */
    const val FONT = "mp"

    /** The font the files really come from at OpenFreeMap. */
    const val SOURCE_FONT = "Noto Sans Regular"

    /** Where the saved map looks for fonts. ".invalid" can never exist on the internet. */
    const val GLYPH_TEMPLATE = "https://offline.moshpoint.invalid/fonts/{fontstack}/{range}.pbf"

    /** A font file covers 256 characters; this is file [range]'s name, e.g. "256-511". */
    fun rangeName(range: Int): String = "${range * 256}-${range * 256 + 255}"

    /** The address MapLibre will ask for font file [range] at. */
    fun glyphUrl(range: Int): String = "https://offline.moshpoint.invalid/fonts/$FONT/${rangeName(range)}.pbf"

    /** The address of the tiny style that an area's offline region is made from. */
    fun packStyleUrl(tileVersion: String): String =
        "https://offline.moshpoint.invalid/pack/" + tileVersion.filter { it.isLetterOrDigit() || it == '_' || it == '-' }.take(60) + ".json"

    /**
     * Chinese, Japanese and Korean characters are drawn by the phone itself, and MapLibre never
     * asks a server for them (CJK ideographs U+4E00-9FFF, Hangul U+AC00-D7AF).
     */
    fun drawnByPhone(range: Int): Boolean = range in 0x4E..0x9F || range in 0xAC..0xD7

    /** Every font file MapLibre may ask for: all 256 less the ones the phone draws. 130 files. */
    val ALL_RANGES: List<Int> = (0..255).filterNot(::drawnByPhone)

    /** Latin (with accents, Vietnamese), Greek, Cyrillic, punctuation, arrows: 8 files, 0.34 MB. */
    val CORE_RANGES: List<Int> = listOf(0x00, 0x01, 0x02, 0x03, 0x04, 0x1E, 0x20, 0x21)

    /**
     * Every other alphabet with anything in it below U+3400 (Hebrew, Arabic, Indian scripts,
     * Thai, Georgian, symbols, Japanese and Korean punctuation...), plus Arabic's joined forms
     * and full-width letters at the top: 48 files, about 1.8 MB. Left out: rare Chinese
     * characters (U+3400-4DBF, 3.5 MB on their own), which fall back to no label.
     */
    val WORLD_RANGES: List<Int> =
        ((0x05..0x33).toList() - setOf(0x14, 0x15, 0x16, 0x1A, 0x1E, 0x20, 0x21, 0x28, 0x2A)) + (0xA7..0xAB) + (0xFB..0xFF)

    /** Languages written in an alphabet outside [CORE_RANGES] (and not drawn by the phone). */
    private val WORLD_LANGUAGES = setOf(
        "ar", "fa", "ur", "ps", "sd", "ug", "ckb", "he", "iw", "yi", "ji", "hi", "mr", "ne", "sa", "bn", "as", "pa", "gu", "or",
        "ta", "te", "kn", "ml", "si", "th", "lo", "km", "my", "ka", "hy", "am", "ti", "dv", "bo", "dz",
    )

    /** True if someone using one of [languages] (codes like "ar", "th") needs [WORLD_RANGES] to read street names. */
    fun needsWorldFonts(languages: List<String>): Boolean = languages.any { it.lowercase().substringBefore('-').substringBefore('_') in WORLD_LANGUAGES }

    /**
     * A valid font file with no characters in it, for the ranges we don't download: MapLibre
     * gets its answer and draws the tile, just without those characters.
     * (Protobuf: `stacks { name: FONT, range: "0-255" }`.)
     */
    fun emptyGlyphs(range: Int): ByteArray {
        val name = FONT.toByteArray(Charsets.US_ASCII)
        val r = rangeName(range).toByteArray(Charsets.US_ASCII)
        val inner = byteArrayOf(0x0A, name.size.toByte()) + name + byteArrayOf(0x12, r.size.toByte()) + r
        return byteArrayOf(0x0A, inner.size.toByte()) + inner
    }
}

/**
 * "Download around you when you arrive", for crews whose venue position nobody knows. There
 * is no venue to arrive at, so arriving means: it's gig time and you've stopped somewhere.
 * Also catches a wrong venue position: settle far from every saved area and that spot is
 * saved too. Feed it this phone's positions while the crew is awake.
 */
class ArrivalPlanner(
    /** Positions vaguer than this are ignored. */
    private val maxAccuracyM: Double = 100.0,
    /** Faster than this is a vehicle: not arriving yet. */
    private val vehicleMps: Double = 3.0,
    /** "Stopped somewhere" = stayed within [stayM] for [stayMs]. */
    private val stayM: Double = 150.0,
    private val stayMs: Long = 5 * 60_000L,
    /** A new area is only worth saving this far from every area we have. */
    private val newAreaM: Double = 1_500.0,
) {
    data class Fix(val at: LatLon, val accuracyM: Double, val speedMps: Double?, val tMs: Long)

    private var anchor: Fix? = null
    private var sumLat = 0.0
    private var sumLon = 0.0
    private var count = 0

    /**
     * Returns where to save an area now, or null. [saved] are the centres of the areas this
     * crew already has (the venue's, and any from here); [aroundYou] is how many of them came
     * from this planner.
     */
    fun onFix(fix: Fix, saved: List<LatLon>, aroundYou: Int): LatLon? {
        if (!fix.at.lat.isFinite() || !fix.at.lon.isFinite() || fix.accuracyM > maxAccuracyM) return null
        if (aroundYou >= VenueMapPlan.MAX_AROUND_YOU) return null
        val moving = fix.speedMps != null && fix.speedMps > vehicleMps
        // Nothing saved at all: take the first spot you're at, without waiting.
        if (saved.isEmpty()) return if (moving) null else fix.at
        val a = anchor
        if (moving || a == null || Geo.distanceM(a.at, fix.at) > stayM || fix.tMs < a.tMs) {
            anchor = fix.takeUnless { moving }
            sumLat = if (moving) 0.0 else fix.at.lat
            sumLon = if (moving) 0.0 else fix.at.lon
            count = if (moving) 0 else 1
            return null
        }
        sumLat += fix.at.lat
        sumLon += fix.at.lon
        count++
        if (fix.tMs - a.tMs < stayMs || count < 3) return null
        val centre = LatLon(sumLat / count, sumLon / count)
        return centre.takeIf { c -> saved.all { Geo.distanceM(it, c) > newAreaM } }
    }

    fun reset() {
        anchor = null
        count = 0
    }
}

/** A venue name typed by hand, tidied for looking up (and for remembering the answer). */
object VenueQuery {
    fun normalise(text: String): String = text.trim().replace(Regex("\\s+"), " ").take(80)

    /** Worth asking about: not blank, not one letter. */
    fun usable(text: String): Boolean = normalise(text).length >= 3

    fun cacheKey(text: String): String = normalise(text).lowercase()

    /**
     * A rough box around [near] (whole degrees, a couple of hundred km) as Nominatim's
     * `viewbox` (left,top,right,bottom): a preference for nearby matches, not a limit, and
     * vague enough not to say where the phone is.
     */
    fun viewbox(near: LatLon?): String? {
        near ?: return null
        if (!near.lat.isFinite() || !near.lon.isFinite()) return null
        val left = (floor(near.lon) - 1).coerceAtLeast(-180.0).toInt()
        val right = (floor(near.lon) + 2).coerceAtMost(180.0).toInt()
        val bottom = (floor(near.lat) - 1).coerceAtLeast(-90.0).toInt()
        val top = (floor(near.lat) + 2).coerceAtMost(90.0).toInt()
        return "$left,$top,$right,$bottom"
    }
}
