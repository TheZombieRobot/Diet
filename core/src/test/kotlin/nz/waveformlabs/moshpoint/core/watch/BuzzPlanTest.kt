package nz.waveformlabs.moshpoint.core.watch

import nz.waveformlabs.moshpoint.core.Trend
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class BuzzPlanTest {
    private fun on(distance: Double? = null, trend: Trend = Trend.STEADY, facing: Boolean = false, lost: Boolean = false) =
        BuzzPlanner.Input(active = true, distanceM = distance, trend = trend, facing = facing, linkLost = lost)

    /** Run [input] for [forMs], polling 10 times a second; returns (time, buzz) for each buzz played. */
    private fun run(p: BuzzPlanner, startMs: Long, forMs: Long, input: (Long) -> BuzzPlanner.Input): List<Pair<Long, Buzz>> {
        val out = mutableListOf<Pair<Long, Buzz>>()
        var t = startMs
        while (t < startMs + forMs) {
            p.next(t, input(t))?.let { out += t to it }
            t += 100
        }
        return out
    }

    @Test fun ticksComeFasterTheCloserYouAre() {
        val gaps = listOf(400.0, 150.0, 100.0, 60.0, 30.0, 10.0, 5.0, 3.0).map { BuzzPlanner.tickIntervalMs(it) }
        assertEquals(gaps.sortedDescending(), gaps, "should shrink all the way in")
        assertEquals(8_000, BuzzPlanner.tickIntervalMs(400.0))
        assertEquals(8_000, BuzzPlanner.tickIntervalMs(150.0))
        assertTrue(BuzzPlanner.tickIntervalMs(149.0) in 3_900..4_000)
        assertTrue(BuzzPlanner.tickIntervalMs(30.0) in 2_500..2_700)
        assertTrue(BuzzPlanner.tickIntervalMs(10.0) in 1_600..1_700)
        assertEquals(600, BuzzPlanner.tickIntervalMs(3.0))
        assertEquals(600, BuzzPlanner.tickIntervalMs(0.2))
    }

    @Test fun steadyDistanceGivesAnEvenTick() {
        val p = BuzzPlanner()
        val buzzes = run(p, 0, 30_000) { on(distance = 30.0) }
        assertTrue(buzzes.all { it.second == Buzz.TICK })
        val gaps = buzzes.zipWithNext { a, b -> b.first - a.first }
        assertTrue(gaps.all { it in 2_600..2_700 }, "gaps $gaps")
    }

    @Test fun nothingWhenNoFindIsOn() {
        val p = BuzzPlanner()
        assertTrue(run(p, 0, 60_000) { BuzzPlanner.Input(active = false, distanceM = 5.0, facing = true, trend = Trend.COLDER) }.isEmpty())
    }

    @Test fun nothingWhileStillSearching() {
        assertTrue(run(BuzzPlanner(), 0, 60_000) { on(distance = null) }.isEmpty())
    }

    @Test fun facingBuzzesOnceAndNeedsATurnAwayToComeBack() {
        val p = BuzzPlanner()
        val buzzes = run(p, 0, 20_000) { t ->
            // Facing from 2 s to 9 s, away until 12 s, facing again after.
            on(distance = 200.0, facing = t in 2_000..9_000 || t >= 12_000)
        }
        val facings = buzzes.filter { it.second == Buzz.FACING }.map { it.first }
        assertEquals(listOf(2_000L, 12_000L), facings)
    }

    @Test fun facingCannotChatter() {
        val p = BuzzPlanner()
        // The latch flickers every 300 ms (a noisy arrow at the edge of the cone).
        val buzzes = run(p, 0, 12_000) { t -> on(distance = 200.0, facing = (t / 300) % 2 == 0L) }
        val facings = buzzes.filter { it.second == Buzz.FACING }.map { it.first }
        assertTrue(facings.zipWithNext { a, b -> b - a }.all { it >= BuzzPlanner.FACING_AT_MOST_EVERY_MS }, "facings at $facings")
    }

    @Test fun headingAwayIsOneLongBuzzNotTicks() {
        val p = BuzzPlanner()
        val buzzes = run(p, 0, 20_000) { on(distance = 25.0, trend = Trend.COLDER) }
        assertTrue(buzzes.all { it.second == Buzz.WRONG_WAY }, "$buzzes")
        assertEquals(listOf(0L, 6_000L, 12_000L, 18_000L), buzzes.map { it.first })
        // Turn round: ticks again.
        val after = run(p, 20_000, 10_000) { on(distance = 25.0, trend = Trend.WARMER) }
        assertTrue(after.isNotEmpty() && after.all { it.second == Buzz.TICK })
    }

    @Test fun foundIsSaidOnceAndThenItIsQuiet() {
        val p = BuzzPlanner()
        val buzzes = run(p, 0, 30_000) { t -> on(distance = if (t < 5_000) 6.0 else 2.0) }
        assertEquals(1, buzzes.count { it.second == Buzz.FOUND })
        assertEquals(Buzz.FOUND, buzzes.last().second)
        assertTrue(p.found)
        assertNull(p.next(40_000, on(distance = 10.0)))
    }

    @Test fun losingThePhoneIsSaidOnceAndOldDistancesStopTicking() {
        val p = BuzzPlanner()
        val buzzes = run(p, 0, 40_000) { t -> on(distance = 20.0, lost = t in 10_000..29_900) }
        val lost = buzzes.filter { it.second == Buzz.LINK_LOST }
        assertEquals(listOf(10_000L), lost.map { it.first })
        assertTrue(buzzes.none { it.first in 10_100..29_900 }, "buzzed while lost: $buzzes")
        assertTrue(buzzes.any { it.first >= 30_000 && it.second == Buzz.TICK }, "ticks should resume")
    }

    @Test fun neverAConstantBuzz() {
        // Ten minutes of the worst a real night can throw at it.
        val rnd = Random(11)
        val p = BuzzPlanner()
        var distance = 80.0
        val buzzes = run(p, 0, 600_000) { t ->
            if (t % 1_000 == 0L) distance = (distance + (rnd.nextDouble() - 0.5) * 6).coerceIn(3.5, 200.0)
            on(
                distance = distance,
                trend = Trend.entries[rnd.nextInt(3)],
                facing = rnd.nextBoolean(),
                lost = rnd.nextInt(50) == 0,
            )
        }
        assertTrue(buzzes.size > 50)
        for ((a, b) in buzzes.zipWithNext()) {
            val silence = b.first - (a.first + a.second.totalMs)
            assertTrue(silence >= BuzzPlanner.MIN_SILENCE_MS, "only $silence ms of quiet between ${a.second} and ${b.second}")
        }
        // Never more than a second of motor in any ten seconds.
        for ((start, _) in buzzes) {
            val inWindow = buzzes.filter { it.first >= start && it.first < start + BuzzPlanner.BUDGET_WINDOW_MS }.sumOf { it.second.onMs }
            assertTrue(inWindow <= BuzzPlanner.BUDGET_MS, "motor on for $inWindow ms in the 10 s from $start")
        }
        assertTrue(buzzes.sumOf { it.second.onMs } <= 600_000 / 10)
    }

    @Test fun flatOutTickingIsStillMostlySilence() {
        val p = BuzzPlanner()
        val buzzes = run(p, 0, 60_000) { on(distance = 3.2, trend = Trend.WARMER) }
        assertTrue(buzzes.zipWithNext { a, b -> b.first - a.first }.all { it >= 600 })
        assertTrue(buzzes.sumOf { it.second.onMs } < 60_000 * 0.07)
    }

    @Test fun everyPatternIsShortAndTheyDifferByRhythm() {
        for (b in Buzz.entries) {
            assertTrue(b.totalMs < 1_000, "$b lasts ${b.totalMs} ms")
            assertTrue(b.pulsesMs.size % 2 == 1, "$b must start and end with the motor on")
        }
        // Told apart without strength control: by how many pulses, and whether each is short or long.
        fun shape(b: Buzz) = b.pulsesMs.filterIndexed { i, _ -> i % 2 == 0 }.joinToString("") { if (it >= 200) "L" else "s" }
        val guidance = Buzz.entries.filter { it.guidance }
        assertEquals(guidance.size, guidance.map(::shape).toSet().size, guidance.associateWith(::shape).toString())
        // And the two answers to "did my Need help go?" can't be confused.
        assertEquals("L", shape(Buzz.SOS_SENT))
        assertEquals("ssss", shape(Buzz.FAILED))
    }
}

