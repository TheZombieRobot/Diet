package nz.waveformlabs.moshpoint.service

import android.content.Context
import android.os.SystemClock
import android.util.Log
import androidx.core.uwb.RangingParameters
import androidx.core.uwb.RangingResult
import androidx.core.uwb.UwbAddress
import androidx.core.uwb.UwbComplexChannel
import androidx.core.uwb.UwbControleeSessionScope
import androidx.core.uwb.UwbDevice
import androidx.core.uwb.UwbManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.core.Advert
import nz.waveformlabs.moshpoint.core.UwbSessionKeys

/**
 * UWB on the phone being FOUND (the UWB "controlee"). Runs inside the visibility service.
 *
 * Opens a controlee scope and advertises its UWB address. When we hear a friend who is
 * looking (their advert has a CONTROLLER block), we join their session so their phone
 * gets an exact distance and direction to us.
 *
 * A controlee can be in one session at a time. If a second friend starts looking, we
 * stay with the first until it goes quiet; the second still gets Bluetooth/GPS.
 * TODO: rotate between lookers, or use one-to-many from the controlee side if supported.
 */
class UwbResponder(
    context: Context,
    private val scope: CoroutineScope,
    private val onAdvertInfo: (Advert.UwbInfo?) -> Unit,
) {
    private val manager = UwbManager.createInstance(context)
    private var session: UwbControleeSessionScope? = null
    private var rangingJob: Job? = null
    private var currentController: String? = null
    private var lastResultAt = 0L
    private var stopped = false

    fun start() {
        scope.launch { newScope() }
        // Drop a session that's gone quiet, so another friend can get UWB.
        scope.launch {
            while (true) {
                delay(5_000)
                if (rangingJob != null && SystemClock.elapsedRealtime() - lastResultAt > QUIET_MS) {
                    rangingJob?.cancel()
                    rangingJob = null
                    currentController = null
                    newScope()
                }
            }
        }
    }

    fun stop() {
        stopped = true
        rangingJob?.cancel()
        rangingJob = null
        session = null
        onAdvertInfo(null)
    }

    private suspend fun newScope() {
        try {
            val s = manager.controleeSessionScope()
            session = s
            onAdvertInfo(Advert.UwbInfo(Advert.UwbRole.CONTROLEE, s.localAddress.address))
        } catch (e: Exception) {
            Log.w(TAG, "UWB controlee unavailable", e)
            session = null
            onAdvertInfo(null)
        }
    }

    /** A friend's advert says they're looking and gives their UWB controller details. */
    fun onFriendController(friend: Friend, info: Advert.UwbInfo) {
        val s = session ?: return
        if (rangingJob != null) return
        val controllerAddress = info.address
        val params = RangingParameters(
            uwbConfigType = RangingParameters.CONFIG_MULTICAST_DS_TWR,
            sessionId = UwbSessionKeys.sessionId(friend.secret, controllerAddress),
            subSessionId = 0,
            sessionKeyInfo = UwbSessionKeys.sessionKey(friend.secret, controllerAddress),
            subSessionKeyInfo = null,
            complexChannel = UwbComplexChannel(info.channel, info.preamble),
            peerDevices = listOf(UwbDevice(UwbAddress(controllerAddress))),
            updateRateType = RangingParameters.RANGING_UPDATE_RATE_AUTOMATIC,
        )
        currentController = friend.id
        lastResultAt = SystemClock.elapsedRealtime()
        rangingJob = scope.launch {
            try {
                s.prepareSession(params).collect { r ->
                    if (r is RangingResult.RangingResultPosition) lastResultAt = SystemClock.elapsedRealtime()
                    if (r is RangingResult.RangingResultPeerDisconnected) throw PeerGone()
                }
            } catch (e: CancellationException) {
                throw e // stopped, or the quiet-watchdog already reopened a scope
            } catch (e: Exception) {
                Log.i(TAG, "UWB session with ${friend.name} ended: $e")
            }
            rangingJob = null
            currentController = null
            if (!stopped) newScope() // scopes are single-use
        }
    }

    private class PeerGone : Exception()

    private companion object {
        const val TAG = "UwbResponder"
        const val QUIET_MS = 20_000L
    }
}
