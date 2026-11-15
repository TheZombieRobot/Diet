package nz.waveformlabs.moshpoint

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.crew.CrewNotifications
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.gigs.Memories

class MemoryReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext
        val done = goAsync()
        CoroutineScope(Dispatchers.Main).launch {
            try {
                GigArchive.refreshList(app)
                Memories.today(GigArchive.gigs).firstOrNull()?.let { (g, years) ->
                    CrewNotifications.post(app, title = Memories.headline(g, years), text = Txt.p(R.plurals.crew_memory_text, g.photos + g.clips), openMap = false)
                }
                Memories.schedule(app, GigArchive.gigs) // the next one
            } finally {
                done.finish()
            }
        }
    }
}
