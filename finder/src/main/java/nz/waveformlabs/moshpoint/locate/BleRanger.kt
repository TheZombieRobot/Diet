package nz.waveformlabs.moshpoint.locate

import android.bluetooth.le.ScanResult
import android.content.Context
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.RssiRanging

/**
 * Listens for friends' Moshpoint adverts over Bluetooth LE.
 *
 * Every advert carries a rotating 16-byte code (see [Advert]). We check it against each
 * friend's [FinderMate.ephemeralId]; on a match we decode the rest (UWB set-up details, if
 * any) and report it with the signal strength. Strangers' codes are ignored (later
 * they'll be relayed for the crowd network instead).
 */
class BleRanger(
    context: Context,
    /** Name shown in the debug panel, e.g. "BT scan (finder)". */
    private val debugName: String,
    private val friends: () -> List<FinderMate>,
    private val onAdvert: (friend: FinderMate, rssiDbm: Int, distanceM: Double, advert: Advert) -> Unit,
) {
    private val app = context.applicationContext
    private var lowLatency = true
    private val rangers = mutableMapOf<String, RssiRanging>()
    private var running = false
    private var heard = 0

    /** When the advert being handled was actually received (elapsedRealtime ms): callbacks can lag. */
    var lastHeardAtElapsedMs = 0L
        private set

    /** When we last heard any friend (elapsedRealtime ms). */
    var lastHeardAt = 0L
        private set

    private fun handle(result: ScanResult) {
        val data = result.scanRecord?.getServiceData(Ble.SERVICE_UUID) ?: return
        val id = Advert.idOf(data) ?: return
        val now = System.currentTimeMillis()
        val friend = friends().firstOrNull { it.ephemeralId.matches(id, now) } ?: return
        val advert = Advert.decode(friend.secret, data) ?: return
        val ranger = rangers.getOrPut(friend.id) { RssiRanging() }
        heard++
        FinderLog.set(debugName, "on, heard ${friend.name} ${result.rssi} dBm (#$heard)")
        lastHeardAtElapsedMs = result.timestampNanos / 1_000_000
        lastHeardAt = android.os.SystemClock.elapsedRealtime()
        onAdvert(friend, result.rssi, ranger.add(result.rssi), advert)
    }

    /**
     * Listen through the shared scan ([BleHub]). [lowLatency] = the finder is on screen: fast
     * scanning and every repeat of every advert, so readings keep flowing.
     * Needs BLUETOOTH_SCAN (Android 12+) or location (Android 10/11).
     */
    fun start(lowLatency: Boolean) {
        if (running && this.lowLatency == lowLatency) return
        this.lowLatency = lowLatency
        running = true
        BleHub.subscribe(app, this, BleHub.Sub(listOf(Ble.SERVICE_UUID), fast = lowLatency, unfiltered = lowLatency) { handle(it) })
        FinderLog.set(debugName, "on (${if (lowLatency) "fast" else "low power"}), nothing heard yet")
    }

    /**
     * Restart the shared scan, so the phone reports a friend it has already heard again
     * (some chips drop repeats even unfiltered). [BleHub] keeps within Android's limit.
     */
    fun refresh(minGapMs: Long = 6_000) {
        if (running) BleHub.refresh(minGapMs)
    }

    /** Call when Bluetooth comes back on: the old scan died with it. */
    fun restart() {
        BleHub.onBluetooth(true)
    }

    fun stop() {
        if (!running) return
        BleHub.unsubscribe(app, this)
        running = false
        FinderLog.set(debugName, "off")
    }
}
