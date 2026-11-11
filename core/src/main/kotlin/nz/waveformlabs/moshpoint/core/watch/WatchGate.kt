package nz.waveformlabs.moshpoint.core.watch

/**
 * What the watch app can do, and which of it is Moshpoint+ (docs/WATCH.md, problem 9).
 *
 * One rule, used by the phone (which enforces it) and the watch (which draws it):
 * everything on the wrist is Moshpoint+ **except asking for help**. Safety is never paywalled.
 */
enum class WatchFeature(val free: Boolean) {
    ARROW(false),
    BUZZ(false),
    TILE(false),
    COMPLICATION(false),
    PING_ON_MY_WAY(false),
    PING_ALL_GOOD(false),

    /** Hold-to-send "Need help". Free for everyone, always. */
    NEED_HELP(true),

    /** "I'm OK now" after a wrist Need help: the other half of the same safety feature. */
    SOS_ALL_CLEAR(true),
}

object WatchGate {
    /** @param plus the phone's single entitlement check, as synced to the watch. */
    fun allows(feature: WatchFeature, plus: Boolean): Boolean = feature.free || plus

    /** The feature a wrist ping counts as, or null for a kind this build doesn't know. */
    fun featureOf(kind: PingKind): WatchFeature? = when (kind) {
        PingKind.ON_MY_WAY -> WatchFeature.PING_ON_MY_WAY
        PingKind.ALL_GOOD -> WatchFeature.PING_ALL_GOOD
        PingKind.NEED_HELP -> WatchFeature.NEED_HELP
        PingKind.SOS_ALL_CLEAR -> WatchFeature.SOS_ALL_CLEAR
        PingKind.UNKNOWN -> null
    }

    /** May this ping go, given the entitlement? Unknown kinds never do. */
    fun allows(kind: PingKind, plus: Boolean): Boolean = featureOf(kind)?.let { allows(it, plus) } ?: false
}
