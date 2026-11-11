package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Several phones, one second at a time.
 *
 * Each phone is a real [Courier]. What's simulated is the world around it:
 *  - the air: every 6 s a phone puts one packet on air, and each phone in range hears it
 *    (or, with [World.loss], sometimes doesn't);
 *  - the relay server, with the real one's rules (see server MailboxStore: 200 records per
 *    chat mailbox, identical bytes replace, pings and pins forgotten after 15 minutes);
 *  - each phone's own clock, which can be wrong.
 */
class CourierSimTest {
    private class Relay(private val world: World) {
        private class Entry(val data: ByteArray, val atMs: Long)

        private val boxes = HashMap<String, ArrayDeque<Entry>>()
        var puts = 0
        /** Like our own server: posting the same bytes again doesn't add a record. The public relay doesn't do this. */
        var dedupes = true
        var tooMany = false
        /** What's still in yesterday's chat mailbox: a phone reads it, but uploads go to today's. */
        var yesterdayChat: List<ByteArray> = emptyList()

        fun put(job: Courier.Upload): PutResult {
            if (tooMany) return PutResult.THROTTLED
            puts++
            val q = boxes.getOrPut("${job.crewId}/${job.box}") { ArrayDeque() }
            if (dedupes) q.removeAll { it.data.contentEquals(job.sealed) }
            q.addFirst(Entry(job.sealed, world.nowMs))
            while (q.size > (if (job.box == Courier.Box.CHAT) 200 else 64)) q.removeLast()
            return PutResult.SENT
        }

        fun get(crewId: String, box: Courier.Box): List<ByteArray> {
            val keep = if (box == Courier.Box.CHAT) 72 * 3600_000L else 15 * 60_000L
            val q = boxes["$crewId/$box"] ?: return emptyList()
            q.removeAll { world.nowMs - it.atMs > keep }
            return q.map { it.data }
        }

        fun fill(crewId: String, box: Courier.Box, n: Int) {
            val q = boxes.getOrPut("$crewId/$box") { ArrayDeque() }
            repeat(n) { i -> q.addFirst(Entry(ByteArray(40) { (i + it).toByte() } + byteArrayOf((i shr 8).toByte()), world.nowMs)) }
        }
    }

    private class World(seed: Long = 7) {
        var nowMs = 1_800_000_000_000L
        val rnd = java.util.Random(seed)
        val relay = Relay(this)
        val phones = ArrayList<Phone>()
        private val links = HashSet<String>()
        /** Chance that a phone in range misses a packet. */
        var loss = 0.0

        private fun key(a: Phone, b: Phone) = if (a.name < b.name) "${a.name}|${b.name}" else "${b.name}|${a.name}"
        fun link(a: Phone, b: Phone) { links += key(a, b) }
        fun cut(a: Phone, b: Phone) { links -= key(a, b) }
        fun linkAll(vararg p: Phone) { for (a in p) for (b in p) if (a !== b) link(a, b) }

        fun broadcast(from: Phone, packet: ByteArray) {
            for (p in phones) {
                if (p === from || !p.live || key(p, from) !in links) continue
                if (rnd.nextDouble() < loss) continue
                p.courier.onPacket(packet, p.now)
            }
        }

        fun run(seconds: Int) = repeat(seconds) {
            nowMs += 1000
            phones.forEach { it.step() }
        }
    }

    private class Phone(val name: String, val world: World, group: GigGroup?, val skewMs: Long = 0L) : Courier.Host, Courier.Uplink, Courier.Air {
        val signer = CrewKeys.generate()
        var crew: Courier.Crew? = group?.let { Courier.Crew(crewIdOf(it), it, signer, main = true) }
        var online = false
        /** Bluetooth on and live. */
        var live = true
        /** What the person would see arrive, in the order it arrived. */
        val got = ArrayList<Courier.Message>()
        val routes = HashMap<Long, Courier.Route>()
        val states = HashMap<Long, MutableList<Courier.State>>()
        val trace = ArrayList<String>()
        var paused = false
        var puts = 0
        var budget: RelayBudget? = null
        private val slot = world.phones.size
        var courier = Courier(this, this, this, java.util.Random(31L * (world.phones.size + 1)))
        val now get() = world.nowMs + skewMs
        private var lastOwn = 0L

