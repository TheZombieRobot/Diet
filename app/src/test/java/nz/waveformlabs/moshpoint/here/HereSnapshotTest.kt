package nz.waveformlabs.moshpoint.here

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
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
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.Floor
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.ui.FinderScreen
import nz.waveformlabs.moshpoint.ui.ImHereChoice
import nz.waveformlabs.moshpoint.ui.MapPin
import nz.waveformlabs.moshpoint.ui.MapScreen
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.MoshTheme
import nz.waveformlabs.moshpoint.ui.PinNote
import nz.waveformlabs.moshpoint.ui.VenueView
import nz.waveformlabs.moshpoint.ui.pinBitmap
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import kotlin.test.assertEquals

/*
 * "I'm here" (docs/IM_HERE.md): the new bits of screen, drawn without a phone. The map itself
 * can't be drawn here (it needs the phone's native map library), but its list, the faces it
 * draws, the finder and the drop-a-pin dialog's contents can.
 *
 * Kept apart from the other screenshot tests, in a package of its own, so its Lang_ classes
 * (the names CI's file naming looks for) don't clash with theirs. CI files them as
 * hereMapList.png, de-hereMapList.png...
 */

/** What both test classes share. Not a test itself. */
abstract class HereSnapshots {
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

    protected val nowMs = 1_000_000_000L
    protected val nowSec = nowMs / 1000
    protected val venue = LatLon(-36.8468, 174.7766)
    protected val me = LatLon(-36.8470, 174.7769)

    /** Sam pinned the bar three minutes ago (by Sam's clock). */
    protected val samPin = GigGroup.Here(nowSec - 180, 20, -36.84655, 174.77640, 50_500, sender = 7L, id = 70L)

    protected fun finder(title: String, arrows: List<ArrowState>, floors: Map<String, Floor>, pinned: Map<String, PinNote>) = snap {
        MoshTheme {
            FinderScreen(
                title = title, visible = true, arrows = arrows, friendOf = { all[it] }, scan = null,
                onScan = {}, onCancelScan = {}, onDismissScan = {}, floors = floors, pinned = pinned, onBack = {},
            )
        }
    }

    /** Right-to-left set on Compose itself: the renderer's own setting doesn't reach every screen. */
    protected fun snap(content: @Composable () -> Unit) = paparazzi.snapshot {
        CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) { content() }
    }
}

/** Drawn in every language (the Lang_ classes below): wherever a translation has to fit. */
open class HereSnapshotTest : HereSnapshots() {
    /**
     * The map's list at the gig. Our own pin first, with ✕. Sam pinned the bar upstairs three
     * minutes ago: the distance is to the bar, the tag is the bar's floor. Alex shares GPS, Mia
     * is heard on Bluetooth only, Jo shares nothing.
     */
    @Test fun hereMapList() = snap {
        MoshTheme {
            MapScreen(
                people = listOf(sam, alex, jo, mia),
                seen = mapOf(
                    "alex" to LocationBook.Seen(-36.8466, 174.7770, nowSec - 30, 10, batteryPct = 64),
                    // Sam's own GPS is somewhere else: the pin replaces it.
                    "sam" to LocationBook.Seen(-36.8490, 174.7790, nowSec - 20, 40),
                ),
                me = me,
                status = "Updated just now",
                nowMs = nowMs,
                onFind = {}, onDirections = { _, _ -> }, onNudge = {}, onBack = {},
                inCrew = true,
                liveMap = false,
                venueView = VenueView(venue, me),
                near = mapOf("mia" to 8.0),
                floors = mapOf("mia" to Floor.DOWN, "sam" to Floor.DOWN),
                pinned = mapOf("sam" to samPin),
                pinnedFloors = mapOf("sam" to Floor.UP),
                myPin = GigGroup.Here(nowSec - 120, 20, me.lat, me.lon, null, sender = 1L, id = 10L),
                onImHere = { _, _ -> },
            )
        }
    }

    /**
     * The whole crew in the finder: Sam's arrow points at the bar Sam pinned (upstairs, three
     * minutes ago, both on Sam's face); Jo is placed by UWB, a floor down; Alex by GPS.
     */
    @Test fun hereFinder() = finder(
        "Iron Maiden",
        listOf(
            ArrowState.Pointing("sam", 20.0, 40.0, Method.HERE_PIN, false),
            ArrowState.Pointing("alex", 120.0, 85.0, Method.GPS_SERVER, false),
            ArrowState.Pointing("jo", 215.0, 14.0, Method.UWB, false),
            ArrowState.DistanceOnly("mia", 9.0, Trend.WARMER, Method.BLE_RSSI),
        ),
        // Sam's live floor says downstairs; the spot Sam pinned is upstairs, and that is what's shown.
        mapOf("sam" to Floor.DOWN, "jo" to Floor.DOWN),
        mapOf("sam" to PinNote(180, Floor.UP)),
    )

