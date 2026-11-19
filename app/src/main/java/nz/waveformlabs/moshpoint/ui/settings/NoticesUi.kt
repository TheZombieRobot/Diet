package nz.waveformlabs.moshpoint.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.safety.Notices
import nz.waveformlabs.moshpoint.ui.Mosh

/**
 * The app's own notices (safety/Notices): Live stopped and why, and a full phone. A notice about
 * Live offers to go live again; going live is always this tap, never a notification or intent.
 */
@Composable
internal fun NoticeDialog(kind: Notices.Kind, onGoLive: () -> Unit, onClose: () -> Unit) {
    val dismiss: (@Composable () -> Unit)? = if (kind.isLive) {
        { NoticeDismiss(onClose) }
    } else {
        null
    }
    AlertDialog(
        onDismissRequest = onClose,
        containerColor = Mosh.Deep,
        title = { Text(noticeTitle(kind), style = Mosh.Heading) },
        text = { Text(noticeText(kind), style = Mosh.Body) },
        confirmButton = { NoticeConfirm(kind, onGoLive, onClose) },
        dismissButton = dismiss,
    )
}

/** The same notice drawn as a card, for screenshot tests (a dialog window can't be drawn there). */
@Composable
internal fun NoticeCard(kind: Notices.Kind) {
    Column(Modifier.fillMaxWidth().background(Mosh.Deep, RoundedCornerShape(28.dp)).padding(24.dp)) {
        Text(noticeTitle(kind), style = Mosh.Heading)
        Spacer(Modifier.height(16.dp))
        Text(noticeText(kind), style = Mosh.Body)
        Spacer(Modifier.height(18.dp))
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            if (kind.isLive) NoticeDismiss {}
            NoticeConfirm(kind, {}, {})
        }
    }
}

@Composable
private fun NoticeConfirm(kind: Notices.Kind, onGoLive: () -> Unit, onClose: () -> Unit) {
    if (kind.isLive) {
        TextButton(onClick = onGoLive) { Text(stringResource(R.string.live_go_live), style = Mosh.Label.copy(color = Mosh.Lime)) }
    } else {
        TextButton(onClick = onClose) { Text(stringResource(R.string.find_ok), style = Mosh.Label.copy(color = Mosh.Cyan)) }
    }
}

@Composable
private fun NoticeDismiss(onClose: () -> Unit) {
    TextButton(onClick = onClose) { Text(stringResource(R.string.main_not_now), style = Mosh.Label) }
}

@Composable
private fun noticeTitle(kind: Notices.Kind): String = stringResource(
    when (kind) {
        Notices.Kind.LIVE_STOPPED, Notices.Kind.LIVE_CANT_START, Notices.Kind.LIVE_CREW_NOT_ON -> R.string.live_off_title
        Notices.Kind.LIVE_TOO_LONG -> R.string.live_long_title
        Notices.Kind.STORAGE_FULL -> R.string.storage_full_title
    },
)

@Composable
private fun noticeText(kind: Notices.Kind): String = stringResource(
    when (kind) {
        Notices.Kind.LIVE_STOPPED, Notices.Kind.LIVE_CANT_START -> R.string.live_cant_start_text
        Notices.Kind.LIVE_TOO_LONG -> R.string.live_long_text
        Notices.Kind.STORAGE_FULL -> R.string.storage_full_text
        Notices.Kind.LIVE_CREW_NOT_ON -> R.string.live_crew_not_on_text
    },
)
