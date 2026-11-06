package nz.waveformlabs.moshpoint.service

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.LocationBox
import nz.waveformlabs.moshpoint.core.SharedLocation
import nz.waveformlabs.moshpoint.locate.MyLocation
import nz.waveformlabs.moshpoint.locate.RelayClient

/**
 * While visible: seal our GPS position for friends and post it to the relay server under
 * our current rotating id. Only friends can open it (see LocationBox).
 *
 * Battery: asks for an update every 15 s or 5 m of movement, and skips uploads when
 * nothing has changed for a minute.
 */
class LocationUploader(context: Context, private val scope: CoroutineScope, private val mySecret: ByteArray) {
    private val myLocation = MyLocation(context)
    private val ephemeral = EphemeralId(mySecret)
    private var job: Job? = null
    private var lastUploadMs = 0L
    private var lastKey: String? = null

    fun start() {
        if (job != null || !RelayClient.enabled) return
        job = scope.launch {
            myLocation.updates(intervalMs = 15_000, minDistanceM = 5f).collect { loc ->
                val now = System.currentTimeMillis()
                val id = ephemeral.currentId(now)
                val key = "${id.contentHashCode()}:${(loc.latitude * 1e5).toLong()}:${(loc.longitude * 1e5).toLong()}"
                if (key == lastKey && now - lastUploadMs < 60_000) return@collect
                val sealed = LocationBox.seal(
                    mySecret, id,
                    SharedLocation(loc.latitude, loc.longitude, now / 1000, loc.accuracy.toInt()),
                )
                if (RelayClient.put(id, sealed)) {
                    lastUploadMs = now
                    lastKey = key
                }
            }
        }
    }

    fun stop() {
        job?.cancel()
        job = null
    }
}
