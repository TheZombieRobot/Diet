package nz.waveformlabs.moshpoint.watch

import android.bluetooth.le.AdvertiseSettings
import android.content.Context
import android.os.SystemClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.Identity
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.FriendSimulator
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.locate.Ble
import nz.waveformlabs.moshpoint.locate.BleBroadcaster
import nz.waveformlabs.moshpoint.locate.BleHub
import nz.waveformlabs.moshpoint.locate.BleRanger
import nz.waveformlabs.moshpoint.locate.Capabilities
import nz.waveformlabs.moshpoint.locate.CrowdRelayRadio
import nz.waveformlabs.moshpoint.locate.GpsFinder
import nz.waveformlabs.moshpoint.locate.RadioWatcher
import nz.waveformlabs.moshpoint.locate.UwbFinder
import nz.waveformlabs.moshpoint.locate.WifiAwareFinder
import nz.waveformlabs.moshpoint.locate.wifiRttSupported

/**
 * Finding for the watch with the phone in a pocket and its screen off (docs/WATCH.md,
 * problems 3 and 4). Built from the same parts as the phone's own finder ([nz.waveformlabs.
 * moshpoint.locate.LocatorEngine]), which is left alone, with three differences that a pocket
 * forces:
 *
 * - **A filtered scan.** The phone's finder scans unfiltered, which Android suspends the
 *   moment the screen goes off. This one asks for a fast *filtered* scan, which keeps going.
 * - **No phone compass, no motion sensor, no spin-scan, no walk-and-watch.** A pocketed
 *   phone's heading says nothing about where its owner faces. So UWB gives distance only
 *   here, and direction comes from GPS or the crowd relay (plain geometry).
 * - **No 20-a-second loop.** Fixes are handed on as they arrive.
 *
 * Only runs while the phone's own finder is not: two "I'm looking" adverts or two UWB
 * sessions from one phone would trip over each other.
 *
 * [scope] must run on the main thread, like the finder's.
 */
