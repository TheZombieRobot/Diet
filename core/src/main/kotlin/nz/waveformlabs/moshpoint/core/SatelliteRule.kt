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
 *  - The crew chat is read in that same batch ([chatInBatch], docs/SPOT_LINKS.md item 4): its
 *    text mailboxes, from the chat's own cursors, so one exchange carries the chat both ways.
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

    /**
     * Is the crew chat read in the batch (docs/SPOT_LINKS.md, item 4)? Over satellite, for a member
     * who switched it on: the chat's own poll is a request of its own, which never goes over
     * satellite, so its text mailboxes ride in the crew sync's batch instead, read from the same
     * cursors (`/v1/heldsince`'s), at most every [GAP_MS] like everything in it. Only text: chat
     * lines, plans, history copies and private messages are records in those mailboxes; photos and
     * clips are files of their own and never go over satellite. Any other network: never, the
     * chat's own poll reads it as before.
     */
    fun chatInBatch(constrained: Boolean, allowed: Boolean): Boolean = constrained && allowed

    /**
     * Whose chats a satellite batch reads, when they don't all fit. [sizes]: each crew's chat
     * mailboxes, in the chat poll's order (tonight's crew first); [room]: the reads the batch has
     * left after the crew sync's own. Tonight's crew first, then the others in turn, starting one
     * further on with each batch ([turn] counts them), so a crew left out this time is read in a
     * later batch. A crew that doesn't fit is skipped, never cut in half. The indexes, in order.
     */
    fun chatCrews(sizes: List<Int>, room: Int, turn: Int): List<Int> {
        if (sizes.isEmpty() || room <= 0) return emptyList()
        val order = listOf(0) + (1 until sizes.size).let { rest ->
            if (rest.isEmpty()) emptyList() else rest.map { 1 + Math.floorMod(it - 1 + turn, rest.count()) }
        }
        var left = room
        val picked = ArrayList<Int>()
        for (i in order) {
            val n = sizes[i]
            if (n in 1..left) {
                picked += i
                left -= n
            }
        }
        return picked.sorted()
    }
}
