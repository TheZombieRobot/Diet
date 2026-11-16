package nz.waveformlabs.moshpoint.ui.moments

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.NeonButton

/**
 * "Add your photos from that night": what happens, then Android's photo picker ([onChoose]).
 * What's picked is copied into the gig, originals kept (StoryState.onPicked). The app never
 * looks through the phone's photos itself, so it needs no photo permission.
 */
@Composable
internal fun CameraRollPicker(gigName: String, adding: Boolean, onChoose: () -> Unit, onClose: () -> Unit) {
    Dialog(onDismissRequest = { if (!adding) onClose() }) {
        CameraRollContent(gigName, adding, onChoose, onClose)
    }
}

/** The dialog's contents (separate so it can be screenshot-tested). */
@Composable
internal fun CameraRollContent(gigName: String, adding: Boolean, onChoose: () -> Unit, onClose: () -> Unit) {
    Column(
        Modifier.widthIn(min = 280.dp, max = 560.dp).fillMaxWidth().background(Mosh.Deep, RoundedCornerShape(28.dp)).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.setup_roll_title), style = Mosh.Heading)
                Text(gigName, style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint))
            }
            TextButton(onClick = onClose, enabled = !adding) { Text("✕", style = Mosh.Label.copy(fontSize = 18.sp)) }
        }
        Text(stringResource(R.string.play_roll_pick_text), style = Mosh.Body)
        NeonButton(if (adding) stringResource(R.string.setup_roll_adding) else stringResource(R.string.play_roll_choose)) {
            if (!adding) onChoose()
        }
    }
}