        init {
            world.phones += this
            courier.setCrews(listOfNotNull(crew), now)
            courier.setOnline(false, now)
        }

        fun seal(kind: Int, text: String = "", minutes: Int = 0): ByteArray {
            val c = crew!!
            val newest = got.maxOfOrNull { it.timeSec } ?: 0L
            val t = MessageClock.stamp(now / 1000, newest, lastOwn)
            lastOwn = t
            return c.group.sealPing(GigGroup.Ping(kind, name, t, minutes = minutes, text = text), signer)
        }

        fun post(kind: Int, text: String = "", minutes: Int = 0): Long {
            val m = assertNotNull(courier.post(crew!!.id, seal(kind, text, minutes), now), "$name couldn't post")
            courier.tick(now)
            return m.id
        }

        fun chat(text: String) = post(GigGroup.Ping.CHAT, text)

        fun state(id: Long): Courier.State? = states[id]?.lastOrNull()
        fun has(id: Long) = got.any { it.id == id }

        /** What the chat shows: by time, then id (see [MessageClock]). */
        fun shown(): List<Long> = got.sortedWith { a, b -> MessageClock.compare(a.timeSec, a.id, b.timeSec, b.id) }.map { it.id }

        fun fetch() {
            val c = crew ?: return
            for (box in Courier.Box.values()) {
                val today = world.relay.get(c.id, box)
                val all = if (box == Courier.Box.CHAT) today + world.relay.yesterdayChat else today
                courier.fetched(c.id, box, all, now, inUploadBox = today.size).forEach { a ->
                    if (a.fresh) a.message?.let {
                        got += it
                        routes[it.id] = Courier.Route.INTERNET
                    }
                }
            }
        }

        fun step() {
            courier.setOnline(online, now)
            courier.tick(now)
            val sec = world.nowMs / 1000
            if (online && (sec + slot * 3) % 20 == 0L) {
                fetch()
                courier.tick(now)
            }
            if (live && (sec + slot) % 6 == 0L) courier.nextPacket(now)?.let { world.broadcast(this, it) }
        }

        /** Kill the app and start it again from what it saved. */
        fun restart() {
            val saved = courier.save()
            courier = Courier(this, this, this, java.util.Random(99))
            courier.restore(saved, now)
            courier.setCrews(listOfNotNull(crew), now)
            courier.setOnline(online, now)
        }

        /** The crew moved to [fresh] and this phone has the new key. */
        fun moveTo(fresh: GigGroup) {
            val old = crew!!
            val next = Courier.Crew(crewIdOf(fresh), fresh, signer, main = true)
            crew = next
            courier.rekeyed(old.id, next, now)
        }

        override fun deliver(crew: Courier.Crew, message: Courier.Message, route: Courier.Route) {
            got += message
            routes[message.id] = route
        }

        override fun stateChanged(crewId: String, id: Long, state: Courier.State) {
            states.getOrPut(id) { ArrayList() }.let { if (it.lastOrNull() != state) it += state }
        }

        override fun fetchWanted(crewId: String) {
            if (!online) return
            fetch()
            // Straight on with it, as the app does once a fetch lands: look, then upload.
            courier.tick(now)
        }

        override fun paused(crewId: String, on: Boolean) {
            paused = on
        }

        override fun trace(id: Long, kind: Int, what: String) {
            trace += "${GigGroup.idText(id)} $what"
        }

        override fun upload(job: Courier.Upload) {
            if (!online) return courier.onUploaded(job, PutResult.NO_NETWORK, now)
            val b = budget
            val ticket = b?.take(job.use, true, now)
            if (b != null && ticket == null) return courier.onUploaded(job, b.refusal(job.use, true, now) ?: PutResult.THROTTLED, now)
            val result = world.relay.put(job)
            if (result == PutResult.SENT) puts++
            if (b != null && ticket != null) b.settle(ticket, if (result == PutResult.SENT) RelayBudget.Outcome.OK else RelayBudget.Outcome.THROTTLED, now)
            courier.onUploaded(job, result, now)
        }

        override fun ready() = live
    }

