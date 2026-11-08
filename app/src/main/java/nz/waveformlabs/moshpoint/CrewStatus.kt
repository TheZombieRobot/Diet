package nz.waveformlabs.moshpoint

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import androidx.compose.runtime.mutableStateMapOf
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.service.VisibilityService

/**
 * How far away each crew member is right now, worked out quietly in the background from
 * their shared spots and ours. Feeds the crew tiles ("40 m") and the ongoing notification
 * ("Bevan 40 m · Jo 1.2 km"), so you can glance instead of opening anything.
 */
object CrewStatus {
    /** Friend id -> metres from us (only when both spots are recent). */
    val distances = mutableStateMapOf<String, Double>()

    fun refresh(c: Context) {
        val me = myLocation(c)
        val now = System.currentTimeMillis() / 1000
        val crew = FriendsRepository.friends.filter { it.gigGroupOnly || it.key in GroupSync.members }
        distances.clear()
        val parts = mutableListOf<Pair<Double, String>>()
        for (f in crew) {
            val s = LocationBook.seen[f.id] ?: continue
            val age = now - s.timeSec
            if (age > 3 * 3600) continue
            val d = me?.let { Geo.distanceM(LatLon(it.latitude, it.longitude), LatLon(s.lat, s.lon)) }
            if (d != null && age < 10 * 60) distances[f.id] = d
            parts += (d ?: Double.MAX_VALUE) to when {
                s.lastGasp -> "${f.name} phone died"
                d != null && age < 10 * 60 -> "${f.name} ${short(d)}"
                else -> "${f.name} ${age / 60} min ago"
            }
        }
        val sorted = parts.sortedBy { it.first }.map { it.second }
        val line = sorted.take(4).joinToString(" · ")
        VisibilityService.showCrew(c, line.ifBlank { null })
        runCatching { CrewWidget.update(c, sorted.take(4)) }
    }

    private fun short(m: Double) = when {
        m < 1000 -> "${maxOf(5, (m / 5).toInt() * 5)} m"
        m < 10_000 -> "%.1f km".format(m / 1000)
        else -> "${(m / 1000).toInt()} km"
    }

    @SuppressLint("MissingPermission")
    private fun myLocation(c: Context): android.location.Location? {
        if (c.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            c.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) return null
        val lm = c.getSystemService(LocationManager::class.java) ?: return null
        return lm.getProviders(true).mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
            .filter { System.currentTimeMillis() - it.time < 10 * 60_000 }
            .minByOrNull { it.accuracy }
    }
}
