package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import nz.waveformlabs.moshpoint.ui.home.MessageSheetContent
import nz.waveformlabs.moshpoint.ui.home.SheetFrame
import nz.waveformlabs.moshpoint.ui.settings.PlusSettings
import nz.waveformlabs.moshpoint.ui.settings.SettingsContent
import org.junit.Rule
import org.junit.Test

/**
 * Text my spot (Moshpoint+, docs/REMOVE_SAFETY.md, stage 3): the button after the crew pings,
 * and Settings' Moshpoint+ switch that turns it on (members only, off until they do).
 *
 * In its own class (and file) rather than in ScreensSnapshotTest, so it merges cleanly with
 * other work on that file. Rendered like the rest:
 *
 *   ./gradlew :app:recordPaparazziDebug   -> app/src/test/snapshots/images/
 *
 * CI files them as textMySpot.png, de-textMySpot.png and so on.
 */
open class SpotSnapshotTest {
    /** Resource qualifier for the language ("de", "ar", "en-rUS"), or null for metric English. */
    protected open val lang: String? get() = null
    protected open val rtl: Boolean get() = false

    private fun device(base: DeviceConfig) = base.copy(
        locale = lang,
        layoutDirection = if (rtl) com.android.resources.LayoutDirection.RTL else com.android.resources.LayoutDirection.LTR,
    )

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = device(DeviceConfig.PIXEL_5), theme = "android:Theme.Material.NoActionBar")

    /** Numbers, dates and units follow the same language and country (en-NZ = metric English). */
    @org.junit.Before fun locale() {
        val tag = lang?.replace("-r", "-") ?: "en-NZ"
        java.util.Locale.setDefault(java.util.Locale.forLanguageTag(tag))
    }

    /**
     * Message crew, opened over tonight's crew, for a member who switched Text my spot on: the
     * row of pings scrolled to its end, where Text my spot is (violet: it opens the texting app).
     */
    private fun snapMessage() = snap {
        MoshTheme {
            BoxWithConstraints(Modifier.fillMaxSize()) {
                HomeUnderTest()
                Box(Modifier.fillMaxSize().background(Mosh.Scrim))
                Box(Modifier.align(Alignment.BottomCenter).heightIn(max = maxHeight - 32.dp)) {
                    SheetFrame { MessageSheetContent(onPing = {}, onTextSpot = {}, pings = rememberScrollState(100_000)) }
                }
            }
        }
    }

    @Test fun textMySpot() = snapMessage()

    @Test fun smallPhoneLargeFontTextMySpot() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        snapMessage()
    }

    /** Settings for a Moshpoint+ member: the Moshpoint+ mark, then Text my spot and satellite data (both off) after Data saver. */
    @Test fun settingsPlus() = snap {
        MoshTheme {
            Box(Modifier.background(Mosh.Deep)) {
                SettingsContent(
                    myName = "Josh", onMyName = {}, onSelfie = {}, onPickMyPhoto = {}, onRemoveMyPhoto = {},
                    onFacebook = {}, alwaysOn = true, onAlwaysOn = {},
                    phoneSummary = "This phone: UWB, Wi-Fi Aware, Bluetooth, compass, GPS", plus = true,
                )
            }
        }
    }

    /** The Moshpoint+ switches alone, small phone and large text (in Settings they're below the fold here). */
    @Test fun smallPhoneLargeFontPlusSettings() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        snap {
            MoshTheme {
                Column(Modifier.fillMaxSize().background(Mosh.Deep).padding(start = 24.dp, end = 24.dp, top = 24.dp)) {
                    Box(Modifier.fillMaxWidth()) { PlusSettings() }
                }
            }
        }
    }

    /** Right-to-left set on Compose itself: the renderer's own setting doesn't reach every screen. */
    private fun snap(content: @Composable () -> Unit) = paparazzi.snapshot {
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.ui.platform.LocalLayoutDirection provides
                if (rtl) androidx.compose.ui.unit.LayoutDirection.Rtl else androidx.compose.ui.unit.LayoutDirection.Ltr,
        ) { content() }
    }
}

/* The same in every language the app ships: the button's and the switch's text are new. */
class Spot_Lang_es : SpotSnapshotTest() {
    override val lang get() = "es"
}

class Spot_Lang_es_rES : SpotSnapshotTest() {
    override val lang get() = "es-rES"
}

class Spot_Lang_pt : SpotSnapshotTest() {
    override val lang get() = "pt"
}

class Spot_Lang_fr : SpotSnapshotTest() {
    override val lang get() = "fr"
}

class Spot_Lang_de : SpotSnapshotTest() {
    override val lang get() = "de"
}

class Spot_Lang_it : SpotSnapshotTest() {
    override val lang get() = "it"
}

class Spot_Lang_nl : SpotSnapshotTest() {
    override val lang get() = "nl"
}

class Spot_Lang_sv : SpotSnapshotTest() {
    override val lang get() = "sv"
}

class Spot_Lang_pl : SpotSnapshotTest() {
    override val lang get() = "pl"
}

class Spot_Lang_tr : SpotSnapshotTest() {
    override val lang get() = "tr"
}

class Spot_Lang_ar : SpotSnapshotTest() {
    override val lang get() = "ar"
    override val rtl get() = true
}

class Spot_Lang_hi : SpotSnapshotTest() {
    override val lang get() = "hi"
}

class Spot_Lang_th : SpotSnapshotTest() {
    override val lang get() = "th"
}

class Spot_Lang_vi : SpotSnapshotTest() {
    override val lang get() = "vi"
}

class Spot_Lang_in : SpotSnapshotTest() {
    override val lang get() = "in"
}

class Spot_Lang_ja : SpotSnapshotTest() {
    override val lang get() = "ja"
}

class Spot_Lang_ko : SpotSnapshotTest() {
    override val lang get() = "ko"
}

class Spot_Lang_zh_rCN : SpotSnapshotTest() {
    override val lang get() = "zh-rCN"
}

class Spot_Lang_zh_rTW : SpotSnapshotTest() {
    override val lang get() = "zh-rTW"
}

class Spot_Lang_en_rUS : SpotSnapshotTest() {
    override val lang get() = "en-rUS"
}