    private companion object {
        fun crewIdOf(g: GigGroup) = g.key.take(4).joinToString("") { "%02x".format(it) }
    }

    private val group = GigGroup(ByteArray(32) { (it + 1).toByte() }, "Laneway", 0L)
    private val crewId = crewIdOf(group)
    private val chatBox get() = Courier.Box.CHAT

    // ---- Store and forward ----

    @Test fun aMessageHopsAlongALineOfCrewPhonesAndTheFirstBackOnSignalUploadsIt() {
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        val c = Phone("C", w, group)
        w.link(a, b)
        w.link(b, c) // A can't hear C
        val id = a.chat("Gate C in five")
        assertNull(a.state(id), "nothing confirmed yet")
        w.run(90)
        assertTrue(b.has(id) && c.has(id), "B and C have it: ${b.trace} ${c.trace}")
        assertEquals(Courier.Route.BLUETOOTH, c.routes[id])
        assertEquals(Courier.State.NEARBY, a.state(id))
        assertEquals(0, w.relay.puts)

        // C walks out to the street. It uploads A's message exactly as A sealed it.
        c.online = true
        w.run(150)
        val onRelay = w.relay.get(crewId, chatBox)
        assertEquals(1, onRelay.size)
        assertEquals(id, group.openPing(onRelay.single())!!.id)
        assertEquals(a.signer.tag, group.openPing(onRelay.single())!!.sender)
        assertEquals(1, c.puts)

        // Later A gets signal: it finds its message already there, and doesn't post a second copy.
        a.online = true
        w.run(40)
        assertEquals(Courier.State.SENT, a.state(id))
        assertEquals(0, a.puts)
        b.online = true
        w.run(120)
        assertEquals(0, b.puts)
        assertEquals(1, w.relay.puts)
        // Forward only.
        assertEquals(listOf(Courier.State.NEARBY, Courier.State.SENT), a.states[id]!!.toList())
    }

    @Test fun sentNearbyNeedsAReceiptAndNeverStopsTheUpload() {
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        w.link(a, b)
        b.live = false // B's Bluetooth is off: A is talking to nobody
        val id = a.chat("anyone?")
        w.run(120)
        assertNotEquals(Courier.State.NEARBY, a.state(id))
        assertNotEquals(Courier.State.SENT, a.state(id))
        b.live = true
        w.run(120)
        assertEquals(Courier.State.NEARBY, a.state(id))
        assertTrue(b.has(id))
        // Signal comes back for A only: "Sent nearby" didn't stop it uploading.
        a.online = true
        w.run(60)
        assertEquals(Courier.State.SENT, a.state(id))
        assertEquals(1, a.puts)
        assertEquals(1, w.relay.get(crewId, chatBox).size)
    }

    // ---- Duplicates ----

    @Test fun everyRouteAtOnceStillShowsEachMessageOnce() {
        val w = World()
        w.loss = 0.35
        val phones = listOf("A", "B", "C", "D").map { Phone(it, w, group) }
        w.linkAll(*phones.toTypedArray())
        val a = phones[0]
        val ids = (1..5).map { a.chat("message $it") }
        w.run(600)
        for (p in phones.drop(1)) {
            assertEquals(ids.toSet(), p.got.map { it.id }.toSet(), "${p.name} has all five")
            assertEquals(5, p.got.size, "${p.name} was shown each once")
        }
        // Now everyone has signal too: the same messages come back from the relay.
        phones.forEach { it.online = true }
        w.run(300)
        for (p in phones.drop(1)) assertEquals(5, p.got.size, "${p.name} still shows each once")
        assertEquals(5, w.relay.get(crewId, chatBox).size)
        ids.forEach { assertEquals(Courier.State.SENT, a.state(it)) }
    }

    @Test fun aReSealedCopyIsTheSameMessage() {
        // An older build's retry seals again: different bytes on the relay, one message.
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        a.online = true
        b.online = true
        val p = GigGroup.Ping(GigGroup.Ping.CHAT, "A", w.nowMs / 1000, text = "hello")
        val first = group.sealPing(p, a.signer)
        val again = group.sealPing(p, a.signer)
        assertFalse(first.contentEquals(again))
        w.relay.put(Courier.Upload(crewId, 0, chatBox, first, RelayUse.MESSAGE, false))
        w.relay.put(Courier.Upload(crewId, 0, chatBox, again, RelayUse.MESSAGE, false))
        w.run(60)
        assertEquals(1, b.got.size)
    }

