package nz.waveformlabs.moshpoint.locate

import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.aware.AttachCallback
import android.net.wifi.aware.DiscoverySessionCallback
import android.net.wifi.aware.PeerHandle
import android.net.wifi.aware.PublishConfig
import android.net.wifi.aware.PublishDiscoverySession
import android.net.wifi.aware.SubscribeConfig
import android.net.wifi.aware.SubscribeDiscoverySession
import android.net.wifi.aware.WifiAwareManager
import android.net.wifi.aware.WifiAwareSession
import android.net.wifi.rtt.RangingRequest
import android.net.wifi.rtt.RangingResult
import android.net.wifi.rtt.RangingResultCallback
import android.net.wifi.rtt.WifiRttManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Wi-Fi Aware (Neighbour Awareness Networking) + Wi-Fi RTT: a good close-range distance
 * on phones without UWB. No direction, so the arrow still comes from spin-scan / GPS,
 * but the distance readout gets much better than Bluetooth.
 *
 * - Visible phone: publishes the "moshpoint" service with its rotating id as the
 *   service info, and allows ranging ([WifiAwarePublisher]).
 * - Looking phone: subscribes, recognises friends by their rotating id, then measures
 *   round-trip time to them about once a second ([WifiAwareFinder]).
 *
 * Needs Wi-Fi switched on (it doesn't need to be connected to a network) and location on.
 */
private const val SERVICE = "moshpoint"
private const val TAG = "WifiAware"

fun wifiRttSupported(context: Context) =
    context.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI_AWARE) &&
        context.packageManager.hasSystemFeature(PackageManager.FEATURE_WIFI_RTT)

