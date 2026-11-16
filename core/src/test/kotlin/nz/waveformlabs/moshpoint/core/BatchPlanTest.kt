package nz.waveformlabs.moshpoint.core

import java.nio.ByteBuffer
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class BatchPlanTest {
    private fun id(n: Int) = ByteArray(16) { (n + it).toByte() }
    private fun rec(n: Int, size: Int = 29) = ByteArray(size) { (n * 7 + it).toByte() }
    private fun loc(n: Int, v: Int) = BatchPlan.Put(id(n), rec(v), held = false, replaceable = true)

    @Test fun eachRotatingIdGoesOnceAsItsNewestCopy() {
        val plan = BatchPlan()
        assertNull(plan.add(loc(1, 1), BatchPlan.Timing.MINUTE, 0L))
        plan.add(loc(2, 2), BatchPlan.Timing.MINUTE, 1_000L)
        val older = loc(1, 3)
        assertNotNull(plan.add(older, BatchPlan.Timing.MINUTE, 2_000L), "the first copy for id 1 is replaced")
        val newest = loc(1, 4)
        assertSame(older, plan.add(newest, BatchPlan.Timing.MINUTE, 3_000L))
        // Crew messages to one mailbox are all different messages: none replaces another.
        repeat(3) { plan.add(BatchPlan.Put(id(9), rec(100 + it, 80), held = false, replaceable = false, key = it + 1L), BatchPlan.Timing.MINUTE, 4_000L) }
        val b = plan.take(emptyList(), 60_000L)
        assertEquals(5, b.puts.size)
        assertEquals(1, b.puts.count { it.id.contentEquals(id(1)) }, "id 1 at most once")
        assertContentEquals(rec(4), b.puts.single { it.id.contentEquals(id(1)) }.record, "the newest copy")
        assertEquals(3, b.puts.count { it.id.contentEquals(id(9)) })
        assertEquals(0, plan.waiting)
    }

    @Test fun oneBatchAMinuteUnlessSomeoneIsWaiting() {
        val plan = BatchPlan()
        assertEquals(Long.MAX_VALUE, plan.dueAtMs(), "nothing waiting, nothing due")
        plan.add(loc(1, 1), BatchPlan.Timing.MINUTE, 10_000L)
        plan.add(loc(2, 1), BatchPlan.Timing.MINUTE, 40_000L)
        assertEquals(70_000L, plan.dueAtMs(), "a minute after the oldest put")
        // A message just typed (or our position while a mate is looking): within a couple of seconds, taking the rest along.
        plan.add(BatchPlan.Put(id(3), rec(3, 60), held = true, replaceable = false, key = 7L), BatchPlan.Timing.SOON, 41_000L)
        assertEquals(42_500L, plan.dueAtMs())
        val b = plan.take(emptyList(), 42_500L)
        assertEquals(3, b.puts.size)
        assertEquals(Long.MAX_VALUE, plan.dueAtMs())
    }

    /**
     * Review finding F1 (docs/WAVE2C_REVIEW.md): `RelayClient`'s flusher sleeps until the batch is
     * due, and with nothing waiting until it's woken. With no crew sync to take the puts (no crew,
     * or a dormant one: friends finding each other), every location queued for the minute's batch
     * must still go within a minute: the first one, and every one after the queue has emptied.
     * The flusher here is the app's: asleep until [BatchPlan.dueAtMs] as it last read it, woken
     * only when queuing a put says so.
     */
    @Test fun everyPutForTheMinuteGoesWithinAMinuteWithNoCrewSync() {
        val plan = BatchPlan()
        var started = false // the first put starts the flusher, which then reads when the batch is due
        var sleepUntil = Long.MAX_VALUE // nothing waiting: asleep until woken
        val queuedAt = LinkedHashMap<Int, Long>() // each location, by number, and when it was queued
        val went = ArrayList<Pair<Long, Int>>() // each batch's time, and the location it carried
        var fix = 0
        for (s in 0..600) {
            val now = s * 1_000L
            // A location every 15 s, under a rotating id that changes every 5 minutes.
            if (s % 15 == 0) {
                fix++
                queuedAt[fix] = now
                val before = plan.dueAtMs()
                plan.add(BatchPlan.Put(id(s / 300), rec(fix), held = false, replaceable = true), BatchPlan.Timing.MINUTE, now)
                // The app wakes its flusher by the plan's rule (RelayClient.queue).
                if (!started || BatchPlan.wakes(before, plan.dueAtMs())) sleepUntil = plan.dueAtMs()
                started = true
            }
            if (now >= sleepUntil) {
                plan.take(emptyList(), now).puts.forEach { p -> went += now to queuedAt.keys.single { rec(it).contentEquals(p.record) } }
                sleepUntil = plan.dueAtMs()
            }
        }
        // Each location goes, or a newer copy of it does, within a minute (the last minute's may still be waiting).
        for ((f, q) in queuedAt) {
            if (q > 540_000L) continue
            assertTrue(went.any { (t, g) -> g >= f && t in q..q + 60_000L }, "location $f, queued at ${q / 1000} s, went within a minute (batches: $went)")
        }
    }

    @Test fun getsFirstThenTheOldestPutsThatFit() {
        val plan = BatchPlan()
        repeat(150) { plan.add(loc(it, it), BatchPlan.Timing.MINUTE, it.toLong()) }
        val gets = List(126) { BatchPlan.Get(id(200 + it), held = false, since = 0L) }
        val b = plan.take(gets, 60_000L)
        assertEquals(126, b.gets.size, "every get: they're why the sync asks")
        assertEquals(74, b.puts.size, "200 ops in all")
        assertContentEquals(id(0), b.puts.first().id, "oldest first")
        assertEquals(76, plan.waiting)
        assertTrue(plan.dueAtMs() <= 61_500L, "the rest goes straight after")
        assertEquals(200, b.ops.size)
        assertTrue(b.ops.take(74).none { it.isGet } && b.ops.drop(74).all { it.isGet }, "puts, then gets")
        // The body cap: 4,000-byte chat records, 512 KB at most.
        val big = BatchPlan()
        repeat(200) { big.add(BatchPlan.Put(id(it), rec(it, 4_000), held = true, replaceable = false, key = it + 1L), BatchPlan.Timing.MINUTE, 0L) }
        val c = big.take(emptyList(), 1L)
        assertTrue(RelayWire.batchSize(c.ops) <= RelayWire.MAX_BODY)
        assertEquals(130, c.puts.size)
    }

    @Test fun noAnswerPutsLocationsBackButNotStaleOrSupersededOnesAndNeverMessages() {
        val plan = BatchPlan()
        plan.add(loc(1, 1), BatchPlan.Timing.MINUTE, 0L)
        plan.add(loc(2, 1), BatchPlan.Timing.MINUTE, 0L)
        plan.add(BatchPlan.Put(id(9), rec(9, 80), held = false, replaceable = false, key = 5L), BatchPlan.Timing.MINUTE, 0L)
        val b = plan.take(emptyList(), 60_000L)
        assertEquals(3, b.puts.size)
        plan.add(loc(2, 2), BatchPlan.Timing.MINUTE, 61_000L) // a newer fix arrived meanwhile
        plan.putBack(b.puts, 62_000L)
        val again = plan.take(emptyList(), 120_000L)
        assertEquals(2, again.puts.size, "id 1 back, id 2's newer copy only, the message not (the courier retries it)")
        assertContentEquals(rec(2), again.puts.single { it.id.contentEquals(id(2)) }.record)
        // Ten minutes waiting: not worth sending any more.
        plan.add(loc(3, 1), BatchPlan.Timing.MINUTE, 0L)
        val late = plan.take(emptyList(), 11 * 60_000L)
        assertEquals(0, late.puts.size)
        assertEquals(1, late.dropped.size)
    }

    @Test fun drainingHandsBackEverythingForSingleRequests() {
        val plan = BatchPlan()
        plan.add(loc(1, 1), BatchPlan.Timing.SOON, 0L)
        plan.add(BatchPlan.Put(id(9), rec(9, 80), held = true, replaceable = false, key = 5L), BatchPlan.Timing.MINUTE, 0L)
        assertEquals(2, plan.drain().size)
        assertEquals(0, plan.waiting)
        assertEquals(Long.MAX_VALUE, plan.dueAtMs())
    }

    @Test fun batchBytesMatchTheRelayApiExample() {
        // docs/RELAY_API.md section 9: put a 29-byte record under A, read box B from the start.
        val a = ByteArray(16) { 0xA0.toByte() }
        val b = ByteArray(16) { 0xB0.toByte() }
        val record = ByteArray(29) { it.toByte() }
        val body = RelayWire.batch(listOf(RelayWire.put(false, a, record), RelayWire.get(false, b, 0L)))
        val want = byteArrayOf(1, 2, 1, 0, 0x2d) + a + record + byteArrayOf(3, 0, 0x18) + b + ByteArray(8)
        assertContentEquals(want, body)
        // Its answer: PUT OK, then GET OK with a cursor and the one record.
        val ops = listOf(RelayWire.put(false, a, record), RelayWire.get(false, b, 0L))
        val answer = byteArrayOf(1, 2, 0, 0) + ByteBuffer.allocate(8).putLong(42L).array() + byteArrayOf(0, 1, 0, 0x1d) + record
        val parsed = assertNotNull(RelayWire.parseBatch(answer, ops))
        assertEquals(RelayWire.OK, parsed[0].status)
        assertNull(parsed[0].block)
        assertEquals(42L, parsed[1].block!!.next)
        assertContentEquals(record, parsed[1].block!!.records.single())
        // A relay that doesn't know an op type answers 6 alone, even for a get.
        val odd = byteArrayOf(1, 2, 6, 6)
        val two = assertNotNull(RelayWire.parseBatch(odd, ops))
        assertEquals(RelayWire.UNKNOWN, two[0].status)
        assertEquals(RelayWire.UNKNOWN, two[1].status)
        assertNull(RelayWire.parseBatch(answer.copyOf(answer.size - 1), ops), "cut off")
        assertNull(RelayWire.parseBatch(answer + 0, ops), "a byte over")
        assertNull(RelayWire.parseBatch(byteArrayOf(2, 2, 0, 0), ops), "another version")
    }

    /** Our relay's budget with batches (as RelayClient builds it): a full minute never holds up a safety ping. */
    @Test fun aBusyMinuteNeverHoldsUpSafety() {
        val b = RelayBudget.withBatches(random = { 0.0 })
        var now = 0L
        repeat(120) {
            val t = assertNotNull(b.take(RelayUse.MESSAGE, false, now)) // polls, every half second
            b.settle(t, RelayBudget.Outcome.OK, now)
            now += 490L
        }
        now = 59_000L
        assertNull(b.take(RelayUse.MESSAGE, false, now), "the minute is full for everything else")
        assertNull(b.take(RelayUse.BACKGROUND, true, now))
        assertEquals(0L, b.roomInMs(RelayUse.SAFETY, true, now), "Need help doesn't wait for room")
        assertNotNull(b.take(RelayUse.SAFETY, true, now), "and goes")
        // The public relay's budget is unchanged: its limits are the relay's own.
        val public = RelayBudget(random = { 0.0 })
        repeat(8) { public.take(RelayUse.MESSAGE, false, it * 1_000L) }
        assertNull(public.take(RelayUse.SAFETY, true, 9_000L))
    }

    /**
     * Review finding F3 (docs/WAVE2C_REVIEW.md): with batches, our relay's budget counts every
     * request, not just what the batch replaced. A burst in the background (here
     * `AvatarSync.fetchFriends`: this week's photo, then last week's, for 20 friends who have
     * none, every 6 hours) must never refuse the minute's batch or the finder's polls.
     */
    @Test fun aBackgroundBurstNeverStarvesTheBatchOrTheFinder() {
        // Our relay with batches, as RelayClient builds it.
        val b = RelayBudget.withBatches(random = { 0.0 })
        var now = 0L
        var photos = 0
        repeat(40) {
            b.take(RelayUse.BACKGROUND, false, now)?.let { t ->
                b.settle(t, RelayBudget.Outcome.REFUSED, now) // 404: no photo this week
                photos++
            }
            now += 250L
        }
        assertTrue(photos >= 20, "at least one photo asked for each friend ($photos)")
        // The rest of the minute: the finder's poll every 4 s, and the sync's batch at 30 s.
        while (now < 60_000L) {
            if (now % 4_000L == 0L) {
                val poll = assertNotNull(b.take(RelayUse.MESSAGE, false, now), "the finder's poll at ${now / 1000} s")
                b.settle(poll, RelayBudget.Outcome.OK, now)
            }
            if (now == 30_000L) {
                val batch = assertNotNull(b.take(RelayUse.MESSAGE, true, now), "the minute's batch")
                b.settle(batch, RelayBudget.Outcome.OK, now)
            }
            now += 1_000L
        }
        assertNotNull(b.take(RelayUse.SAFETY, true, now), "and safety, as ever")
        // Still a net for a runaway loop: a minute of requests back to back stops at the relay's own rate.
        var looped = 0
        repeat(500) { b.take(RelayUse.MESSAGE, false, now)?.let { t -> b.settle(t, RelayBudget.Outcome.OK, now); looped++ } }
        assertTrue(looped < 120, "a runaway loop is held back ($looped went)")
    }

    /**
     * The hard rule: Need help never waits for the batch. A real courier posts it while a batch
     * is half a minute away: its upload starts at once, on its own, and no batch ever carries it.
     * Its durable copy for the chat mailbox goes the same way. A chat message posted at the same
     * moment waits for the batch.
     */
    @Test fun needHelpDoesNotWaitForTheBatch() {
        val group = GigGroup(ByteArray(32) { (it + 1).toByte() }, "Laneway", 0L)
        val crewId = "crew"
        val signer = CrewKeys.generate()
        var now = 1_800_000_000_000L
        val plan = BatchPlan()
        val alone = ArrayList<Pair<Courier.Upload, Long>>()
        val batched = HashMap<Long, Courier.Upload>()
        lateinit var courier: Courier
        // The app's uplink, as OfflineMessages does it: route by use, safety straight to the relay.
        val uplink = object : Courier.Uplink {
            override fun upload(job: Courier.Upload) {
                when (BatchPlan.route(job.use)) {
                    BatchPlan.Route.ALONE -> {
                        alone += job to now
                        courier.onUploaded(job, PutResult.SENT, now)
                    }
                    BatchPlan.Route.BATCH -> {
                        val key = batched.size + 1L
                        batched[key] = job
                        plan.add(BatchPlan.Put(id(job.box.ordinal), job.sealed, held = job.box == Courier.Box.CHAT, replaceable = false, key = key), BatchPlan.Timing.MINUTE, now)
                    }
                }
            }
        }
        val host = object : Courier.Host {
            override fun deliver(crew: Courier.Crew, message: Courier.Message, route: Courier.Route) {}
            override fun stateChanged(crewId: String, id: Long, state: Courier.State) {}
            override fun fetchWanted(crewId: String) {}
            override fun paused(crewId: String, on: Boolean) {}
            override fun trace(id: Long, kind: Int, what: String) {}
        }
        courier = Courier(host, uplink, object : Courier.Air { override fun ready() = false })
        courier.setCrews(listOf(Courier.Crew(crewId, group, signer, main = true)), now)
        courier.setOnline(true, now)
        // A location waits for the minute's batch; it's due 30 s from now.
        plan.add(loc(1, 1), BatchPlan.Timing.MINUTE, now - 30_000L)
        val chat = assertNotNull(courier.post(crewId, group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", now / 1000, text = "at the bar"), signer), now))
        val help = assertNotNull(courier.post(crewId, group.sealPing(GigGroup.Ping(GigGroup.Ping.NEED_HELP, "Jo", now / 1000), signer), now))
        courier.tick(now)
        val helpUploads = alone.filter { it.first.id == help.id }
        assertTrue(helpUploads.isNotEmpty(), "Need help started straight away")
        assertTrue(helpUploads.all { it.second == now && it.first.use == RelayUse.SAFETY }, "at the moment it was posted")
        assertEquals(setOf(Courier.Box.PING, Courier.Box.CHAT), helpUploads.map { it.first.box }.toSet(), "its ping and its durable copy, each on its own")
        assertTrue(batched.values.none { it.id == help.id }, "never handed to the batch")
        // The courier's next tick starts the chat message (Need help took both upload slots first).
        now += 1_000L
        courier.tick(now)
        assertTrue(alone.none { it.first.id == chat.id }, "a chat message waits for the batch")
        assertTrue(batched.values.any { it.id == chat.id })
        assertTrue(plan.dueAtMs() > now, "and the batch isn't sent early for it")
        now += 29_000L
        val b = plan.take(emptyList(), now)
        assertTrue(b.puts.none { p -> p.record.contentEquals(help.sealed) }, "no batch carries it")
        assertTrue(b.puts.any { p -> p.record.contentEquals(chat.sealed) })
    }

    /**
     * Review finding F2 (docs/WAVE2C_REVIEW.md): messages already waiting in the minute's batch
     * hold the courier's upload slots until the batch answers, up to a minute. Need help posted
     * then must still start at once, on its own, not when the batch has gone.
     */
    @Test fun needHelpDoesNotWaitBehindMessagesAlreadyInTheBatch() {
        val group = GigGroup(ByteArray(32) { (it + 1).toByte() }, "Laneway", 0L)
        val crewId = "crew"
        val signer = CrewKeys.generate()
        var now = 1_800_000_000_000L
        val plan = BatchPlan()
        val alone = ArrayList<Pair<Courier.Upload, Long>>()
        val batched = HashMap<Long, Courier.Upload>()
        lateinit var courier: Courier
        // The app's uplink, as OfflineMessages does it: safety straight to the relay, the rest
        // into the batch, answered only when the batch is (not in this test: it's a minute away).
        val uplink = object : Courier.Uplink {
            override fun upload(job: Courier.Upload) {
                when (BatchPlan.route(job.use)) {
                    BatchPlan.Route.ALONE -> {
                        alone += job to now
                        courier.onUploaded(job, PutResult.SENT, now)
                    }
                    BatchPlan.Route.BATCH -> {
                        val key = batched.size + 1L
                        batched[key] = job
                        plan.add(BatchPlan.Put(id(job.box.ordinal), job.sealed, held = job.box == Courier.Box.CHAT, replaceable = false, key = key), BatchPlan.Timing.MINUTE, now)
                    }
                }
            }
        }
        val host = object : Courier.Host {
            override fun deliver(crew: Courier.Crew, message: Courier.Message, route: Courier.Route) {}
            override fun stateChanged(crewId: String, id: Long, state: Courier.State) {}
            override fun fetchWanted(crewId: String) {}
            override fun paused(crewId: String, on: Boolean) {}
            override fun trace(id: Long, kind: Int, what: String) {}
        }
        courier = Courier(host, uplink, object : Courier.Air { override fun ready() = false })
        courier.setCrews(listOf(Courier.Crew(crewId, group, signer, main = true)), now)
        // Two lines written in a basement go up when the signal comes back, with the minute's batch.
        courier.setOnline(false, now)
        val lines = listOf("on our way", "grab a spot").map { text ->
            assertNotNull(courier.post(crewId, group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", now / 1000, text = text), signer), now))
        }
        now += 120_000L
        courier.setOnline(true, now)
        courier.tick(now)
        assertEquals(lines.map { it.id }.toSet(), batched.values.map { it.id }.toSet(), "both lines wait in the batch, unanswered")
        // Need help, with the batch still most of a minute away.
        now += 5_000L
        val help = assertNotNull(courier.post(crewId, group.sealPing(GigGroup.Ping(GigGroup.Ping.NEED_HELP, "Jo", now / 1000), signer), now))
        courier.tick(now)
        val helpUploads = alone.filter { it.first.id == help.id }
        assertEquals(setOf(Courier.Box.PING, Courier.Box.CHAT), helpUploads.map { it.first.box }.toSet(), "Need help and its durable copy start at once")
        assertTrue(helpUploads.all { it.second == now && it.first.use == RelayUse.SAFETY }, "at the moment it was posted, as safety")
        assertTrue(batched.values.none { it.id == help.id }, "never handed to the batch")
        // Nothing else jumps in: the two lines still wait for their batch, and no third line starts.
        val third = assertNotNull(courier.post(crewId, group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "Jo", now / 1000, text = "where are you"), signer), now))
        courier.tick(now)
        assertTrue(batched.values.none { it.id == third.id } && alone.none { it.first.id == third.id }, "a chat line still waits for a free slot")
    }
}
