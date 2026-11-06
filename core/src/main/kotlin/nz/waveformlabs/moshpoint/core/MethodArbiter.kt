package nz.waveformlabs.moshpoint.core

/**
 * Picks the best live fix for each friend so the user never has to choose a method.
 *
 * Every locating method (UWB, Wi-Fi Aware, Bluetooth, GPS via server, crowd relay,
 * spin-to-scan) pushes [Fix]es in. [arrowFor] combines them into a single [ArrowState]:
 *
 * - Stale fixes (older than their method's [Method.maxAgeMs]) are dropped.
 * - The best remaining direction-giving fix sets the arrow's angle.
 * - Distance comes from whichever fix has the most trustworthy distance (e.g. UWB or
 *   Wi-Fi Aware beats GPS when close), so a GPS arrow can still show a Wi-Fi distance.
 * - A small hysteresis stops the arrow flicking between two similar methods.
 */
class MethodArbiter(
    /** A new method must beat the current one by this much score to take over. */
    private val switchMargin: Double = 0.1,
    /** Below this score the arrow is shown but flagged as unsure (Scan prompt). */
    private val unsureBelow: Double = 0.35,
) {
    private val latest = mutableMapOf<Pair<String, Method>, Fix>()

    /**
     * Methods the arbiter may use. Everything by default; the debug panel switches methods
     * off so each one can be tested on its own. Fixes from disabled methods are still
     * recorded (so the panel can show them) but never drive the arrow.
     */
    var enabled: Set<Method> = Method.entries.toSet()
    private val currentDirectionMethod = mutableMapOf<String, Method>()
    private val rssiTrend = mutableMapOf<String, TrendTracker>()

    fun submit(fix: Fix) {
        latest[fix.friendId to fix.method] = fix
        if (fix.method == Method.BLE_RSSI || fix.method == Method.WIFI_AWARE) {
            fix.distanceM?.let { rssiTrend.getOrPut(fix.friendId) { TrendTracker() }.add(it) }
        }
    }

    fun forget(friendId: String) {
        latest.keys.removeAll { it.first == friendId }
        currentDirectionMethod.remove(friendId)
        rssiTrend.remove(friendId)
    }

    fun latestFix(friendId: String, method: Method): Fix? = latest[friendId to method]

    companion object {
        private val CLOSE_RANGE = setOf(Method.UWB, Method.WIFI_AWARE, Method.BLE_RSSI)
        private val GPS_LIKE = setOf(Method.GPS_SERVER, Method.CROWD_RELAY)
        const val GPS_USELESS_BELOW_M = 20.0
    }

    fun scoreOf(fix: Fix, nowMs: Long): Double = score(fix, nowMs)

    /** Score of a fix right now: method precision x confidence, decaying with age. */
    private fun score(fix: Fix, nowMs: Long): Double {
        val age = (nowMs - fix.timestampMs).coerceAtLeast(0)
        if (age > fix.method.maxAgeMs) return 0.0
        val freshness = 1.0 - 0.5 * (age.toDouble() / fix.method.maxAgeMs)
        return fix.method.precision * fix.confidence.coerceIn(0.0, 1.0) * freshness
    }

    fun arrowFor(friendId: String, headingDeg: Double, nowMs: Long): ArrowState {
        val live = latest.values
            .filter { it.friendId == friendId && it.method in enabled }
            .map { it to score(it, nowMs) }
            .filter { it.second > 0.0 }
        if (live.isEmpty()) return ArrowState.NoSignal(friendId)

        val distance = live
            .filter { it.first.distanceM != null }
            .maxByOrNull { it.second }
            ?.first?.distanceM

        // GPS error (~5-15 m each phone) is bigger than the gap once you're close, so a
        // GPS/crowd bearing is worse than no arrow: show distance and prompt Scan instead.
        val closeRange = live
            .filter { it.first.method in CLOSE_RANGE && it.first.distanceM != null }
            .minOfOrNull { it.first.distanceM!! }
        val directional = live.filter {
            it.first.method.givesDirection && it.first.bearingDeg != null &&
                !(it.first.method in GPS_LIKE && closeRange != null && closeRange < GPS_USELESS_BELOW_M)
        }
        if (directional.isEmpty()) {
            currentDirectionMethod.remove(friendId)
            val best = live.maxBy { it.second }.first
            return if (distance == null) {
                ArrowState.NoSignal(friendId)
            } else {
                ArrowState.DistanceOnly(
                    friendId = friendId,
                    distanceM = distance,
                    trend = rssiTrend[friendId]?.trend() ?: Trend.STEADY,
                    method = best.method,
                )
            }
        }

        val best = directional.maxBy { it.second }
        val current = currentDirectionMethod[friendId]?.let { m -> directional.firstOrNull { it.first.method == m } }
        val chosen = if (current != null && best.second - current.second < switchMargin) current else best
        currentDirectionMethod[friendId] = chosen.first.method

        return ArrowState.Pointing(
            friendId = friendId,
            relativeDeg = Geo.relativeDeg(chosen.first.bearingDeg!!, headingDeg),
            distanceM = distance,
            method = chosen.first.method,
            unsure = chosen.second < unsureBelow,
        )
    }
}

/** One row of the debug panel: what one method last said about one friend. */
data class MethodDebug(
    val method: Method,
    val fix: Fix?,
    val ageMs: Long?,
    /** 0 when stale, missing or disabled. */
    val score: Double,
    val enabled: Boolean,
    /** True if this method is currently setting the arrow's direction. */
    val drivingDirection: Boolean,
)

/** Debug view of everything the arbiter knows about a friend. */
fun MethodArbiter.debug(friendId: String, nowMs: Long, drivingMethod: Method?): List<MethodDebug> =
    Method.entries.map { m ->
        val fix = latestFix(friendId, m)
        val age = fix?.let { (nowMs - it.timestampMs).coerceAtLeast(0) }
        MethodDebug(
            method = m,
            fix = fix,
            ageMs = age,
            score = if (fix == null || m !in enabled) 0.0 else scoreOf(fix, nowMs),
            enabled = m in enabled,
            drivingDirection = m == drivingMethod,
        )
    }

/** Tracks whether distance readings are shrinking (warmer) or growing (colder). */
internal class TrendTracker(private val window: Int = 6, private val deadbandM: Double = 1.5) {
    private val values = ArrayDeque<Double>()

    fun add(distanceM: Double) {
        values.addLast(distanceM)
        while (values.size > window) values.removeFirst()
    }

    fun trend(): Trend {
        if (values.size < 3) return Trend.STEADY
        val half = values.size / 2
        val older = values.take(half).average()
        val newer = values.drop(values.size - half).average()
        return when {
            newer < older - deadbandM -> Trend.WARMER
            newer > older + deadbandM -> Trend.COLDER
            else -> Trend.STEADY
        }
    }
}
