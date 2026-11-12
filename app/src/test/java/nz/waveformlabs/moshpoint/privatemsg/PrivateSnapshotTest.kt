package nz.waveformlabs.moshpoint.privatemsg

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import nz.waveformlabs.moshpoint.CrewChat
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.ui.CrewTiles
import nz.waveformlabs.moshpoint.ui.FinderScreen
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.MoshTheme
import nz.waveformlabs.moshpoint.ui.PrivateChatScreen
import nz.waveformlabs.moshpoint.ui.UnreadBadge
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import kotlin.test.assertEquals

/*
 * Private messages (docs/PRIVATE_MESSAGES.md): the new bits of screen, drawn without a phone.
 *
 * Kept apart from the other screenshot tests, in a package of its own, so its Lang_ classes
 * (the names CI's file naming looks for) don't clash with theirs. CI files them as
 * privateThread.png, de-privateThread.png...
 */

/** What both test classes share. Not a test itself. */
abstract class PrivateSnapshots {
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
    protected val all get() = listOf(sam, alex, jo).associateBy { it.id }

    protected val nowSec = 1_000_000L

    /** A message in a thread, [ago] seconds old, as the thread screen gets it. */
    protected fun line(from: String, ago: Long, text: String, mine: Boolean, state: Int, id: String) =
        CrewChat.Line(from, nowSec - ago, text, mine, sender = if (mine) 1L else 7L, state = state, id = id)

    /** Right-to-left set on Compose itself: the renderer's own setting doesn't reach every screen. */
    protected fun snap(content: @Composable () -> Unit) = paparazzi.snapshot {
        CompositionLocalProvider(LocalLayoutDirection provides if (rtl) LayoutDirection.Rtl else LayoutDirection.Ltr) { content() }
    }
}

/** Drawn in every language (the Lang_ classes below): wherever a translation has to fit. */
open class PrivateSnapshotTest : PrivateSnapshots() {
    /**
     * A thread with Sam at the gig, with no signal (the crew chat's note on top): Sam's messages,
     * and ours as Sent, Sent nearby and Waiting for signal.
     */
    @Test fun privateThread() = snap {
        MoshTheme {
            PrivateChatScreen(
                name = "Sam",
                lines = listOf(
                    line("Sam", 900, "are you still near the bar?", false, CrewChat.SENT, "a1"),
                    line("Me", 840, "yes! upstairs by the window", true, CrewChat.SENT, "a2"),
                    line("Sam", 600, "ok coming up. don't tell Jo 🤫", false, CrewChat.SENT, "a3"),
                    line("Me", 540, "my lips are sealed", true, CrewChat.SENT, "a4"),
                    line("Me", 90, "got you a drink", true, CrewChat.NEARBY, "a5"),
                    line("Me", 20, "where are you??", true, CrewChat.WAITING, "a6"),
                ),
                nowSec = nowSec,
                myName = "Me",
                muted = false,
                onSend = {},
                onBack = {},
                offlineHint = stringResource(R.string.offline_hint_bluetooth),
                colour = sam.color,
            )
        }
    }

    /** A new thread: who can read it (only the two of you), and where to write. */
    @Test fun privateEmpty() = snap {
        MoshTheme {
            PrivateChatScreen(name = "Sam", lines = emptyList(), nowSec = nowSec, myName = "Me", muted = false, onSend = {}, onBack = {}, colour = sam.color)
        }
    }

    /** Alex muted on this phone: the note under the top, Unmute, and a message that couldn't be sent. */
    @Test fun privateMuted() = snap {
        MoshTheme {
            PrivateChatScreen(
                name = "Alex",
                lines = listOf(
                    line("Alex", 7200, "you coming to the afterparty??", false, CrewChat.SENT, "b1"),
                    line("Alex", 7100, "hello??", false, CrewChat.SENT, "b2"),
                    line("Me", 300, "sorry, phone died", true, CrewChat.FAILED, "b3"),
                ),
                nowSec = nowSec,
                myName = "Me",
                muted = true,
                onSend = {},
                onBack = {},
                colour = alex.color,
            )
        }
    }

