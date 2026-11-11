package nz.waveformlabs.moshpoint.core

/**
 * Small rules for crew messages that every phone must apply the same way. They live here,
 * not in the app, so the tests that can fail a build cover them.
 */

/**
 * Timestamps, when phones' clocks disagree.
 *
 * Chat is ordered by the time each sender stamped. That only reads sensibly if a reply is
 * never stamped earlier than the message it answers, so a phone stamps a new message just
 * after the newest one it has seen (within reason), whatever its own clock says.
 */
object MessageClock {
    /** How far ahead of its own clock a phone will stamp to stay behind what it has seen. */
    const val FOLLOW_SEC = 300L

    /** A timestamp further ahead than this of the phone reading it is treated as a wrong clock. */
    const val FUTURE_SLACK_SEC = 120L

    /**
     * The time to stamp on a new message. [newestSeenSec] is the newest message this phone has
     * seen in that crew; [lastOwnSec] the last one it sent there (so two quick messages never
     * share a second, and so an id).
     */
    fun stamp(nowSec: Long, newestSeenSec: Long, lastOwnSec: Long = 0L): Long {
        var t = nowSec
        if (newestSeenSec >= t && newestSeenSec - nowSec <= FOLLOW_SEC) t = newestSeenSec + 1
        if (lastOwnSec >= t && lastOwnSec - nowSec <= FOLLOW_SEC + 60) t = lastOwnSec + 1
        return t
    }

    /**
     * Where a message sorts on the phone showing it: by its own time, unless that is in the
     * future here, in which case by when it arrived. Otherwise one phone with a fast clock
     * would pin its message to the bottom of everyone's chat for hours.
     */
    fun sortTime(timeSec: Long, arrivedSec: Long): Long = if (timeSec > arrivedSec + FUTURE_SLACK_SEC) arrivedSec else timeSec

    /** The order every phone shows: by time, then by message id, so arrival order never matters. */
    fun compare(aTimeSec: Long, aId: Long, bTimeSec: Long, bId: Long): Int =
        if (aTimeSec != bTimeSec) aTimeSec.compareTo(bTimeSec) else java.lang.Long.compareUnsigned(aId, bId)
}

/**
 * The meet-up pin: the newest one wins, including "removed". Two guards on "newest":
 *  - a pin dated well into the future is refused, or one pin dated years ahead would win
 *    forever and lock the crew's pin;
 *  - a new pin is stamped just after the one it replaces, so it wins even from a phone whose
 *    clock runs slow.
 */
object PinRule {
    const val FUTURE_SLACK_SEC = 300L

    /** Should a pin stamped [incomingSec] replace the one stamped [currentSec] (0 = none)? */
    fun accepts(incomingSec: Long, currentSec: Long, nowSec: Long): Boolean =
        incomingSec <= nowSec + FUTURE_SLACK_SEC && incomingSec > currentSec

    /** A saved pin time, made safe: an old build may have stored one from the far future. */
    fun capped(savedSec: Long, nowSec: Long): Long = minOf(savedSec, nowSec + FUTURE_SLACK_SEC)

    /** The time to stamp on a pin we set or clear now. */
    fun stamp(nowSec: Long, currentSec: Long): Long = maxOf(nowSec, capped(currentSec, nowSec) + 1)
}

/**
 * What to do with a quick ping when it arrives, by kind and by how old it is.
 *
 * Before this, every ping older than 20 minutes was dropped without a trace, "Need help"
 * included, and any kind a build didn't know was announced as "pinged the crew".
 */
object PingPolicy {
    enum class Group {
        /** Need help, Check in, Home safe: never dropped, sent first. */
        SAFETY,
        /** On my way, Where are you?, Stay put, Meet at the pin, All good, Heading home. */
        QUICK,
        /** "Here for the next half hour", with a spot. */
        FLARE,
        /** Chat lines, the pinned plan, "joined": they live in the chat mailbox. */
        CHAT,
        /** A kind this build doesn't know: ignored, never announced. */
        UNKNOWN,
    }

    /** Pings count as fresh, and are announced, for this long. */
    const val FRESH_SEC = 20 * 60L

    /** A Need help still raises an alert this long after it was sent (then it's only shown). */
    const val HELP_ALERT_SEC = 12 * 3600L

    fun group(kind: Int): Group = when (kind) {
        GigGroup.Ping.NEED_HELP, GigGroup.Ping.CHECK_IN, GigGroup.Ping.HOME_SAFE -> Group.SAFETY
        GigGroup.Ping.COMING, GigGroup.Ping.STAY_PUT, GigGroup.Ping.WHERE_ARE_YOU, GigGroup.Ping.MEET_AT_PIN,
        GigGroup.Ping.ALL_GOOD, GigGroup.Ping.GOING_HOME -> Group.QUICK
        GigGroup.Ping.FLARE -> Group.FLARE
        GigGroup.Ping.CHAT, GigGroup.Ping.PLAN, GigGroup.Ping.JOIN -> Group.CHAT
        else -> Group.UNKNOWN
    }

    /** How the relay budget treats it. */
    fun use(kind: Int): RelayUse = if (group(kind) == Group.SAFETY) RelayUse.SAFETY else RelayUse.MESSAGE

    /** Safety pings are also posted to the crew's chat mailbox, which keeps them for days (older builds ignore them there). */
    fun alsoHeld(kind: Int): Boolean = group(kind) == Group.SAFETY

