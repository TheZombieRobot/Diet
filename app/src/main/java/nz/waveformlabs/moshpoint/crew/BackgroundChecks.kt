package nz.waveformlabs.moshpoint.crew

import android.content.Context
import nz.waveformlabs.moshpoint.chat.ChatSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository

/**
 * Every background check set again (reliability P1-5): after a reboot or an update (Android
 * drops an app's alarms then) and at app start. The hourly chat check and the followers'
 * 15-minute check never move later for it (core AlarmPlan); loading the crew sets its
 * gig-day wake-up.
 */
object BackgroundChecks {
    fun rearm(c: Context) {
        val app = c.applicationContext
        FriendsRepository.init(app)
        if (GroupSync.group.value == null) GroupSync.load(app)
        if (ChatSync.allCrews(app).isNotEmpty()) ChatSync.schedule(app)
        if (GroupSync.group.value != null && GroupSync.following) FollowCheck.schedule(app)
    }
}