    // ---- Out of order, and clocks ----

    @Test fun messagesThatArriveOutOfOrderShowInTheOrderTheyWereSent() {
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        val c = Phone("C", w, group)
        w.link(a, c)
        val ids = ArrayList<Long>()
        repeat(4) {
            ids += a.chat("line ${it + 1}")
            w.run(2)
        }
        w.run(120)
        assertEquals(4, c.got.size)
        // C walks over to B, who's been out of range. B asks what it's missing and is sent the newest first.
        w.cut(a, c)
        w.link(c, b)
        w.run(240)
        assertEquals(4, b.got.size, b.trace.toString())
        assertNotEquals(ids, b.got.map { it.id }, "they did arrive out of order")
        assertEquals(ids, b.shown())
        assertEquals(ids, c.shown())
    }

    @Test fun aReplyStaysBelowTheQuestionWhenClocksDisagree() {
        val w = World()
        val a = Phone("A", w, group, skewMs = 150_000L)
        val b = Phone("B", w, group, skewMs = -170_000L)
        val c = Phone("C", w, group)
        w.linkAll(a, b, c)
        val q = a.chat("where is everyone?")
        w.run(60)
        val r1 = b.chat("by the sound desk") // B's clock says this is five minutes before A asked
        w.run(60)
        val r2 = c.chat("coming")
        w.run(90)
        for (p in listOf(a, b, c)) {
            val mine = if (p === a) q else if (p === b) r1 else r2
            val order = (p.got.map { it.id to it.timeSec } + (mine to 0L)).map { it.first }.toSet()
            assertEquals(setOf(q, r1, r2), order)
        }
        // Every phone sorts the three the same way: question, then the answers in the order they were written.
        val times = HashMap<Long, Long>()
        (a.got + b.got + c.got).forEach { times[it.id] = it.timeSec }
        assertTrue(times.getValue(r1) > times.getValue(q), "the reply is stamped after the question")
        assertTrue(times.getValue(r2) > times.getValue(r1))
    }

    // ---- In and out of range ----

    @Test fun aMessageWaitsForSomeoneToWalkIntoRangeThenTravelsWithThem() {
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        val c = Phone("C", w, group)
        val id = a.chat("I'm at the merch stand")
        w.run(180)
        assertNotEquals(Courier.State.NEARBY, a.state(id))
        assertFalse(b.has(id))
        // B wanders past A...
        w.link(a, b)
        w.run(150)
        assertTrue(b.has(id), b.trace.toString())
        assertEquals(Courier.State.NEARBY, a.state(id))
        // ...then off to find C, well out of A's range.
        w.cut(a, b)
        w.link(b, c)
        w.run(180)
        assertTrue(c.has(id), c.trace.toString())
    }

    @Test fun aPhoneWithSignalPassesRelayMessagesToAMateWithout() {
        // The other direction: B is in the basement, A is by the door with signal.
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        val far = Phone("Far", w, group) // at home, internet only
        a.online = true
        far.online = true
        w.link(a, b)
        val id = far.chat("save me a spot!")
        w.run(240)
        assertTrue(a.has(id))
        assertTrue(b.has(id), "B got it over Bluetooth from A: ${b.trace}")
        assertEquals(Courier.Route.BLUETOOTH, b.routes[id])
        // And B's answer goes out through A.
        val reply = b.chat("will do")
        w.run(240)
        assertTrue(far.has(reply), "it reached the relay through A")
        assertEquals(1, a.puts)
    }

    // ---- Need help, and the crowd ----

