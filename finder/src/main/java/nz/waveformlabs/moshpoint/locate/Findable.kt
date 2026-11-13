package nz.waveformlabs.moshpoint.locate

import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.EphemeralId

/**
 * Being findable: what this phone does so its mates' finders can find it (docs/FINDER_MODULE.md).
 * Run it from a foreground service, which Android needs for advertising and scanning in the
 * background; the phone app's is `VisibilityService`, which does its gig work around this.
 *
 * - A Bluetooth advert with our rotating code (core [Advert]), swapped each time the code rotates
 *   and, within 30 s, when [identity] changes (the phone app: a crew starting or ending).
 *   Medium speed (~4 a second), fast for 90 s after a mate's finder says it is looking.
 * - On UWB phones: our UWB controlee address in the advert, and joining a looking mate's
 *   session ([UwbResponder]).
 * - Wi-Fi Aware: our rotating code published, ranging allowed ([WifiAwarePublisher]).
 * - A low-power listen for mates who are looking (it speeds the advert up, and on UWB phones
 *   joins their UWB session).
 * - Bluetooth or Wi-Fi Aware coming back on after being switched off: restarted.
 *
 * [startAdvertising] then [startListening] (or [start] for both): two steps so the host can do
 * its own work in between, in the order it always has. [scope] must run on the main thread.
 *
 * Battery: the advert is BALANCED at high TX power; the listen scan is LOW_POWER.
 */
class Findable(
    private val context: Context,
    private val scope: CoroutineScope,
    /** Who we are right now (the phone app: the crew pass at a gig, see its Identity). */
    private val identity: () -> ByteArray,
    /** Everyone who may be looking for us. */
    private val mates: () -> List<FinderMate>,
    /** Our air pressure for the advert (core `Baro` units), or null for none (the phone app: floors). */
    private val advertPressure: () -> Int? = { null },
    /** Every advert heard from a mate, before anything else is done with it (the phone app: floors). */
    private val onMateHeard: (mate: FinderMate, distanceM: Double, advert: Advert) -> Unit = { _, _, _ -> },
    /** A mate's finder is looking for us: every advert that says so (the phone app: share our GPS more often). */
    private val onMateLooking: (FinderMate) -> Unit = {},
    /** A mate asked us to light up: every advert that asks. */
    private val onAskedToLight: (FinderMate) -> Unit = {},
    /** Bluetooth was switched off or on: after the shared scan hears of it, before our own radios restart. */
    private val onBluetoothToggled: (on: Boolean) -> Unit = {},
) {
    private lateinit var broadcaster: BleBroadcaster
    private val mySecret: ByteArray get() = identity()
    private val ephemeral: EphemeralId get() = EphemeralId(mySecret)
    private var advertisedAs: String? = null
    private var uwbInfo: Advert.UwbInfo? = null
    private var uwb: UwbResponder? = null
    private var listener: BleRanger? = null
    private var rotateJob: Job? = null
    private var wifi: WifiAwarePublisher? = null
    private var radios: RadioWatcher? = null
    private var lastLookedAt = 0L

    /** Both steps at once, for a host with nothing to do in between. */
    fun start() {
        startAdvertising()
        startListening()
    }

    /** The advert, rotating with our code. */
    fun startAdvertising() {
        // Medium advert (~4 a second) by default: enough readings for spin-to-scan even before
        // we notice a friend looking (background listening is slow). Fast while one is looking.
        broadcaster = BleBroadcaster(context, AdvertiseSettings.ADVERTISE_MODE_BALANCED, "BT advert (visible)")

        rotateJob = scope.launch {
            while (true) {
                readvertise()
                wifi?.refresh()
                val now = System.currentTimeMillis()
                val nextRotation = (ephemeral.epochAt(now) + 1) * EphemeralId.DEFAULT_ROTATION_MS
                // Wake at the next rotation, or sooner if we become someone else (a crew
                // starting or ending) so crew mates can find us straight away.
                val until = nextRotation + 50
                while (System.currentTimeMillis() < until) {
                    delay(minOf(30_000L, until - System.currentTimeMillis()).coerceAtLeast(1L))
                    if (identityKey() != advertisedAs) break
                }
            }
        }
    }

    /** Wi-Fi Aware, the radio watcher, UWB, and the low-power listen for mates who are looking. */
    fun startListening() {
        if (wifiRttSupported(context)) {
            wifi = WifiAwarePublisher(context) { ephemeral.currentId(System.currentTimeMillis()) }.also { it.start() }
        }
        radios = RadioWatcher(
            context,
            onBluetooth = { on ->
                BleHub.onBluetooth(on)
                onBluetoothToggled(on)
                if (on) {
                    readvertise()
                    listener?.restart()
                    CrowdRelayRadio.restartAfterBluetooth(context)
                } else {
                    broadcaster.onBluetoothOff()
                }
            },
            onWifiAware = { available -> if (available) wifi?.restart() },
        ).also { it.start() }

        val responder = if (Capabilities.detect(context).uwb) {
            UwbResponder(context, scope) { info ->
                uwbInfo = info
                readvertise()
            }.also {
                uwb = it
                it.start()
            }
        } else {
            null
        }
        // Low-power listen for friends who are looking: speeds our advert up, and on UWB
        // phones joins their UWB session.
        listener = BleRanger(context, "BT scan (visible, listening for lookers)", mates) { friend, _, distanceM, advert ->
            onMateHeard(friend, distanceM, advert)
            if (advert.looking) onFriendLooking(friend)
            if (advert.askLight) onAskedToLight(friend)
            val info = advert.uwb
            if (info?.role == Advert.UwbRole.CONTROLLER) responder?.onFriendController(friend, info)
        }.also { it.start(lowLatency = false) }
        scope.launch {
            while (true) {
                delay(10_000)
                if (broadcaster.mode == AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY &&
                    System.currentTimeMillis() - lastLookedAt > FAST_FOR_MS
                ) {
                    broadcaster.mode = AdvertiseSettings.ADVERTISE_MODE_BALANCED
                    FinderLog.log("No one looking: advert back to medium")
                }
            }
        }
    }

    private fun onFriendLooking(friend: FinderMate) {
        lastLookedAt = System.currentTimeMillis()
        onMateLooking(friend)
        if (broadcaster.mode != AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY) {
            broadcaster.mode = AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY
            // Test builds only, checked here so release builds don't build the text (see BleRanger).
            if (FinderLog.enabled) FinderLog.log("${friend.name} is looking: advert to fast")
        }
    }

    private fun identityKey() = mySecret.copyOf(4).joinToString("") { "%02x".format(it) }

    /** Rebuild the advert now (the phone app: our pressure moved). Only after [startAdvertising]. */
    fun readvertise() {
        val me = mySecret
        advertisedAs = identityKey()
        val id = EphemeralId(me).currentId(System.currentTimeMillis())
        broadcaster.update(Advert.encode(me, id, uwbInfo, pressure = advertPressure()))
    }

    /**
     * Everything off. The UWB responder going re-advertises once without its UWB block just
     * before the advert stops, as it always has.
     */
    fun stop() {
        rotateJob?.cancel()
        radios?.stop()
        wifi?.stop()
        listener?.stop()
        uwb?.stop()
        if (::broadcaster.isInitialized) broadcaster.stop()
    }

    private companion object {
        const val FAST_FOR_MS = 90_000L
    }
}
