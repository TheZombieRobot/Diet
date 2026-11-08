package nz.waveformlabs.moshpoint.ui

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.graphics.RectF
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import nz.waveformlabs.moshpoint.PhotoStore
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.Point

/** One person on the map. */
data class MapPin(
    val id: String,
    val name: String,
    val lat: Double,
    val lon: Double,
    /** ARGB ring colour. */
    val color: Int,
    /** Shown under the name, e.g. "3 min ago". */
    val caption: String,
    /** Old position: drawn faded. */
    val stale: Boolean,
)

/** Where someone has been lately, drawn as a faint line in their colour. */
class MapTrail(val color: Int, val points: List<Pair<Double, Double>>)

/** A crew photo pinned where it was taken. */
class MapMoment(val key: String, val label: String, val lat: Double, val lon: Double, val image: androidx.compose.ui.graphics.ImageBitmap)

/** A saved spot or the crew's meet-up pin. */
data class MapPlace(val id: String, val name: String, val lat: Double, val lon: Double, val meetUp: Boolean)

/** Free OpenStreetMap vector maps, no API key (openfreemap.org). */
const val MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/dark"

/**
 * The map itself (MapLibre). Friends are drawn as their photo (or initial) in a ring of
 * their colour, Snap Map style; you're the cyan dot. [focus] changes move the camera:
 * a single pin zooms to it, several fit everyone in view.
 */