internal class PocketFinder(
    private val context: Context,
    private val scope: CoroutineScope,
    /** The one mate being found (null = nobody). */
    private val mate: () -> Friend?,
    private val onFix: (Fix) -> Unit,
) {
    private fun identity(): ByteArray = Identity.current(context)

    /** Real mates only: a simulated one has no radio to listen for. */
    private fun friends(): List<Friend> = listOfNotNull(mate()?.takeIf { !FriendsRepository.isSimulated(it.id) })

    private var jobs = listOf<Job>()
    private var lookingAdvert: BleBroadcaster? = null
    private var uwbInfo: Advert.UwbInfo? = null
    private val fastScan = Any()
    private var sim: FriendSimulator? = null
    private var simFor: String? = null

    val running: Boolean get() = jobs.isNotEmpty()

    /** The compass correction for the watch: 0 until the phone has a GPS fix (no GPS bearing exists before that either). */
    val declinationDeg: Double get() = gps.declinationDeg

    private val uwb: UwbFinder? = if (Capabilities.detect(context).uwb) {
        UwbFinder(
            context, scope, ::identity,
            onAdvertInfo = { info ->
                uwbInfo = info
                updateLookingAdvert()
            },
            // The angle is measured at antennas facing a leg: only the distance is passed on.
            onResult = { friendId, distance, _ ->
                if (distance != null) onFix(Fix(friendId, Method.UWB, bearingDeg = null, distanceM = distance, confidence = 0.8, timestampMs = System.currentTimeMillis()))
            },
            nameOf = { id -> FriendsRepository.byId(id)?.name },
        )
    } else {
        null
    }

    private val ble = BleRanger(context, "BT scan (watch finding)", ::friends) { friend, _, distance, advert ->
        onFix(Fix(friend.id, Method.BLE_RSSI, null, distance, confidence = 0.7, timestampMs = System.currentTimeMillis()))
        val info = advert.uwb
        if (info?.role == Advert.UwbRole.CONTROLEE) uwb?.onFriendControlee(friend.id, info.address)
    }

    private val gps = GpsFinder(context, scope, ::friends) { onFix(it) }

    private val wifi: WifiAwareFinder? = if (wifiRttSupported(context)) {
        WifiAwareFinder(context, scope, ::friends) { friendId, distance ->
            onFix(Fix(friendId, Method.WIFI_AWARE, null, distance, confidence = 0.85, timestampMs = System.currentTimeMillis()))
        }
    } else {
        null
    }

    private val radios = RadioWatcher(
        context,
        onBluetooth = { on ->
            BleHub.onBluetooth(on)
            if (on) {
                ble.restart()
                updateLookingAdvert()
            } else {
                lookingAdvert?.onBluetoothOff()
            }
        },
        onWifiAware = { available ->
            if (available) {
                wifi?.stop()
                wifi?.start()
            }
        },
    )

    fun start() {
        if (running) return
        // Listen through the shared scan as a quiet, filtered listener, and separately ask for
        // it to be fast: together that is "fast and filtered", which survives screen-off.
        ble.start(lowLatency = false)
        BleHub.subscribe(context, fastScan, BleHub.Sub(listOf(Ble.SERVICE_UUID), fast = true, unfiltered = false) { })
        uwb?.start()
        gps.start()
        wifi?.start()
        radios.start()
        CrowdRelayRadio.startListening(context)
        jobs = listOf(
            // The "I'm looking" advert tells a visible mate's phone to speed its own advert up
            // (and carries our UWB details). Its id rotates with everyone's.
            scope.launch {
                while (true) {
                    val now = System.currentTimeMillis()
                    delay((EphemeralId(identity()).epochAt(now) + 1) * EphemeralId.DEFAULT_ROTATION_MS - now + 50)
                    updateLookingAdvert()
                }
            },
            scope.launch {
                while (true) {
                    tick()
                    delay(250)
                }
            },
        )
        updateLookingAdvert()
        DebugStatus.log("Watch: pocket finder on")
    }

    fun stop() {
        if (!running) return
        ble.stop()
        BleHub.unsubscribe(context, fastScan)
        uwb?.stop()
        gps.stop()
        wifi?.stop()
        radios.stop()
        CrowdRelayRadio.stopListening(context)
        lookingAdvert?.stop()
        jobs.forEach { it.cancel() }
        jobs = emptyList()
        sim = null
        DebugStatus.log("Watch: pocket finder off")
    }

    private fun tick() {
        // Gone quiet (some chips report a filtered advert once and drop the repeats): a gentle
        // refresh, as the phone's finder does. BleHub keeps within Android's scan limit.
        if (SystemClock.elapsedRealtime() - ble.lastHeardAt > 8_000) ble.refresh(minGapMs = 12_000)
        // Test builds: a simulated friend walks in from far away, so the wrist can be tried
        // with one phone and no second person.
        val m = mate() ?: return
        if (!DebugStatus.enabled || !FriendsRepository.isSimulated(m.id)) return
        val s = sim?.takeIf { simFor == m.id }
            ?: FriendSimulator(m.id, startBearingDeg = (m.id.hashCode() and 0xFF) * 360.0 / 256, seed = m.id.hashCode()).also {
                sim = it
                simFor = m.id
            }
        s.tick(System.currentTimeMillis(), headingDeg = 0.0).forEach(onFix)
    }

    private fun updateLookingAdvert() {
        if (!running) return
        val adv = lookingAdvert
            ?: BleBroadcaster(context, AdvertiseSettings.ADVERTISE_MODE_BALANCED, "BT advert (watch looking)").also { lookingAdvert = it }
        val me = identity()
        adv.update(Advert.encode(me, EphemeralId(me).currentId(System.currentTimeMillis()), uwbInfo, looking = true))
    }
}
