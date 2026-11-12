package nz.waveformlabs.moshpoint.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalInspectionMode
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.core.watch.NoArrow
import nz.waveformlabs.moshpoint.core.watch.WatchMate
import nz.waveformlabs.moshpoint.core.watch.WatchState
import nz.waveformlabs.moshpoint.core.watch.WristView
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import java.util.Locale

/**
 * Every watch screen as a PNG, on a small (192 dp) and a large (227 dp) round watch, in every
 * language the app ships (docs/WATCH.md, problem 10). The picture is cut to the round glass on
 * a grey surround, exactly as a watch would show it, so text that runs off the curve is plain
 * to see: German and Thai run long, Arabic runs right to left.
 *
 *   ./gradlew :wear:recordPaparazziDebug   -> wear/src/test/snapshots/images/
 *
 * Files are named ..._WatchScreensTest_<screen>[<language>_<size>].png.
 */
@RunWith(Parameterized::class)
class WatchScreensTest(private val lang: String, private val size: String) {
    companion object {
        /** English first, then the app's 19 languages, then US English for feet and miles. */
        val LANGUAGES = listOf(
            "en", "es", "es-rES", "pt-rBR", "fr", "de", "it", "nl", "sv", "pl", "tr", "ar", "hi", "th", "vi", "in", "ja", "ko",
            "zh-rCN", "zh-rTW", "en-rUS",
        )

        @JvmStatic
        @Parameterized.Parameters(name = "{0}_{1}")
        fun cases(): List<Array<String>> = LANGUAGES.flatMap { l -> listOf("small", "large").map { arrayOf(l, it) } }
    }

    private val rtl get() = lang == "ar"

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = (if (size == "small") DeviceConfig.WEAR_OS_SMALL_ROUND else DeviceConfig.GALAXY_WATCH4_CLASSIC_LARGE).copy(
            locale = lang.takeIf { it != "en" },
            layoutDirection = if (rtl) com.android.resources.LayoutDirection.RTL else com.android.resources.LayoutDirection.LTR,
        ),
        theme = "android:Theme.Material.NoActionBar",
    )

    /** Numbers and units follow the same language and country (en-NZ = metric English). */
    @Before fun locale() {
        Locale.setDefault(Locale.forLanguageTag(if (lang == "en") "en-NZ" else lang.replace("-r", "-")))
    }

    private fun snap(content: @Composable () -> Unit) = paparazzi.snapshot {
        CompositionLocalProvider(
            LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr,
            // A snapshot is one frame, and the Wear scrolling list keeps itself hidden until its
            // second (it settles its scroll position first). In inspection mode, the same switch
            // Android Studio's previews use, it draws straight away.
            LocalInspectionMode provides true,
        ) {
            // The round glass, on a grey surround so its edge can be seen.
            Box(Modifier.fillMaxSize().background(Color(0xFF3A3A3A))) {
                Box(Modifier.fillMaxSize().clip(CircleShape)) { WristTheme { content() } }
            }
        }
    }

    private val now = 1_800_000_000L
    private val sam = WatchMate("sam", "Sam", 0xFF22E4FF.toInt(), lastSeenSec = now - 20, distanceM = 40.0)
    private val jo = WatchMate("jo", "Jo", 0xFFFFB020.toInt(), lastSeenSec = now - 60, distanceM = 1_240.0)
    private val alexandra = WatchMate("alex", "Alexandra", 0xFFC86BFF.toInt(), lastSeenSec = now - 15 * 60)
    private val mia = WatchMate("mia", "Mia", 0xFFB6FF3B.toInt(), lastSeenSec = now - 30)
    private val crew = WatchState(plus = true, crewName = "Laneway crew", sentAtSec = now, mates = listOf(sam, jo, mia, alexandra))

    private fun finder(ui: FinderUi) = snap { FinderScreen(ui, face = null) }
    private fun live(view: WristView, facing: Boolean = false, buzzOff: Boolean = false) =
        FinderUi("Sam", 0xFF22E4FF.toInt(), FinderStatus.LIVE, view, facing = facing, buzzOff = buzzOff)

    // ---- Crew list ----

    @Test fun crew() = snap { CrewScreen(crew, now, emptyMap()) }

    @Test fun crewLocked() = snap { CrewScreen(WatchState(plus = false, sentAtSec = now), now, emptyMap()) }

    @Test fun crewNoPhone() = snap { CrewScreen(null, now, emptyMap()) }

    @Test fun pingNotSent() = snap { CrewScreen(crew, now, emptyMap(), flash = PingFate.OUT_OF_REACH) }

    // ---- Finder ----

    @Test fun finderArrow() = finder(live(WristView.Arrow(35.0, 40.0, rough = false)))

    @Test fun finderFacing() = finder(live(WristView.Arrow(4.0, 1_240.0, rough = false), facing = true))

    @Test fun finderHoldFlat() = finder(live(WristView.DistanceOnly(40.0, Trend.STEADY, NoArrow.HOLD_FLAT)))

    @Test fun finderCloser() = finder(live(WristView.DistanceOnly(6.5, Trend.WARMER, NoArrow.NO_DIRECTION), buzzOff = true))

    @Test fun finderSearching() = finder(live(WristView.Searching))

    @Test fun finderNeedsPhone() = finder(FinderUi("Sam", 0xFF22E4FF.toInt(), FinderStatus.NEEDS_PHONE))

    @Test fun finderFound() = finder(FinderUi("Sam", 0xFF22E4FF.toInt(), FinderStatus.FOUND, canRestart = true))

    @Test fun finderAmbient() = finder(live(WristView.DistanceOnly(40.0, Trend.STEADY, NoArrow.HOLD_FLAT)).copy(ambient = true))

    // ---- Need help ----

    @Test fun sosHold() = snap { SosScreen(SosUi(SosPhase.HOLD, progress = 0.6f)) }

    @Test fun sosSent() = snap { SosScreen(SosUi(SosPhase.SENT)) }

    @Test fun sosNotSent() = snap { SosScreen(SosUi(SosPhase.OUT_OF_REACH)) }

    @Test fun sosUnconfirmed() = snap { SosScreen(SosUi(SosPhase.UNCONFIRMED)) }
}
