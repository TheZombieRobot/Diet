package nz.waveformlabs.moshpoint.ui.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.sharing.TextMySpot
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.home.PlusChip

/**
 * Settings' Moshpoint+ switches, for members only (free users never see them): Text my spot
 * (docs/REMOVE_SAFETY.md, stage 3). Off until the member turns it on. The small amber Moshpoint+
 * mark on top is the one Plan a gig shows members: quiet, never louder than the switches.
 */
@Composable
internal fun PlusSettings() {
    val context = LocalContext.current
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        PlusChip()
        PlusSwitch(stringResource(R.string.spot_text), stringResource(R.string.spot_text_setting), TextMySpot.on.value) { TextMySpot.set(context, it) }
    }
}

@Composable
private fun PlusSwitch(title: String, note: String, on: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(title, style = Mosh.Label)
            Text(note, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 18.sp, color = Mosh.TextFaint))
        }
        Spacer(Modifier.width(12.dp))
        Switch(on, onChange, colors = SwitchDefaults.colors(checkedTrackColor = Mosh.Amber, checkedThumbColor = Color(0xFF140C00), uncheckedTrackColor = Color(0xFF1C1630)))
    }
}
