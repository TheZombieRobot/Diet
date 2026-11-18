package nz.waveformlabs.moshpoint.core

/**
 * "Use satellite when there's no signal" (Moshpoint+, docs/REMOVE_SAFETY.md, stage 4).
 *
 * On Android 16 a phone whose carrier offers it can get a satellite data network when there's
 * no other. It is slow, it may cost the person money, and Android calls it bandwidth-constrained.
 * An app only gets one if its manifest says it's built for satellite and the carrier lists it.
 * Moshpoint's manifest says so; this is what the app then does with one:
 *
 *  - The switch off (the default), or not a Moshpoint+ member: nothing at all goes over it. The
 *    app behaves as with no signal (crew phones nearby pass messages on over Bluetooth).
 *  - The switch on, for a member: only the relay's batch (one `POST /v1/batch` to our own relay:
 *    locations, pings, chat text and pins going up, the crew's mailboxes coming down), at most
 *    one every [GAP_MS]. No photos, clips, faces, Discover, venue maps, map tiles or anything
 *    else. The free public relay takes no batches, so nothing goes over satellite there.
 *  - Any other network: exactly as before.
 */
object SatelliteRule {
    /** At most one batch every two minutes over satellite. */
    const val GAP_MS = 120_000L

    /** `NetworkCapabilities.TRANSPORT_SATELLITE` (Android 15, API 35). */
    const val TRANSPORT_SATELLITE = 10

    /** `NetworkCapabilities.NET_CAPABILITY_NOT_BANDWIDTH_CONSTRAINED` (Android 16, API 36). */
    const val NOT_BANDWIDTH_CONSTRAINED = 37

    /**
     * Is the network a satellite (bandwidth-constrained) one? [sdk]: the phone's Android API
     * level. From Android 16 every network has [NOT_BANDWIDTH_CONSTRAINED] unless it's
     * constrained; a satellite transport counts from Android 15. Older phones never have one.
     */
    fun constrained(sdk: Int, satelliteTransport: Boolean, notBandwidthConstrained: Boolean): Boolean =
        (sdk >= 35 && satelliteTransport) || (sdk >= 36 && !notBandwidthConstrained)

    /** May anything go over a satellite network? Only for a Moshpoint+ member who switched it on. */
    fun allowed(switchOn: Boolean, member: Boolean): Boolean = switchOn && member

    /** Does the phone count as having a network? A satellite one only when [allowed]. */
    fun usable(online: Boolean, constrained: Boolean, allowed: Boolean): Boolean = online && (!constrained || allowed)

    /** What a request to the internet is, for the rule. */
    enum class Request {
        /** One `POST /v1/batch` to our own relay. */
        BATCH,

        /** Anything else: uploads and downloads of their own, lookups, Discover, maps. */
        OTHER,
    }

    /**
     * May [request] go now? [lastBatchMs]: when the last batch went over satellite (elapsed
     * time), or null if none has. A normal network: always, as before.
     */
    fun mayGo(constrained: Boolean, allowed: Boolean, request: Request, nowMs: Long, lastBatchMs: Long?): Boolean = when {
        !constrained -> true
        !allowed || request != Request.BATCH -> false
        else -> lastBatchMs == null || nowMs - lastBatchMs >= GAP_MS
    }

    /** When the next batch may go over satellite: [dueMs] or the end of the gap, whichever is later. */
    fun nextBatchAt(dueMs: Long, lastBatchMs: Long?): Long = if (lastBatchMs == null) dueMs else maxOf(dueMs, lastBatchMs + GAP_MS)
}
