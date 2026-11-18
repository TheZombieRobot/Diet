package nz.waveformlabs.moshpoint.core.watch

/**
 * What the watch app can do, and which of it is Moshpoint+ (docs/WATCH.md, problem 9).
 *
 * One rule, used by the phone (which enforces it) and the watch (which draws it): everything on
 * the wrist is Moshpoint+. (Need help and its "I'm OK now" were the free exceptions until the
 * owner removed them, 16 November 2026.)
 */
enum class WatchFeature(val free: Boolean) {
    ARROW(false),
    BUZZ(false),
    TILE(false),
    COMPLICATION(false),
    PING_ON_MY_WAY(false),
    PING_ALL_GOOD(false),
}

object WatchGate {
    /** @param plus the phone's single entitlement check, as synced to the watch. */
    fun allows(feature: WatchFeature, plus: Boolean): Boolean = feature.free || plus

    /**
     * The feature a wrist ping counts as, or null for a kind this build doesn't know. An older
     * watch's Need help or "I'm OK now" (codes 3 and 4) reads as [PingKind.UNKNOWN]: refused,
     * and the watch is told it wasn't sent.
     */
    fun featureOf(kind: PingKind): WatchFeature? = when (kind) {
        PingKind.ON_MY_WAY -> WatchFeature.PING_ON_MY_WAY
        PingKind.ALL_GOOD -> WatchFeature.PING_ALL_GOOD
        PingKind.UNKNOWN -> null
    }

    /** May this ping go, given the entitlement? Unknown kinds never do. */
    fun allows(kind: PingKind, plus: Boolean): Boolean = featureOf(kind)?.let { allows(it, plus) } ?: false
}
