package nz.waveformlabs.moshpoint.ui

import android.content.Context
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import nz.waveformlabs.moshpoint.R
import org.json.JSONObject

/** One credit: a font or library, its version, and the licence(s) it comes under. */
internal data class Credit(val id: String, val name: String, val detail: String, val licences: List<LicenceText>)
internal data class LicenceText(val name: String, val text: String?, val url: String?)

/**
 * Every third-party part of the app with its licence. Libraries come from the list the build
 * makes of everything shipped (aboutlibraries.json), so it can't drift out of date; fonts are
 * bundled files with their licence texts in assets/licenses.
 */
internal object Credits {
    fun fonts(context: Context): List<Credit> {
        fun asset(f: String) = runCatching { context.assets.open("licenses/$f").bufferedReader().use { it.readText() } }.getOrNull()
        val ofl = LicenceText("SIL Open Font License 1.1", null, "https://openfontlicense.org")
        return listOf(
            Credit("font:unbounded", "Unbounded", "© 2022 The Unbounded Project Authors", listOf(ofl.copy(text = asset("Unbounded-OFL.txt")))),
            Credit("font:inter", "Inter", "© 2020 The Inter Project Authors", listOf(ofl.copy(text = asset("Inter-OFL.txt")))),
            Credit("font:permanent-marker", "Permanent Marker", "© Font Diner, Inc.", listOf(LicenceText("Apache License 2.0", asset("PermanentMarker-Apache2.txt"), "https://www.apache.org/licenses/LICENSE-2.0"))),
        )
    }

    /**
     * Licences the generated list only links to, but whose terms ask for the notice to ship with
     * the app: bundled in assets/licenses/third-party and matched by the licence's URL.
     */
    private val bundled = mapOf(
        "facebook-android-sdk" to "third-party/Facebook-SDK-LICENSE.txt",
        "libyuv" to "third-party/libyuv-LICENSE.txt",
    )

    fun libraries(context: Context): List<Credit> = runCatching {
        val json = context.resources.openRawResource(R.raw.aboutlibraries).bufferedReader().use { it.readText() }
        parse(json) { l ->
            bundled.entries.firstOrNull { l.url?.contains(it.key) == true }?.let { (_, file) ->
                runCatching { context.assets.open("licenses/$file").bufferedReader().use { it.readText() } }.getOrNull()
            }
        }
    }.getOrDefault(emptyList())

    /** The build's library list; [fallback] supplies a licence text the list only links to. */
    internal fun parse(json: String, fallback: (LicenceText) -> String? = { null }): List<Credit> {
        val root = JSONObject(json)
        val lics = root.optJSONObject("licenses") ?: JSONObject()
        val libs = root.optJSONArray("libraries") ?: return emptyList()
        return (0 until libs.length()).map { i ->
            val l = libs.getJSONObject(i)
            val ids = l.optJSONArray("licenses")
            val licences = (0 until (ids?.length() ?: 0)).map { j ->
                val id = ids!!.getString(j)
                val o = lics.optJSONObject(id)
                val t = LicenceText(o?.optString("name")?.takeIf { it.isNotBlank() } ?: id, o?.optString("content")?.takeIf { it.isNotBlank() }, o?.optString("url")?.takeIf { it.isNotBlank() })
                if (t.text == null) t.copy(text = fallback(t)) else t
            }
            val by = l.optJSONObject("organization")?.optString("name")?.takeIf { it.isNotBlank() }
                ?: l.optJSONArray("developers")?.optJSONObject(0)?.optString("name")?.takeIf { it.isNotBlank() }
            val version = l.optString("artifactVersion")
            Credit(
                "lib:" + l.optString("uniqueId").ifBlank { "#$i" },
                l.optString("name").takeIf { it.isNotBlank() } ?: l.optString("uniqueId"),
                listOfNotNull(by, version.takeIf { it.isNotBlank() }).joinToString(" · "),
                licences,
            )
        }.distinctBy { Triple(it.name, it.detail, it.licences.map { l -> l.name }) }.sortedBy { it.name.lowercase() }
    }
}

