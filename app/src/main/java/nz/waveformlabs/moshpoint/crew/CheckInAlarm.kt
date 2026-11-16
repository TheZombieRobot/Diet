package nz.waveformlabs.moshpoint.crew

import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import nz.waveformlabs.moshpoint.CheckInAlarmReceiver
import nz.waveformlabs.moshpoint.chat.OfflineMessages
import nz.waveformlabs.moshpoint.core.OutboxState
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.safety.AppErrors

/**
 * The overdue check-in, on time with every app closed (reliability P0-4). "Heading home, worry
 * if I'm not home in 45 minutes" runs on the crew's phones, and used to be checked only while
 * a phone had the app open or was live. Now:
 *
 *  - **A mate's check-in:** one alarm for the next moment anyone can be overdue (core
 *    CheckIns.nextCheckSec), set again whenever a check-in or Home safe arrives. When it goes
 *    off: load the crew, look for a Home safe (the relay's ping and chat mailboxes), then run
 *    the check, which alerts on the help channel.
 *  - **Your own:** a reminder shortly before the crew is alerted (core CheckInReminder), with
 *    "I'm home safe" on the notification itself.
 *
 * Doze-capable alarms (setAndAllowWhileIdle, RTC_WAKEUP): no exact-alarm permission; in deep
 * Doze Android may hold one back by up to about 15 minutes.
 */
object CheckInAlarm {
    private const val ACTION_DUE = "nz.waveformlabs.moshpoint.CHECK_IN_DUE"
    private const val ACTION_REMIND = "nz.waveformlabs.moshpoint.CHECK_IN_REMIND"
    private const val ACTION_HOME_SAFE = "nz.waveformlabs.moshpoint.CHECK_IN_HOME_SAFE"

    /** The reminder about our own check-in: one notification, replaced and removed in place. */
    const val REMINDER_NOTIFICATION = 0x30000001

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main + AppErrors.handler("CheckInAlarm"))

    /** Wake at [atSec] (unix s) to see who's overdue; null = nobody is on their way home. */
    fun planDue(c: Context, atSec: Long?) = plan(c, ACTION_DUE, atSec)

    /** Remind us at [atSec] about our own check-in; null = no alarm (none due, or shown already). Never touches a reminder already showing. */
    fun planReminder(c: Context, atSec: Long?) = plan(c, ACTION_REMIND, atSec)

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("checkin_alarm", Context.MODE_PRIVATE)

    /** The deadline (unix s) of the check-in whose reminder was last shown, or 0. */
    fun remindedFor(c: Context): Long = prefs(c).getLong("reminded_for", 0L)

    /** The reminder for the check-in due at [deadlineSec] is showing now: false if it already was (once per check-in). */
    fun markReminded(c: Context, deadlineSec: Long): Boolean {
        if (remindedFor(c) == deadlineSec) return false
        prefs(c).edit().putLong("reminded_for", deadlineSec).apply()
        return true
    }

    fun cancelReminderNotification(c: Context) {
        runCatching { c.applicationContext.getSystemService(NotificationManager::class.java)?.cancel(REMINDER_NOTIFICATION) }
    }

    /** "I'm home safe" on the reminder notification. */
    fun homeSafeIntent(c: Context): PendingIntent = pending(c.applicationContext, ACTION_HOME_SAFE)

    private fun plan(c: Context, action: String, atSec: Long?) {
        val app = c.applicationContext
        val am = app.getSystemService(AlarmManager::class.java) ?: return
        val pi = pending(app, action)
        runCatching {
            if (atSec == null) am.cancel(pi) else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atSec * 1000, pi)
        }.onFailure { DebugStatus.log("Check-in alarm not set: $it") }
    }

    private fun pending(c: Context, action: String) = PendingIntent.getBroadcast(
        c,
        when (action) {
            ACTION_DUE -> 44
            ACTION_REMIND -> 45
            else -> 46
        },
        Intent(c, CheckInAlarmReceiver::class.java).setAction(action),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    /** An alarm went off (or "I'm home safe" was tapped). [done] once it's handled; never longer than the broadcast may run. */
    internal fun fired(c: Context, action: String?, done: () -> Unit) {
        val app = c.applicationContext
        scope.launch {
            try {
                withTimeoutOrNull(BUDGET_MS) {
                    FriendsRepository.init(app)
                    if (GroupSync.group.value == null) GroupSync.load(app)
                    when (action) {
                        ACTION_REMIND -> GroupSync.remindCheckIn(app)
                        ACTION_HOME_SAFE -> homeSafe(app)
                        else -> GroupSync.checkInsDue(app)
                    }
                }
            } finally {
                done()
            }
        }
    }

    /** Tapped on the reminder: tell the crew, and wait a little for the outbox to get it out. */
    private suspend fun homeSafe(app: Context) {
        val sent = GroupSync.homeSafe(app)
        if (sent.id == 0L) return
        val until = System.currentTimeMillis() + HOME_SAFE_WAIT_MS
        while (System.currentTimeMillis() < until) {
            val s = OfflineMessages.followedState(sent.id)
            if (s == OutboxState.SENT || s == OutboxState.NEARBY) {
                cancelReminderNotification(app)
                return
            }
            if (s == OutboxState.FAILED) break
            delay(400)
        }
        // Not out yet: say so on the reminder, rather than letting it look done. The outbox keeps trying.
        CrewNotifications.homeSafeWaiting(app)
    }

    /** Under the 60 s a background broadcast may take. */
    private const val BUDGET_MS = 40_000L
    private const val HOME_SAFE_WAIT_MS = 12_000L
}
