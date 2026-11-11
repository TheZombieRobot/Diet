package nz.waveformlabs.moshpoint.wear

import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import nz.waveformlabs.moshpoint.core.watch.Decoded
import nz.waveformlabs.moshpoint.core.watch.WatchMessage
import nz.waveformlabs.moshpoint.core.watch.WatchProtocol

/**
 * Everything the phone sends lands here, whether or not the watch app is open:
 *  - live messages (find updates, ping answers) go straight on to [PhoneLink.incoming];
 *  - crew status and faces, pushed only when they change, go into [CrewStore], and the tile
 *    and complication are asked to redraw. That push is their only refresh: nothing polls.
 */
class WatchListenerService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != WatchProtocol.PATH_TO_WATCH) return
        when (val d = WatchProtocol.decode(event.data)) {
            is Decoded.Ok -> PhoneLink.dispatch(d.message)
            is Decoded.TooNew -> {
                // The phone speaks a newer version than this build reads: tell the wearer which
                // device to update, and tell the phone what we can read.
                PhoneLink.dispatch(WatchMessage.VersionNotice(d.version, d.version))
                Wearable.getMessageClient(this).sendMessage(event.sourceNodeId, WatchProtocol.PATH_TO_PHONE, WatchProtocol.versionNotice())
            }
            is Decoded.TooOld -> PhoneLink.dispatch(WatchMessage.VersionNotice(d.version, d.version))
            else -> Unit // a message type from the future, or not ours: ignore
        }
    }

    override fun onDataChanged(events: DataEventBuffer) {
        var changed = false
        for (event in events) {
            val item = event.dataItem
            val path = item.uri.path ?: continue
            if (event.type != DataEvent.TYPE_CHANGED) continue
            if (path == WatchProtocol.PATH_STATE) {
                PhoneLink.stateBytes(item)?.let { if (CrewStore.onState(this, it) != null) changed = true }
            } else if (path.startsWith(WatchProtocol.PATH_FACE_PREFIX)) {
                // This callback runs on its own thread, so waiting for the picture here is fine.
                val key = path.removePrefix(WatchProtocol.PATH_FACE_PREFIX)
                val asset = DataMapItem.fromDataItem(item).dataMap.getAsset(WatchProtocol.KEY_IMAGE)
                if (asset != null && key.isNotBlank() && !CrewStore.hasFace(key)) {
                    runCatching {
                        val response = Tasks.await(Wearable.getDataClient(this).getFdForAsset(asset))
                        try {
                            response.inputStream?.use { it.readBytes() }?.let { CrewStore.onFace(this, key, it) }
                        } finally {
                            response.release()
                        }
                    }
                }
            }
        }
        if (changed) Glance.requestRedraw(this)
    }
}
