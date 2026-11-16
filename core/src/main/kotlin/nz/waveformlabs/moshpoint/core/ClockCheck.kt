package nz.waveformlabs.moshpoint.core

/**
 * "Now", for deciding a crew is over (reliability P2): the phone's clock, unless it has just
 * jumped forward. A clock set days ahead by mistake used to end the crew and delete its chat
 * and keys on the spot.
 *
 * Within one boot, real time passes as elapsedRealtime does. A wall clock more than [JUMP_MS]
 * ahead of that is a jump: until it has stood for [ACCEPT_AFTER_MS] of real time (a correction
 * that's right after all), the time counted from before the jump is used. A clock going back,
 * or a reboot, is simply taken as it is (going back only makes a crew last longer).
 */
object ClockCheck {
    const val JUMP_MS = 10 * 60_000L
    const val ACCEPT_AFTER_MS = 6 * 3600_000L

    /** The last trusted reading: wall clock and elapsedRealtime at that moment, in boot [boot]; when a jump was first seen (-1: none). */
    data class Anchor(val wallMs: Long, val elapsedMs: Long, val boot: Int, val jumpSeenElapsedMs: Long = -1L) {
        fun save(): String = "$wallMs,$elapsedMs,$boot,$jumpSeenElapsedMs"

        companion object {
            fun parse(s: String?): Anchor? {
                val f = s?.split(',') ?: return null
                if (f.size != 4) return null
                return Anchor(f[0].toLongOrNull() ?: return null, f[1].toLongOrNull() ?: return null, f[2].toIntOrNull() ?: return null, f[3].toLongOrNull() ?: return null)
            }
        }
    }

    class Result(val trustedNowMs: Long, val anchor: Anchor)

    fun check(a: Anchor?, wallMs: Long, elapsedMs: Long, boot: Int): Result {
        val fresh = Result(wallMs, Anchor(wallMs, elapsedMs, boot))
        if (a == null || a.boot != boot || elapsedMs < a.elapsedMs) return fresh
        val expected = a.wallMs + (elapsedMs - a.elapsedMs)
        if (wallMs - expected <= JUMP_MS) return fresh
        // Jumped forward: count on from before the jump, until the new time has stood long enough.
        val since = if (a.jumpSeenElapsedMs >= 0) a.jumpSeenElapsedMs else elapsedMs
        if (elapsedMs - since >= ACCEPT_AFTER_MS) return fresh
        return Result(expected, a.copy(jumpSeenElapsedMs = since))
    }
}
