package nz.waveformlabs.moshpoint.ui

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import nz.waveformlabs.moshpoint.CrewChat
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.GigGroup
import org.junit.Rule
import org.junit.Test

/**
 * Messages without signal, as the crew chat shows them: the three delivery states under your
 * own messages (Sent, Sent nearby, Waiting for signal) and the banner that says what's going on.
 *
 * In its own class (and file) rather than in ScreensSnapshotTest, so it merges cleanly with
 * other work on that file. Rendered like the rest:
 *
 *   ./gradlew :app:recordPaparazziDebug   -> app/src/test/snapshots/images/
 *
 * CI files them as offlineChat.png, de-offlineChat.png and so on.
 */
open class OfflineSnapshotTest {
    /** Resource qualifier for the language ("de", "ar", "en-rUS"), or null for metric English. */
    protected open val lang: String? get() = null
    protected open val rtl: Boolean get() = false

    @get:Rule
    val paparazzi = Paparazzi(
        deviceConfig = DeviceConfig.PIXEL_5.copy(
            locale = lang,
            layoutDirection = if (rtl) com.android.resources.LayoutDirection.RTL else com.android.resources.LayoutDirection.LTR,
        ),
        theme = "android:Theme.Material.NoActionBar",
    )

    /** Numbers, dates and units follow the same language and country (en-NZ = metric English). */
    @org.junit.Before fun locale() {
        val tag = lang?.replace("-r", "-") ?: "en-NZ"
        java.util.Locale.setDefault(java.util.Locale.forLanguageTag(tag))
    }

    private val now = 1_000_000L

    private fun theirs(from: String, ago: Long, text: String) = CrewChat.Line(from, now - ago, text, false)

    private fun mine(ago: Long, text: String, state: Int, kind: Int = GigGroup.Ping.CHAT) =
        CrewChat.Line("Me", now - ago, text, true, kind, state = state)

    private fun note(ago: Long, text: String) = CrewChat.Line("", now - ago, text, false, CrewChat.NOTE)

    @Composable
    private fun Chat(lines: List<CrewChat.Line>, hint: String?) {
        MoshTheme {
            CrewChatScreen(
                crewName = "Iron Maiden",
                lines = lines,
                plan = null,
                flares = emptyList(),
                myName = "Me",
                nowSec = now,
                meetUp = "Sound desk",
                readOnly = false,
                onSend = {}, onSetPlan = {}, onFlare = {}, onEndFlare = {}, onPing = {}, onCheckIn = {},
                onSharePlan = {}, onOpenMap = {}, onBack = {},
                colourOf = { mapOf("Jo" to 0xFFFFB020.toInt(), "Alex" to 0xFFFF2E93.toInt())[it] },
                offlineHint = hint,
            )
        }
    }

    /**
     * No signal in the venue, live, Bluetooth on. One message went before the signal dropped
     * (Sent), a quick "Meet at the pin" has reached a crew phone nearby (Sent nearby), and the
     * newest hasn't reached anyone yet (Waiting for signal).
     */
    @Test fun offlineChat() = snap {
        Chat(
            listOf(
                theirs("Jo", 600, "Where is everyone?"),
                mine(540, "Left of the stage", CrewChat.SENT),
                theirs("Jo", 200, "No signal in here at all"),
                mine(120, "Sound desk", CrewChat.NEARBY, GigGroup.Ping.MEET_AT_PIN),
                mine(20, "Bringing drinks 🍻", CrewChat.WAITING),
            ),
            stringResource(R.string.offline_hint_bluetooth),
        )
    }

    /** No signal and not live: nothing can be passed on, so the banner says to go live. */
    @Test fun offlineChatNotLive() = snap {
        Chat(
            listOf(
                theirs("Alex", 900, "Doors at 7"),
                mine(60, "Anyone near gate C?", CrewChat.WAITING),
                mine(30, "I can't find you", CrewChat.WAITING),
            ),
            stringResource(R.string.offline_hint_go_live),
        )
    }

    /** You removed someone with no signal: the crew's new key waits for the internet, and Bluetooth messages with it. */
    @Test fun offlineChatNewKey() = snap {
        Chat(
            listOf(
                theirs("Jo", 400, "Who's that in the chat?"),
                note(120, stringResource(R.string.crew_note_you_removed, "Sam")),
                note(119, stringResource(R.string.offline_note_rekey_offline)),
                mine(30, "Sorted", CrewChat.WAITING),
            ),
            stringResource(R.string.offline_hint_paused),
        )
    }

    /** Right-to-left set on Compose itself: the renderer's own setting doesn't reach every screen. */
    private fun snap(content: @Composable () -> Unit) = paparazzi.snapshot {
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.ui.platform.LocalLayoutDirection provides
                if (rtl) androidx.compose.ui.unit.LayoutDirection.Rtl else androidx.compose.ui.unit.LayoutDirection.Ltr,
        ) { content() }
    }
}

/*
 * The same three screens in every language the app ships: the banner is the longest new text
 * and the state labels sit under a bubble, so clipping would show here first.
 */
class Offline_Lang_es : OfflineSnapshotTest() {
    override val lang get() = "es"
}

class Offline_Lang_es_rES : OfflineSnapshotTest() {
    override val lang get() = "es-rES"
}

class Offline_Lang_pt : OfflineSnapshotTest() {
    override val lang get() = "pt"
}

class Offline_Lang_fr : OfflineSnapshotTest() {
    override val lang get() = "fr"
}

class Offline_Lang_de : OfflineSnapshotTest() {
    override val lang get() = "de"

    /** Guard: the translations really load (otherwise these screenshots would be English). */
    @Test fun offlineTranslationsLoad() = kotlin.test.assertEquals("Warte auf Empfang", paparazzi.context.getString(R.string.offline_state_waiting))
}

class Offline_Lang_it : OfflineSnapshotTest() {
    override val lang get() = "it"
}

class Offline_Lang_nl : OfflineSnapshotTest() {
    override val lang get() = "nl"
}

class Offline_Lang_sv : OfflineSnapshotTest() {
    override val lang get() = "sv"
}

class Offline_Lang_pl : OfflineSnapshotTest() {
    override val lang get() = "pl"
}

class Offline_Lang_tr : OfflineSnapshotTest() {
    override val lang get() = "tr"
}

class Offline_Lang_ar : OfflineSnapshotTest() {
    override val lang get() = "ar"
    override val rtl get() = true
}

class Offline_Lang_hi : OfflineSnapshotTest() {
    override val lang get() = "hi"
}

class Offline_Lang_th : OfflineSnapshotTest() {
    override val lang get() = "th"
}

class Offline_Lang_vi : OfflineSnapshotTest() {
    override val lang get() = "vi"
}

class Offline_Lang_in : OfflineSnapshotTest() {
    override val lang get() = "in"
}

class Offline_Lang_ja : OfflineSnapshotTest() {
    override val lang get() = "ja"
}

class Offline_Lang_ko : OfflineSnapshotTest() {
    override val lang get() = "ko"
}

class Offline_Lang_zh_rCN : OfflineSnapshotTest() {
    override val lang get() = "zh-rCN"
}

class Offline_Lang_zh_rTW : OfflineSnapshotTest() {
    override val lang get() = "zh-rTW"
}

class Offline_Lang_en_rUS : OfflineSnapshotTest() {
    override val lang get() = "en-rUS"
}
