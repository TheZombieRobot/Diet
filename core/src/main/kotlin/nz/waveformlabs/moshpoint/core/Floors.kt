package nz.waveformlabs.moshpoint.core

import kotlin.math.abs
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.roundToInt
import kotlin.math.sqrt

/*
 * Upstairs / downstairs from the phones' pressure sensors (docs/VENUE_MAP.md, section 4).
 *
 * Air pressure drops about 12 Pa for every metre you climb. Two phones' sensors disagree by
 * far more than that, and the weather moves both of them all night, so a single reading says
 * nothing. What works:
 *  - compare two phones' readings taken at the same moment (the weather cancels), and
 *  - subtract the difference they showed while they were side by side (their sensors' offset).
 * The offset slowly drifts, so the calibration ages: the longer since two mates were together,
 * the bigger a height difference has to be before we call it a floor, until we stop saying.
 */

/** Pressure as it travels between phones, and the height it stands for. */
object Baro {
    /** One unit is 2 Pa (0.02 hPa), about 17 cm of height. 16 bits reach 1310 hPa. */
    const val HPA_PER_UNIT = 0.02
    const val MAX_UNITS = 0xFFFF

    /** R·T / (M·g) for air at 20 °C: the height over which pressure falls by a factor of e. */
    const val SCALE_HEIGHT_M = 8581.0

    /** Readings outside what a phone can meet on Earth are a broken sensor. */
    fun plausible(hPa: Double): Boolean = hPa.isFinite() && hPa in 300.0..1200.0

    fun toUnits(hPa: Double): Int? = if (plausible(hPa)) (hPa / HPA_PER_UNIT).roundToInt() else null

    fun toHpa(units: Int): Double = units * HPA_PER_UNIT

    /**
     * How far above us the other phone is, in metres (negative = below), from two pressures
     * taken at the same moment. [theirHpa] must already have the pair's offset added.
     */
    fun heightAboveM(myHpa: Double, theirHpa: Double): Double = SCALE_HEIGHT_M * ln(myHpa / theirHpa)
}

/**
 * This phone's own recent pressure. Smooths out door slams and squeezed pockets (median over
 * a few seconds), and can say what our pressure was at an earlier moment, so a mate's reading
 * from a minute ago is compared with ours from a minute ago: that's what cancels the weather.
 */
class PressureHistory(
    private val keepMs: Long = 10 * 60_000L,
    private val smoothMs: Long = 8_000L,
) {
    private val samples = ArrayDeque<Pair<Long, Double>>()

    @Synchronized
    fun add(tMs: Long, hPa: Double) {
        if (!Baro.plausible(hPa)) return
        // Batched sensor events can arrive slightly out of order: keep the list sorted.
        if (samples.isNotEmpty() && tMs < samples.last().first) return
        samples.addLast(tMs to hPa)
        while (samples.isNotEmpty() && tMs - samples.first().first > keepMs) samples.removeFirst()
    }

    /** Our pressure now (smoothed), or null if the newest reading is older than [maxAgeMs]. */
    @Synchronized
    fun current(nowMs: Long, maxAgeMs: Long = 60_000L): Double? {
        val newest = samples.lastOrNull() ?: return null
        if (nowMs - newest.first > maxAgeMs) return null
        return medianBefore(newest.first)
    }

    /** Our pressure at [tMs] (smoothed), or null if we have no reading within [maxGapMs] of it. */
    @Synchronized
    fun at(tMs: Long, maxGapMs: Long = 90_000L): Double? {
        val nearest = samples.minByOrNull { abs(it.first - tMs) } ?: return null
        if (abs(nearest.first - tMs) > maxGapMs) return null
        return medianBefore(nearest.first)
    }

    @Synchronized
    fun clear() = samples.clear()

    private fun medianBefore(tMs: Long): Double? {
        val window = samples.filter { it.first <= tMs && tMs - it.first <= smoothMs }.map { it.second }.sorted()
        if (window.isEmpty()) return null
        return if (window.size % 2 == 1) window[window.size / 2] else (window[window.size / 2 - 1] + window[window.size / 2]) / 2
    }
}

enum class Floor { UP, DOWN }

/** How we know two phones are side by side. */
enum class Closeness { UWB, BLUETOOTH, NOT_CLOSE }

/** Every number the floor logic uses, in one place, to tune from field recordings. */
data class FloorConfig(
    /** Side by side by UWB: this close or closer (a floor apart is 2.7 m or more). */
    val togetherUwbM: Double = 2.0,
    /** Side by side by Bluetooth: its distance estimate says this or closer. */
    val togetherBleM: Double = 1.5,
    /** How long they must stay side by side before we trust it. */
    val uwbHoldMs: Long = 4_000L,
    val bleHoldMs: Long = 20_000L,
    val uwbMinPairs: Int = 4,
    val bleMinPairs: Int = 6,
    /** The readings' difference may wander this much while together (hPa); more means stairs. */
    val steadyHpa: Double = 0.12,
    /** A bigger offset than this between two sensors means one is broken. */
    val maxOffsetHpa: Double = 4.0,
    /** Uncertainty straight after calibrating (m). */
    val sigmaUwbM: Double = 0.4,
    val sigmaBleM: Double = 0.7,
    /** How fast the calibration goes off (m per hour): phones warm up, sensors drift. */
    val driftMPerHour: Double = 0.3,
    /** Past this much uncertainty (m) we say nothing until they meet again. */
    val maxSigmaM: Double = 2.0,
    /** The least height difference we ever call a floor (m). */
    val floorM: Double = 2.5,
    /** The tag needs `max(floorM, marginM + 2 x uncertainty)`... */
    val marginM: Double = 1.5,
    /** ...and stays until the height falls below this share of that (no flicker at the edge). */
    val keepFraction: Double = 0.6,
    /** A Bluetooth calibration can't replace a UWB one younger than this if they disagree by more than [disagreeM]. */
    val uwbTrustMs: Long = 60 * 60_000L,
    val disagreeM: Double = 2.0,
    /** Readings older than this say nothing about where someone is now. */
    val theirMaxAgeMs: Long = 120_000L,
    /** Gap between pairs that ends a "together" spell. */
    val pairGapMs: Long = 10_000L,
)

