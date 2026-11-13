package nz.waveformlabs.moshpoint.locate

import android.content.Context
import android.util.Log
import androidx.core.uwb.RangingParameters
import androidx.core.uwb.RangingResult
import androidx.core.uwb.UwbAddress
import androidx.core.uwb.UwbControllerSessionScope
import androidx.core.uwb.UwbDevice
import androidx.core.uwb.UwbManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.UwbSessionKeys
import nz.waveformlabs.moshpoint.core.UwbSlots

/**
 * UWB on the phone that's LOOKING (the UWB "controller").
 *
 * How the two phones set up UWB with no connection and no server:
 * 1. We open a controller session scope, which gives us a UWB address and channel.
 * 2. We put those in our Bluetooth advert (encrypted, see [Advert]).
 * 3. A visible friend's phone hears it, derives the same session id + key from our secret
 *    (they have it, they're our friend) and joins as a controlee. See `UwbResponder`.
 * 4. Their advert carries their UWB address; when [BleRanger] hears it we add them here.
 *
 * One multicast session ranges to several friends at once. Results come out as distance +
 * azimuth, relative to the phone, via [onResult]. When more friends are ready for UWB than one
 * session has places ([UwbSlots.CAPACITY]), the one the finder is focused on gets a place
 * first, then the nearest (core [UwbSlots]); with room for everyone, everyone is in.
 *
 * Only runs on phones with UWB. Needs the UWB_RANGING permission.
 */
