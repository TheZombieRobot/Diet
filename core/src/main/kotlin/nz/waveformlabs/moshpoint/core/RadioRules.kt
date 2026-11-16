package nz.waveformlabs.moshpoint.core

/**
 * The crowd relay's advert (the finder module's CrowdRelayRadio) takes a turn every second. When
 * the turn's bytes are the ones already on air (our own location with nobody else's to pass on),
 * they're left there instead of being set again (docs/WAVE2C_BATTERY.md): the controller keeps
 * sending them. They're set again on a change, and every [KEEP_ALIVE_MS] anyway: setting them
 * gives the advert a new data id, which a chip that reports a repeat only once reports again.
 */
object RelayAdvertRefresh {
    const val KEEP_ALIVE_MS = 30_000L

    /** Set [next] on air now? [onAir]: the bytes set last (null: none yet), at [setAtMs]. */
    fun send(next: ByteArray, onAir: ByteArray?, setAtMs: Long, nowMs: Long): Boolean =
        onAir == null || !next.contentEquals(onAir) || nowMs - setAtMs >= KEEP_ALIVE_MS
}

/**
 * Wi-Fi Aware on a visible phone (the finder module's Findable) publishes only once a mate's
 * finder is looking for us (their "looking" advert heard), and stops again when none has been
 * heard for [HOLD_MS]: it used to publish for all of Live (docs/WAVE2C_BATTERY.md). Only a looking
 * mate can range to it.
 */
object AwarePublish {
    const val HOLD_MS = 5 * 60_000L

    /** [lastLookedAtMs]: when a "looking" advert was last heard, 0 if never. */
    fun wanted(nowMs: Long, lastLookedAtMs: Long): Boolean = lastLookedAtMs > 0L && nowMs - lastLookedAtMs < HOLD_MS
}

/**
 * "Light me up" (full brightness, a strobing screen, the torch) goes off by itself [LIMIT_MS]
 * after it was switched on or the screen was last touched, whichever is later
 * (docs/WAVE2C_BATTERY.md). A touch keeps it going; it used to run until the finder was left.
 */
object BeaconLimit {
    const val LIMIT_MS = 10 * 60_000L

    fun expired(nowMs: Long, onSinceMs: Long, lastTouchMs: Long): Boolean = nowMs - maxOf(onSinceMs, lastTouchMs) >= LIMIT_MS
}