    @Test fun needHelpCrossesAStrangersPhoneButChatDoesNot() {
        val w = World()
        val a = Phone("A", w, group)
        // Any two Moshpoint phones, not in this crew (two, so the hop count shows it was passed on).
        val s1 = Phone("S1", w, null)
        val s2 = Phone("S2", w, null)
        val b = Phone("B", w, group)
        w.link(a, s1)
        w.link(s1, s2)
        w.link(s2, b)
        val help = a.post(GigGroup.Ping.NEED_HELP)
        val chat = a.chat("not through strangers")
        w.run(240)
        assertTrue(b.has(help), "B heard it through the strangers")
        assertEquals(Courier.Route.CROWD, b.routes[help])
        assertFalse(b.has(chat), "chat is only carried by crew phones")
        // B's receipt comes back the same way, so A knows.
        assertEquals(Courier.State.NEARBY, a.state(help))
        assertTrue(s1.got.isEmpty() && s2.got.isEmpty(), "the strangers' phones could read none of it")
    }

    @Test fun needHelpIsCarriedForHoursAndUploadedWhereItLasts() {
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        val c = Phone("C", w, group)
        w.link(a, b)
        val help = a.post(GigGroup.Ping.NEED_HELP)
        w.run(60)
        assertTrue(b.has(help))
        // Three hours pass before B gets anywhere near C. Before: dropped after 20 minutes.
        w.cut(a, b)
        w.run(3 * 3600)
        w.link(b, c)
        w.run(240)
        assertTrue(c.has(help), c.trace.toString())
        val verdict = PingPolicy.onArrival(GigGroup.Ping.NEED_HELP, c.got.single().timeSec, 0, c.now / 1000)
        assertTrue(verdict.alert && verdict.late)
        // C reaches signal: it goes to the ping mailbox, and to the chat mailbox that keeps it for days.
        c.online = true
        w.run(200)
        assertEquals(1, w.relay.get(crewId, Courier.Box.PING).size)
        assertEquals(1, w.relay.get(crewId, chatBox).size)
    }

    // ---- Uploading for others ----

