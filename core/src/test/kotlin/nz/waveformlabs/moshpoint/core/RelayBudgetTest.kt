package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RelayBudgetTest {
    private fun budget() = RelayBudget(random = { 0.0 })

    /** One request that the relay answers with [outcome]. Returns false if the budget said no. */
    private fun RelayBudget.go(use: RelayUse, now: Long, outcome: RelayBudget.Outcome, message: Boolean = true): Boolean {
        val t = take(use, message, now) ?: return false
        settle(t, outcome, now)
        return true
    }

    /**
     * The bug this replaces: two hours in a venue with no signal, the location share retrying
     * on every fix and the outbox retrying every minute, used up the whole day's budget, so
     * nothing could be uploaded once signal came back.
     */
    @Test fun retriesWithNoSignalCostNothing() {
        val b = budget()
        var now = 1_000_000L
        var tried = 0
        repeat(2 * 3600 / 15) { i ->
            if (b.go(RelayUse.BACKGROUND, now, RelayBudget.Outcome.NO_ANSWER)) tried++
            if (i % 4 == 0 && b.go(RelayUse.MESSAGE, now, RelayBudget.Outcome.NO_ANSWER)) tried++
            now += 15_000
        }
        assertTrue(tried > 50, "it did keep trying ($tried)")
        assertEquals(190, b.messagesLeft(RelayUse.MESSAGE, now))
        assertEquals(150, b.messagesLeft(RelayUse.BACKGROUND, now))

        // Signal's back: the queue goes out, at the relay's pace (8 requests a minute: 2 kept for
        // safety, 2 for looking, 4 for uploads).
        b.networkBack()
        var sent = 0
        var minutes = 0
        while (sent < 40 && minutes < 30) {
            repeat(10) { if (sent < 40 && b.go(RelayUse.MESSAGE, now, RelayBudget.Outcome.OK)) sent++ }
            now += 60_000
            minutes++
        }
        assertEquals(40, sent)
        assertTrue(minutes <= 10, "40 messages at 4 a minute took $minutes min")
    }

    @Test fun locationSharesCannotUseUpTheMessages() {
        val b = budget()
        var now = 0L
        fun fill(use: RelayUse): Int {
            var n = 0
            // Spread out, so only the day's limit is in play here.
            while (b.go(use, now, RelayBudget.Outcome.OK)) {
                n++
                now += 15_000
            }
            return n
        }
        assertEquals(150, fill(RelayUse.BACKGROUND))
        assertEquals(PutResult.THROTTLED, b.refusal(RelayUse.BACKGROUND, true, now))
        // Crew messages still have their 40, and Need help the last 10 after that.
        assertEquals(40, fill(RelayUse.MESSAGE))
        assertEquals(10, fill(RelayUse.SAFETY))
        assertEquals(0, b.messagesLeft(RelayUse.SAFETY, now))
        assertNull(b.take(RelayUse.SAFETY, true, now))
        // Lookups publish nothing, so they still go.
        assertNotNull(b.take(RelayUse.MESSAGE, false, now))

        // A day after the first message the count starts again, and the waiting queue flushes.
        now = 24 * 3600_000L + 1
        assertEquals(190, b.messagesLeft(RelayUse.MESSAGE, now))
        assertTrue(b.go(RelayUse.MESSAGE, now, RelayBudget.Outcome.OK))
    }

    @Test fun eightRequestsAMinuteWithTwoKeptForMessages() {
        val b = budget()
        val now = 5_000_000L
        // Of the 8, two are kept for safety (F6) and two more for messages: background takes 4.
        repeat(4) { assertTrue(b.go(RelayUse.BACKGROUND, now + it, RelayBudget.Outcome.OK, message = false)) }
        assertNull(b.take(RelayUse.BACKGROUND, false, now + 10))
        repeat(2) { assertTrue(b.go(RelayUse.MESSAGE, now + 11 + it, RelayBudget.Outcome.OK)) }
        assertNull(b.take(RelayUse.MESSAGE, true, now + 13), "the rest of the minute is safety's")
        repeat(2) { assertTrue(b.go(RelayUse.SAFETY, now + 14 + it, RelayBudget.Outcome.OK)) }
        assertNull(b.take(RelayUse.SAFETY, true, now + 16))
        // The window slides: a minute after the first four, there's room again.
        assertNotNull(b.take(RelayUse.BACKGROUND, false, now + 60_010))
    }

    @Test fun backsOffWhenTheRelaySaysTooMany() {
        val b = budget()
        var now = 0L
        assertTrue(b.go(RelayUse.MESSAGE, now, RelayBudget.Outcome.THROTTLED))
        // The message wasn't published, so it isn't counted; but nothing ordinary goes for a minute.
        assertEquals(190, b.messagesLeft(RelayUse.MESSAGE, now))
        assertEquals(PutResult.THROTTLED, b.refusal(RelayUse.MESSAGE, true, now + 59_000))
        assertEquals(PutResult.THROTTLED, b.refusal(RelayUse.BACKGROUND, false, now + 59_000))
        now += 60_000
        assertTrue(b.go(RelayUse.MESSAGE, now, RelayBudget.Outcome.THROTTLED))
        // Second time: two minutes.
        assertEquals(PutResult.THROTTLED, b.refusal(RelayUse.MESSAGE, true, now + 119_000))
        now += 120_000
        assertTrue(b.go(RelayUse.MESSAGE, now, RelayBudget.Outcome.OK))
        assertEquals(0L, b.waitingUntil(RelayUse.MESSAGE, now))
        // A success starts the steps again from one minute.
        assertTrue(b.go(RelayUse.MESSAGE, now + 1, RelayBudget.Outcome.THROTTLED))
        assertNull(b.refusal(RelayUse.MESSAGE, true, now + 1 + 60_000))
    }

    @Test fun backOffIsJitteredSoACrowdDoesNotRetryInStep() {
        val early = RelayBudget(random = { 0.0 })
        val late = RelayBudget(random = { 0.999 })
        early.go(RelayUse.MESSAGE, 0, RelayBudget.Outcome.THROTTLED)
        late.go(RelayUse.MESSAGE, 0, RelayBudget.Outcome.THROTTLED)
        assertEquals(60_000L, early.waitingUntil(RelayUse.MESSAGE, 0))
        assertTrue(late.waitingUntil(RelayUse.MESSAGE, 0) in 85_000L..90_000L)
    }

    @Test fun afterNoAnswerBackgroundRequestsWaitABitButMessagesStillTry() {
        val b = budget()
        assertTrue(b.go(RelayUse.MESSAGE, 0, RelayBudget.Outcome.NO_ANSWER))
        // Location shares and the like stop spinning on a dead connection...
        assertEquals(PutResult.NO_NETWORK, b.refusal(RelayUse.BACKGROUND, true, 14_000))
        assertNull(b.refusal(RelayUse.BACKGROUND, true, 15_000))
        // ...but a message, a new crew key or a Need help is tried: one timeout on patchy signal mustn't hold those up.
        assertNull(b.refusal(RelayUse.MESSAGE, true, 1_000))
        assertNull(b.refusal(RelayUse.SAFETY, true, 1_000))
        // Still nothing: background waits longer each time, two minutes at most.
        var now = 15_000L
        repeat(6) {
            assertTrue(b.go(RelayUse.BACKGROUND, now, RelayBudget.Outcome.NO_ANSWER))
            now = b.waitingUntil(RelayUse.BACKGROUND, now)
        }
        assertTrue(b.go(RelayUse.BACKGROUND, now, RelayBudget.Outcome.NO_ANSWER))
        assertEquals(120_000L, b.waitingUntil(RelayUse.BACKGROUND, now) - now)
        // The phone says the network is back: no more waiting.
        b.networkBack()
        assertNull(b.refusal(RelayUse.BACKGROUND, true, now + 1))
    }

    /** A venue network that Android vouches for but that doesn't reach the relay (or a relay that's down). */
    @Test fun lookUpsBackOffWithJitterAfterRepeatedNoAnswers() {
        val b = budget()
        fun lookUp(now: Long, outcome: RelayBudget.Outcome) = b.go(RelayUse.MESSAGE, now, outcome, message = false)
        // One timeout on patchy signal holds nothing up.
        assertTrue(lookUp(0, RelayBudget.Outcome.NO_ANSWER))
        assertNull(b.refusal(RelayUse.MESSAGE, false, 1))
        // The second in a row: 5 s, then 10, 20, and 30 s at most.
        var now = 1L
        for (wait in listOf(5_000L, 10_000L, 20_000L, 30_000L, 30_000L)) {
            assertTrue(lookUp(now, RelayBudget.Outcome.NO_ANSWER))
            assertEquals(PutResult.NO_NETWORK, b.refusal(RelayUse.MESSAGE, false, now + wait - 1))
            assertEquals(-1L, b.roomInMs(RelayUse.MESSAGE, false, now + wait - 1))
            now += wait
            assertNull(b.refusal(RelayUse.MESSAGE, false, now))
        }
        // Uploads and safety pings keep their own pace meanwhile.
        assertTrue(lookUp(now, RelayBudget.Outcome.NO_ANSWER))
        assertNull(b.refusal(RelayUse.MESSAGE, true, now + 1))
        assertNull(b.refusal(RelayUse.SAFETY, true, now + 1))
        // Any answer from the relay: look-ups go at their own pace again (two more misses before a wait).
        assertTrue(b.go(RelayUse.SAFETY, now + 1, RelayBudget.Outcome.OK))
        assertTrue(lookUp(now + 2, RelayBudget.Outcome.NO_ANSWER))
        assertNull(b.refusal(RelayUse.MESSAGE, false, now + 3))
        // The network coming back clears the wait too.
        assertTrue(lookUp(now + 3, RelayBudget.Outcome.NO_ANSWER))
        assertEquals(PutResult.NO_NETWORK, b.refusal(RelayUse.MESSAGE, false, now + 4))
        b.networkBack()
        assertNull(b.refusal(RelayUse.MESSAGE, false, now + 4))
    }

    @Test fun lookUpWaitsAreJittered() {
        val late = RelayBudget(random = { 0.999 })
        repeat(2) { late.go(RelayUse.MESSAGE, 0, RelayBudget.Outcome.NO_ANSWER, message = false) }
        assertEquals(PutResult.NO_NETWORK, late.refusal(RelayUse.MESSAGE, false, 6_000))
        assertNull(late.refusal(RelayUse.MESSAGE, false, 6_250))
    }

    @Test fun aBurstOfTooManyAnswersIsOnePauseNotFive() {
        val b = budget()
        // Four requests on their way together (the minute's uploads), and the relay says "too many" to each.
        val tickets = (0L..3L).map { assertNotNull(b.take(RelayUse.MESSAGE, true, it)) }
        tickets.forEach { b.settle(it, RelayBudget.Outcome.THROTTLED, 200) }
        assertEquals(60_200L, b.waitingUntil(RelayUse.MESSAGE, 200), "one minute, not eight")
        // The next one, made after that pause, does step it up.
        assertTrue(b.go(RelayUse.MESSAGE, 60_200, RelayBudget.Outcome.THROTTLED))
        assertEquals(60_200L + 120_000L, b.waitingUntil(RelayUse.MESSAGE, 60_200))
    }

    @Test fun needHelpStillTriesThroughAPause() {
        val b = budget()
        assertTrue(b.go(RelayUse.MESSAGE, 0, RelayBudget.Outcome.THROTTLED))
        assertNull(b.take(RelayUse.MESSAGE, true, 1_000))
        // A safety ping goes anyway, but not in a stream: one every ten seconds.
        assertTrue(b.go(RelayUse.SAFETY, 1_000, RelayBudget.Outcome.THROTTLED))
        assertNull(b.take(RelayUse.SAFETY, true, 5_000))
        assertTrue(b.go(RelayUse.SAFETY, 11_000, RelayBudget.Outcome.OK))
        // Trying through the pause didn't make it longer, and didn't end it for everything else.
        assertEquals(60_000L, b.waitingUntil(RelayUse.MESSAGE, 12_000))
        assertNull(b.take(RelayUse.MESSAGE, true, 12_000))
    }

    @Test fun ourOwnServerOnlyPausesForSeconds() {
        // Our server's limiter refills every second: a minute's pause there would stop the finder for nothing.
        val b = RelayBudget(messagesPerDay = 1_000_000, requestsPerMinute = 600, messageReserve = 0, safetyReserve = 0, requestReserve = 0, throttleBaseMs = 5_000, throttleMaxMs = 30_000, random = { 0.0 })
        var now = 0L
        val waits = (1..5).map {
            assertTrue(b.go(RelayUse.BACKGROUND, now, RelayBudget.Outcome.THROTTLED, message = false))
            val until = b.waitingUntil(RelayUse.MESSAGE, now)
            (until - now).also { now = until }
        }
        assertEquals(listOf(5_000L, 10_000L, 20_000L, 30_000L, 30_000L), waits)
    }

    @Test fun aQueueBeingFlushedLeavesRoomToLookAtTheMailboxes() {
        val b = budget()
        val now = 3_000_000L
        // Back on signal with a backlog: uploads take every slot they're allowed, as soon as it frees.
        repeat(4) { assertTrue(b.go(RelayUse.MESSAGE, now + it * 100, RelayBudget.Outcome.OK)) }
        assertNull(b.take(RelayUse.MESSAGE, true, now + 1_000), "the fifth upload waits")
        assertEquals(59_000L, b.roomInMs(RelayUse.MESSAGE, true, now + 1_000))
        // Two requests a minute are kept for looking: new messages, where the crew is, a Need help coming in.
        assertTrue(b.go(RelayUse.MESSAGE, now + 2_000, RelayBudget.Outcome.OK, message = false))
        assertTrue(b.go(RelayUse.MESSAGE, now + 3_000, RelayBudget.Outcome.OK, message = false))
        assertNull(b.take(RelayUse.MESSAGE, false, now + 4_000))
        // A Need help going out isn't held to the uploads' share, nor to the look-ups': it has two of its own (F6).
        val c = budget()
        repeat(4) { assertTrue(c.go(RelayUse.MESSAGE, now + it, RelayBudget.Outcome.OK)) }
        repeat(2) { assertTrue(c.go(RelayUse.MESSAGE, now + 5 + it, RelayBudget.Outcome.OK, message = false)) }
        assertTrue(c.go(RelayUse.SAFETY, now + 10, RelayBudget.Outcome.OK))
        assertTrue(c.go(RelayUse.SAFETY, now + 11, RelayBudget.Outcome.OK))
    }

    @Test fun lookUpsForAnOpenChatDoNotSqueezeOutLocationShares() {
        val b = budget()
        val now = 9_000_000L
        // The open chat looks at its mailboxes four times this minute (not background: someone is watching).
        repeat(4) { assertTrue(b.go(RelayUse.MESSAGE, now + it * 1_000, RelayBudget.Outcome.OK, message = false)) }
        // A location share still goes, and so does a message. Then the minute is full for everyone
        // but safety, which keeps two (F6).
        assertTrue(b.go(RelayUse.BACKGROUND, now + 7_000, RelayBudget.Outcome.OK))
        assertTrue(b.go(RelayUse.MESSAGE, now + 8_000, RelayBudget.Outcome.OK))
        assertNull(b.take(RelayUse.MESSAGE, true, now + 9_000))
        // How long until there's room: when the first look-up is a minute old.
        assertEquals(51_000L, b.roomInMs(RelayUse.MESSAGE, true, now + 9_000))
        assertEquals(0L, b.roomInMs(RelayUse.MESSAGE, true, now + 60_000))
        // During a pause, waiting a few seconds won't help: say so.
        assertTrue(b.go(RelayUse.MESSAGE, now + 60_000, RelayBudget.Outcome.THROTTLED))
        assertEquals(-1L, b.roomInMs(RelayUse.MESSAGE, true, now + 61_000))
    }

    /**
     * Review finding F6 (docs/WAVE2C_REVIEW.md), the owner's rule: safety is never limited on the
     * free tier. However busy the minute on the public relay, a safety ping (Need help, Check in or
     * Home safe: its ping and its durable copy in the chat mailbox, two requests) never waits for
     * it. Everything else gets that much less, and the minute stays within what we take of
     * ntfy.sh's own limit (8 of its 12).
     */
    @Test fun aSafetyPingNeverWaitsForTheMinuteOnThePublicRelay() {
        val lookUp = RelayUse.MESSAGE to false
        val upload = RelayUse.MESSAGE to true
        val share = RelayUse.BACKGROUND to true
        for (order in listOf(listOf(lookUp, upload, share), listOf(share, upload, lookUp), listOf(upload, share, lookUp))) {
            val b = budget()
            val now = 7_000_000L
            // Every other kind of traffic takes all it may this minute, in this order.
            var others = 0
            var t = now
            while (order.any { (use, message) -> b.go(use, t, RelayBudget.Outcome.OK, message).also { if (it) others++ } }) t += 100
            t += 100
            assertEquals(0L, b.roomInMs(RelayUse.SAFETY, true, t), "Need help doesn't wait for room ($order)")
            repeat(2) { assertTrue(b.go(RelayUse.SAFETY, t + it, RelayBudget.Outcome.OK), "its request ${it + 1} goes at once ($order)") }
            assertEquals(6, others, "everything else gets two less than the minute's 8 ($order)")
            assertNull(b.take(RelayUse.SAFETY, true, t + 2), "and the minute holds no more than 8 ($order)")
        }
    }

    @Test fun aRefusalCountsTheRequestButNotTheMessage() {
        val b = budget()
        assertTrue(b.go(RelayUse.MESSAGE, 0, RelayBudget.Outcome.REFUSED))
        assertEquals(190, b.messagesLeft(RelayUse.MESSAGE, 0))
        // It took one of this minute's four uploads all the same.
        repeat(3) { assertTrue(b.go(RelayUse.MESSAGE, 1, RelayBudget.Outcome.OK)) }
        assertNull(b.take(RelayUse.MESSAGE, true, 2))
    }
}