class WifiAwarePublisher(context: Context, private val idNow: () -> ByteArray) {
    private val aware = context.getSystemService(WifiAwareManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private var session: WifiAwareSession? = null
    private var publish: PublishDiscoverySession? = null
    private var stopped = true

    /** Wi-Fi Aware came back (Wi-Fi toggled, hotspot off, ...). */
    fun restart() {
        stop()
        start()
    }

    private fun config() = PublishConfig.Builder()
        .setServiceName(SERVICE)
        .setServiceSpecificInfo(idNow())
        .setRangingEnabled(true)
        .build()

    @SuppressLint("MissingPermission")
    fun start() {
        if (aware == null || !aware.isAvailable) {
            FinderLog.set("Wi-Fi Aware (visible)", "unavailable (Wi-Fi or location off?)")
            return
        }
        stopped = false
        try {
            aware.attach(object : AttachCallback() {
                override fun onAttached(s: WifiAwareSession) {
                    if (stopped) {
                        s.close() // stop() ran before attach finished
                        return
                    }
                    session = s
                    FinderLog.set("Wi-Fi Aware (visible)", "publishing")
                    s.publish(config(), object : DiscoverySessionCallback() {
                        override fun onPublishStarted(p: PublishDiscoverySession) {
                            if (stopped) p.close() else publish = p
                        }

                        override fun onSessionTerminated() {
                            publish = null
                            FinderLog.set("Wi-Fi Aware (visible)", "session ended")
                        }
                    }, handler)
                }

                override fun onAttachFailed() {
                    Log.w(TAG, "attach failed")
                    FinderLog.log("Wi-Fi Aware: attach FAILED")
                }
            }, handler)
        } catch (e: SecurityException) {
            Log.w(TAG, "no permission", e)
        }
    }

    /** Call when our rotating id changes. */
    fun refresh() {
        publish?.updatePublish(config())
    }

    fun stop() {
        stopped = true
        publish?.close()
        session?.close()
        publish = null
        session = null
    }
}

class WifiAwareFinder(
    context: Context,
    private val scope: CoroutineScope,
    private val friends: () -> List<FinderMate>,
    private val onDistance: (friendId: String, distanceM: Double) -> Unit,
) {
    private val aware = context.getSystemService(WifiAwareManager::class.java)
    private val rtt = context.getSystemService(WifiRttManager::class.java)
    private val executor = context.mainExecutor
    private val handler = Handler(Looper.getMainLooper())
    private var session: WifiAwareSession? = null
    private var subscribe: SubscribeDiscoverySession? = null
    private var rangingJob: Job? = null
    private var stopped = true

    /** Friend id -> latest peer handle for them. */
    private val peers = mutableMapOf<String, PeerHandle>()

    @SuppressLint("MissingPermission")
    fun start() {
        if (aware == null || rtt == null || !aware.isAvailable) {
            FinderLog.set(K, "unavailable (Wi-Fi or location off?)")
            return
        }
        FinderLog.set(K, "attaching")
        stopped = false
        try {
            aware.attach(object : AttachCallback() {
                override fun onAttached(s: WifiAwareSession) {
                    if (stopped) {
                        s.close()
                        return
                    }
                    session = s
                    s.subscribe(
                        SubscribeConfig.Builder().setServiceName(SERVICE).build(),
                        object : DiscoverySessionCallback() {
                            override fun onSubscribeStarted(sub: SubscribeDiscoverySession) {
                                if (stopped) sub.close() else subscribe = sub
                            }

                            override fun onSessionTerminated() {
                                subscribe = null
                                peers.clear()
                                FinderLog.set(K, "session ended")
                            }

                            override fun onServiceDiscovered(peer: PeerHandle, info: ByteArray?, filter: MutableList<ByteArray>?) {
                                if (info == null) return
                                val now = System.currentTimeMillis()
                                val friend = friends().firstOrNull { it.ephemeralId.matches(info, now) } ?: return
                                if (peers.put(friend.id, peer) == null) FinderLog.log("Wi-Fi Aware: found ${friend.name}")
                                FinderLog.set(K, "subscribed, ${peers.size} friend(s) found")
                            }
                        },
                        handler,
                    )
                }

                override fun onAttachFailed() {
                    Log.w(TAG, "attach failed")
                    FinderLog.log("Wi-Fi Aware: attach FAILED")
                }
            }, handler)
        } catch (e: SecurityException) {
            Log.w(TAG, "no permission", e)
        }
        rangingJob = scope.launch {
            while (true) {
                delay(1_000)
                rangeAll()
            }
        }
    }

    @SuppressLint("MissingPermission")
    private fun rangeAll() {
        val r = rtt ?: return
        if (peers.isEmpty() || !r.isAvailable) return
        val tracked = friends().map { it.id }.toSet()
        val targets = peers.filterKeys { it in tracked }.entries.take(RangingRequest.getMaxPeers())
        if (targets.isEmpty()) return
        val byHandle = targets.associate { it.value to it.key }
        val req = RangingRequest.Builder().apply { targets.forEach { addWifiAwarePeer(it.value) } }.build()
        try {
            r.startRanging(req, executor, object : RangingResultCallback() {
                override fun onRangingResults(results: MutableList<RangingResult>) {
                    results.forEach { res ->
                        if (res.status != RangingResult.STATUS_SUCCESS) return@forEach
                        val friendId = byHandle[res.peerHandle] ?: return@forEach
                        onDistance(friendId, res.distanceMm / 1000.0)
                        FinderLog.set(K, "RTT ok: %.1f m ±%.1f".format(res.distanceMm / 1000.0, res.distanceStdDevMm / 1000.0))
                    }
                }

                override fun onRangingFailure(code: Int) {
                    Log.w(TAG, "ranging failed: $code")
                    FinderLog.set(K, "RTT FAILED code $code")
                }
            })
        } catch (e: SecurityException) {
            Log.w(TAG, "no permission for RTT", e)
        }
    }

    fun stop() {
        stopped = true
        rangingJob?.cancel()
        rangingJob = null
        subscribe?.close()
        session?.close()
        subscribe = null
        session = null
        peers.clear()
        FinderLog.set(K, "off")
    }

    private companion object {
        const val K = "Wi-Fi Aware (looking)"
    }
}
