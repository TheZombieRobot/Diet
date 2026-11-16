package nz.waveformlabs.moshpoint

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import nz.waveformlabs.moshpoint.crew.CheckInAlarm

/** The check-in alarms and the reminder's "I'm home safe" (see [CheckInAlarm]). Not exported: only our own PendingIntents reach it. */
class CheckInAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CheckInAlarm.fired(context, intent.action) { pending.finish() }
    }
}
