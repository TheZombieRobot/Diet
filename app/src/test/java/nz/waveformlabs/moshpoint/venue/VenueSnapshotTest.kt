package nz.waveformlabs.moshpoint.venue

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.Floor
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.core.VenuePlacement
import nz.waveformlabs.moshpoint.ui.FinderScreen
import nz.waveformlabs.moshpoint.ui.FriendsScreen
import nz.waveformlabs.moshpoint.ui.MapPin
import nz.waveformlabs.moshpoint.ui.MapScreen
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.MoshTheme
import nz.waveformlabs.moshpoint.ui.VenueMapLine
import nz.waveformlabs.moshpoint.ui.VenueView
import nz.waveformlabs.moshpoint.ui.pinBitmap
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import kotlin.test.assertEquals

/*
 * The venue map's bits of screen that can be drawn without a phone (docs/VENUE_MAP.md): the
 * crew card's line about the offline map, and the upstairs/downstairs tag wherever it shows.
 * The map itself can't be drawn here (it needs the phone's native map library).
 *
 * Kept apart from ScreensSnapshotTest. The classes that repeat these in each language are
 * named Lang_<language>, like the ones there: that is what CI's file naming looks for, and why
 * these tests have a package of their own. CI files them as venueCard.png, de-venueCard.png...
 */

/** What both test classes share. Not a test itself. */
abstract class VenueSnapshots {
    /** Resource qualifier for the language ("de", "ar", "en-rUS"), or null for metric English. */
    protected open val lang: String? get() = null
    protected open val rtl: Boolean get() = false

    private fun device(base: DeviceConfig) = base.copy(
        locale = lang,
        layoutDirection = if (rtl) com.android.resources.LayoutDirection.RTL else com.android.resources.LayoutDirection.LTR,
    )

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = device(DeviceConfig.PIXEL_5), theme = "android:Theme.Material.NoActionBar")

    /** Numbers and units follow the same language and country (en-NZ = metric English). */
    @Before fun locale() {
        val tag = lang?.replace("-r", "-") ?: "en-NZ"
        java.util.Locale.setDefault(java.util.Locale.forLanguageTag(tag))
    }

    private fun friend(id: String, name: String, colour: Long) =
        Friend(FriendRecord(id, name, colour.toInt(), ByteArray(32) { it.toByte() }, true, 0L))

    protected val sam = friend("sam", "Sam", 0xFF22E4FF)
    protected val alex = friend("alex", "Alex", 0xFFC86BFF)
    protected val jo = friend("jo", "Jo", 0xFFFFB020)
    protected val mia = friend("mia", "Mia", 0xFFB6FF3B)
    protected val all get() = listOf(sam, alex, jo, mia).associateBy { it.id }

    protected fun finder(title: String, arrows: List<ArrowState>, floors: Map<String, Floor>) = snap {
        MoshTheme {
            FinderScreen(
                title = title, visible = true, arrows = arrows, friendOf = { all[it] }, scan = null,
                onScan = {}, onCancelScan = {}, onDismissScan = {}, floors = floors, onBack = {},
            )
        }
    }

    /** Right-to-left set on Compose itself: the renderer's own setting doesn't reach every screen. */
    protected fun snap(content: @Composable () -> Unit) = paparazzi.snapshot {
        CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) { content() }
    }
}

/** Drawn in every language (the Lang_ classes below): wherever a translation has to fit. */
open class VenueSnapshotTest : VenueSnapshots() {
    /** Home, in a crew whose venue map is on the phone: the one line under the gig's date and place. */
    @Test fun venueCard() = snap {
        MoshTheme {
            FriendsScreen(
                friends = listOf(alex, jo, sam, mia), visible = true, alwaysOn = false,
                phoneSummary = "This phone: UWB, Wi-Fi Aware, Bluetooth, compass, GPS",
                myName = "Josh", onMyName = {}, missingPermissions = emptyList(), onFixPermissions = {},
                onVisible = {}, onAlwaysOn = {}, onFind = {}, onShareCode = {}, onShowQr = {}, onScanQr = {},
                scanned = null, onScannedUsed = {}, onAdd = { _, _, _ -> null }, onRemove = {},
                onSetPhoto = {}, onRemovePhoto = {}, onClearGigGroup = {},
                groupName = "Iron Maiden", onStartGroup = {}, onShowGroupQr = {},
                crewWhen = "Sat 14 Dec, 8:00 pm · Spark Arena, Auckland",
                venueMap = VenueMaps.Status(VenueMaps.Line.SAVED),
            )
        }
    }

