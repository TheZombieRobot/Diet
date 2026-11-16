package nz.waveformlabs.moshpoint.main

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.safety.Notices
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.service.VisibilityService
import nz.waveformlabs.moshpoint.ui.settings.NoticeDialog

/**
 * Over everything: the app's own notices (safety/Notices), and the Live switch kept in step when
 * Live goes off by itself while the app is open (the night ended, 12 hours, Android stopped it).
 * Draws nothing at all when there's nothing to say.
 */
@Composable
internal fun AppNotices(a: MainActivity) {
    val running = VisibilityService.runningState.value
    LaunchedEffect(running) {
        if (!running && a.home.visibleToMates && !VisibilityPrefs.isVisible(a)) a.home.visibleToMates = false
    }
    val kind = Notices.showing.value ?: return
    // Live went off without you: the switch says so as the notice shows.
    LaunchedEffect(kind) { if (kind.isLive) a.home.visibleToMates = VisibilityPrefs.isVisible(a) && VisibilityService.isRunning }
    NoticeDialog(
        kind,
        onGoLive = {
            Notices.dismiss(a)
            a.home.setVisibility(true)
        },
        onClose = { Notices.dismiss(a) },
    )
}
