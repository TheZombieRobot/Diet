package nz.waveformlabs.moshpoint.wear

import android.app.NotificationManager
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import nz.waveformlabs.moshpoint.core.watch.Buzz

/**
 * Plays the buzzes [nz.waveformlabs.moshpoint.core.watch.BuzzPlanner] chooses
 * (docs/WATCH.md, problem 7).
 *
 * The watch's own settings win, and it is Android that applies them, not us: guidance buzzes
 * are tagged as notification-class, so the system's vibration strength, master switch, silent
 * mode, Do Not Disturb and battery saver all govern them. Buzzes under the wearer's finger
 * (hold ticks, sent, failed) are tagged as touch feedback. Strength is always the system
 * default: no fixed amplitude, and never a usage that would break through the wearer's settings.
 */
object Buzzer {
    fun play(context: Context, buzz: Buzz) {
        val vibrator = context.getSystemService(Vibrator::class.java) ?: return
        if (!vibrator.hasVibrator()) return
        // A waveform starts with a wait, then on, off, on...
        val effect = VibrationEffect.createWaveform(longArrayOf(0L) + buzz.pulsesMs, -1)
        runCatching {
            if (Build.VERSION.SDK_INT >= 33) {
                val usage = if (buzz.guidance) VibrationAttributes.USAGE_NOTIFICATION else VibrationAttributes.USAGE_TOUCH
                vibrator.vibrate(effect, VibrationAttributes.createForUsage(usage))
            } else {
                val usage = if (buzz.guidance) AudioAttributes.USAGE_NOTIFICATION_EVENT else AudioAttributes.USAGE_ASSISTANCE_SONIFICATION
                @Suppress("DEPRECATION")
                vibrator.vibrate(effect, AudioAttributes.Builder().setUsage(usage).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
            }
        }
    }

    /**
     * Best guess at whether the watch is muting guidance buzzes right now (silent, Do Not
     * Disturb, theatre or bedtime mode, battery saver, or no motor). Only used to tell the
     * wearer why it's quiet; the muting itself is the system's doing.
     */
    fun silenced(context: Context): Boolean {
        val vibrator = context.getSystemService(Vibrator::class.java)
        if (vibrator == null || !vibrator.hasVibrator()) return true
        if (context.getSystemService(AudioManager::class.java)?.ringerMode == AudioManager.RINGER_MODE_SILENT) return true
        val filter = context.getSystemService(NotificationManager::class.java)?.currentInterruptionFilter
        if (filter != null && filter != NotificationManager.INTERRUPTION_FILTER_ALL && filter != NotificationManager.INTERRUPTION_FILTER_UNKNOWN) return true
        return context.getSystemService(PowerManager::class.java)?.isPowerSaveMode == true
    }
}
