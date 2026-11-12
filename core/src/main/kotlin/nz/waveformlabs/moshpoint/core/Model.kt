package nz.waveformlabs.moshpoint.core

/**
 * The ways Moshpoint can work out where a friend is.
 *
 * [precision] is a rough "how much do we trust a fix from this method" weight.
 * It is used by [MethodArbiter] to pick the best live fix. [maxAgeMs] is how long a
 * fix from this method stays usable before it is treated as stale.
 */
enum class Method(val precision: Double, val maxAgeMs: Long, val givesDirection: Boolean) {
    /** Ultra-wideband: exact distance and angle within ~50 m. */
    UWB(precision = 1.0, maxAgeMs = 2_000, givesDirection = true),

    /** GPS fixes shared through the internet relay, turned into an arrow with the compass. */
    GPS_SERVER(precision = 0.5, maxAgeMs = 40_000, givesDirection = true),

    /**
     * Spin-to-scan: user turns in a circle, body shadow gives a rough bearing. Field tests
     * showed it's often wrong in a crowd, so it ranks below GPS and doesn't last long.
     */
    SPIN_SCAN(precision = 0.45, maxAgeMs = 30_000, givesDirection = true),

    /** Walk-and-watch: which way you were walking when the Bluetooth signal got stronger. */
    WALK(precision = 0.4, maxAgeMs = 20_000, givesDirection = true),

    /** GPS fixes that hopped phone to phone over Bluetooth through the crowd. */
    CROWD_RELAY(precision = 0.4, maxAgeMs = 60_000, givesDirection = true),

    /** Wi-Fi Aware round-trip-time: good distance, no direction. */
    WIFI_AWARE(precision = 0.7, maxAgeMs = 4_000, givesDirection = false),

    /** Bluetooth signal strength: rough "warmer / colder" distance, no direction. */
    BLE_RSSI(precision = 0.3, maxAgeMs = 5_000, givesDirection = false),

    /**
     * "I'm here": the spot a mate pinned as where they're standing, from our own GPS position
     * (docs/IM_HERE.md). Only our GPS is unsure, not theirs, so it beats their live GPS for as
     * long as the pin stands; UWB up close still wins. Re-made every few seconds while it stands.
     */
    HERE_PIN(precision = 0.65, maxAgeMs = 40_000, givesDirection = true),
}

/**
 * One reading of where a friend is, from one method.
 *
 * @param bearingDeg absolute bearing to the friend in degrees clockwise from true north,
 *   or null when the method only gives distance.
 * @param distanceM estimated distance in metres, or null when unknown.
 * @param confidence 0..1, how sure the method is about this particular reading.
 */
data class Fix(
    val friendId: String,
    val method: Method,
    val bearingDeg: Double?,
    val distanceM: Double?,
    val confidence: Double,
    val timestampMs: Long,
)

/** What the main screen should draw for one friend. */
sealed interface ArrowState {
    val friendId: String

    /** Nothing usable: show the no-signal state for this friend. */
    data class NoSignal(override val friendId: String) : ArrowState

    /**
     * We know roughly how far, but not which way (Wi-Fi Aware / Bluetooth only).
     * The UI shows distance and warmer/colder, and nudges the user to press Scan.
     */
    data class DistanceOnly(
        override val friendId: String,
        val distanceM: Double,
        val trend: Trend,
        val method: Method,
    ) : ArrowState

    /**
     * A proper arrow.
     *
     * @param relativeDeg angle to draw the arrow at, relative to the top of the phone
     *   (0 = straight ahead, 90 = to the right).
     * @param unsure true when the fix is old or low confidence; the UI shows the Scan prompt.
     */
    data class Pointing(
        override val friendId: String,
        val relativeDeg: Double,
        val distanceM: Double?,
        val method: Method,
        val unsure: Boolean,
    ) : ArrowState
}

enum class Trend { WARMER, COLDER, STEADY }