/**
 * One mate's floor relative to us. Feed it pairs of same-moment readings ([onPair]) with how
 * close the phones are; ask it for the tag ([update]). One per mate, on each phone: nothing
 * about floors is sent, only pressure.
 */
class FloorTracker(private val cfg: FloorConfig = FloorConfig()) {
    /** What two phones' sensors disagreed by while side by side, and when. */
    data class Calibration(val offsetHpa: Double, val atMs: Long, val byUwb: Boolean)

    data class Estimate(val heightM: Double, val sigmaM: Double, val floor: Floor?)

    /** The current calibration (set it to restore one saved earlier tonight). */
    var calibration: Calibration? = null

    /** The tag last worked out by [update]. */
    var floor: Floor? = null
        private set

    private val spell = ArrayDeque<Pair<Long, Double>>() // (time, my - their) while together
    private var spellBy = Closeness.NOT_CLOSE

    /**
     * A pair of readings from the same moment. [close] says whether the phones are side by
     * side right now. Returns true when this pair produced a new calibration.
     */
    fun onPair(myHpa: Double, theirHpa: Double, tMs: Long, close: Closeness): Boolean {
        if (close == Closeness.NOT_CLOSE || !Baro.plausible(myHpa) || !Baro.plausible(theirHpa)) {
            spell.clear()
            spellBy = Closeness.NOT_CLOSE
            return false
        }
        // A new spell: after a gap, or when the method changes (UWB and Bluetooth have different rules).
        if (spell.isNotEmpty() && (tMs - spell.last().first > cfg.pairGapMs || tMs < spell.last().first || close != spellBy)) spell.clear()
        spellBy = close
        spell.addLast(tMs to (myHpa - theirHpa))
        val hold = if (close == Closeness.UWB) cfg.uwbHoldMs else cfg.bleHoldMs
        // Judge the latest stretch only, a little longer than the hold time.
        while (spell.size > 1 && tMs - spell.first().first > hold * 2) spell.removeFirst()
        val need = if (close == Closeness.UWB) cfg.uwbMinPairs else cfg.bleMinPairs
        if (spell.size < need || tMs - spell.first().first < hold) return false
        val diffs = spell.map { it.second }.sorted()
        if (diffs.last() - diffs.first() > cfg.steadyHpa) return false // one of them is on the move (stairs)
        val offset = if (diffs.size % 2 == 1) diffs[diffs.size / 2] else (diffs[diffs.size / 2 - 1] + diffs[diffs.size / 2]) / 2
        if (abs(offset) > cfg.maxOffsetHpa) return false
        val old = calibration
        if (close == Closeness.BLUETOOTH && old != null && old.byUwb && tMs - old.atMs < cfg.uwbTrustMs) {
            // Bluetooth can be fooled through a thin floor; UWB can't. Don't let it undo a fresh UWB answer.
            val apartM = abs(Baro.heightAboveM(myHpa, theirHpa + offset) - Baro.heightAboveM(myHpa, theirHpa + old.offsetHpa))
            if (apartM > cfg.disagreeM) return false
        }
        calibration = Calibration(offset, tMs, byUwb = close == Closeness.UWB)
        return true
    }

    /** How unsure the height is at [nowMs], in metres: grows as the calibration ages. */
    fun sigmaM(c: Calibration, nowMs: Long): Double {
        val hours = (nowMs - c.atMs).coerceAtLeast(0L) / 3_600_000.0
        val start = if (c.byUwb) cfg.sigmaUwbM else cfg.sigmaBleM
        return sqrt(start * start + (cfg.driftMPerHour * hours) * (cfg.driftMPerHour * hours))
    }

    /** The height a difference must reach at this uncertainty before it's called a floor. */
    fun thresholdM(sigmaM: Double): Double = max(cfg.floorM, cfg.marginM + 2 * sigmaM)

    /**
     * Works out the tag from same-moment readings. [theirAtMs] is when theirs was taken.
     * Null (and no tag) when we can't honestly say: no calibration, calibration aged out,
     * or their reading is old.
     */
    fun update(myHpa: Double?, theirHpa: Double?, theirAtMs: Long, nowMs: Long): Estimate? {
        val c = calibration
        if (c == null || myHpa == null || theirHpa == null || !Baro.plausible(myHpa) || !Baro.plausible(theirHpa) ||
            nowMs - theirAtMs > cfg.theirMaxAgeMs
        ) {
            floor = null
            return null
        }
        val sigma = sigmaM(c, nowMs)
        if (sigma > cfg.maxSigmaM) {
            floor = null
            return null
        }
        val height = Baro.heightAboveM(myHpa, theirHpa + c.offsetHpa)
        val enter = thresholdM(sigma)
        val keep = enter * cfg.keepFraction
        floor = when {
            height >= enter -> Floor.UP
            height <= -enter -> Floor.DOWN
            floor == Floor.UP && height >= keep -> Floor.UP
            floor == Floor.DOWN && height <= -keep -> Floor.DOWN
            else -> null
        }
        return Estimate(height, sigma, floor)
    }

    /** Their reading went stale, or they left: no tag until fresh readings come. */
    fun clearTag() {
        floor = null
    }
}