class HoldToSendTest {
    @Test fun lettingGoEarlySendsNothing() {
        val h = HoldToSend()
        h.press(0)
        var events = (0L..1_900L step 50).mapNotNull { h.poll(it) }
        assertTrue(HoldToSend.Event.SEND !in events)
        h.release()
        events = (1_950L..10_000L step 50).mapNotNull { h.poll(it) }
        assertTrue(events.isEmpty())
        assertEquals(0f, h.progress(5_000))
    }

    @Test fun aFullHoldSendsExactlyOnce() {
        val h = HoldToSend()
        h.press(1_000)
        val events = (1_000L..9_000L step 16).mapNotNull { h.poll(it) }
        assertEquals(1, events.count { it == HoldToSend.Event.SEND })
        assertEquals(3, events.count { it == HoldToSend.Event.TICK }) // at 0.5, 1.0 and 1.5 s
        assertEquals(HoldToSend.Event.SEND, events.last())
    }

    @Test fun ringFillsOverTwoSeconds() {
        val h = HoldToSend()
        assertEquals(0f, h.progress(0))
        h.press(100)
        assertEquals(0.5f, h.progress(1_100), 1e-3f)
        assertEquals(1f, h.progress(2_100), 1e-3f)
        assertEquals(1f, h.progress(9_000), 1e-3f)
    }

    @Test fun aSecondPressAfterLettingGoStartsFromNothing() {
        val h = HoldToSend()
        h.press(0); h.poll(1_500); h.release()
        h.press(2_000)
        assertEquals(0.25f, h.progress(2_500), 1e-3f)
        assertNull((2_000L..3_900L step 100).mapNotNull { h.poll(it) }.firstOrNull { it == HoldToSend.Event.SEND })
        assertEquals(HoldToSend.Event.SEND, h.poll(4_000))
    }
}
