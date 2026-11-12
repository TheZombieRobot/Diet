package nz.waveformlabs.moshpoint.venue

import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.VenueMapPlan
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** The saved venue map's style rewriting and the venue lookup's reading of Nominatim: text in, text out. */
class VenueLogicTest {
    private val index = """{"tilejson":"3.0.0","tiles":["https://tiles.openfreemap.org/planet/20261104_001001_pt/{z}/{x}/{y}.pbf"],
        "minzoom":0,"maxzoom":14,"attribution":"<a href=\"https://openfreemap.org\">OpenFreeMap</a> © OpenMapTiles Data from OpenStreetMap"}"""

    /** Shaped like OpenFreeMap's styles: an index-fed vector source, three fonts, a label layer that names none. */
    private val style = """{
      "version": 8, "name": "Liberty",
      "sources": {
        "ne2_shaded": {"type": "raster", "maxzoom": 6, "tileSize": 256, "tiles": ["https://tiles.openfreemap.org/natural_earth/ne2sr/{z}/{x}/{y}.png"]},
        "openmaptiles": {"type": "vector", "url": "https://tiles.openfreemap.org/planet"}
      },
      "sprite": "https://tiles.openfreemap.org/sprites/ofm_f384/ofm",
      "glyphs": "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
      "layers": [
        {"id": "background", "type": "background", "paint": {"background-color": "#f8f4f0"}},
        {"id": "road", "type": "line", "source": "openmaptiles", "source-layer": "transportation", "layout": {"line-cap": "round"}},
        {"id": "road_label", "type": "symbol", "source": "openmaptiles", "source-layer": "transportation_name",
         "layout": {"text-field": "{name}", "text-font": ["Noto Sans Regular"], "symbol-placement": "line"}},
        {"id": "water_name", "type": "symbol", "source": "openmaptiles", "source-layer": "water_name",
         "layout": {"text-field": "{name}", "text-font": ["Noto Sans Italic"]}},
        {"id": "place_city", "type": "symbol", "source": "openmaptiles", "source-layer": "place",
         "layout": {"text-field": "{name}", "text-font": ["case", ["==", ["get", "capital"], 2], ["literal", ["Noto Sans Bold"]], ["literal", ["Noto Sans Regular"]]]}},
        {"id": "poi", "type": "symbol", "source": "openmaptiles", "source-layer": "poi", "layout": {"icon-image": "{class}", "text-field": "{name}"}},
        {"id": "icon_only", "type": "symbol", "source": "openmaptiles", "source-layer": "aeroway"}
      ]
    }"""

    private val tiles get() = assertNotNull(VenueStyle.parseTiles(index))

    @Test fun readsThisWeeksTileAddressFromTheIndex() {
        val t = tiles
        assertEquals("https://tiles.openfreemap.org/planet/20261104_001001_pt/{z}/{x}/{y}.pbf", t.template)
        assertEquals("20261104_001001_pt", t.version)
        assertEquals(0, t.minZoom)
        assertEquals(14, t.maxZoom)
        assertTrue("OpenStreetMap" in t.attribution)
        // Not an index we can use: no pack is made from it.
        assertNull(VenueStyle.parseTiles("{}"))
        assertNull(VenueStyle.parseTiles("<html>busy</html>"))
        assertNull(VenueStyle.parseTiles("""{"tiles":["http://plain.example/{z}/{x}/{y}.pbf"]}"""))
        assertNull(VenueStyle.parseTiles("""{"tiles":["https://example.org/no-placeholders.pbf"]}"""))
        // No attribution in the index: the map still credits its sources.
        assertTrue("OpenStreetMap" in VenueStyle.parseTiles("""{"tiles":["https://t.example/planet/v7/{z}/{x}/{y}.pbf"]}""")!!.attribution)
    }

