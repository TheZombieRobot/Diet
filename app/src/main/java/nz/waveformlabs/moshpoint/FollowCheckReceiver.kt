package nz.waveformlabs.moshpoint

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import nz.waveformlabs.moshpoint.crew.FollowCheck
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository

class FollowCheckReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        GroupSync.load(app)
        if (GroupSync.group.value == null || !GroupSync.following) {
            FollowCheck.cancel(app)
            return
        }
        FriendsRepository.init(app)
        // A one-off alarm now (it wakes the phone in Doze): the next one is set before this one's work.
        FollowCheck.ranNow(app)
        val done = goAsync()
        CoroutineScope(Dispatchers.Main + nz.waveformlabs.moshpoint.safety.AppErrors.handler("FollowCheck")).launch {
            try {
                withTimeoutOrNull(25_000) { GroupSync.syncOnce(app) }
            } finally {
                done.finish()
            }
        }
    }
}