@Composable
fun FriendMap(
    pins: List<MapPin>,
    me: LatLng?,
    focus: Pair<Int, List<LatLng>>,
    onPinTapped: (String) -> Unit,
    modifier: Modifier = Modifier,
    places: List<MapPlace> = emptyList(),
    /** Long-press on the map: drop a pin there. */
    onLongPress: (Double, Double) -> Unit = { _, _ -> },
    /** False in screenshot tests, which can't load the native map library. */
    live: Boolean = true,
    moments: List<MapMoment> = emptyList(),
    onMomentTapped: (String) -> Unit = {},
    trails: List<MapTrail> = emptyList(),
    /** Bump to save the area on screen for use with no signal; progress goes to [onOffline]. */
    saveOffline: Int = 0,
    onOffline: (String) -> Unit = {},
) {
    if (!live || LocalInspectionMode.current) {
        // Screenshot tests can't load the native map: a plain stand-in.
        Box(modifier.fillMaxSize().background(Mosh.Deep), contentAlignment = Alignment.Center) {
            Text("map", style = Mosh.Eyebrow)
        }
        return
    }
    val context = LocalContext.current
    val holder = remember { arrayOfNulls<MapLibreMap>(1) }
    // Latest callback, read from the map's own listener (set up once).
    val longPress = androidx.compose.runtime.rememberUpdatedState(onLongPress)
    val momentTap = androidx.compose.runtime.rememberUpdatedState(onMomentTapped)
    // State, so pins get drawn as soon as the map style has loaded.
    val styleReady = remember { androidx.compose.runtime.mutableStateOf(false) }
    val mapView = remember {
        MapLibre.getInstance(context)
        MapView(context).apply {
            onCreate(null)
            getMapAsync { map ->
                holder[0] = map
                map.uiSettings.isAttributionEnabled = true
                map.uiSettings.isLogoEnabled = false
                map.uiSettings.isRotateGesturesEnabled = false
                map.cameraPosition = CameraPosition.Builder().target(LatLng(-41.29, 174.78)).zoom(4.0).build()
                map.setStyle(Style.Builder().fromUri(MAP_STYLE_URL)) { style ->
                    style.addSource(GeoJsonSource(SRC_TRAILS))
                    style.addLayer(
                        org.maplibre.android.style.layers.LineLayer(LAYER_TRAILS, SRC_TRAILS).withProperties(
                            PropertyFactory.lineColor(Expression.toColor(Expression.get("color"))),
                            PropertyFactory.lineWidth(3f),
                            PropertyFactory.lineOpacity(0.55f),
                            PropertyFactory.lineDasharray(arrayOf(1.5f, 1.5f)),
                        ),
                    )
                    style.addSource(GeoJsonSource(SRC_MOMENTS))
                    style.addLayer(
                        SymbolLayer(LAYER_MOMENTS, SRC_MOMENTS).withProperties(
                            PropertyFactory.iconImage(Expression.get("icon")),
                            PropertyFactory.iconAllowOverlap(true),
                            PropertyFactory.iconIgnorePlacement(true),
                            PropertyFactory.textField(Expression.get("label")),
                            PropertyFactory.textFont(arrayOf("Noto Sans Regular")),
                            PropertyFactory.textSize(11f),
                            PropertyFactory.textColor(android.graphics.Color.WHITE),
                            PropertyFactory.textHaloColor(android.graphics.Color.BLACK),
                            PropertyFactory.textHaloWidth(1.5f),
                            PropertyFactory.textOffset(arrayOf(0f, 2.4f)),
                            PropertyFactory.textAllowOverlap(true),
                        ),
                    )
                    style.addSource(GeoJsonSource(SRC_PLACES))
                    style.addImage("place-meet", placeBitmap(true))
                    style.addImage("place-spot", placeBitmap(false))
                    style.addLayer(
                        SymbolLayer(LAYER_PLACES, SRC_PLACES).withProperties(
                            PropertyFactory.iconImage(Expression.get("icon")),
                            PropertyFactory.iconAnchor("bottom"),
                            PropertyFactory.iconAllowOverlap(true),
                            PropertyFactory.iconIgnorePlacement(true),
                            PropertyFactory.textField(Expression.get("label")),
                            PropertyFactory.textFont(arrayOf("Noto Sans Regular")),
                            PropertyFactory.textSize(12f),
                            PropertyFactory.textColor(android.graphics.Color.WHITE),
                            PropertyFactory.textHaloColor(android.graphics.Color.BLACK),
                            PropertyFactory.textHaloWidth(1.5f),
                            PropertyFactory.textOffset(arrayOf(0f, 0.6f)),
                            PropertyFactory.textAnchor("top"),
                            PropertyFactory.textAllowOverlap(true),
                        ),
                    )
                    style.addSource(GeoJsonSource(SRC_ME))
                    style.addSource(GeoJsonSource(SRC_FRIENDS))
                    style.addLayer(
                        CircleLayer(LAYER_ME, SRC_ME).withProperties(
                            PropertyFactory.circleRadius(8f),
                            PropertyFactory.circleColor(android.graphics.Color.rgb(0x22, 0xE4, 0xFF)),
                            PropertyFactory.circleStrokeColor(android.graphics.Color.WHITE),
                            PropertyFactory.circleStrokeWidth(3f),
                        ),
                    )
                    style.addLayer(
                        SymbolLayer(LAYER_FRIENDS, SRC_FRIENDS).withProperties(
                            PropertyFactory.iconImage(Expression.get("icon")),
                            PropertyFactory.iconAllowOverlap(true),
                            PropertyFactory.iconIgnorePlacement(true),
                            PropertyFactory.iconOpacity(Expression.get("op")),
                            PropertyFactory.textField(Expression.get("label")),
                            PropertyFactory.textFont(arrayOf("Noto Sans Regular")),
                            PropertyFactory.textSize(12f),
                            PropertyFactory.textColor(android.graphics.Color.WHITE),
                            PropertyFactory.textHaloColor(android.graphics.Color.BLACK),
                            PropertyFactory.textHaloWidth(1.5f),
                            PropertyFactory.textOffset(arrayOf(0f, 2.6f)),
                            PropertyFactory.textAllowOverlap(true),
                        ),
                    )
                    styleReady.value = true
                }
                map.addOnMapLongClickListener { at ->
                    longPress.value(at.latitude, at.longitude)
                    true
                }
                map.addOnMapClickListener { at ->
                    val pt = map.projection.toScreenLocation(at)
                    val hit = map.queryRenderedFeatures(pt, LAYER_FRIENDS).firstOrNull()?.getStringProperty("id")
                    if (hit != null) onPinTapped(hit)
                    val moment = if (hit == null) map.queryRenderedFeatures(pt, LAYER_MOMENTS).firstOrNull()?.getStringProperty("key") else null
                    if (moment != null) momentTap.value(moment)
                    hit != null || moment != null
                }
            }
        }
    }

    // The map view needs the screen's lifecycle passed on to it.
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val obs = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> Unit
            }
        }
        lifecycle.addObserver(obs)
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) mapView.onStart()
        if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onResume()
        onDispose {
            lifecycle.removeObserver(obs)
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
        }
    }

    AndroidView({ mapView }, modifier.fillMaxSize()) {
        if (!styleReady.value) return@AndroidView
        val map = holder[0] ?: return@AndroidView
        val style = map.style ?: return@AndroidView
        // Photos/initials as map icons (re-added each time: cheap, and photos can change).
        pins.forEach { style.addImage("f-${it.id}", pinBitmap(it)) }
        style.getSourceAs<GeoJsonSource>(SRC_FRIENDS)?.setGeoJson(
            FeatureCollection.fromFeatures(
                pins.map { p ->
                    Feature.fromGeometry(Point.fromLngLat(p.lon, p.lat)).apply {
                        addStringProperty("id", p.id)
                        addStringProperty("icon", "f-${p.id}")
                        addStringProperty("label", "${p.name}\n${p.caption}")
                        addNumberProperty("op", if (p.stale) 0.55 else 1.0)
                    }
                },
            ),
        )
        style.getSourceAs<GeoJsonSource>(SRC_TRAILS)?.setGeoJson(
            FeatureCollection.fromFeatures(
                trails.filter { it.points.size >= 2 }.map { t ->
                    Feature.fromGeometry(org.maplibre.geojson.LineString.fromLngLats(t.points.map { Point.fromLngLat(it.second, it.first) })).apply {
                        addStringProperty("color", String.format("#%06X", t.color and 0xFFFFFF))
                    }
                },
            ),
        )
        moments.forEach { style.addImage("m-${it.key}", momentBitmap(it.image)) }
        style.getSourceAs<GeoJsonSource>(SRC_MOMENTS)?.setGeoJson(
            FeatureCollection.fromFeatures(
                moments.map { m ->
                    Feature.fromGeometry(Point.fromLngLat(m.lon, m.lat)).apply {
                        addStringProperty("key", m.key)
                        addStringProperty("icon", "m-${m.key}")
                        addStringProperty("label", m.label)
                    }
                },
            ),
        )
        style.getSourceAs<GeoJsonSource>(SRC_PLACES)?.setGeoJson(
            FeatureCollection.fromFeatures(
                places.map { p ->
                    Feature.fromGeometry(Point.fromLngLat(p.lon, p.lat)).apply {
                        addStringProperty("icon", if (p.meetUp) "place-meet" else "place-spot")
                        addStringProperty("label", if (p.meetUp) "Meet: ${p.name}" else p.name)
                    }
                },
            ),
        )
        style.getSourceAs<GeoJsonSource>(SRC_ME)?.setGeoJson(
            FeatureCollection.fromFeatures(me?.let { listOf(Feature.fromGeometry(Point.fromLngLat(it.longitude, it.latitude))) } ?: emptyList()),
        )
    }

    // "Save this area": download the visible area's map (zoom 12-17) for when data dies.
    val offlineCb = androidx.compose.runtime.rememberUpdatedState(onOffline)
    LaunchedEffect(saveOffline) {
        if (saveOffline == 0) return@LaunchedEffect
        val map = holder[0] ?: return@LaunchedEffect
        val bounds = map.projection.visibleRegion.latLngBounds
        saveArea(context, bounds) { offlineCb.value(it) }
    }

    // Camera moves when asked (first open, "Everyone", "Me", or tapping someone in the list).
    LaunchedEffect(focus.first) {
        var tries = 0
        while (holder[0] == null && tries++ < 50) kotlinx.coroutines.delay(100)
        val map = holder[0] ?: return@LaunchedEffect
        val pts = focus.second
        when {
            pts.isEmpty() -> Unit
            pts.size == 1 -> map.animateCamera(CameraUpdateFactory.newLatLngZoom(pts[0], 15.0), 600)
            else -> map.animateCamera(
                CameraUpdateFactory.newLatLngBounds(LatLngBounds.Builder().includes(pts).build(), 140),
                600,
            )
        }
    }
}