    /** Long-press on the map: "I'm here" comes first, one tap, nothing to type. (The dialog's contents: a dialog window can't be drawn here.) */
    @Test fun hereDialog() = snap {
        MoshTheme {
            Box(Modifier.fillMaxSize().background(Mosh.Ground).padding(24.dp), contentAlignment = Alignment.Center) {
                Column(Modifier.fillMaxWidth().background(Mosh.Deep, RoundedCornerShape(28.dp)).padding(24.dp)) {
                    Text(stringResource(R.string.find_drop_pin), style = Mosh.Heading)
                    Spacer(Modifier.height(16.dp))
                    ImHereChoice {}
                    Text(stringResource(R.string.find_drop_pin_crew_help), style = Mosh.Body)
                    Spacer(Modifier.height(10.dp))
                    OutlinedTextField("", {}, singleLine = true, placeholder = { Text(stringResource(R.string.find_drop_pin_hint)) })
                    Spacer(Modifier.height(12.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = {}) { Text(stringResource(R.string.find_just_for_me), style = Mosh.Label.copy(color = Mosh.Cyan)) }
                        TextButton(onClick = {}) { Text(stringResource(R.string.find_crew_meetup), style = Mosh.Label.copy(color = Mosh.Pink)) }
                    }
                }
            }
        }
    }
}

/** English only: one mate in the finder, and the faces the map draws. */
class HereMoreSnapshotTest : HereSnapshots() {
    /** Finding Sam: the arrow points at Sam's pin, the chip says so, the tag is the pinned spot's floor. */
    @Test fun hereFinderOne() = finder(
        "Sam",
        listOf(ArrowState.Pointing("sam", 25.0, 60.0, Method.HERE_PIN, false)),
        mapOf("sam" to Floor.DOWN),
        mapOf("sam" to PinNote(180, Floor.UP)),
    )

    /** The faces on the map (twice their size): pinned upstairs, pinned on our floor, and a GPS face for comparison. */
    @Test fun herePins() = snap {
        MoshTheme {
            val pins = remember {
                listOf(
                    MapPin("sam", "Sam", 0.0, 0.0, sam.color, "pinned 3 min ago", stale = false, exact = true, floor = "↑ Upstairs"),
                    MapPin("jo", "Jo", 0.0, 0.0, jo.color, "pinned just now", stale = false, exact = true),
                    MapPin("alex", "Alex", 0.0, 0.0, alex.color, "2 min ago", stale = false),
                ).map { it to pinBitmap(it) }
            }
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
}

class Lang_es : HereSnapshotTest() {
    override val lang get() = "es"
}

class Lang_es_rES : HereSnapshotTest() {
    override val lang get() = "es-rES"
}

class Lang_pt : HereSnapshotTest() {
    override val lang get() = "pt-rBR"
}

class Lang_fr : HereSnapshotTest() {
    override val lang get() = "fr"
}

class Lang_de : HereSnapshotTest() {
    override val lang get() = "de"

    /** Guard: the translations really load (otherwise these screenshots would be English). */
    @Test fun hereTranslationsLoad() = assertEquals("Ich bin hier", paparazzi.context.getString(R.string.here_button))
}

class Lang_it : HereSnapshotTest() {
    override val lang get() = "it"
}

class Lang_nl : HereSnapshotTest() {
    override val lang get() = "nl"
}

class Lang_sv : HereSnapshotTest() {
    override val lang get() = "sv"
}

class Lang_pl : HereSnapshotTest() {
    override val lang get() = "pl"
}

class Lang_tr : HereSnapshotTest() {
    override val lang get() = "tr"
}

class Lang_ar : HereSnapshotTest() {
    override val lang get() = "ar"
    override val rtl get() = true
}

class Lang_hi : HereSnapshotTest() {
    override val lang get() = "hi"
}

class Lang_th : HereSnapshotTest() {
    override val lang get() = "th"
}

class Lang_vi : HereSnapshotTest() {
    override val lang get() = "vi"
}

class Lang_in : HereSnapshotTest() {
    override val lang get() = "in"
}

class Lang_ja : HereSnapshotTest() {
    override val lang get() = "ja"
}

class Lang_ko : HereSnapshotTest() {
    override val lang get() = "ko"
}

class Lang_zh_rCN : HereSnapshotTest() {
    override val lang get() = "zh-rCN"
}

class Lang_zh_rTW : HereSnapshotTest() {
    override val lang get() = "zh-rTW"
}

class Lang_en_rUS : HereSnapshotTest() {
    override val lang get() = "en-rUS"
}