class UwbFinder(
    context: Context,
    private val scope: CoroutineScope,
    private val identity: () -> ByteArray,
    /** Called when our advertised UWB details change (new scope), so the advert can be updated. */
    private val onAdvertInfo: (Advert.UwbInfo?) -> Unit,
    private val onResult: (friendId: String, distanceM: Double?, azimuthDeg: Double?) -> Unit,
    /** Our best distance to a friend now, by any method: the nearest get the places when there are too few. */
    private val distanceOf: (friendId: String) -> Double? = { null },
    /** A friend's name, for the status log only (null: "a friend"). */
    private val nameOf: (friendId: String) -> String? = { null },
) {
    private val manager = UwbManager.createInstance(context)
    private var session: UwbControllerSessionScope? = null
    private var rangingJob: Job? = null
    private var setupJob: Job? = null

    /** Controlee address (hex) -> friend id: who is in the session. */
    private val peers = mutableMapOf<String, String>()

    /** Friends whose phones told us their controlee address, in the session or not, and when we last heard it. */
    private class Ready(val address: ByteArray, val heardAtMs: Long)
    private val ready = mutableMapOf<String, Ready>()

    /** The friend the finder is focused on: always given a place while they're ready. */
    private var focused: String? = null
    private var lastSwapMs = 0L

    /** Adds and removes go one at a time, in the order asked (a swap removes before it adds). */
    private val ops = Mutex()

    fun start() {
        if (setupJob != null) return
        setupJob = scope.launch { newScope() }
    }

    fun stop() {
        setupJob?.cancel()
        rangingJob?.cancel()
        setupJob = null
        rangingJob = null
        session = null
        peers.clear()
        ready.clear()
        onAdvertInfo(null)
        FinderLog.set(K, "off")
    }

    private suspend fun newScope() {
        try {
            val s = manager.controllerSessionScope()
            session = s
            peers.clear()
            // Friends join each new session with a new address: wait to hear them again.
            ready.clear()
            FinderLog.set(K, "ready, ch ${s.uwbComplexChannel.channel}, waiting for a visible UWB friend")
            onAdvertInfo(
                Advert.UwbInfo(
                    role = Advert.UwbRole.CONTROLLER,
                    address = s.localAddress.address,
                    channel = s.uwbComplexChannel.channel,
                    preamble = s.uwbComplexChannel.preambleIndex,
                ),
            )
        } catch (e: Exception) {
            // No UWB, UWB switched off (e.g. airplane mode), or permission missing.
            Log.w(TAG, "UWB controller unavailable", e)
            FinderLog.set(K, "UNAVAILABLE: ${e.javaClass.simpleName} ${e.message ?: ""}".trim())
            session = null
            onAdvertInfo(null)
        }
    }

    /** A friend's advert told us their controlee address. */
    fun onFriendControlee(friendId: String, address: ByteArray) {
        val s = session ?: return
        ready[friendId] = Ready(address, System.currentTimeMillis())
        val key = address.hex()
        if (peers[key] == friendId) return
        peers.entries.removeAll { it.value == friendId } // their address changed (new scope)
        rebalance(s)
    }

    /** The finder is showing [friendId] now (null: the whole crew, or nobody): they get a place first. */
    fun focus(friendId: String?) {
        if (focused == friendId) return
        focused = friendId
        session?.let { rebalance(it) }
    }

    /**
     * Bring the session in line with who should be in it (core [UwbSlots]). With room for
     * everyone that's simply everyone, added as they're heard. Otherwise one round of swaps at
     * most every [SWAP_GAP_MS] (each costs a moment of ranging), except to make room for the
     * focused friend, which happens at once.
     */
    private fun rebalance(s: UwbControllerSessionScope) {
        val now = System.currentTimeMillis()
        val members = peers.values.toSet()
        // Ready: heard lately, or in the session now (a member stays until UWB says they've gone).
        val candidates = ready.filter { (id, r) -> id in members || now - r.heardAtMs <= READY_FOR_MS }
        val focus = focused
        val want = UwbSlots.choose(candidates.keys.associateWith { distanceOf(it) }, members, focus)
        val leaving = peers.filterValues { it !in want }.keys.toList()
        val joining = want.filter { it !in members }
        if (leaving.isNotEmpty()) {
            val forFocus = focus != null && focus in joining
            if (!forFocus && now - lastSwapMs < SWAP_GAP_MS) return
            lastSwapMs = now
            leaving.forEach { leave(s, it) }
        }
        joining.forEach { id -> candidates[id]?.let { join(s, id, it.address) } }
    }

    /** Take [key] (a controlee address, hex) out of the session to make room. */
    private fun leave(s: UwbControllerSessionScope, key: String) {
        val friendId = peers.remove(key) ?: return
        FinderLog.log("UWB: making room, ${nameOf(friendId) ?: "a friend"} out (${peers.size} peer(s))")
        val address = key.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        op("removeControlee") { s.removeControlee(UwbAddress(address)) }
    }

    /** Add [friendId] at [address]: the first one opens the session, the rest join it. */
    private fun join(s: UwbControllerSessionScope, friendId: String, address: ByteArray) {
        val key = address.hex()
        peers[key] = friendId
        FinderLog.log("UWB: adding friend to session (${peers.size} peer(s))")

        if (rangingJob == null) {
            val params = RangingParameters(
                uwbConfigType = RangingParameters.CONFIG_MULTICAST_DS_TWR,
                sessionId = UwbSessionKeys.sessionId(identity(), s.localAddress.address),
                subSessionId = 0,
                sessionKeyInfo = UwbSessionKeys.sessionKey(identity(), s.localAddress.address),
                subSessionKeyInfo = null,
                complexChannel = s.uwbComplexChannel,
                peerDevices = listOf(UwbDevice(UwbAddress(address))),
                updateRateType = RangingParameters.RANGING_UPDATE_RATE_AUTOMATIC,
            )
            rangingJob = scope.launch {
                try {
                    s.prepareSession(params).collect(::handle)
                } catch (e: CancellationException) {
                    throw e // stop() was called: don't reopen
                } catch (e: Exception) {
                    Log.w(TAG, "UWB ranging ended", e)
                    FinderLog.log("UWB: session ended (${e.javaClass.simpleName})")
                }
                // A session scope is single-use: open a fresh one and re-advertise.
                rangingJob = null
                newScope()
            }
        } else {
            op("addControlee") { s.addControlee(UwbAddress(address)) }
        }
    }

    /** One add or remove, after the ones asked for before it. */
    private fun op(what: String, block: suspend () -> Unit) {
        scope.launch {
            ops.withLock {
                try {
                    block()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "$what failed", e)
                }
            }
        }
    }

    private fun handle(result: RangingResult) {
        val friendId = peers[result.device.address.address.hex()] ?: return
        when (result) {
            is RangingResult.RangingResultPosition -> {
                FinderLog.set(
                    K,
                    "ranging ${peers.size} peer(s): " +
                        "${result.position.distance?.value?.let { "%.2f m".format(it) } ?: "no dist"}, " +
                        "az ${result.position.azimuth?.value?.let { "%.0f°".format(it) } ?: "none"}",
                )
                onResult(
                    friendId,
                    result.position.distance?.value?.toDouble(),
                    result.position.azimuth?.value?.toDouble()?.let { it * AZIMUTH_SIGN },
                )
            }
            is RangingResult.RangingResultPeerDisconnected -> peers.entries.removeAll { it.value == friendId }
            else -> Unit
        }
    }

    companion object {
        private const val TAG = "UwbFinder"
        private const val K = "UWB (looking)"

        /** A friend not heard for this long isn't counted as ready (unless they're in the session). */
        private const val READY_FOR_MS = 30_000L

        /** Swaps when there are too few places: one round at most this often, except for the focused friend. */
        private const val SWAP_GAP_MS = 15_000L

        /**
         * TODO: confirm on a real phone. We want positive = friend is to the RIGHT.
         * If arrows point the mirror-image way, flip this to -1.
         */
        const val AZIMUTH_SIGN = 1.0
    }
}

internal fun ByteArray.hex() = joinToString("") { "%02x".format(it) }
