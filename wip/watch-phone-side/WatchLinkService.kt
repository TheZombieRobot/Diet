package nz.waveformlabs.moshpoint.watch

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import nz.waveformlabs.moshpoint.core.watch.Decoded
import nz.waveformlabs.moshpoint.core.watch.WatchMessage
import nz.waveformlabs.moshpoint.core.watch.WatchProtocol

/**
 * Everything the watch asks of the phone arrives here. Play services starts this service
 * (and the app's process, if need be) whenever a message comes in, so it works with the phone
 * app closed and the screen off.
 *
 *  - Wrist pings, "Need help" first among them: [WatchPings].
 *  - Find start / still looking / stop: [WatchFind].
 *  - "Tell me the crew status again": [WatchSync].
 */
class WatchLinkService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != WatchProtocol.PATH_TO_PHONE) return
        val watch = event.sourceNodeId
        WatchLink.heardFromWatch()
        WatchSync.start(this)
        when (val d = WatchProtocol.decode(event.data)) {
            is Decoded.Ok -> when (val m = d.message) {
                // Answered before this returns: the callback's own thread keeps the process
                // awake until the ping has gone and been checked.
                is WatchMessage.Ping -> WatchPings.handle(this, watch, m)
                is WatchMessage.FindStart -> WatchFind.start(this, watch, m)
                is WatchMessage.FindRenew -> WatchFind.renew(this, watch, m)
                is WatchMessage.FindStop -> WatchFind.stop(m.sessionId)
                WatchMessage.SyncRequest -> WatchSync.publishNow(this)
                else -> Unit
            }
            // A newer watch than this phone app understands: say what we can read, so the
            // watch can tell its wearer which of the two to update.
            is Decoded.TooNew -> Wearable.getMessageClient(this).sendMessage(watch, WatchProtocol.PATH_TO_WATCH, WatchProtocol.versionNotice())
            else -> Unit
        }
    }
}