private const val SRC_ME = "me"
private const val SRC_PLACES = "places"
private const val SRC_MOMENTS = "moments"
private const val SRC_TRAILS = "trails"
private const val LAYER_TRAILS = "trail-lines"
private const val LAYER_MOMENTS = "moment-pins"
private const val LAYER_PLACES = "place-pins"
private const val SRC_FRIENDS = "friends"
private const val LAYER_ME = "me-dot"
private const val LAYER_FRIENDS = "friend-pins"

/** A round photo (or initial) with a coloured ring, like a Snap Map avatar. */
private fun pinBitmap(p: MapPin): Bitmap {
    val size = 112
    val ring = 9f
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = p.color
    c.drawCircle(size / 2f, size / 2f, size / 2f, paint)
    val inner = RectF(ring, ring, size - ring, size - ring)
    val photo = PhotoStore.photos[p.id]?.asAndroidBitmap()
    if (photo != null) {
        val layer = c.saveLayer(inner, null)
        paint.color = android.graphics.Color.WHITE
        c.drawOval(inner, paint)
        paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
        val side = minOf(photo.width, photo.height)
        val src = Rect((photo.width - side) / 2, (photo.height - side) / 2, (photo.width + side) / 2, (photo.height + side) / 2)
        c.drawBitmap(photo, src, inner, paint)
        paint.xfermode = null
        c.restoreToCount(layer)
    } else {
        paint.color = android.graphics.Color.rgb(0x1C, 0x16, 0x30)
        c.drawOval(inner, paint)
        paint.color = android.graphics.Color.WHITE
        paint.textSize = 44f
        paint.textAlign = Paint.Align.CENTER
        paint.isFakeBoldText = true
        val y = size / 2f - (paint.descent() + paint.ascent()) / 2
        c.drawText(p.name.take(1).uppercase(), size / 2f, y, paint)
    }
    return out
}