    @Test fun helpersRegainingSignalTogetherUploadEachMessageOnce() {
        for (dedupes in listOf(true, false)) {
            val w = World(seed = if (dedupes) 3 else 11)
            w.relay.dedupes = dedupes
            val author = Phone("X", w, group)
            val helpers = (1..5).map { Phone("H$it", w, group) }
            w.linkAll(author, *helpers.toTypedArray())
            val ids = (1..10).map { author.chat("from the pit $it") }
            w.run(600)
            helpers.forEach { h -> assertEquals(10, h.got.size, "${h.name} carries all ten") }
            // The gig ends and all five walk out into signal at the same moment. The author's phone is dead.
            author.live = false
            helpers.forEach { it.online = true }
            w.run(900)
            val records = w.relay.get(crewId, chatBox)
            assertEquals(10, records.size, "one record each (relay ${if (dedupes) "drops repeats" else "keeps everything it's sent"})")
            assertEquals(ids.toSet(), records.map { group.openPing(it)!!.id }.toSet())
            assertEquals(10, w.relay.puts, "ten uploads between five helpers")
        }
    }

    @Test fun aHelperNeverPushesAMailboxPastItsLimit() {
        val w = World()
        val author = Phone("X", w, group)
        val helper = Phone("H", w, group)
        w.link(author, helper)
        val ids = (1..12).map {
            w.run(1)
            author.chat("backlog $it")
        }
        w.run(600)
        assertEquals(12, helper.got.size)
        author.live = false
        // The crew's mailbox is nearly full already (the relay keeps 200 and drops the oldest).
        w.relay.fill(crewId, chatBox, 178)
        helper.online = true
        w.run(900)
        val records = w.relay.get(crewId, chatBox)
        assertEquals(Courier.HELD_LIMIT, records.size)
        // The two it did send are the newest.
        assertEquals(ids.takeLast(2).toSet(), records.mapNotNull { group.openPing(it)?.id }.toSet())
    }

    @Test fun yesterdaysFullMailboxDoesNotStopTodaysUploads() {
        val w = World()
        val author = Phone("X", w, group)
        val helper = Phone("H", w, group)
        w.link(author, helper)
        val id = author.chat("day two of the festival")
        w.run(120)
        assertTrue(helper.has(id))
        author.live = false
        // Yesterday's chat mailbox is as good as full. Uploads go to today's, which is empty.
        w.relay.yesterdayChat = List(190) { i -> ByteArray(40) { (i + it).toByte() } + byteArrayOf((i shr 8).toByte()) }
        helper.online = true
        w.run(300)
        assertTrue(w.relay.get(crewId, chatBox).any { group.openPing(it)?.id == id }, "uploaded into today's mailbox")
    }

    // ---- Retrying, and the pin ----

    @Test fun anOldLineTheUserRetriesIsUploadedNotDroppedAsTooOld() {
        val w = World()
        val a = Phone("A", w, group)
        a.online = true
        // Written four days ago, never sent (the queue was lost); the person taps "Not sent".
        val old = group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "A", a.now / 1000 - 4 * 86_400L, text = "from Thursday"), a.signer)
        val id = assertNotNull(a.courier.post(crewId, old, a.now)).id
        w.run(30)
        assertEquals(Courier.State.SENT, a.state(id))
        assertTrue(w.relay.get(crewId, chatBox).any { it.contentEquals(old) })
    }

    @Test fun ourPinIsOnlyKeptFreshWhileTheAppIsInUse() {
        val w = World()
        val a = Phone("A", w, group)
        a.online = true
        a.courier.post(crewId, group.sealRally(GigGroup.Rally(-36.85, 174.76, "Sound desk", a.now / 1000), a.signer), a.now)
        w.run(35 * 60)
        val whileOpen = w.relay.puts
        assertTrue(whileOpen >= 3, "re-posted about every ten minutes: $whileOpen")
        // App closed and not live: nobody is looking at the map, so no more requests for the pin.
        a.courier.active = false
        w.run(60 * 60)
        assertEquals(whileOpen, w.relay.puts)
        a.courier.active = true
        w.run(60)
        assertEquals(whileOpen + 1, w.relay.puts)
    }

    // ---- The relay's budget ----

    @Test fun whenTheRelaySaysTooManyMessagesWaitThenFlush() {
        val w = World()
        val a = Phone("A", w, group)
        a.online = true
        w.relay.tooMany = true
        val ids = (1..3).map { a.chat("queued $it") }
        w.run(20 * 60)
        ids.forEach { assertNotEquals(Courier.State.SENT, a.state(it)) }
        assertEquals(0, w.relay.puts)
        // The app shows a new message as "Waiting for signal" while this lasts, not "Sending…".
        assertTrue(a.courier.onHold(a.now))
        w.relay.tooMany = false
        w.run(16 * 60)
        ids.forEach { assertEquals(Courier.State.SENT, a.state(it)) }
        assertEquals(3, w.relay.puts)
        assertFalse(a.courier.onHold(a.now))
    }

    @Test fun aSpentBudgetHoldsChatBackButNotNeedHelpAndFlushesNextDay() {
        val w = World()
        val a = Phone("A", w, group)
        val budget = RelayBudget(random = { 0.0 })
        a.budget = budget
        a.online = true
        // A long day: location shares used their 150, messages most of the rest.
        var t = a.now - 3600_000L
        repeat(150) { budget.settle(budget.take(RelayUse.BACKGROUND, true, t)!!, RelayBudget.Outcome.OK, t); t += 10_000 }
        repeat(38) { budget.settle(budget.take(RelayUse.MESSAGE, true, t)!!, RelayBudget.Outcome.OK, t); t += 10_000 }
        // 188 of the day's 200 are gone. Ordinary messages may use two more; safety pings the lot.
        val chats = (1..4).map { a.chat("late one $it") }
        w.run(60)
        assertEquals(2, chats.count { a.state(it) == Courier.State.SENT }, "two messages fitted, two wait")
        val help = a.post(GigGroup.Ping.NEED_HELP)
        w.run(120)
        assertEquals(Courier.State.SENT, a.state(help), "Need help has its own share of the budget")
        assertEquals(1, w.relay.get(crewId, Courier.Box.PING).size)
        w.run(40 * 60)
        assertEquals(2, chats.count { a.state(it) == Courier.State.SENT }, "the other two are still waiting")
        // The budget's day rolls over: the rest go out by themselves.
        w.run(24 * 3600)
        chats.forEach { assertEquals(Courier.State.SENT, a.state(it)) }
    }

    // ---- A rekey part-way through ----

    @Test fun aRemovedMemberCanNeitherSendNorReadOverBluetoothAfterARekey() {
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        val c = Phone("C", w, group)
        val r = Phone("R", w, group) // about to be removed
        w.linkAll(a, b, c, r)
        val before = b.chat("everyone here?")
        w.run(120)
        assertTrue(a.has(before) && c.has(before) && r.has(before))

        // A removes R. Nobody has signal, so only A has the new key.
        val fresh = GigGroup(ByteArray(32) { (it + 90).toByte() }, group.name, 0L)
        a.moveTo(fresh)
        w.run(90)
        assertTrue(b.paused && c.paused && r.paused, "the old key is on hold everywhere within earshot")

        // B writes without knowing. Nothing sealed with the old key goes on air any more.
        val after = b.chat("meet at the car")
        // R's own app would be on hold too, so model a tampered one: it broadcasts regardless.
        val sneaky = group.sealPing(GigGroup.Ping(GigGroup.Ping.CHAT, "R", r.now / 1000, text = "still here"), r.signer)
        val rGot = r.got.size
        repeat(5) {
            MessagePacket.split(sneaky, 0).forEach { w.broadcast(r, it.encode()) }
            w.run(30)
        }
        val sneakyId = group.openPing(sneaky)!!.id
        for (p in listOf(a, b, c)) assertFalse(p.has(sneakyId), "${p.name} took a message from the removed member")
        assertFalse(a.has(after) || c.has(after) || r.has(after), "B's message isn't out under the old key")
        assertEquals(rGot, r.got.size)

        // A rekey pushed over Bluetooth goes nowhere: a new key only ever comes from the relay.
        val forged = group.sealDirect(r.signer, b.signer.pub, GigGroup.DIRECT_REKEY, RekeyPolicy.payloadOld(ByteArray(32) { 5 }, null, false), r.now / 1000)!!
        val bGot = b.got.size
        MessagePacket.split(forged, 5).forEach { w.broadcast(r, it.encode()) }
        w.run(30)
        assertEquals(bGot, b.got.size)
        assertEquals(group.key.toList(), b.crew!!.group.key.toList())

        // B and C get the new key from the relay. B's waiting message is signed again and arrives, once, same id.
        b.moveTo(fresh)
        c.moveTo(fresh)
        w.run(240)
        assertFalse(b.paused || c.paused)
        assertTrue(a.has(after) && c.has(after), "${a.trace}")
        assertEquals(1, a.got.count { it.id == after })
        // R holds only the old key: it hears packets and can open none.
        assertFalse(r.has(after))
        assertEquals(rGot, r.got.size)
        val reply = a.chat("on my way")
        w.run(120)
        assertTrue(b.has(reply) && c.has(reply))
        assertFalse(r.has(reply))
    }

    // ---- Whatever the night does ----

    /**
     * Six phones wander in and out of each other's range for twenty minutes, with a third of
     * packets lost, chatting and pinging as they go. Then everyone gets signal. Whatever the
     * order of events: every phone ends up with every message, shown once, and the relay
     * holds one copy of each.
     */
    @Test fun phonesOnHoldTogetherStayOnHoldAndOneOnItsOwnLetsGo() {
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        val c = Phone("C", w, group)
        val d = Phone("D", w, group)
        w.linkAll(a, b, c, d)
        // A removes someone with no signal anywhere: only A has the new key.
        a.moveTo(GigGroup(ByteArray(32) { (it + 90).toByte() }, group.name, 0L))
        w.run(120)
        assertTrue(b.paused && c.paused && d.paused)
        // A walks off. B and C stay together; D wanders off alone.
        for (p in listOf(b, c, d)) w.cut(a, p)
        w.cut(d, b)
        w.cut(d, c)
        w.run(45 * 60)
        assertTrue(b.paused && c.paused, "in range of each other, they pass the notice back and forth")
        assertFalse(d.paused, "half an hour without hearing it, D stops waiting")
    }

    @Test fun aRandomNightEndsWithEveryMessageEverywhereOnce() {
        for (seed in 1L..6L) {
            val w = World(seed)
            w.loss = 0.3
            val phones = (0 until 6).map { Phone("P$it", w, group, skewMs = (it - 3) * 20_000L) }
            val rnd = java.util.Random(seed * 17)
            val sent = HashMap<Long, Phone>()
            repeat(40) { round ->
                // Shuffle who's near whom.
                for (a in phones) for (b in phones) if (a.name < b.name) { if (rnd.nextInt(3) == 0) w.link(a, b) else w.cut(a, b) }
                if (round < 30 && rnd.nextInt(2) == 0) {
                    val p = phones[rnd.nextInt(phones.size)]
                    val id = if (rnd.nextInt(4) == 0) p.post(GigGroup.Ping.ALL_GOOD) else p.chat("round $round")
                    sent[id] = p
                }
                w.run(30)
            }
            phones.forEach { it.online = true }
            w.run(30 * 60)
            for (p in phones) {
                val expected = sent.filterValues { it !== p }.keys
                assertEquals(expected, p.got.map { it.id }.toSet(), "seed $seed: ${p.name} has every message from the others")
                assertEquals(expected.size, p.got.size, "seed $seed: ${p.name} was shown each once")
            }
            val chats = w.relay.get(crewId, chatBox).mapNotNull { group.openPing(it)?.id }
            val sentChats = sent.keys.filter { id -> phones.any { ph -> ph.got.any { it.id == id && it.kind == GigGroup.Ping.CHAT } } }
            assertEquals(sentChats.toSet(), chats.toSet(), "seed $seed: every chat line is on the relay")
            assertEquals(chats.size, chats.toSet().size, "seed $seed: once each")
            sent.forEach { (id, p) -> if (id in sentChats) assertEquals(Courier.State.SENT, p.state(id), "seed $seed") }
            // Everyone agrees on the order.
            val order = phones[0].shown().filter { id -> sent[id] !== phones[0] && sent[id] !== phones[1] }
            assertEquals(order, phones[1].shown().filter { id -> sent[id] !== phones[0] && sent[id] !== phones[1] }, "seed $seed")
        }
    }

    // ---- Surviving a restart ----

    @Test fun theQueueAndWhatWasSeenSurviveARestart() {
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        w.link(a, b)
        val id = a.chat("before the phone restarts")
        w.run(90)
        assertTrue(b.has(id))
        a.restart()
        b.restart()
        w.run(120)
        assertEquals(1, b.got.count { it.id == id }, "not shown again after a restart")
        // A's unsent message is still queued, and goes out when there's signal.
        a.online = true
        w.run(90)
        assertEquals(1, w.relay.get(crewId, chatBox).size)
        assertEquals(Courier.State.SENT, a.state(id))
        b.online = true
        w.run(60)
        assertEquals(1, b.got.count { it.id == id })
    }

    // ---- The meet-up pin ----

    @Test fun theNewestPinWinsAndAFarFuturePinIsRefused() {
        val w = World()
        val a = Phone("A", w, group)
        val b = Phone("B", w, group)
        w.link(a, b)
        fun pin(p: Phone, name: String, t: Long) = p.courier.post(crewId, group.sealRally(GigGroup.Rally(-36.85, 174.76, name, t), p.signer), p.now)!!.id
        val first = pin(a, "Sound desk", a.now / 1000)
        w.run(90)
        assertTrue(b.has(first))
        assertEquals(Courier.Route.BLUETOOTH, b.routes[first])
        val second = pin(b, "Car park", b.now / 1000)
        w.run(90)
        assertTrue(a.has(second))
        // Someone tries to lock the pin with a date ten years out.
        val locked = group.sealRally(GigGroup.Rally(0.1, 0.1, "Mine forever", b.now / 1000 + 10 * 365 * 86_400L), b.signer)
        MessagePacket.split(locked, 5).forEach { w.broadcast(b, it.encode()) }
        w.run(30)
        assertFalse(a.has(group.openRally(locked)!!.id))
        // An unsigned pin (older build, or anyone with the key) isn't taken over Bluetooth.
        val unsigned = group.sealRally(GigGroup.Rally(0.2, 0.2, "Who?", a.now / 1000))
        MessagePacket.split(unsigned, 5).forEach { w.broadcast(b, it.encode()) }
        w.run(30)
        // A was shown B's pin and nothing since (its own isn't "received").
        assertEquals(listOf(second), a.got.map { it.id })
    }
}
