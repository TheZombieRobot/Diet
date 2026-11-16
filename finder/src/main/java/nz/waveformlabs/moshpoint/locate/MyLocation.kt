package nz.waveformlabs.moshpoint.locate

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import nz.waveformlabs.moshpoint.core.LocationPick

/**
 * This phone's GPS position. Uses the plain framework LocationManager so there's no
 * dependency on Google Play services. Listens to GPS and network providers and keeps
 * whichever fix is better.
 */
class MyLocation(context: Context) {
    private val lm = context.getSystemService(LocationManager::class.java)

    /**
     * [highAccuracy] false: Wi-Fi and cell positioning only, no GPS ("balanced power"; a phone
     * without a network provider uses GPS at the same interval).
     */
    @SuppressLint("MissingPermission")
    fun updates(intervalMs: Long, minDistanceM: Float, highAccuracy: Boolean = true): Flow<Location> = callbackFlow {
        var best: Location? = null
        val listener = LocationListener { loc ->
            val b = best
            if (b == null || isBetter(loc, b)) {
                best = loc
                trySend(loc)
            }
        }
        // Register even if location is switched off right now: updates start as soon as
        // the user turns it on. (Only skip providers this phone doesn't have at all.)
        val all = lm.allProviders
        val balanced = !highAccuracy && LocationManager.NETWORK_PROVIDER in all
        val providers = (if (balanced) listOf(LocationManager.NETWORK_PROVIDER) else listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER))
            .filter { it in all }
        try {
            providers.forEach { lm.requestLocationUpdates(it, intervalMs, minDistanceM, listener, Looper.getMainLooper()) }
        } catch (e: SecurityException) {
            Log.w("MyLocation", "no location permission", e)
        }
        awaitClose { lm.removeUpdates(listener) }
    }

    private fun isBetter(new: Location, old: Location): Boolean =
        LocationPick.isBetter(new.elapsedRealtimeNanos, new.accuracy, old.elapsedRealtimeNanos, old.accuracy)
}