    /** The line in each of its four states, beside the card's Invite button so the width is the real one. */
    @Test fun venueLines() = snap {
        MoshTheme {
            Column(
                Modifier.fillMaxSize().background(Mosh.Ground).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                listOf(
                    VenueMaps.Status(VenueMaps.Line.SAVING, 40),
                    VenueMaps.Status(VenueMaps.Line.SAVED),
                    VenueMaps.Status(VenueMaps.Line.WAITING),
                    VenueMaps.Status(VenueMaps.Line.ON_ARRIVAL),
                ).forEach { status ->
                    Row(
                        Modifier.fillMaxWidth().background(Mosh.Deep, RoundedCornerShape(24.dp)).padding(horizontal = 18.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(R.string.home_eyebrow_tonight), style = Mosh.Eyebrow)
                            Text("Iron Maiden", style = Mosh.Heading, maxLines = 1)
                            Text("Sat 14 Dec, 8:00 pm · Spark Arena", style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim), maxLines = 2)
                            VenueMapLine(status)
                        }
                        TextButton(onClick = {}) { Text(stringResource(R.string.home_invite), style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Cyan)) }
                    }
                }
            }
        }
    }

    /**
     * Finding the whole crew: Sam (UWB) is upstairs and Jo downstairs, tagged on their faces
     * on the radar and in the strip; Mia is Bluetooth-only and upstairs, so tagged in the strip.
     */
    @Test fun venueFinder() = finder(
        "Iron Maiden",
        listOf(
            ArrowState.Pointing("sam", 20.0, 6.0, Method.UWB, false),
            ArrowState.Pointing("alex", 60.0, 45.0, Method.GPS_SERVER, false),
            ArrowState.Pointing("jo", 215.0, 14.0, Method.UWB, false),
            ArrowState.DistanceOnly("mia", 9.0, Trend.WARMER, Method.BLE_RSSI),
        ),
        mapOf("sam" to Floor.UP, "jo" to Floor.DOWN, "mia" to Floor.UP),
    )
}

/** English only: the same tag in the finder's other views, on map pins and in the map's list. */
class VenueMoreSnapshotTest : VenueSnapshots() {
    /** Under 3 m but a floor up: the arrow stays, tagged. No "found them" through the ceiling. */
    @Test fun venueUpstairs() = finder("Sam", listOf(ArrowState.Pointing("sam", 25.0, 2.8, Method.UWB, false)), mapOf("sam" to Floor.UP))

    /** Bluetooth only (no direction): how close, and which floor. */
    @Test fun venueClose() = finder("Sam", listOf(ArrowState.DistanceOnly("sam", 5.0, Trend.WARMER, Method.BLE_RSSI)), mapOf("sam" to Floor.DOWN))