    /** How long phones carry it for crew mates who haven't had it. */
    fun carrySec(kind: Int): Long = when (group(kind)) {
        Group.SAFETY -> 12 * 3600L
        Group.QUICK, Group.FLARE -> 2 * 3600L
        Group.CHAT -> 24 * 3600L
        Group.UNKNOWN -> 0L
    }

    /** How long strangers' phones pass it along (see MessageRelay). */
    fun crowdSec(kind: Int): Long = if (kind == GigGroup.Ping.NEED_HELP) 3600L else FRESH_SEC

    class Verdict(
        /** Put it in the chat (and on the crew's ping list). False only for kinds we don't know. */
        val show: Boolean,
        /** Raise a notification now. */
        val alert: Boolean,
        /** It arrived well after it was sent: say so ("sent 40 min ago"). */
        val late: Boolean,
        /** Its time as far as this phone is concerned (a future stamp is pulled back to now). */
        val timeSec: Long,
    )

    fun onArrival(kind: Int, timeSec: Long, minutes: Int, nowSec: Long): Verdict {
        val t = if (timeSec > nowSec + MessageClock.FUTURE_SLACK_SEC) nowSec else timeSec
        val age = (nowSec - t).coerceAtLeast(0)
        val late = age > FRESH_SEC
        return when (group(kind)) {
            Group.UNKNOWN -> Verdict(show = false, alert = false, late = false, timeSec = t)
            Group.SAFETY -> Verdict(
                show = true,
                // Need help is announced even hours late; a late Check in or Home safe only updates the state.
                alert = if (kind == GigGroup.Ping.NEED_HELP) age <= HELP_ALERT_SEC else !late,
                late = late, timeSec = t,
            )
            Group.QUICK -> Verdict(show = true, alert = !late, late = late, timeSec = t)
            Group.FLARE -> {
                val live = t + minutes.coerceIn(1, 120) * 60L > nowSec
                Verdict(show = true, alert = live, late = !live, timeSec = t)
            }
            Group.CHAT -> Verdict(show = true, alert = true, late = false, timeSec = t)
        }
    }
}

/**
 * How one of your own messages is doing, as the chat stores it (a number per line).
 *
 * The first three numbers are the ones saved chats already use; the new ones come after, so
 * old rows still load. A state only moves forward: waiting, then sent nearby, then sent. The
 * one way back is asking to try again.
 */
object OutboxState {
    /** The relay has it. */
    const val SENT = 0
    /** First attempt under way. */
    const val SENDING = 1
    /** Given up on (too old to be worth sending, and nobody had it). Tap to try again. */
    const val FAILED = 2
    /** A crew phone nearby has confirmed it holds it. Still to be uploaded. */
    const val NEARBY = 3
    /** Queued: no signal, and no crew phone has it yet. */
    const val WAITING = 4

    private fun rank(state: Int) = when (state) {
        SENT -> 3
        NEARBY -> 2
        WAITING -> 1
        else -> 0
    }

    /** May a line in state [from] be changed to [to]? */
    fun mayMove(from: Int, to: Int): Boolean = when {
        from == to -> false
        to == FAILED -> from == SENDING || from == WAITING
        to == SENDING -> from == FAILED || from == WAITING
        else -> rank(to) > rank(from)
    }
}

/**
 * Which form of crew intro to put on air (see [GigGroup.sealIntro]).
 *
 * The first form shows 4 constant bytes of the member's crew pass, so someone listening can
 * follow one person all night and from gig to gig. The second form shows nothing constant,
 * but builds from before it can't read it, and a crew mate who can't read our intro can't
 * find us. So:
 *  - while anyone in the crew might be on an older build, our own intro takes turns between
 *    the two forms and intros passed on for crew mates stay in the first;
 *  - a member's own intro (signed by them) arriving in the second form shows their phone
 *    writes it, so reads it. That's remembered;
 *  - once every member we know has shown that, only the second form goes on air. If someone
 *    new turns up on an older build, they aren't on the list and the turns start again.
 *
 * Only what's on air changes. The copy posted to the relay stays in the first form: people
 * following from home and older builds read the crew list from there.
 */
class IntroForms(saved: String? = null, private val max: Int = 600) {
    private val reads = LinkedHashSet<String>()

    init {
        saved?.split(',')?.filter { it.length == 16 }?.forEach { reads += it }
    }

    /** An intro was heard. True if it taught us something (then save [snapshot]). */
    fun heard(intro: GigGroup.Intro): Boolean {
        // Passed on by someone else (unsigned), or in the first form: says nothing about this member's own phone.
        if (!intro.form2 || intro.sig == null) return false
        if (!reads.add(key(intro.secret))) return false
        while (reads.size > max) reads.remove(reads.first())
        return true
    }

    /** Has the member with this crew pass shown that their phone reads the second form? */
    fun reads(secret: ByteArray): Boolean = key(secret) in reads

    /** Every member in [crew] (by crew pass) reads the second form: the first can stop. Never true for a crew of one. */
    fun newOnly(crew: Collection<ByteArray>): Boolean = crew.isNotEmpty() && crew.all { reads(it) }

    /** Should our own intro go out in the second form on its [turn]th time (0, 1, 2…)? */
    fun ownForm2(turn: Int, crew: Collection<ByteArray>): Boolean = newOnly(crew) || turn % 2 == 1

    fun snapshot(): String = reads.joinToString(",")

    // A short hash, so this list isn't another copy of anyone's crew pass.
    private fun key(secret: ByteArray): String =
        java.security.MessageDigest.getInstance("SHA-256").digest("mp-intro2".toByteArray() + secret).copyOf(8).joinToString("") { "%02x".format(it) }
}
