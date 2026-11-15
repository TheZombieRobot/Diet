package nz.waveformlabs.moshpoint.main

import android.location.Location
import android.os.SystemClock
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.locate.MapFeed
import nz.waveformlabs.moshpoint.ui.map.VenueView
import nz.waveformlabs.moshpoint.venue.VenueMaps

/**
 * The map: whether it's open, its own position feed, and the venue view it opens on at the gig
 * (with the finder looking for the crew so UWB can place them). Owned by [MainActivity].
 */
internal class MapState(private val a: MainActivity) {
    var showMap by mutableStateOf(false)
    val mapFeed by lazy { MapFeed(a, a.lifecycleScope) }

    /** Set while the map is open at the gig: the venue it opened on. Null = the ordinary map. */
    var mapVenue by mutableStateOf<VenueView?>(null)
    /** The finder engine is running just for the map (UWB places mates exactly). */
    var mapEngine = false

    /** When the map was last opened (time since boot), for [mapFirstFix]. */
    private var mapOpenedAtMs = 0L

    fun openMap() {
        mapOpenedAtMs = SystemClock.elapsedRealtime()
        // At the gig (gig day, and this phone at the venue) the map opens zoomed into the venue.
        mapVenue = venueViewFor(a.lastKnownLocation())
        showMap = true
        mapFeed.start()
        if (mapVenue != null) lookForCrewFromMap()
    }

    /** The venue to open the map on, if [here] says this phone is at the gig; else null. */
    private fun venueViewFor(here: Location?): VenueView? {
        val venue = VenueMaps.venue(a) ?: return null
        if (!VenueMaps.atGig(a, here)) return null
        return VenueView(venue, here?.let { LatLon(it.latitude, it.longitude) })
    }

    /**
     * The map's own first position after opening. If the phone had no fresh position when the
     * map opened (not live, say), this one can still say we're at the gig, for a few seconds.
     * After that an open map never moves by itself.
     */
    fun mapFirstFix(here: Location) {
        if (mapVenue != null || !showMap || SystemClock.elapsedRealtime() - mapOpenedAtMs > MAP_FIRST_FIX_MS) return
        mapVenue = venueViewFor(here) ?: return
        lookForCrewFromMap()
    }

    /**
     * UWB only measures while someone is looking, so at the gig the map looks for the whole
     * crew (unless the finder is already looking for someone).
     */
    private fun lookForCrewFromMap() {
        if (!a.finder.engineReady || a.finder.finding || mapEngine) return
        val ids = FriendsRepository.friends.filter { it.gigGroupOnly || it.key in GroupSync.members }.map { it.id }.toSet()
        if (ids.isEmpty()) return
        a.finder.pendingStop?.cancel()
        a.finder.engine.track(ids)
        a.finder.engine.start()
        mapEngine = true
    }

    fun closeMap() {
        showMap = false
        mapFeed.stop()
        if (mapEngine) {
            mapEngine = false
            if (!a.finder.finding) a.finder.stopEngineSoon()
        }
    }

    private companion object {
        /** How long after the map opens its first position may still open the venue view. */
        const val MAP_FIRST_FIX_MS = 15_000L
    }
}
