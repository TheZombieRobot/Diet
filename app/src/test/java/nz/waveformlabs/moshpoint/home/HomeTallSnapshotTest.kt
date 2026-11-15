package nz.waveformlabs.moshpoint.home

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import com.android.resources.Density
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.ui.HomeFixtures
import nz.waveformlabs.moshpoint.ui.HomeUnderTest
import nz.waveformlabs.moshpoint.ui.MoshTheme
import nz.waveformlabs.moshpoint.ui.SetupIssue
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/**
 * The whole home in one tall picture, every section at once, for checking the rhythm top to
 * bottom (docs/HOME_REDESIGN.md). Its own class, because it's saved at full size: Paparazzi
 * otherwise shrinks every picture to 1000 px, which would make a screen this tall unreadable.
 * A Pixel 5's width (393 dp) at 1.25 px per dp, so the file stays small.
 */
open class HomeTallSnapshotTest {
    protected open val lang: String? get() = null
    protected open val rtl: Boolean get() = false

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_5.copy(
            screenWidth = 491, screenHeight = 4300, xdpi = 200, ydpi = 200, density = Density.create(200),
            locale = lang,
            layoutDirection = if (rtl) com.android.resources.LayoutDirection.RTL else com.android.resources.LayoutDirection.LTR,
        ),
        theme = "android:Theme.Material.NoActionBar",
        useDeviceResolution = true,
    )

    @Before fun locale() {
        val tag = lang?.replace("-r", "-") ?: "en-NZ"
        java.util.Locale.setDefault(java.util.Locale.forLanguageTag(tag))
    }

    /** Every section: setup card, tonight's crew (check-in, meet-up, alert, plan, photos), Up next, memories, Past gigs, Friends. */
    @Test fun homeWhole() = snap {
        MoshTheme {
            HomeUnderTest(
                setupIssues = listOf(
                    SetupIssue(stringResource(R.string.main_setup_bluetooth_off), stringResource(R.string.main_setup_turn_on)) {},
                ),
                pinnedPlan = "Sound desk after the encore",
                moments = HomeFixtures.moments(),
                checkInBy = "2:15 am",
                privateUnread = mapOf("sam" to 1),
                flareNotes = mapOf("sam" to "🔥 " + stringResource(R.string.crew_vibe_bar)),
                pastGigs = HomeFixtures.pastGigs + HomeFixtures.lastYear,
                followers = listOf("Mum"),
                pings = listOf(HomeFixtures.ping(GigGroup.Ping.COMING, "Alex", 120)),
            )
        }
    }

    /** Right-to-left set on Compose itself: the renderer's own setting doesn't reach every screen. */
    private fun snap(content: @Composable () -> Unit) = paparazzi.snapshot {
        CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) { content() }
    }
}

// Every language the app ships (as in ScreensSnapshotTest). CI files them by language.
class Lang_es : HomeTallSnapshotTest() { override val lang get() = "es" }
class Lang_es_rES : HomeTallSnapshotTest() { override val lang get() = "es-rES" }
class Lang_pt : HomeTallSnapshotTest() { override val lang get() = "pt-rBR" }
class Lang_fr : HomeTallSnapshotTest() { override val lang get() = "fr" }
class Lang_de : HomeTallSnapshotTest() { override val lang get() = "de" }
class Lang_it : HomeTallSnapshotTest() { override val lang get() = "it" }
class Lang_nl : HomeTallSnapshotTest() { override val lang get() = "nl" }
class Lang_sv : HomeTallSnapshotTest() { override val lang get() = "sv" }
class Lang_pl : HomeTallSnapshotTest() { override val lang get() = "pl" }
class Lang_tr : HomeTallSnapshotTest() { override val lang get() = "tr" }
class Lang_ar : HomeTallSnapshotTest() {
    override val lang get() = "ar"
    override val rtl get() = true
}
class Lang_hi : HomeTallSnapshotTest() { override val lang get() = "hi" }
class Lang_th : HomeTallSnapshotTest() { override val lang get() = "th" }
class Lang_vi : HomeTallSnapshotTest() { override val lang get() = "vi" }
class Lang_in : HomeTallSnapshotTest() { override val lang get() = "in" }
class Lang_ja : HomeTallSnapshotTest() { override val lang get() = "ja" }
class Lang_ko : HomeTallSnapshotTest() { override val lang get() = "ko" }
class Lang_zh_rCN : HomeTallSnapshotTest() { override val lang get() = "zh-rCN" }
class Lang_zh_rTW : HomeTallSnapshotTest() { override val lang get() = "zh-rTW" }
class Lang_en_rUS : HomeTallSnapshotTest() { override val lang get() = "en-rUS" }