    @Test fun aSavedLookAsksForNothingThePackDoesNotHold() {
        val pinned = JSONObject(assertNotNull(VenueStyle.pin(style, tiles)))
        // Tiles: the fixed address, no index to go stale.
        val source = pinned.getJSONObject("sources").getJSONObject("openmaptiles")
        assertFalse(source.has("url"))
        assertEquals(tiles.template, source.getJSONArray("tiles").getString(0))
        assertEquals(14, source.getInt("maxzoom"))
        assertTrue("OpenStreetMap" in source.getString("attribution")) // the credit still shows on the map
        // Fonts: the private address, and one font everywhere.
        assertEquals(VenueMapPlan.GLYPH_TEMPLATE, pinned.getString("glyphs"))
        val layers = pinned.getJSONArray("layers")
        var labels = 0
        for (i in 0 until layers.length()) {
            val l = layers.getJSONObject(i)
            if (l.getString("type") != "symbol") {
                assertFalse(l.optJSONObject("layout")?.has("text-font") == true, l.getString("id"))
                continue
            }
            labels++
            // Including the layer that named no font (MapLibre's fallback font isn't in the pack either)
            // and the one that had no layout at all.
            assertEquals("[\"mp\"]", l.getJSONObject("layout").getJSONArray("text-font").toString(), l.getString("id"))
        }
        assertEquals(5, labels)
        assertFalse("Noto Sans" in pinned.toString()) // a font the pack doesn't have would hold up whole tiles
        // Untouched: the icons, the other source, the layer order and styling.
        assertEquals("https://tiles.openfreemap.org/sprites/ofm_f384/ofm", pinned.getString("sprite"))
        assertTrue(pinned.getJSONObject("sources").has("ne2_shaded"))
        assertEquals(7, layers.length())
        assertEquals("round", layers.getJSONObject(1).getJSONObject("layout").getString("line-cap"))
        assertEquals("line", layers.getJSONObject(2).getJSONObject("layout").getString("symbol-placement"))
    }

    @Test fun whatIsNotAMapStyleIsRefused() {
        assertNull(VenueStyle.pin("not json", tiles))
        assertNull(VenueStyle.pin("""{"version":8,"sources":{"other":{"type":"vector"}},"layers":[]}""", tiles))
        assertNull(VenueStyle.pin("""{"version":8,"sources":{"openmaptiles":{"type":"vector"}}}""", tiles))
    }

    @Test fun theOfflineRegionIsMadeFromATinyStyle() {
        val pack = JSONObject(VenueStyle.packStyle(tiles, VenueStyle.spriteOf(style)))
        assertEquals(8, pack.getInt("version"))
        // Exactly what the region must hold: the tiles, the icon sheet, the one font.
        assertEquals(tiles.template, pack.getJSONObject("sources").getJSONObject("openmaptiles").getJSONArray("tiles").getString(0))
        assertEquals("https://tiles.openfreemap.org/sprites/ofm_f384/ofm", pack.getString("sprite"))
        assertEquals(VenueMapPlan.GLYPH_TEMPLATE, pack.getString("glyphs"))
        val layer = pack.getJSONArray("layers").getJSONObject(0)
        assertEquals("symbol", layer.getString("type"))
        // A label layer with text is what makes MapLibre count the font as needed.
        assertTrue(layer.getJSONObject("layout").has("text-field"))
        assertEquals(VenueMapPlan.FONT, layer.getJSONObject("layout").getJSONArray("text-font").getString(0))
        // No icon sheet in the style: none in the pack.
        assertFalse(JSONObject(VenueStyle.packStyle(tiles, null)).has("sprite"))
    }

    @Test fun fontFilesAreFetchedFromTheStylesOwnFontAddress() {
        val glyphs = assertNotNull(VenueStyle.glyphsOf(style))
        assertEquals("https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf", VenueStyle.fontFileUrl(glyphs, 0))
        assertEquals("https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/7680-7935.pbf", VenueStyle.fontFileUrl(glyphs, 0x1E))
        assertNull(VenueStyle.glyphsOf("""{"glyphs":"https://example.org/fonts.pbf"}"""))
        assertNull(VenueStyle.spriteOf("""{"sprite":"file:///somewhere"}"""))
    }

    @Test fun readsNominatimsAnswer() {
        val found = VenueLookup.parse(JSONArray("""[{"lat":"-36.8468","lon":"174.7766","display_name":"Spark Arena, Auckland"},{"lat":"1","lon":"2"}]"""))
        assertEquals(VenueLookup.Result.Found(LatLon(-36.8468, 174.7766), "Spark Arena, Auckland"), found)
        assertEquals(VenueLookup.Result.NotFound, VenueLookup.parse(JSONArray("[]")))
        assertEquals(VenueLookup.Result.NotFound, VenueLookup.parse(JSONArray("""[{"lat":"north","lon":"2"}]""")))
        assertEquals(VenueLookup.Result.NotFound, VenueLookup.parse(JSONArray("""[{"lat":"95.0","lon":"2"}]""")))
    }
}
