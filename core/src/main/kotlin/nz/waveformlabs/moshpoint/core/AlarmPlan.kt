package nz.waveformlabs.moshpoint.core

/**
 * When to set a background check's alarm again (reliability P1-5). The app sets it at start,
 * after a reboot and after an update; doing that each time the app opens must never push a
 * planned check back (an app opened every half hour would otherwise never be checked by the
 * hourly alarm), and a check that was lost (reboot, update) runs soon.
 */
object AlarmPlan {
    /**
     * [plannedMs]: when the alarm was last planned for (0 = never). Returns when to set it for.
     * [lostDelayMs]: how soon a lost or missed check runs.
     */
    fun next(plannedMs: Long, nowMs: Long, intervalMs: Long, lostDelayMs: Long): Long = when {
        plannedMs <= 0L -> nowMs + intervalMs
        plannedMs <= nowMs -> nowMs + lostDelayMs
        // Planned further out than one interval: the clock moved back. Start again from now.
        plannedMs > nowMs + intervalMs -> nowMs + intervalMs
        else -> plannedMs
    }
}
