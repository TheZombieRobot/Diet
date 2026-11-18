package nz.waveformlabs.moshpoint

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import nz.waveformlabs.moshpoint.crew.CrewNotifications
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.gigs.GigWake

class GigWakeReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // The morning after: loading a finished crew ends it (and says where the photos went).
        if (intent.action == GigWake.ACTION_END) {
            GroupSync.load(context)
            return
        }
        GroupSync.load(context)
        nz.waveformlabs.moshpoint.venue.VenueMaps.sync(context) // gig day: finish the venue map if it isn't saved yet
        val g = GroupSync.group.value ?: return
        if (System.currentTimeMillis() / 1000 > g.startsAtSec + 2 * 3600) return // too late to say "tonight"
        val time = java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(g.startsAtSec * 1000))
        CrewNotifications.post(
            context,
            title = Txt.s(R.string.crew_wake_title, g.name),
            text = if (g.venue.isNotBlank()) Txt.s(R.string.crew_wake_text_venue, time, g.venue) else Txt.s(R.string.crew_wake_text, time),
            openMap = false,
            // Gone by itself once the gig's well under way, so it's never stale the next morning.
            timeoutMs = ((g.startsAtSec + 4 * 3600) * 1000 - System.currentTimeMillis()).coerceAtLeast(60_000),
        )
    }
}
