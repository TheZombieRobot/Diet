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

    /** Score of a fix right now: method precision x confidence, decaying with age. */
    private fun score(fix: Fix, nowMs: Long): Double {
        val age = (nowMs - fix.timestampMs).coerceAtLeast(0)
        if (age > fix.method.maxAgeMs) return 0.0
        val freshness = 1.0 - 0.5 * (age.toDouble() / fix.method.maxAgeMs)
        return fix.method.precision * fix.confidence.coerceIn(0.0, 1.0) * freshness
    }

    fun arrowFor(friendId: String, headingDeg: Double, nowMs: Long): ArrowState {
        val live = latest.values
            .filter { it.friendId == friendId }
            .map { it to score(it, nowMs) }
            .filter { it.second > 0.0 }
        if (live.isEmpty()) return ArrowState.NoSignal(friendId)

        val distance = live
            .filter { it.first.distanceM != null }
            .maxByOrNull { it.second }
            ?.first?.distanceM

        val directional = live.filter { it.first.method.givesDirection && it.first.bearingDeg != null }
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