/** Full-screen acknowledgements: copyright, map credit, fonts and libraries; tap one to read its licence. */
@Composable
internal fun AcknowledgementsScreen(onClose: () -> Unit) {
    Dialog(onDismissRequest = onClose, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        AcknowledgementsContent(onClose)
    }
}

@Composable
internal fun AcknowledgementsContent(onClose: () -> Unit) {
    val context = LocalContext.current
    val fonts = remember { Credits.fonts(context) }
    val libraries = remember { Credits.libraries(context) }
    var open by rememberSaveable { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize().background(Mosh.Deep).statusBarsPadding().navigationBarsPadding()) {
        Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.setup_open_source_licences), style = Mosh.Heading, modifier = Modifier.weight(1f), maxLines = 2)
            TextButton(onClick = onClose) { Text(stringResource(R.string.setup_done), style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Cyan)) }
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, end = 20.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            item {
                Text(stringResource(R.string.setup_copyright, "2026"), style = Mosh.Body.copy(color = Mosh.Text))
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.setup_ack_intro), style = Mosh.Body.copy(fontSize = 14.sp, color = Mosh.TextDim))
                Spacer(Modifier.height(18.dp))
                Text(stringResource(R.string.setup_ack_map), style = Mosh.Eyebrow)
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.setup_ack_map_text), style = english(Mosh.Body.copy(fontSize = 14.sp, color = Mosh.TextDim)))
                Text(stringResource(R.string.venue_ack_lookup), style = english(Mosh.Body.copy(fontSize = 14.sp, color = Mosh.TextDim)))
                Spacer(Modifier.height(18.dp))
                Text(stringResource(R.string.setup_ack_fonts), style = Mosh.Eyebrow)
            }
            items(fonts, key = { it.id }) { c -> CreditRow(c, open == c.id) { open = if (open == c.id) null else c.id } }
            if (libraries.isNotEmpty()) {
                item { Spacer(Modifier.height(18.dp)); Text(stringResource(R.string.setup_ack_libraries), style = Mosh.Eyebrow) }
                items(libraries, key = { it.id }) { c ->
                    CreditRow(c, open == c.id) { open = if (open == c.id) null else c.id }
                }
            }
        }
    }
}

@Composable
private fun CreditRow(c: Credit, expanded: Boolean, onTap: () -> Unit) {
    Column(Modifier.fillMaxWidth().animateContentSize().clickable(onClick = onTap).padding(vertical = 10.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(c.name, style = english(Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Text)), maxLines = 2, overflow = TextOverflow.Ellipsis)
                val sub = listOf(c.detail, c.licences.joinToString(", ") { it.name }).filter { it.isNotBlank() }.joinToString("\n")
                if (sub.isNotBlank()) Text(sub, style = english(Mosh.Body.copy(fontSize = 12.sp, lineHeight = 16.sp, color = Mosh.TextFaint)))
            }
            Text(if (expanded) "–" else "+", style = Mosh.Label.copy(fontSize = 18.sp, color = Mosh.Cyan), modifier = Modifier.padding(start = 12.dp))
        }
        if (expanded) {
            c.licences.forEach { l ->
                Spacer(Modifier.height(8.dp))
                Text(
                    l.text ?: listOfNotNull(l.name, l.url).joinToString("\n"),
                    style = english(Mosh.Body.copy(fontSize = 11.sp, lineHeight = 15.sp, color = Mosh.TextDim)),
                )
            }
        }
    }
}

/**
 * Credits are English (names, legal text). Lay them out left to right so "©" and full stops stay
 * where they belong in right-to-left languages, but keep them on the page's starting edge.
 */
@Composable
private fun english(base: TextStyle): TextStyle {
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    return base.copy(textDirection = TextDirection.Ltr, textAlign = if (rtl) TextAlign.Right else TextAlign.Left)
}
