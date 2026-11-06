package nz.waveformlabs.moshpoint.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Restores visibility after a reboot, but only if the user chose "always on" and it was on. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (VisibilityPrefs.alwaysOn(context) && VisibilityPrefs.isVisible(context)) {
            VisibilityService.start(context)
        }
    }
}
