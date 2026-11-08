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
) {
    if (LocalInspectionMode.current) {
        // Screenshot tests can't load the native map: a plain stand-in.
        Box(modifier.fillMaxSize().background(Mosh.Deep), contentAlignment = Alignment.Center) {
            Text("map", style = Mosh.Eyebrow)
        }
        return
    }
    val context = LocalContext.current
    val holder = remember { arrayOfNulls<MapLibreMap>(1) }
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
                map.addOnMapClickListener { at ->
                    val pt = map.projection.toScreenLocation(at)
                    val hit = map.queryRenderedFeatures(pt, LAYER_FRIENDS).firstOrNull()?.getStringProperty("id")
                    if (hit != null) onPinTapped(hit)
                    hit != null
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
        style.getSourceAs<GeoJsonSource>(SRC_ME)?.setGeoJson(
            FeatureCollection.fromFeatures(me?.let { listOf(Feature.fromGeometry(Point.fromLngLat(it.longitude, it.latitude))) } ?: emptyList()),
        )
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
