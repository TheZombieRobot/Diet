package nz.waveformlabs.moshpoint.core

/**
 * "Storage full" is said once, not on every write that fails (reliability P1-6): once, and
 * again only if it is still full a day later.
 */
object StorageNotice {
    const val AGAIN_AFTER_MS = 24 * 3600_000L

    fun shouldTell(lastToldMs: Long, nowMs: Long): Boolean =
        lastToldMs <= 0L || nowMs < lastToldMs || nowMs - lastToldMs >= AGAIN_AFTER_MS

    /** Is this failure a full disk (ENOSPC), going by the exception's messages? */
    fun isFull(t: Throwable?): Boolean {
        var e = t
        var depth = 0
        while (e != null && depth < 8) {
            val m = e.message.orEmpty()
            if (m.contains("ENOSPC") || m.contains("No space left", ignoreCase = true)) return true
            e = e.cause
            depth++
        }
        return false
    }
}
