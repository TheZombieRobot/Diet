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
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.UwbSessionKeys

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
 * One multicast session ranges to every friend at once. Results come out as distance +
 * azimuth, relative to the phone, via [onResult].
 *
 * Only runs on phones with UWB. Needs the UWB_RANGING permission.
 */
class UwbFinder(
    context: Context,
    private val scope: CoroutineScope,
    private val mySecret: ByteArray,
    /** Called when our advertised UWB details change (new scope), so the advert can be updated. */
    private val onAdvertInfo: (Advert.UwbInfo?) -> Unit,
    private val onResult: (friendId: String, distanceM: Double?, azimuthDeg: Double?) -> Unit,
) {
    private val manager = UwbManager.createInstance(context)
    private var session: UwbControllerSessionScope? = null
    private var rangingJob: Job? = null
    private var setupJob: Job? = null

    /** Controlee address (hex) -> friend id. */
    private val peers = mutableMapOf<String, String>()

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
        onAdvertInfo(null)
        DebugStatus.set(K, "off")
    }

    private suspend fun newScope() {
        try {
            val s = manager.controllerSessionScope()
            session = s
            peers.clear()
            DebugStatus.set(K, "ready, ch ${s.uwbComplexChannel.channel}, waiting for a visible UWB friend")
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
            DebugStatus.set(K, "UNAVAILABLE: ${e.javaClass.simpleName} ${e.message ?: ""}".trim())
            session = null
            onAdvertInfo(null)
        }
    }

    /** A friend's advert told us their controlee address. */
    fun onFriendControlee(friendId: String, address: ByteArray) {
        val s = session ?: return
        val key = address.hex()
        if (peers[key] == friendId) return
        peers.entries.removeAll { it.value == friendId } // their address changed (new scope)
        peers[key] = friendId
        DebugStatus.log("UWB: adding friend to session (${peers.size} peer(s))")

        if (rangingJob == null) {
            val params = RangingParameters(
                uwbConfigType = RangingParameters.CONFIG_MULTICAST_DS_TWR,
                sessionId = UwbSessionKeys.sessionId(mySecret, s.localAddress.address),
                subSessionId = 0,
                sessionKeyInfo = UwbSessionKeys.sessionKey(mySecret, s.localAddress.address),
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
                    DebugStatus.log("UWB: session ended (${e.javaClass.simpleName})")
                }
                // A session scope is single-use: open a fresh one and re-advertise.
                rangingJob = null
                newScope()
            }
        } else {
            scope.launch {
                try {
                    s.addControlee(UwbAddress(address))
                } catch (e: Exception) {
                    Log.w(TAG, "addControlee failed", e)
                }
            }
        }
    }

    private fun handle(result: RangingResult) {
        val friendId = peers[result.device.address.address.hex()] ?: return
        when (result) {
            is RangingResult.RangingResultPosition -> {
                DebugStatus.set(
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

        /**
         * TODO: confirm on a real phone. We want positive = friend is to the RIGHT.
         * If arrows point the mirror-image way, flip this to -1.
         */
        const val AZIMUTH_SIGN = 1.0
    }
}

internal fun ByteArray.hex() = joinToString("") { "%02x".format(it) }
