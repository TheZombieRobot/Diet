package nz.waveformlabs.moshpoint.server

import java.util.concurrent.ConcurrentHashMap

/**
 * Token buckets, one per key (a client address, an install, a mailbox): [capacity] at once, then
 * [refillPerSec]. A request costs 1 by default; byte budgets charge the number of bytes.
 *
 * Buckets live in memory only (never written anywhere) and are forgotten once idle long enough
 * to be full again. At most [maxKeys] are tracked: past that, after a sweep, new keys are let
 * through untracked rather than turned away.
 */
class RateLimiter(
    private val capacity: Double,
    private val refillPerSec: Double,
    private val clock: () -> Long = System::currentTimeMillis,
    private val maxKeys: Int = 200_000,
) {
    private class Bucket(var tokens: Double, var lastMs: Long)

    private val buckets = ConcurrentHashMap<String, Bucket>()

    /** Take [cost] from [key]'s bucket if it has that much. */
    fun allow(key: String, cost: Double = 1.0): Boolean {
        val now = clock()
        if (buckets.size >= maxKeys && !buckets.containsKey(key)) {
            sweep()
            if (buckets.size >= maxKeys) return true
        }
        val b = buckets.computeIfAbsent(key) { Bucket(capacity, now) }
        synchronized(b) {
            b.tokens = minOf(capacity, b.tokens + (now - b.lastMs).coerceAtLeast(0) / 1000.0 * refillPerSec)
            b.lastMs = now
            if (b.tokens < cost) return false
            b.tokens -= cost
            return true
        }
    }

    /** Give back [cost] taken by [allow] for something that then didn't happen. */
    fun refund(key: String, cost: Double) {
        val b = buckets[key] ?: return
        synchronized(b) { b.tokens = minOf(capacity, b.tokens + cost) }
    }

    /** Seconds until [key] has [cost] again (for Retry-After). */
    fun waitSeconds(key: String, cost: Double = 1.0): Long {
        val b = buckets[key] ?: return 1
        val missing = synchronized(b) { cost - b.tokens }
        if (missing <= 0 || refillPerSec <= 0) return 1
        return (missing / refillPerSec).toLong().coerceIn(1, 3600)
    }

    /** Forget keys that have been idle long enough to have a full bucket again. */
    fun sweep() {
        val now = clock()
        val idleMs = if (refillPerSec > 0) (capacity / refillPerSec * 1000).toLong() else Long.MAX_VALUE
        buckets.entries.removeIf { now - it.value.lastMs > idleMs }
    }

    val size: Int get() = buckets.size
}
