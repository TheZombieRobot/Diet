package nz.waveformlabs.moshpoint.server

import java.util.concurrent.ConcurrentHashMap

/**
 * Simple per-client token bucket. A phone needs about one PUT every 15 s and one lookup
 * every 4 s, plus relayed uploads in crowd mode, so the defaults leave plenty of room.
 */
class RateLimiter(
    private val capacity: Double,
    private val refillPerSec: Double,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    private class Bucket(var tokens: Double, var lastMs: Long)

    private val buckets = ConcurrentHashMap<String, Bucket>()

    fun allow(client: String): Boolean {
        val now = clock()
        val b = buckets.computeIfAbsent(client) { Bucket(capacity, now) }
        synchronized(b) {
            b.tokens = minOf(capacity, b.tokens + (now - b.lastMs) / 1000.0 * refillPerSec)
            b.lastMs = now
            if (b.tokens < 1.0) return false
            b.tokens -= 1.0
            return true
        }
    }

    /** Forget clients that have been idle long enough to have a full bucket again. */
    fun sweep() {
        val now = clock()
        val idleMs = (capacity / refillPerSec * 1000).toLong()
        buckets.entries.removeIf { now - it.value.lastMs > idleMs }
    }
}
