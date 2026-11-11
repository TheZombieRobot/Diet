package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.OfflineMessages
import nz.waveformlabs.moshpoint.locate.RelayClient

/**
 * Test builds only (Settings, under TESTING): tools for trying "messages without signal".
 *
 *  - **Force no internet**: this phone stops talking to the relay, as if it had no signal.
 *    Bluetooth carries on, so two phones on a desk behave like two phones in a dead venue.
 *    (Airplane mode with Bluetooth back on is the real test; this is the quick one.)
 *  - **Message routes**: for each message, which way it went or came: queued, on air, a crew
 *    phone nearby has it, uploaded, uploaded for a crew mate, in by Bluetooth, in by crowd
 *    relay, in from the relay. Ids are the first six characters of the message id, the same
 *    on every phone, so two testers can compare logs.
 *
 * The words here are plain English on purpose, like the other debug tools: none of this is
 * in release builds (CI checks the release APK for the switch's label).
 */
@Composable
internal fun OfflineDebugTools() {
    if (!BuildConfig.TEST_BUILD) return
    var noInternet by remember { mutableStateOf(RelayClient.debugNoInternet) }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("Force no internet", style = Mosh.Label)
            Text(
                "This phone stops talking to the relay, as if it had no signal. Bluetooth carries on. Off again when the app restarts.",
                style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
            )
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            noInternet,
            {
                noInternet = it
                OfflineMessages.setNoInternet(it)
            },
            colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Amber, checkedThumbColor = Color(0xFF1A1000), uncheckedTrackColor = Color(0xFF1C1630)),
        )
    }
    Text("Message routes (newest first)", style = Mosh.Label.copy(fontSize = 14.sp))
    val routes = OfflineMessages.routes
    if (routes.isEmpty()) {
        Text("Nothing yet. Send a message in the crew chat.", style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint))
    } else {
        Column {
            routes.take(40).forEach { line ->
                Text(line, style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 16.sp, fontFamily = FontFamily.Monospace, color = Mosh.TextDim))
            }
        }
        TextButton(onClick = { OfflineMessages.routes.clear() }) {
            Text("Clear message routes", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
        }
    }
}
