package nz.waveformlabs.moshpoint.watch

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.ui.Mosh

/**
 * Test builds only (Settings, under TESTING): Moshpoint+ off and on.
 *
 * There is no billing yet, so in a test build everyone is a member. This switch lets a tester
 * see the watch app as someone who hasn't paid does: the locked screen, the arrow and the
 * quick messages refused. And it lets them check the one thing that must never be behind
 * that: Need help from the wrist still goes (docs/WATCH.md, problems 8 and 9).
 *
 * Plain English on purpose, like the other debug tools: none of this is in release builds.
 */
@Composable
fun WatchDebugTools() {
    if (!BuildConfig.TEST_BUILD) return
    val context = LocalContext.current
    var plus by remember { mutableStateOf(runCatching { Entitlements.plus(context) }.getOrDefault(true)) }
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("Moshpoint+ (watch app)", style = Mosh.Label)
            Text(
                "Off: the watch shows its locked screen, and finding and quick messages from the wrist are refused. Need help from the wrist must still work.",
                style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint),
            )
        }
        Spacer(Modifier.width(12.dp))
        Switch(
            plus,
            {
                plus = it
                Entitlements.set(context, it)
            },
            colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Amber, checkedThumbColor = Color(0xFF1A1000), uncheckedTrackColor = Color(0xFF1C1630)),
        )
    }
}
