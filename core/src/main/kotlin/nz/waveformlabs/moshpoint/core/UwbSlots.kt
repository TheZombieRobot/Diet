package nz.waveformlabs.moshpoint.core

/**
 * Who gets this phone's UWB ranging places when more mates are ready for UWB than one session
 * ranges at once (ROADMAP, "Small items"): the mate the finder is focused on first, then the
 * nearest. With room for everyone, everyone is in, exactly as before.
 *
 * Members stay unless someone outside is clearly nearer ([SWAP_RATIO] and [SWAP_MIN_M]): a
 * member's distance comes from UWB itself, an outsider's from Bluetooth signal strength, which
 * wobbles, and every swap costs a moment of ranging. The app also spaces swaps out in time.
 */
object UwbSlots {
    /**
     * Places in one session. Phones differ (many take 8 in one multicast session); 4 keeps the
     * ranging round short and is within what UWB phones accept. A first guess, to tune once a
     * crew with five or more UWB phones has tried it (the field tests use two, which never fill it).
     */
    const val CAPACITY = 4

    /** An outsider replaces the farthest member only if nearer than this share of its distance... */
    const val SWAP_RATIO = 0.7

    /** ...and nearer by at least this much. */
    const val SWAP_MIN_M = 3.0

    /**
     * Who should be in the session. [ready]: mates whose phones are ready for UWB, each with our
     * best distance to them now (null = not known). [current]: who's in it now. [focused]: the
     * mate the finder is showing, if any; they're always in while they're ready.
     */
    fun choose(ready: Map<String, Double?>, current: Set<String>, focused: String?, capacity: Int = CAPACITY): Set<String> {
        if (capacity <= 0) return emptySet()
        if (ready.size <= capacity) return ready.keys.toSet()
        fun d(id: String): Double = ready[id] ?: Double.MAX_VALUE
        val chosen = LinkedHashSet<String>()
        current.filter { it in ready }.sortedBy { d(it) }.forEach { chosen += it }
        val focus = focused?.takeIf { it in ready }
        // The farthest member that may give up its place (never the focused mate).
        fun farthest(): String? = chosen.filter { it != focus }.maxByOrNull { d(it) }
        if (focus != null && focus !in chosen) {
            if (chosen.size >= capacity) farthest()?.let { chosen -= it }
            chosen += focus
        }
        while (chosen.size > capacity) chosen -= farthest() ?: break
        // Free places: nearest first (unknown distances last, in a stable order).
        val outside = ready.keys.filter { it !in chosen }.sortedWith(compareBy<String> { d(it) }.thenBy { it })
        for (id in outside) {
            if (chosen.size >= capacity) break
            chosen += id
        }
        // Someone clearly nearer takes the farthest member's place.
        for (id in outside) {
            if (id in chosen) continue
            val near = ready[id] ?: continue
            val worst = farthest() ?: break
            val far = d(worst)
            if (near < far * SWAP_RATIO && far - near >= SWAP_MIN_M) {
                chosen -= worst
                chosen += id
            }
        }
        return chosen
    }
}