    /** The faces the map draws (here at twice their size): placed by UWB, upstairs, downstairs, and plain GPS. */
    @Test fun venuePins() = snap {
        MoshTheme {
            val pins = remember {
                listOf(
                    MapPin("sam", "Sam", 0.0, 0.0, sam.color, "6 m", stale = false, exact = true),
                    MapPin("alex", "Alex", 0.0, 0.0, alex.color, "8 m", stale = false, exact = true, floor = "↑ Upstairs"),
                    MapPin("jo", "Jo", 0.0, 0.0, jo.color, "2 min ago", stale = false, floor = "↓ Downstairs"),
                    MapPin("mia", "Mia", 0.0, 0.0, mia.color, "20 min ago", stale = true),
                ).map { it to pinBitmap(it) }
            }
            // Mid grey, like a street map: the tag has to read on light and dark.
            Column(
                Modifier.fillMaxSize().background(Color(0xFF8E9AA5)).padding(24.dp),
                verticalArrangement = Arrangement.spacedBy(20.dp),
            ) {
                pins.forEach { (pin, bitmap) ->
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(20.dp)) {
                        Box(Modifier.background(Color(0xFFE9EDF0), RoundedCornerShape(8.dp)).padding(12.dp)) {
                            val size = with(LocalDensity.current) { Modifier.size((bitmap.width * 2).toDp(), (bitmap.height * 2).toDp()) }
                            Image(bitmap.asImageBitmap(), contentDescription = null, modifier = size, contentScale = ContentScale.FillBounds)
                        }
                        Text("${pin.name} · ${pin.caption}", style = Mosh.Label.copy(color = Color(0xFF1C1630)))
                    }
                }
            }
        }
    }

    /**
     * The map opened at the gig. The map itself can't be drawn here, but its list can: Sam is
     * placed by UWB (measured distance), Mia is heard on Bluetooth only (how close, never a
     * pin), Alex shares GPS and Jo shares nothing. Mates measured or heard right now come first.
     */
    @Test fun venueMapList() = snap {
        MoshTheme {
            val venue = LatLon(-36.8468, 174.7766)
            val me = LatLon(-36.8470, 174.7769)
            MapScreen(
                people = listOf(sam, alex, jo, mia),
                seen = mapOf("alex" to LocationBook.Seen(-36.8466, 174.7770, 1_000_000L - 30, 10, batteryPct = 64)),
                me = me,
                status = "Updated just now",
                nowMs = 1_000_000_000L,
                onFind = {}, onDirections = { _, _ -> }, onNudge = {}, onBack = {},
                inCrew = true,
                liveMap = false,
                venueView = VenueView(venue, me),
                uwb = mapOf("sam" to VenuePlacement.UwbReading(40.0, 6.0, 1_000_000_000L)),
                near = mapOf("mia" to 8.0),
                floors = mapOf("sam" to Floor.UP, "mia" to Floor.DOWN),
                heights = mapOf("sam" to 3.2, "mia" to -3.1),
            )
        }
    }
}

class Lang_es : VenueSnapshotTest() {
    override val lang get() = "es"
}

class Lang_es_rES : VenueSnapshotTest() {
    override val lang get() = "es-rES"
}

class Lang_pt : VenueSnapshotTest() {
    override val lang get() = "pt-rBR"
}

class Lang_fr : VenueSnapshotTest() {
    override val lang get() = "fr"
}

class Lang_de : VenueSnapshotTest() {
    override val lang get() = "de"

    /** Guard: the venue translations really load (otherwise these screenshots would be English). */
    @Test fun venueTranslationsLoad() = assertEquals("↑ Oben", paparazzi.context.getString(R.string.venue_floor_up))
}

class Lang_it : VenueSnapshotTest() {
    override val lang get() = "it"
}

class Lang_nl : VenueSnapshotTest() {
    override val lang get() = "nl"
}

class Lang_sv : VenueSnapshotTest() {
    override val lang get() = "sv"
}

class Lang_pl : VenueSnapshotTest() {
    override val lang get() = "pl"
}

class Lang_tr : VenueSnapshotTest() {
    override val lang get() = "tr"
}

class Lang_ar : VenueSnapshotTest() {
    override val lang get() = "ar"
    override val rtl get() = true
}

class Lang_hi : VenueSnapshotTest() {
    override val lang get() = "hi"
}

class Lang_th : VenueSnapshotTest() {
    override val lang get() = "th"
}

class Lang_vi : VenueSnapshotTest() {
    override val lang get() = "vi"
}

class Lang_in : VenueSnapshotTest() {
    override val lang get() = "in"
}

class Lang_ja : VenueSnapshotTest() {
    override val lang get() = "ja"
}

class Lang_ko : VenueSnapshotTest() {
    override val lang get() = "ko"
}

class Lang_zh_rCN : VenueSnapshotTest() {
    override val lang get() = "zh-rCN"
}

class Lang_zh_rTW : VenueSnapshotTest() {
    override val lang get() = "zh-rTW"
}

class Lang_en_rUS : VenueSnapshotTest() {
    override val lang get() = "en-rUS"
}
