package nz.waveformlabs.moshpoint.service

import android.content.Context
import android.location.Location
import android.os.BatteryManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.LocationBox
import nz.waveformlabs.moshpoint.core.RelayPacket
import nz.waveformlabs.moshpoint.core.SharedLocation
import nz.waveformlabs.moshpoint.locate.CrowdRelayRadio
import nz.waveformlabs.moshpoint.locate.MyLocation
import nz.waveformlabs.moshpoint.locate.RelayClient

/**
 * While visible: seal our GPS position (and battery level) for friends, hand it to the
 * crowd relay, and post it to the relay under our current rotating id. Only friends can
 * open it.
 *
 * - **Ghost mode** ([VisibilityPrefs.ghost]): nothing goes on the map; you're still
 *   findable by Bluetooth up close.
 * - **Last gasp**: when the battery hits 5% we post one final position straight away,
 *   flagged, so mates know where you were when your phone died.
 *
 * Battery: asks for an update every 15 s or 5 m of movement, and skips uploads when
 * nothing has changed (see [RelayClient.uploadGapMs]).
 */
class LocationUploader(private val context: Context, private val scope: CoroutineScope, private val mySecret: ByteArray) {
    private val myLocation = MyLocation(context)
    private val ephemeral = EphemeralId(mySecret)
    private var job: Job? = null
    private var lastUploadMs = 0L
    private var lastKey: String? = null
    private var lastLoc: Location? = null
    private var gaspSent = false

    fun start() {
        if (job != null) return
        job = scope.launch {
            myLocation.updates(intervalMs = 15_000, minDistanceM = 5f).collect { loc ->
                lastLoc = loc
                publish(loc, force = false)
            }
        }
    }

    /** Battery changed (from the service's battery receiver). */
    fun onBattery(pct: Int, charging: Boolean) {
        if (charging || pct > 10) gaspSent = false
        if (!gaspSent && !charging && pct in 1..5) {
            val loc = lastLoc ?: return
            gaspSent = true
            DebugStatus.log("Battery $pct%: sending last-known location")
            scope.launch { publish(loc, force = true, lastGasp = true) }
        }
    }

    private suspend fun publish(loc: Location, force: Boolean, lastGasp: Boolean = false) {
        nz.waveformlabs.moshpoint.GhostMode.expireIfDue(context)
        if (VisibilityPrefs.ghost(context)) {
            CrowdRelayRadio.ownPacket = null
            DebugStatus.set("Location", "ghost mode: not shared")
            return
        }
        val now = System.currentTimeMillis()
        val id = ephemeral.currentId(now)
        val shared = SharedLocation(loc.latitude, loc.longitude, now / 1000, loc.accuracy.toInt(), battery(), lastGasp)
        // Always hand the crowd relay a fresh sealed copy (works with no signal).
        CrowdRelayRadio.ownPacket = RelayPacket(RelayPacket.MAX_TTL, id, LocationBox.seal(mySecret, id, shared))
        val key = "${id.contentHashCode()}:${(loc.latitude * 1e5).toLong()}:${(loc.longitude * 1e5).toLong()}"
        if (!force) {
            if (now - lastUploadMs < RelayClient.uploadGapMs) return
            // Standing still: a refresh every 3 minutes is plenty (the relay keeps the last one).
            if (key == lastKey && now - lastUploadMs < 180_000) return
        }
        if (RelayClient.put(id, LocationBox.seal(mySecret, id, shared))) {
            lastUploadMs = now
            lastKey = key
            DebugStatus.set("Location", "shared ${if (lastGasp) "(last gasp) " else ""}via ${RelayClient.label}")
        }
    }

    private fun battery(): Int? =
        context.getSystemService(BatteryManager::class.java)?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
            ?.takeIf { it in 0..100 }

    fun stop() {
        job?.cancel()
        job = null
    }
}
