package nz.waveformlabs.moshpoint.core

/**
 * "Heading home, worry if I haven't checked in within 45 minutes" and "Home safe".
 *
 * These two pings can overtake each other on the way (one by the relay, one carried by a
 * mate's phone), and phones' clocks differ. Before this the state was kept by display name,
 * in memory, and whichever arrived last won: a Home safe followed by a delayed Check in
 * brought the check-in back, and every crew phone sounded an urgent alarm about someone
 * who was home.
 *
 * Here: one state per person (by signing key), and the newest by **their own** clock wins,
 * so the order they arrive in doesn't matter and neither does the reader's clock.
 */
class CheckIns {
    private class Entry(
        val name: String,
        /** When they sent it, by their clock. */
        val timeSec: Long,
        /** Minutes until they should be home; -1 once they've said Home safe. */
        val minutes: Int,
        /** When it reached this phone, by this phone's clock. */
        val arrivedSec: Long,
        var alerted: Boolean,
    ) {
        val waiting get() = minutes >= 0
    }

    /** Someone is overdue. [late] = we only heard about their check-in after it was already due. */
    class Overdue(val sender: Long, val name: String, val late: Boolean)

    private val bySender = LinkedHashMap<Long, Entry>()

    /**
     * A Check in or Home safe from [sender] arrived. Returns true if it changed what we know
     * (false for a repeat, or for something older than what we already have).
     */
    fun onPing(sender: Long, name: String, kind: Int, timeSec: Long, minutes: Int, nowSec: Long): Boolean {
        if (sender == 0L) return false
        val homeSafe = when (kind) {
            GigGroup.Ping.HOME_SAFE -> true
            GigGroup.Ping.CHECK_IN -> false
            else -> return false
        }
        // A stamp from the future is a wrong clock: count it from when it arrived.
        val t = if (timeSec > nowSec + MessageClock.FUTURE_SLACK_SEC) nowSec else timeSec
        val had = bySender[sender]
        if (had != null) {
            if (t < had.timeSec) return false
            // Same second: Home safe wins, so a tie can never raise an alarm.
            if (t == had.timeSec && (had.waiting == !homeSafe)) return false
            if (t == had.timeSec && !had.waiting) return false
        }
        bySender[sender] = Entry(name, t, if (homeSafe) -1 else minutes.coerceIn(0, 32767), nowSec, alerted = false)
        return true
    }

    /** People to raise the alarm about now. Each is returned once. */
    fun due(nowSec: Long): List<Overdue> {
        forget(nowSec)
        val out = ArrayList<Overdue>()
        for ((sender, e) in bySender) {
            if (!e.waiting || e.alerted) continue
            val deadline = e.timeSec + e.minutes * 60L + GRACE_SEC
            if (nowSec <= deadline) continue
            // It reached us already overdue (carried by Bluetooth, or we were off). Their Home
            // safe may be right behind it: give it a moment before alarming.
            val arrivedLate = e.arrivedSec > deadline
            if (arrivedLate && nowSec - e.arrivedSec < SETTLE_SEC) continue
            e.alerted = true
            out += Overdue(sender, e.name, arrivedLate)
        }
        return out
    }

    /** Who's on their way home: signing tag -> when they should be home (their clock, unix s). */
    fun waiting(): Map<Long, Long> = bySender.filterValues { it.waiting }.mapValues { it.value.timeSec + it.value.minutes * 60L }

    fun nameOf(sender: Long): String? = bySender[sender]?.name

    private fun forget(nowSec: Long) {
        bySender.values.removeAll { nowSec - it.timeSec > KEEP_SEC && nowSec - it.arrivedSec > KEEP_SEC }
    }

    /** To save across restarts: one line per person. */
    fun snapshot(): String = bySender.entries.joinToString("\n") { (s, e) ->
        listOf(s.toString(), e.timeSec.toString(), e.minutes.toString(), e.arrivedSec.toString(), if (e.alerted) "1" else "0", e.name.replace('\n', ' ').replace('\t', ' '))
            .joinToString("\t")
    }

    companion object {
        /** A little slack on the deadline before alarming. */
        const val GRACE_SEC = 120L
        /** How long a check-in that arrives already overdue waits for a Home safe that may be following it. */
        const val SETTLE_SEC = 180L
        private const val KEEP_SEC = 24 * 3600L

        fun restore(saved: String?): CheckIns {
            val c = CheckIns()
            saved.orEmpty().split('\n').forEach { row ->
                val f = row.split('\t')
                if (f.size < 6) return@forEach
                val sender = f[0].toLongOrNull() ?: return@forEach
                c.bySender[sender] = Entry(
                    f[5], f[1].toLongOrNull() ?: return@forEach, f[2].toIntOrNull() ?: return@forEach,
                    f[3].toLongOrNull() ?: return@forEach, f[4] == "1",
                )
            }
            return c
        }
    }
}