    /**
     * Holding a crew mate's face on the home screen: "Message Sam" comes first in the options, and
     * Sam's face wears the count of unread private messages. (The dialog's contents: a dialog
     * window can't be drawn here.)
     */
    @Test fun privateOptions() = snap {
        MoshTheme {
            Box(Modifier.fillMaxSize().background(Mosh.Ground).padding(24.dp)) {
                Column {
                    CrewTiles(listOf(sam, alex, jo), emptyMap(), nowSec, onFind = {}, onOptions = {}, badges = mapOf("sam" to 2))
                    Spacer(Modifier.height(24.dp))
                    Column(Modifier.fillMaxWidth().background(Mosh.Deep, RoundedCornerShape(28.dp)).padding(24.dp)) {
                        Text("Sam", style = Mosh.Heading)
                        Spacer(Modifier.height(12.dp))
                        TextButton(onClick = {}) {
                            Text(stringResource(R.string.private_message_name, "Sam"))
                            Spacer(Modifier.width(8.dp))
                            UnreadBadge(2)
                        }
                        TextButton(onClick = {}) { Text(stringResource(R.string.home_keep_friend, "Sam")) }
                        TextButton(onClick = {}) { Text(stringResource(R.string.home_set_photo)) }
                        TextButton(onClick = {}) { Text(stringResource(R.string.home_remove_name, "Sam"), color = Color(0xFFE53935)) }
                    }
                }
            }
        }
    }

    /** Finding Sam: "Message Sam" under the name, with the unread count. */
    @Test fun privateFinder() = snap {
        MoshTheme {
            FinderScreen(
                title = "Sam", visible = true,
                arrows = listOf(ArrowState.Pointing("sam", 25.0, 60.0, Method.GPS_SERVER, false)),
                friendOf = { all[it] }, scan = null,
                onScan = {}, onCancelScan = {}, onDismissScan = {},
                onMessage = {}, messageUnread = mapOf("sam" to 2),
                onBack = {},
            )
        }
    }
}

class Lang_es : PrivateSnapshotTest() {
    override val lang get() = "es"
}

class Lang_es_rES : PrivateSnapshotTest() {
    override val lang get() = "es-rES"
}

class Lang_pt : PrivateSnapshotTest() {
    override val lang get() = "pt-rBR"
}

class Lang_fr : PrivateSnapshotTest() {
    override val lang get() = "fr"
}

class Lang_de : PrivateSnapshotTest() {
    override val lang get() = "de"

    /** Guard: the translations really load (otherwise these screenshots would be English). */
    @Test fun privateTranslationsLoad() = assertEquals("Nachricht an Sam", paparazzi.context.getString(R.string.private_message_name, "Sam"))
}

class Lang_it : PrivateSnapshotTest() {
    override val lang get() = "it"
}

class Lang_nl : PrivateSnapshotTest() {
    override val lang get() = "nl"
}

class Lang_sv : PrivateSnapshotTest() {
    override val lang get() = "sv"
}

class Lang_pl : PrivateSnapshotTest() {
    override val lang get() = "pl"
}

class Lang_tr : PrivateSnapshotTest() {
    override val lang get() = "tr"
}

class Lang_ar : PrivateSnapshotTest() {
    override val lang get() = "ar"
    override val rtl get() = true
}

class Lang_hi : PrivateSnapshotTest() {
    override val lang get() = "hi"
}

class Lang_th : PrivateSnapshotTest() {
    override val lang get() = "th"
}

class Lang_vi : PrivateSnapshotTest() {
    override val lang get() = "vi"
}

class Lang_in : PrivateSnapshotTest() {
    override val lang get() = "in"
}

class Lang_ja : PrivateSnapshotTest() {
    override val lang get() = "ja"
}

class Lang_ko : PrivateSnapshotTest() {
    override val lang get() = "ko"
}

class Lang_zh_rCN : PrivateSnapshotTest() {
    override val lang get() = "zh-rCN"
}

class Lang_zh_rTW : PrivateSnapshotTest() {
    override val lang get() = "zh-rTW"
}

class Lang_en_rUS : PrivateSnapshotTest() {
    override val lang get() = "en-rUS"
}
