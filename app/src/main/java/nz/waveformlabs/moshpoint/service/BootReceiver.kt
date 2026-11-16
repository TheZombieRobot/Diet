package nz.waveformlabs.moshpoint.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import nz.waveformlabs.moshpoint.crew.BackgroundChecks

/**
 * After a reboot or an app update (Android drops alarms and services then): the background
 * checks are set again (docs/WAVE2_SAFETY.md), and Live comes back:
 *  - after a reboot, only with "Stay live after a restart" (otherwise it's off, not by your
 *    choice, so being in a crew tonight still puts you live when the app opens);
 *  - after an update, if it was on: an update isn't you switching it off.
 * Either way only if it still should be (the night isn't over, under 12 hours: core LiveRules).
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED -> {
                BackgroundChecks.rearm(app)
                if (VisibilityPrefs.alwaysOn(app)) LiveControl.restore(app)
                else if (VisibilityPrefs.isVisible(app)) VisibilityPrefs.markStopped(app)
            }
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                BackgroundChecks.rearm(app)
                LiveControl.restore(app)
            }
        }
    }
}