/** A map pin: hot pink for the crew meet-up, cyan for your own spots. */
private fun placeBitmap(meetUp: Boolean): Bitmap {
    val w = 64
    val h = 84
    val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = if (meetUp) android.graphics.Color.rgb(0xFF, 0x2E, 0x93) else android.graphics.Color.rgb(0x22, 0xE4, 0xFF)
    val path = android.graphics.Path().apply {
        addCircle(w / 2f, w / 2f, w / 2f - 4, android.graphics.Path.Direction.CW)
        moveTo(w / 2f - 14, w / 2f + 18)
        lineTo(w / 2f, h - 2f)
        lineTo(w / 2f + 14, w / 2f + 18)
        close()
    }
    c.drawPath(path, paint)
    paint.color = android.graphics.Color.rgb(0x0F, 0x0B, 0x1C)
    c.drawCircle(w / 2f, w / 2f, 12f, paint)
    return out
}

/** A crew photo as a small rounded square with a white border (cached per image). */
private val momentIcons = java.util.WeakHashMap<androidx.compose.ui.graphics.ImageBitmap, Bitmap>()

private fun momentBitmap(img: androidx.compose.ui.graphics.ImageBitmap): Bitmap = momentIcons.getOrPut(img) {
    val size = 104
    val src = img.asAndroidBitmap()
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val c = Canvas(out)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = android.graphics.Color.WHITE
    c.drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), 18f, 18f, paint)
    val inner = RectF(5f, 5f, size - 5f, size - 5f)
    val layer = c.saveLayer(inner, null)
    c.drawRoundRect(inner, 14f, 14f, paint)
    paint.xfermode = PorterDuffXfermode(PorterDuff.Mode.SRC_IN)
    val side = minOf(src.width, src.height)
    c.drawBitmap(src, Rect((src.width - side) / 2, (src.height - side) / 2, (src.width + side) / 2, (src.height + side) / 2), inner, paint)
    paint.xfermode = null
    c.restoreToCount(layer)
    out
}

/** Downloads the map for [bounds] so it works offline (MapLibre keeps it on the phone). */
private fun saveArea(context: android.content.Context, bounds: LatLngBounds, progress: (String) -> Unit) {
    val om = org.maplibre.android.offline.OfflineManager.getInstance(context)
    val def = org.maplibre.android.offline.OfflineTilePyramidRegionDefinition(
        MAP_STYLE_URL, bounds, 12.0, 17.0, context.resources.displayMetrics.density,
    )
    progress("Saving this area…")
    om.createOfflineRegion(def, "venue".toByteArray(), object : org.maplibre.android.offline.OfflineManager.CreateOfflineRegionCallback {
        override fun onCreate(offlineRegion: org.maplibre.android.offline.OfflineRegion) {
            offlineRegion.setObserver(object : org.maplibre.android.offline.OfflineRegion.OfflineRegionObserver {
                override fun onStatusChanged(status: org.maplibre.android.offline.OfflineRegionStatus) {
                    if (status.isComplete) {
                        progress("Area saved: the map works here with no signal")
                        offlineRegion.setDownloadState(org.maplibre.android.offline.OfflineRegion.STATE_INACTIVE)
                    } else if (status.requiredResourceCount > 0) {
                        progress("Saving this area… ${100 * status.completedResourceCount / status.requiredResourceCount}%")
                    }
                }

                override fun onError(error: org.maplibre.android.offline.OfflineRegionError) {
                    progress("Couldn't save the area: ${error.message}")
                }

                override fun mapboxTileCountLimitExceeded(limit: Long) {
                    progress("Too big to save: zoom in on the venue and try again")
                }
            })
            offlineRegion.setDownloadState(org.maplibre.android.offline.OfflineRegion.STATE_ACTIVE)
        }

        override fun onError(error: String) {
            progress("Couldn't save the area: $error")
        }
    })
}
