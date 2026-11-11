package nz.waveformlabs.moshpoint.venue

import nz.waveformlabs.moshpoint.core.VenueMapPlan
import org.json.JSONArray
import org.json.JSONObject

/**
 * Turns OpenFreeMap's tile index and map styles into the fixed, self-contained ones a saved
 * venue map uses (docs/VENUE_MAP.md, section 1). Text in, text out: no phone needed.
 *
 * Why not use the styles as they are: they find their tiles through an index that points at
 * this week's map data (so last week's saved tiles would stop matching), and they name three
 * fonts of 130 files each (18 MB), where a tile can't be drawn until every font file its labels
 * ask for has answered.
 */
object VenueStyle {
    /** What we need from the tile index. [version] is the dated folder in [template]. */
    data class Tiles(val template: String, val version: String, val minZoom: Int, val maxZoom: Int, val attribution: String)

    /** The styles' name for the street-map tiles. */
    const val SOURCE = "openmaptiles"

    private const val DEFAULT_ATTRIBUTION =
        "<a href=\"https://openfreemap.org\" target=\"_blank\">OpenFreeMap</a> <a href=\"https://www.openmaptiles.org/\" target=\"_blank\">&copy; OpenMapTiles</a> " +
            "Data from <a href=\"https://www.openstreetmap.org/copyright\" target=\"_blank\">OpenStreetMap</a>"

    /** Reads the tile index (TileJSON). Null if it isn't one we can use. */
    fun parseTiles(tileJson: String): Tiles? = runCatching {
        val o = JSONObject(tileJson)
        val template = o.getJSONArray("tiles").getString(0)
        require(template.startsWith("https://") && "{z}" in template && "{x}" in template && "{y}" in template)
        // ".../planet/20261104_001001_pt/{z}/{x}/{y}.pbf" -> "20261104_001001_pt"
        val version = template.substringBefore("/{z}").substringAfterLast('/').filter { it.isLetterOrDigit() || it == '_' || it == '-' }
        require(version.isNotEmpty())
        Tiles(
            template, version.take(60), o.optInt("minzoom", 0).coerceIn(0, 22), o.optInt("maxzoom", 14).coerceIn(0, 22),
            o.optString("attribution").ifBlank { DEFAULT_ATTRIBUTION },
        )
    }.getOrNull()

    /** The street-map source with its tile address spelled out, so the map never asks the index again. */
    private fun pinnedSource(t: Tiles): JSONObject = JSONObject()
        .put("type", "vector")
        .put("tiles", JSONArray().put(t.template))
        .put("minzoom", t.minZoom)
        .put("maxzoom", t.maxZoom)
        .put("attribution", t.attribution)

    /**
     * One of the map looks (Bright, Night, Dark), rewritten to use only what the pack holds:
     * the fixed tiles, and one font from the private address. Null if it isn't a style we understand.
     */
    fun pin(styleJson: String, t: Tiles): String? = runCatching {
        val o = JSONObject(styleJson)
        val sources = o.getJSONObject("sources")
        require(sources.has(SOURCE))
        sources.put(SOURCE, pinnedSource(t))
        o.put("glyphs", VenueMapPlan.GLYPH_TEMPLATE)
        val layers = o.getJSONArray("layers")
        for (i in 0 until layers.length()) {
            val layer = layers.getJSONObject(i)
            if (layer.optString("type") != "symbol") continue
            // Every label layer, including ones that name no font: MapLibre's fallback font
            // isn't in the pack either, and one unanswered font holds up the whole tile.
            val layout = layer.optJSONObject("layout") ?: JSONObject().also { layer.put("layout", it) }
            layout.put("text-font", JSONArray().put(VenueMapPlan.FONT))
        }
        o.toString()
    }.getOrNull()

    /** The address of a style's icon sheet, if it has one. */
    fun spriteOf(styleJson: String): String? = runCatching {
        JSONObject(styleJson).optString("sprite").takeIf { it.startsWith("https://") }
    }.getOrNull()

    /** Where a style gets its fonts (a template with {fontstack} and {range}). */
    fun glyphsOf(styleJson: String): String? = runCatching {
        JSONObject(styleJson).optString("glyphs").takeIf { it.startsWith("https://") && "{fontstack}" in it && "{range}" in it }
    }.getOrNull()

    /**
     * The tiny style an area's offline region is made from. It names exactly what the region
     * must hold: the tiles, the icon sheet, and the one font (a label layer is what makes
     * MapLibre count a font as needed).
     */
    fun packStyle(t: Tiles, sprite: String?): String {
        val o = JSONObject()
            .put("version", 8)
            .put("name", "moshpoint venue pack")
            .put("sources", JSONObject().put(SOURCE, pinnedSource(t)))
            .put("glyphs", VenueMapPlan.GLYPH_TEMPLATE)
        if (sprite != null) o.put("sprite", sprite)
        o.put(
            "layers",
            JSONArray().put(
                JSONObject().put("id", "labels").put("type", "symbol").put("source", SOURCE).put("source-layer", "place")
                    .put("layout", JSONObject().put("text-field", "{name}").put("text-font", JSONArray().put(VenueMapPlan.FONT))),
            ),
        )
        return o.toString()
    }

    /** The address of one of the real font's files, from a style's own font template. */
    fun fontFileUrl(glyphsTemplate: String, range: Int): String =
        glyphsTemplate.replace("{fontstack}", VenueMapPlan.SOURCE_FONT.replace(" ", "%20")).replace("{range}", VenueMapPlan.rangeName(range))
}
