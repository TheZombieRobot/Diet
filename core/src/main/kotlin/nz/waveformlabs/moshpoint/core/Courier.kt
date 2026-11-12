package nz.waveformlabs.moshpoint.core

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.nio.ByteBuffer
import java.security.MessageDigest

/**
 * Gets crew messages to the crew by whichever route works, and knows how each one went.
 *
 * A message is sealed and signed once by its author. From then on the same bytes travel:
 *  - to the relay server, when there's signal ([Uplink]);
 *  - over Bluetooth adverts to crew phones in range, which carry it on ([Air]);
 *  - for pings and pins, through any Moshpoint phone, a few hops (the crowd relay).
 * The first crew phone back on signal uploads what it's carrying for the others.
 *
 * This class is the whole of that logic: outbox, carried messages, duplicates, states, what to
 * upload and what to put on air. It's plain synchronous code with the clock passed in, so
 * several phones can be simulated in a test (and those tests can fail a build). The app only
 * adapts it to the radio and the relay; see the app's OfflineMessages.
 *
 * Not thread-safe: call it from one thread (the app uses Main).
 */
class Courier(
    private val host: Host,
    private val uplink: Uplink,
    private val air: Air,
    private val random: java.util.Random = java.util.Random(),
    private val secure: java.security.SecureRandom = java.security.SecureRandom(),
) {
    /** How a message got here. */
    enum class Route { OWN, INTERNET, BLUETOOTH, CROWD }

    /** How one of our own messages is doing. It only ever moves forward. */
    enum class State {
        /** Not on the relay, and no crew phone has it yet. */
        WAITING,
        /** A crew phone nearby has confirmed it holds it. Still to be uploaded. */
        NEARBY,
        /** The relay has it. */
        SENT,
        /** It got too old to be worth sending and never reached anyone. */
        GAVE_UP,
    }

    /** Which of a crew's mailboxes. The app turns it into the id that is valid right now. */
    enum class Box { CHAT, PING, PIN }

    /** A crew this phone is in. Only the [main] one uses Bluetooth; the rest are asleep. */
    class Crew(val id: String, val group: GigGroup, val signer: CrewKeys.Signer, val main: Boolean)

    /** A signed crew message, opened: exactly one of [ping] and [pin] is set. */
    class Message(val id: Long, val sealed: ByteArray, val ping: GigGroup.Ping?, val pin: GigGroup.Rally?) {
        val kind: Int get() = ping?.kind ?: KIND_PIN
        val timeSec: Long get() = ping?.timeSec ?: pin!!.timeSec
        val sender: Long get() = ping?.sender ?: pin!!.sender
    }

    /**
     * What came of looking at a sealed blob. [message] is null when these exact bytes were
     * looked at before. [fresh] is true the first time this phone meets the message, by any
     * route and in any wrapping: that is when to notify.
     */
    class Accepted(val id: Long, val message: Message?, val fresh: Boolean)

    /** One upload for the app to make. Report back with [onUploaded]. */
    class Upload(val crewId: String, val id: Long, val box: Box, val sealed: ByteArray, val use: RelayUse, val helper: Boolean)

    /** The app (or a test's simulated phone). */
    interface Host {
        /** A message new to this phone arrived over Bluetooth. Show it. */
        fun deliver(crew: Crew, message: Message, route: Route)

        /** One of our own messages moved on. */
        fun stateChanged(crewId: String, id: Long, state: State)

        /** Before uploading for crew mates we need a fresh look at [crewId]'s mailboxes: fetch them and call [fetched]. */
        fun fetchWanted(crewId: String)

        /** Bluetooth messages for [crewId] are on hold until the relay gives us its new key ([on]), or back ([on] false). */
        fun paused(crewId: String, on: Boolean)

        /** For the test builds' route log. */
        fun trace(id: Long, kind: Int, what: String)
    }

    /** The relay server. */
    interface Uplink {
        /** Start [job]. The result comes back through [onUploaded], straight away or later. */
        fun upload(job: Upload)
    }

    /** Bluetooth adverts. */
    interface Air {
        /** Can this phone put message packets on air and hear them right now (live, Bluetooth on, big enough adverts)? */
        fun ready(): Boolean
    }

    private class Parcel(
        val crewId: String,
        val id: Long,
        val sealed: ByteArray,
        val kind: Int,
        val timeSec: Long,
        val sender: Long,
        val mine: Boolean,
        val heldAtMs: Long,
        val route: Route,
    ) {
        var onServer = false
        var durable = false
        var nearby = false
        var gaveUp = false
        var confirmedAtMs = 0L
        var putAtMs = 0L
        var notified: State? = null
        /** When a crew phone told us it had uploaded this (0 = it didn't, or the relay has since confirmed it). */
        var toldAtMs = 0L

        // Uploading
        var primaryFlying = false
        var durableFlying = false
        var retryAtMs = 0L
        var tries = 0
        var refusals = 0
        var helperAfterMs = 0L
        var helperStopped = false

        // On air
        var aired = 0
        var heardOnAirMs = 0L
        var boosted = false
    }

    private class Retired(val group: GigGroup, val untilMs: Long, var nextMs: Long)

    private val crews = LinkedHashMap<String, Crew>()
    private val parcels = LinkedHashMap<Long, Parcel>()
    private val seen = LinkedHashSet<Long>()
    /** Hash of sealed bytes -> message id (0 = not a message). Only to avoid opening the same bytes twice. */
    private val blobIds = LinkedHashMap<Long, Long>()

    private var online = true
    private var onlineSinceMs = 0L
    private var helperReadyAtMs = 0L
    private var uploadHoldUntilMs = 0L
    private var throttleStep = 0
    private var inFlight = 0
    private var helping = 0
    /** Each phone works through a backlog in its own order, so two helpers that overlap mostly send different messages. */
    private val helperSalt = random.nextLong()
    private var lastRelayOkMs = 0L
    private var lastRelayFailMs = 0L
    private val lastFetchMs = HashMap<String, Long>()
    private val helperBatch = HashMap<String, Int>()
    private val chatCount = HashMap<String, Int>()
    private val fetchAskedMs = HashMap<String, Long>()
    private var lastExpireMs = 0L

    // Bluetooth
    private val reassembly = Reassembly()
    private val relay = MessageRelay()
    private val heard = LinkedHashMap<Long, Long>()
    private val pushes = LinkedHashMap<Long, Long>()
    private val fragments = ArrayDeque<MessagePacket>()
    private val receipts = LinkedHashMap<Long, Boolean>()
    private var receiptDueMs = Long.MAX_VALUE
    private var receiptCrowd = false
    private val acked = LinkedHashSet<Long>()
    private var haveDueMs = Long.MAX_VALUE
    private var nextHaveMs = 0L
    private var lastHaveSentMs = 0L
    private var offlinePeerAtMs = Long.MIN_VALUE / 2
    private val retired = ArrayList<Retired>()
    private var pausedCrewId: String? = null
    private var pausedUntilMs = 0L
    private var pauseBeaconMs = 0L

    /** True once something changed that [save] would write differently. The app saves and clears it. */
    var dirty = false

    /**
     * Is the app open or live? While it isn't, nobody is looking at the map, so our meet-up pin
     * isn't kept fresh on the relay every ten minutes (messages waiting to go still go).
     */
    var active = true

    // ---- Crews and connection ----

    /** The crews this phone is in now. Messages for crews it has left are dropped. */
    fun setCrews(list: List<Crew>, nowMs: Long) {
        val oldMain = main()?.id
        crews.clear()
        list.forEach { crews[it.id] = it }
        if (parcels.values.removeAll { it.crewId !in crews }) dirty = true
        if (main()?.id != oldMain) {
            pushes.clear()
            fragments.clear()
            receipts.clear()
            haveDueMs = Long.MAX_VALUE
        }
        pausedCrewId?.let { if (it != main()?.id) unpause(nowMs) }
    }

    private fun main(): Crew? = crews.values.firstOrNull { it.main }

    /** Does the phone have a network at all? (Whether the relay answers is learnt from uploads and fetches.) */
    fun setOnline(up: Boolean, nowMs: Long) {
        if (up && !online) {
            // Back on signal with other people's messages: don't all rush the relay at once.
            helperReadyAtMs = nowMs + HELPER_WAIT_MS + random.nextInt(HELPER_SPREAD_MS)
            onlineSinceMs = nowMs
            uploadHoldUntilMs = 0L
            parcels.values.forEach { if (it.mine) it.retryAtMs = 0L }
        }
        online = up
    }

    /** No network, or the relay hasn't answered for a while: time to lean on Bluetooth. */
    private fun cutOff(nowMs: Long): Boolean = !online || (lastRelayFailMs > lastRelayOkMs && nowMs - lastRelayOkMs > 45_000L)

    // ---- Our own messages ----

    /**
     * A message of ours, already sealed and signed for [crewId]. From here the courier owns
     * getting it out. Returns it opened (for its id), or null if these bytes aren't a signed
     * message of ours for that crew.
     */
    fun post(crewId: String, sealed: ByteArray, nowMs: Long): Message? {
        val crew = crews[crewId] ?: return null
        val m = open(crew, sealed) ?: return null
        if (m.sender != crew.signer.tag) return null
        seen += m.id
        trimSeen()
        blobIds[blobHash(sealed)] = m.id
        if (m.pin != null) parcels.values.removeAll { it.crewId == crewId && it.kind == KIND_PIN }
        parcels[m.id] = Parcel(crewId, m.id, sealed, m.kind, m.timeSec, m.sender, mine = true, heldAtMs = nowMs, route = Route.OWN)
        capCrew(crewId)
        dirty = true
        host.trace(m.id, m.kind, "queued")
        return m
    }

    /** Where one of our messages has got to, or null if the courier no longer holds it. */
    fun stateOf(id: Long): State? = parcels[id]?.takeIf { it.mine }?.let { stateOf(it) }

    /** Nothing can be uploaded right now: no network, or the relay asked us to slow down. */
    fun onHold(nowMs: Long): Boolean = !online || nowMs < uploadHoldUntilMs

    /**
     * Ask again now for anything of ours still waiting (the user tapped retry). A message the
     * relay refused gets another go. If the relay asked us to slow down, that pause stands:
     * tapping through it would only make the relay ask for a longer one.
     */
    fun retryNow(nowMs: Long) {
        parcels.values.forEach {
            if (it.mine) {
                it.retryAtMs = 0L
                it.tries = 0
                it.refusals = 0
                if (it.gaveUp) {
                    it.gaveUp = false
                    tell(it)
                }
            }
        }
        tick(nowMs)
    }

    /** Does the courier hold a meet-up pin of ours for [crewId] (and so keeps it on the relay)? */
    fun holdsOwnPin(crewId: String): Boolean = parcels.values.any { it.crewId == crewId && it.kind == KIND_PIN && it.mine }

    /**
     * A newer pin (or a removal) for [crewId] arrived in a form the courier doesn't carry: an
     * unsigned one from an older build. Whatever pin it holds from before [timeSec] is out of
     * date, and must stop being re-posted.
     */
    fun pinSuperseded(crewId: String, timeSec: Long) {
        if (parcels.values.removeAll { it.crewId == crewId && it.kind == KIND_PIN && it.timeSec < timeSec }) dirty = true
    }

    private fun stateOf(p: Parcel): State = when {
        p.onServer || p.durable -> State.SENT
        p.nearby -> State.NEARBY
        p.gaveUp -> State.GAVE_UP
        else -> State.WAITING
    }

    private fun tell(p: Parcel) {
        if (!p.mine) return
        val s = stateOf(p)
        val before = p.notified
        // Forward only: a pin that lapsed on the relay doesn't go back to "waiting".
        if (before != null && before.ordinal >= s.ordinal && !(before == State.GAVE_UP && s != State.GAVE_UP)) return
        p.notified = s
        if (before == null && s == State.WAITING) return
        host.stateChanged(p.crewId, p.id, s)
    }

    /**
     * After an upload that didn't go: say where the message stands, even if that is only
     * "still waiting" (which [tell] keeps quiet about for a brand-new message). What was last
     * said is kept in step, so a later "gave up" is never mistaken for old news.
     */
    private fun tellStanding(p: Parcel) {
        val s = stateOf(p)
        val before = p.notified
        // Never back from "sent" or "sent nearby".
        if (before != null && before != State.GAVE_UP && before.ordinal > s.ordinal) return
        p.notified = s
        host.stateChanged(p.crewId, p.id, s)
    }

    // ---- The relay: what's there, and what to send ----

    /**
     * The app fetched [box] of [crewId]: [blobs] is everything in it. Marks what's on the relay
     * (so nothing is uploaded twice), keeps the main crew's messages to pass on by Bluetooth,
     * and says which are new to this phone.
     *
     * [inUploadBox]: how many of [blobs] sit in the mailbox an upload would go to now. The chat
     * mailbox changes every day and each day's holds 200, so yesterday's mustn't count against
     * today's room.
     */
    fun fetched(crewId: String, box: Box, blobs: List<ByteArray>, nowMs: Long, inUploadBox: Int = blobs.size): List<Accepted> {
        val crew = crews[crewId] ?: return emptyList()
        val key = "$crewId/${box.ordinal}"
        lastFetchMs[key] = nowMs
        helperBatch[key] = HELPER_BATCH
        if (box == Box.CHAT) chatCount[crewId] = inUploadBox.coerceIn(0, blobs.size)
        relayAnswered(nowMs)
        val out = ArrayList<Accepted>()
        val here = HashSet<Long>()
        for (blob in blobs) {
            val a = accept(crew, blob, Route.INTERNET, box, nowMs)
            if (a != null) {
                out += a
                here += a.id
            }
        }
        if (box == Box.CHAT) checkWhatWeWereTold(crewId, here, nowMs)
        if (box == Box.PIN && active) {
            // The pin box forgets after 15 minutes. If the crew's pin has dropped out, someone re-posts it.
            parcels.values.firstOrNull { it.crewId == crewId && it.kind == KIND_PIN }?.let { p ->
                if (p.id !in here && p.onServer && nowMs - p.confirmedAtMs > PIN_LAPSE_MS) p.onServer = false
            }
        }
        return out
    }

    /**
     * A crew phone's word that it uploaded one of our messages shows "Sent" at once, but the
     * relay's own word beats it. At the first look at the chat mailbox after that (with room
     * to spare, so nothing has been pushed out), a message that isn't there is uploaded by us
     * after all. A mistaken or tampered phone can't make a message vanish by claiming it went.
     */
    private fun checkWhatWeWereTold(crewId: String, here: Set<Long>, nowMs: Long) {
        val roomy = (chatCount[crewId] ?: 0) < HELD_LIMIT
        for (p in parcels.values) {
            if (p.crewId != crewId || !p.mine || p.toldAtMs == 0L || primaryBox(p.kind) != Box.CHAT) continue
            // Give the upload we were told about a moment to show up.
            if (nowMs - p.toldAtMs < TOLD_CHECK_AFTER_MS) continue
            p.toldAtMs = 0L
            if (p.id !in here && roomy && p.onServer) {
                p.onServer = false
                dirty = true
                host.trace(p.id, p.kind, "a crew phone said it uploaded this, but it isn't on the relay: uploading it ourselves")
            }
        }
    }

    /** One sealed blob the app got from the relay outside a full fetch (see [fetched] for the result). */
    fun fromRelay(crewId: String, box: Box, sealed: ByteArray, nowMs: Long): Accepted? =
        crews[crewId]?.let { accept(it, sealed, Route.INTERNET, box, nowMs) }

    private fun accept(crew: Crew, sealed: ByteArray, route: Route, box: Box?, nowMs: Long): Accepted? {
        val hash = blobHash(sealed)
        val known = blobIds[hash]
        if (known != null) {
            if (known == 0L) return null
            if (route == Route.INTERNET) onRelay(known, box, nowMs)
            return Accepted(known, null, false)
        }
        val m = open(crew, sealed)
        if (m == null) {
            // A History bundle on the relay carries whole messages: no need to upload those again.
            if (route == Route.INTERNET && box == Box.CHAT) {
                crew.group.openHistory(sealed)?.lines?.forEach { if (it.id != 0L) onRelay(it.id, Box.CHAT, nowMs) }
            }
            remember(hash, 0L)
            return null
        }
        remember(hash, m.id)
        val nowSec = nowMs / 1000
        if (m.pin != null) {
            val current = parcels.values.firstOrNull { it.crewId == crew.id && it.kind == KIND_PIN }
            if (current?.id == m.id) {
                if (route == Route.INTERNET) onRelay(m.id, box, nowMs)
                return Accepted(m.id, m, false)
            }
            // The newest pin wins; one dated well ahead is refused, or it would win forever.
            if (!PinRule.accepts(m.timeSec, current?.timeSec ?: 0L, nowSec)) return Accepted(m.id, m, false)
        }
        val fresh = seen.add(m.id)
        trimSeen()
        val had = parcels[m.id]
        if (had == null && crew.main && worthCarrying(m.kind, m.timeSec, nowMs)) {
            if (m.pin != null) parcels.values.removeAll { it.crewId == crew.id && it.kind == KIND_PIN }
            val p = Parcel(crew.id, m.id, sealed, m.kind, m.timeSec, m.sender, mine = m.sender == crew.signer.tag, heldAtMs = nowMs, route = route)
            p.helperAfterMs = nowMs + HELPER_SETTLE_MS + random.nextInt(HELPER_SETTLE_SPREAD_MS)
            parcels[m.id] = p
            capCrew(crew.id)
        }
        if (route == Route.INTERNET) onRelay(m.id, box, nowMs)
        if (fresh) dirty = true
        return Accepted(m.id, m, fresh)
    }

    private fun open(crew: Crew, sealed: ByteArray): Message? {
        crew.group.openPing(sealed)?.let { p ->
            // Unsigned could be anyone; a kind we don't know is ignored, never announced.
            return if (p.sender != 0L && PingPolicy.group(p.kind) != PingPolicy.Group.UNKNOWN) Message(p.id, sealed, p, null) else null
        }
        crew.group.openRally(sealed)?.let { r -> if (r.sender != 0L) return Message(r.id, sealed, null, r) }
        return null
    }

    /** Message [id] is on the relay (seen in [box], or uploaded there; a null [box] is a crew phone's word for it). */
    private fun onRelay(id: Long, box: Box?, nowMs: Long) {
        val p = parcels[id] ?: return
        val primary = box == null || box == primaryBox(p.kind)
        // Seen there ourselves: nothing left to check.
        if (box != null && primary) p.toldAtMs = 0L
        if (primary && !p.onServer) {
            p.onServer = true
            dirty = true
        }
        if (!primary && !p.durable) {
            p.durable = true
            dirty = true
        }
        p.confirmedAtMs = nowMs
        tell(p)
    }

    /** An upload ended. */
    fun onUploaded(job: Upload, result: PutResult, nowMs: Long) {
        if (job.helper) helping = (helping - 1).coerceAtLeast(0) else inFlight = (inFlight - 1).coerceAtLeast(0)
        val p = parcels[job.id]
        val primary = p == null || job.box == primaryBox(p.kind)
        if (p != null) {
            if (primary) p.primaryFlying = false else p.durableFlying = false
        }
        when (result) {
            PutResult.SENT -> {
                relayAnswered(nowMs)
                throttleStep = 0
                if (p != null) {
                    p.tries = 0
                    p.putAtMs = nowMs
                    onRelay(p.id, job.box, nowMs)
                    host.trace(p.id, p.kind, if (job.helper) "uploaded for a crew mate" else "uploaded")
                    // If its author is in range, tell them it's on the relay.
                    if (job.helper && primary) queueReceipt(p, nowMs)
                }
            }
            PutResult.NO_NETWORK -> {
                lastRelayFailMs = nowMs
                p?.let { it.retryAtMs = nowMs + minOf(5_000L shl it.tries.coerceAtMost(5), 120_000L); it.tries++ }
            }
            PutResult.THROTTLED -> {
                relayAnswered(nowMs)
                // The relay (or the app's budget for it) said "too many": everything waits a
                // little, 30 s then up to 2 min, so the queue doesn't spin. How long the relay
                // really needs is the budget's business (it answers "too many" for free until
                // then). Uploads already on their way when the wait began, and a safety ping
                // sent through it, don't make it longer.
                if (nowMs >= uploadHoldUntilMs) {
                    val base = minOf(30_000L shl throttleStep.coerceAtMost(2), 120_000L)
                    uploadHoldUntilMs = nowMs + base + random.nextInt((base / 2).toInt())
                    throttleStep++
                }
                // Need help keeps trying through the wait, a little apart.
                if (p != null && rank(p.kind) == 0) p.retryAtMs = nowMs + SAFETY_RETRY_MS
            }
            PutResult.REFUSED -> {
                relayAnswered(nowMs)
                if (p != null) {
                    if (job.helper) p.helperStopped = true else {
                        p.refusals++
                        p.retryAtMs = nowMs + 5 * 60_000L
                        // Refused three times: stop, and say so ("Not sent"). A tap tries again.
                        if (p.refusals >= MAX_REFUSALS && !p.onServer && !p.durable) {
                            p.gaveUp = true
                            tell(p)
                        }
                    }
                }
            }
        }
        // It didn't go: say where it stands now (waiting, or already with a crew phone nearby).
        if (result != PutResult.SENT && p != null && p.mine && !job.helper && !p.gaveUp) tellStanding(p)
    }

    private fun relayAnswered(nowMs: Long) {
        lastRelayOkMs = nowMs
    }

    /**
     * Housekeeping, and starting uploads. Call about once a second while the app or the
     * service is running, and right after [post], [fetched] or a change of connection.
     */
    fun tick(nowMs: Long) {
        if (nowMs - lastExpireMs >= 5_000L) {
            lastExpireMs = nowMs
            expire(nowMs)
        }
        planAir(nowMs)
        val jobs = planUploads(nowMs)
        // Started last: an upload may answer at once and come straight back in here.
        jobs.first.forEach { uplink.upload(it) }
        jobs.second.forEach { host.fetchWanted(it) }
    }

    private fun planUploads(nowMs: Long): Pair<List<Upload>, List<String>> {
        val jobs = ArrayList<Upload>()
        val wantFetch = ArrayList<String>()
        if (!online) return jobs to wantFetch
        // Asked to slow down: only safety pings still go (the app's budget spaces those out too).
        val held = nowMs < uploadHoldUntilMs
        var free = MAX_IN_FLIGHT - inFlight

        fun start(p: Parcel, box: Box, helper: Boolean) {
            if (box == primaryBox(p.kind)) p.primaryFlying = true else p.durableFlying = true
            if (helper) helping++ else {
                inFlight++
                free--
            }
            val use = if (p.kind != KIND_PIN) PingPolicy.use(p.kind) else RelayUse.MESSAGE
            jobs += Upload(p.crewId, p.id, box, p.sealed, use, helper)
        }

        // Our own first: the author is the one who should upload. Safety pings, then oldest first.
        val own = parcels.values.filter { it.mine && it.crewId in crews && nowMs >= it.retryAtMs && it.refusals < MAX_REFUSALS && !it.gaveUp }
            .sortedWith(compareBy<Parcel>({ rank(it.kind) }, { it.timeSec }))
        for (p in own) {
            if (free <= 0) break
            if (held && rank(p.kind) != 0) continue
            // A crew phone already has this one and may have uploaded it while we had no signal:
            // look at the mailbox first (for a moment), rather than post a second copy.
            if (p.nearby && !p.onServer && nowMs - onlineSinceMs < LOOK_FIRST_MS &&
                (lastFetchMs["${p.crewId}/${primaryBox(p.kind).ordinal}"] ?: 0L) < onlineSinceMs
            ) {
                if (nowMs - (fetchAskedMs[p.crewId] ?: 0L) >= LOOK_FIRST_MS) {
                    fetchAskedMs[p.crewId] = nowMs
                    if (p.crewId !in wantFetch) wantFetch += p.crewId
                }
                continue
            }
            // Our own pin is re-posted every ten minutes while the app is in use: the relay's pin box forgets after fifteen.
            val pinDue = active && p.kind == KIND_PIN && nowMs - p.putAtMs >= PIN_REPOST_MS
            if ((!p.onServer || pinDue) && !p.primaryFlying) start(p, primaryBox(p.kind), false)
            if (free > 0 && wantsDurable(p) && !p.durableFlying) start(p, Box.CHAT, false)
        }

        // Then what we carry for crew mates, after a random wait and a fresh look at the mailbox.
        // One small batch at a time, all started together straight after that look.
        if (held || helping > 0) return jobs to wantFetch
        for (crewId in crews.keys) {
            for (box in Box.values()) {
                val key = "$crewId/${box.ordinal}"
                val waiting = parcels.values.filter {
                    !it.mine && it.crewId == crewId && !it.helperStopped && nowMs >= it.retryAtMs && it.route != Route.INTERNET &&
                        worthCarrying(it.kind, it.timeSec, nowMs) &&
                        ((primaryBox(it.kind) == box && !it.onServer && !it.primaryFlying) || (box == Box.CHAT && wantsDurable(it) && !it.durableFlying))
                }
                if (waiting.isEmpty()) continue
                val fetchedAt = lastFetchMs[key] ?: 0L
                val ready = waiting.filter { nowMs >= maxOf(helperReadyAtMs, it.helperAfterMs) }
                if (ready.isEmpty()) continue
                val checked = ready.filter { fetchedAt >= maxOf(helperReadyAtMs, it.helperAfterMs) }
                if (checked.isEmpty()) {
                    if (nowMs - (fetchAskedMs[crewId] ?: 0L) >= FETCH_ASK_GAP_MS) {
                        fetchAskedMs[crewId] = nowMs
                        if (crewId !in wantFetch) wantFetch += crewId
                    }
                    continue
                }
                var batch = helperBatch[key] ?: 0
                var room = if (box == Box.CHAT) HELD_LIMIT - (chatCount[crewId] ?: 0) else Int.MAX_VALUE
                // Safety first. Then, if the mailbox is nearly full, the newest (old backlog is what
                // waits); with room to spare, this phone's own order.
                val order = if (room < checked.size) compareBy<Parcel> { rank(it.kind) }.thenByDescending { it.timeSec }
                else compareBy<Parcel> { rank(it.kind) }.thenBy { (it.id xor helperSalt) * -0x61c8864680b583ebL }
                for (p in checked.sortedWith(order)) {
                    if (batch <= 0 || room <= 0) break
                    start(p, box, true)
                    batch--
                    room--
                }
                helperBatch[key] = batch
                if (box == Box.CHAT) chatCount[crewId] = HELD_LIMIT - room
            }
        }
        return jobs to wantFetch
    }

    private fun wantsDurable(p: Parcel) = p.kind != KIND_PIN && PingPolicy.alsoHeld(p.kind) && !p.durable

    private fun expire(nowMs: Long) {
        val it = parcels.values.iterator()
        while (it.hasNext()) {
            val p = it.next()
            // Never from under an upload that's on its way: its answer still has to land somewhere.
            if (p.primaryFlying || p.durableFlying) continue
            // One we queued ourselves counts from when it was queued, so an old line the person
            // taps to retry gets a proper go. Anything else counts from when it was written.
            val born = if (p.route == Route.OWN) p.heldAtMs else minOf(p.timeSec * 1000, p.heldAtMs)
            val age = nowMs - born
            if (!p.mine) {
                if (age > carryMs(p.kind)) {
                    it.remove()
                    dirty = true
                }
                continue
            }
            // Our own: an unsent chat line keeps trying for as long as the relay would keep it.
            val keep = if (p.onServer || p.durable) carryMs(p.kind) else maxOf(carryMs(p.kind), if (PingPolicy.group(p.kind) == PingPolicy.Group.CHAT || p.kind == KIND_PIN) OWN_KEEP_MS else 0L)
            if (age > keep) {
                if (!p.onServer && !p.durable && !p.nearby) {
                    p.gaveUp = true
                    tell(p)
                }
                it.remove()
                dirty = true
            }
        }
        while (heard.size > 600) heard.remove(heard.keys.first())
        while (acked.size > 600) acked.remove(acked.first())
        retired.removeAll { nowMs > it.untilMs }
        if (pausedCrewId != null && nowMs > pausedUntilMs) unpause(nowMs)
    }

    private fun capCrew(crewId: String) {
        var n = parcels.values.count { it.crewId == crewId }
        if (n <= MAX_PER_CREW) return
        // Other people's oldest go first; our own unsent ones are never pushed out.
        // (Never the pin: there's only one, and it has to stay on the relay.)
        val victims = parcels.values.filter { it.crewId == crewId && it.kind != KIND_PIN && (!it.mine || it.onServer) }.sortedBy { it.timeSec }
        for (v in victims) {
            if (n <= MAX_PER_CREW) break
            parcels.remove(v.id)
            n--
        }
    }

    // ---- Bluetooth ----

    /** Is there something to put on air? (The relay's schedule asks before giving up a turn.) */
    fun hasPacket(nowMs: Long): Boolean {
        if (!air.ready()) return false
        if (fragments.isNotEmpty()) return true
        if (retired.any { nowMs >= it.nextMs }) return true
        if (pausedCrewId != null && nowMs >= pauseBeaconMs) return true
        if (receipts.isNotEmpty() && nowMs >= receiptDueMs) return true
        if (pushes.values.any { nowMs >= it }) return true
        if (nowMs >= haveDueMs) return true
        return relay.waitingCount() > 0
    }

    /**
     * The next packet to put on air, or null if there's nothing. Each call hands over one
     * packet; the app holds it on air for [RelaySchedule.MESSAGE_MS].
     */
    fun nextPacket(nowMs: Long): ByteArray? {
        if (!air.ready()) return null
        val nowSec = nowMs / 1000
        // The second half of a long message goes straight after the first.
        fragments.removeFirstOrNull()?.let { return out(it, nowSec) }

        // "This key is retired": a crew that moved on tells phones still on the old key to stop using it.
        retired.firstOrNull { nowMs >= it.nextMs }?.let { r ->
            r.nextMs = nowMs + RETIRED_EVERY_MS + random.nextInt(15_000)
            return out(MessagePacket(crowdHops(), 0, 1, r.group.sealEnvelope(GigGroup.ENV_RETIRED, ByteArray(0), nowSec, secure)), nowSec)
        }
        val crew = main() ?: return relay.next(nowSec)?.encode()
        if (pausedCrewId == crew.id) {
            // On hold ourselves: pass the notice on, and nothing else under this key.
            if (nowMs >= pauseBeaconMs) {
                pauseBeaconMs = nowMs + RETIRED_EVERY_MS + random.nextInt(15_000)
                return out(MessagePacket(crowdHops(), 0, 1, crew.group.sealEnvelope(GigGroup.ENV_RETIRED, ByteArray(0), nowSec, secure)), nowSec)
            }
            return relay.next(nowSec)?.encode()
        }

        // Safety pings jump the queue.
        nextPush(nowMs, safetyOnly = true)?.let { return it }

        if (receipts.isNotEmpty() && nowMs >= receiptDueMs) {
            val batch = receipts.entries.take(MAX_RECEIPT_IDS)
            val body = ByteBuffer.allocate(1 + batch.size * 9).put(batch.size.toByte())
            batch.forEach { (id, onServer) -> body.putLong(id).put((if (onServer) 1 else 0).toByte()) }
            batch.forEach { receipts.remove(it.key) }
            val hops = if (receiptCrowd) crowdHops() else 0
            if (receipts.isEmpty()) {
                receiptDueMs = Long.MAX_VALUE
                receiptCrowd = false
            }
            return out(MessagePacket(hops, 0, 1, crew.group.sealEnvelope(GigGroup.ENV_RECEIPT, body.array(), nowSec, secure)), nowSec)
        }

        nextPush(nowMs, safetyOnly = false)?.let { return it }

        if (nowMs >= haveDueMs) {
            haveDueMs = Long.MAX_VALUE
            lastHaveSentMs = nowMs
            return out(MessagePacket(0, 0, 1, crew.group.sealEnvelope(GigGroup.ENV_HAVE, haveBody(crew, nowMs), nowSec, secure)), nowSec)
        }
        // Nothing of our own: do our bit for the crowd.
        return relay.next(nowSec)?.encode()
    }

    private fun out(p: MessagePacket, nowSec: Long): ByteArray {
        // Our own packets come back to us off other phones: don't pass those on again.
        relay.know(p, nowSec)
        heard[p.relayKey] = nowSec
        return p.encode()
    }

    private fun nextPush(nowMs: Long, safetyOnly: Boolean): ByteArray? {
        val nowSec = nowMs / 1000
        val due = pushes.entries.filter { nowMs >= it.value }.mapNotNull { parcels[it.key] }
            .filter { !safetyOnly || rank(it.kind) == 0 }
            .sortedWith(compareBy<Parcel> { rank(it.kind) }.thenByDescending { it.timeSec })
        // Tidy up pushes for messages we no longer hold.
        pushes.keys.removeAll { it !in parcels }
        for (p in due) {
            pushes.remove(p.id)
            if (!airWorthy(p, nowMs)) continue
            // Someone else just put it on air: once is enough.
            if (nowMs - p.heardOnAirMs < HEARD_QUIET_MS) continue
            val packets = MessagePacket.split(p.sealed, hopsFor(p, nowMs))
            if (packets.isEmpty()) continue
            p.aired++
            host.trace(p.id, p.kind, "on air")
            packets.drop(1).forEach { fragments.addLast(it) }
            return out(packets.first(), nowSec)
        }
        return null
    }

    /** Pings and pins start with 4 or 5 hops (not always the same, so the count doesn't show how far a packet has come). Chat gets none. */
    private fun hopsFor(p: Parcel, nowMs: Long): Int {
        if (p.kind != KIND_PIN && PingPolicy.group(p.kind) == PingPolicy.Group.CHAT) return 0
        val age = (nowMs - minOf(p.timeSec * 1000, p.heldAtMs)) / 1000
        val crowdFor = if (p.kind == KIND_PIN) PingPolicy.FRESH_SEC else PingPolicy.crowdSec(p.kind)
        return if (age <= crowdFor) crowdHops() else 0
    }

    private fun crowdHops() = MessagePacket.MAX_TTL - random.nextInt(2)

    private fun airWorthy(p: Parcel, nowMs: Long): Boolean {
        val crew = main() ?: return false
        return p.crewId == crew.id && pausedCrewId != crew.id && worthCarrying(p.kind, p.timeSec, nowMs)
    }

    private fun worthCarrying(kind: Int, timeSec: Long, nowMs: Long): Boolean = nowMs - timeSec * 1000 <= carryMs(kind)

    private fun planAir(nowMs: Long) {
        val crew = main() ?: return
        if (!air.ready() || pausedCrewId == crew.id) return
        val cut = cutOff(nowMs)
        val offlinePeerNear = nowMs - offlinePeerAtMs < OFFLINE_PEER_MS
        for (p in parcels.values) {
            if (p.crewId != crew.id || p.aired > 0 || p.id in pushes || !airWorthy(p, nowMs)) continue
            val safety = rank(p.kind) == 0
            if (p.mine) {
                // Ours goes on air straight away when we're cut off or it's urgent; otherwise only
                // if the relay hasn't taken it within a few seconds, or a mate nearby has no signal.
                val waited = nowMs - p.heldAtMs >= AIR_GRACE_MS && !p.onServer
                if (cut || safety || waited || offlinePeerNear) pushes[p.id] = nowMs
            } else if (safety && !p.boosted && p.route != Route.INTERNET) {
                // A safety ping we were handed: put it on air once more ourselves, without waiting to be asked.
                p.boosted = true
                pushes[p.id] = nowMs + 2_000L + random.nextInt(4_000)
            }
        }
        // With no signal, say what we hold about once a minute, so crew phones in range fill the gaps.
        if (cut && nowMs >= nextHaveMs) {
            nextHaveMs = nowMs + HAVE_EVERY_MS + random.nextInt(HAVE_SPREAD_MS)
            haveDueMs = minOf(haveDueMs, nowMs)
        }
    }

    /** A packet heard on air (the relay's service data, any version 2 packet). */
    fun onPacket(bytes: ByteArray, nowMs: Long) {
        val pkt = MessagePacket.decode(bytes) ?: return
        val nowSec = nowMs / 1000
        val first = heard.put(pkt.relayKey, nowSec) == null
        val sealed = reassembly.offer(pkt, nowMs)
        if (sealed != null) handle(sealed, pkt, first, nowMs)
        // Whatever it was, pass it on if it has hops left (the relay itself takes each packet once).
        relay.offer(pkt, nowSec)
    }

    private fun handle(sealed: ByteArray, pkt: MessagePacket, first: Boolean, nowMs: Long) {
        val crew = main() ?: return
        val env = crew.group.openEnvelope(sealed)
        if (env != null) {
            if (!first) return
            // Nothing sealed long ago, or "in the future", is acted on.
            val age = nowMs / 1000 - env.timeSec
            if (age > ENVELOPE_MAX_AGE_SEC || age < -MessageClock.FOLLOW_SEC) return
            when (env.type) {
                GigGroup.ENV_RETIRED -> pause(crew, nowMs)
                GigGroup.ENV_HAVE -> if (pausedCrewId != crew.id) onHave(crew, env.body, nowMs)
                GigGroup.ENV_RECEIPT -> if (pausedCrewId != crew.id) onReceipt(env.body, nowMs)
            }
            return
        }
        // While this key is on hold, nothing sealed with it is taken off the air.
        if (pausedCrewId == crew.id) return
        // Only signed pings and pins come in this way. A new crew key never does: see RekeyPolicy.
        val a = accept(crew, sealed, Route.BLUETOOTH, null, nowMs) ?: return
        val p = parcels[a.id]
        p?.heardOnAirMs = nowMs
        pushes.remove(a.id)
        val m = a.message
        if (a.fresh && m != null) {
            val crowd = m.kind == KIND_PIN || PingPolicy.group(m.kind) != PingPolicy.Group.CHAT
            val route = if (crowd && pkt.ttl < MessagePacket.MAX_TTL - 1) Route.CROWD else Route.BLUETOOTH
            host.trace(m.id, m.kind, if (route == Route.CROWD) "in by crowd relay, ${pkt.ttl} hops left" else "in by Bluetooth")
            host.deliver(crew, m, route)
        }
        // Confirm we hold it (the first time we hear it), so its author can show "Sent nearby".
        if (p != null && !p.mine && acked.add(a.id)) queueReceipt(p, nowMs)
    }

    private fun queueReceipt(p: Parcel, nowMs: Long) {
        if (p.crewId != main()?.id) return
        receipts[p.id] = p.onServer || p.durable
        if (p.kind == KIND_PIN || PingPolicy.group(p.kind) != PingPolicy.Group.CHAT) receiptCrowd = true
        receiptDueMs = minOf(receiptDueMs, nowMs + RECEIPT_WAIT_MS)
    }

    private fun onReceipt(body: ByteArray, nowMs: Long) {
        if (body.isEmpty()) return
        val b = ByteBuffer.wrap(body)
        val n = minOf(b.get().toInt() and 0xFF, b.remaining() / 9)
        repeat(n) {
            val id = b.long
            val onServer = b.get().toInt() and 1 != 0
            val p = parcels[id] ?: return@repeat
            if (p.mine && !p.nearby) {
                p.nearby = true
                dirty = true
                host.trace(p.id, p.kind, "a crew phone nearby has it")
            }
            if (onServer) {
                if (p.mine && !p.onServer) p.toldAtMs = nowMs
                onRelay(id, null, nowMs)
            }
            tell(p)
        }
    }

    // "What I have": a Bloom filter of the ids this phone holds, so a crew phone in range can
    // send what's missing without anyone sending a long list.

    private fun haveBody(crew: Crew, nowMs: Long): ByteArray {
        val ids = parcels.values.filter { it.crewId == crew.id && worthCarrying(it.kind, it.timeSec, nowMs) }.map { it.id }
        val size = (ids.size * 10 / 8 + 1).coerceIn(8, HAVE_MAX_BYTES)
        val salt = random.nextInt(256)
        val bits = ByteArray(size)
        ids.forEach { id -> bloomSlots(id, salt, size * 8).forEach { i -> bits[i / 8] = (bits[i / 8].toInt() or (1 shl (i % 8))).toByte() } }
        return ByteBuffer.allocate(4 + size).put((if (cutOff(nowMs)) 1 else 0).toByte()).putShort(ids.size.toShort()).put(salt.toByte()).put(bits).array()
    }

    private fun onHave(crew: Crew, body: ByteArray, nowMs: Long) {
        if (body.size < 4 + 8 || !air.ready()) return
        val peerCutOff = body[0].toInt() and 1 != 0
        val count = ByteBuffer.wrap(body, 1, 2).short.toInt() and 0xFFFF
        val salt = body[3].toInt() and 0xFF
        val nBits = (body.size - 4) * 8
        fun has(id: Long) = bloomSlots(id, salt, nBits).all { i -> body[4 + i / 8].toInt() and (1 shl (i % 8)) != 0 }
        if (peerCutOff) offlinePeerAtMs = nowMs
        val mine = parcels.values.filter { it.crewId == crew.id && airWorthy(it, nowMs) }
        val missing = mine.filter { !has(it.id) }
        // A few at a time, most urgent and newest first, each after a short random wait: if
        // another phone answers first we hear it and stay quiet. Their next "what I have" asks for more.
        missing.sortedWith(compareBy<Parcel> { rank(it.kind) }.thenByDescending { it.timeSec }).take(PUSH_BATCH).forEach { p ->
            if (p.id !in pushes) pushes[p.id] = nowMs + random.nextInt(PUSH_SPREAD_MS)
        }
        // They hold things we don't: tell them what we have, so they send those.
        if (count > mine.size - missing.size && nowMs - lastHaveSentMs >= HAVE_REPLY_GAP_MS) {
            haveDueMs = minOf(haveDueMs, nowMs + 1_000L + random.nextInt(3_000))
        }
    }

    private fun bloomSlots(id: Long, salt: Int, nBits: Int): IntArray {
        val x = (id xor (salt * -0x61c8864680b583ebL)) * -0x3d4d51c2d82b14b1L
        val h1 = (x ushr 33).toInt()
        val h2 = (x.toInt() or 1)
        return IntArray(BLOOM_HASHES) { Math.floorMod(h1 + it * h2, nBits) }
    }

    // ---- When the crew moves to a new key ----

    private fun pause(crew: Crew, nowMs: Long) {
        val already = pausedCrewId == crew.id
        pausedCrewId = crew.id
        pausedUntilMs = nowMs + PAUSE_MS
        if (already) return
        pauseBeaconMs = nowMs + random.nextInt(10_000)
        pushes.clear()
        fragments.clear()
        receipts.clear()
        haveDueMs = Long.MAX_VALUE
        host.trace(0L, 0, "crew key retired: Bluetooth on hold until the relay gives us the new one")
        host.paused(crew.id, true)
    }

    private fun unpause(nowMs: Long) {
        val id = pausedCrewId ?: return
        pausedCrewId = null
        nextHaveMs = nowMs
        host.paused(id, false)
    }

    /** Is Bluetooth on hold for [crewId] (its key was retired and we don't have the new one yet)? */
    fun isPaused(crewId: String): Boolean = pausedCrewId == crewId

    /**
     * This phone moved crew [oldId] to a new key, [fresh] (it removed someone, reset the
     * invite, or the relay delivered someone else's rekey). From now on the old key is dead:
     *  - messages of ours that hadn't reached the relay are signed again under the new key,
     *    with the same ids, so nobody sees them twice;
     *  - everything else sealed with the old key is dropped: only its author can re-sign it;
     *  - phones still on the old key are told, over the crowd relay, to stop using it.
     * Replaces the crew in [setCrews]'s list.
     */
    fun rekeyed(oldId: String, fresh: Crew, nowMs: Long) {
        val old = crews[oldId] ?: return
        // Ours that hadn't reached the relay, and our pin either way: the new key has its own mailboxes, and the pin isn't in them.
        val mineUnsent = parcels.values.filter { it.crewId == oldId && it.mine && ((!it.onServer && !it.durable) || it.kind == KIND_PIN) }
        parcels.values.removeAll { it.crewId == oldId }
        val list = crews.values.map { if (it.id == oldId) fresh else it }
        setCrews(list, nowMs)
        for (p in mineUnsent) {
            val m = open(old, p.sealed) ?: continue
            val again = m.ping?.let { fresh.group.sealPing(it, fresh.signer, secure) } ?: fresh.group.sealRally(m.pin!!, fresh.signer, secure)
            val re = open(fresh, again) ?: continue
            if (re.id != p.id) continue
            blobIds[blobHash(again)] = re.id
            parcels[re.id] = Parcel(fresh.id, re.id, again, p.kind, p.timeSec, p.sender, mine = true, heldAtMs = p.heldAtMs, route = Route.OWN).also {
                it.notified = p.notified
            }
            host.trace(re.id, p.kind, "signed again under the crew's new key")
        }
        retire(old.group, nowMs)
        dirty = true
    }

    /** Tell phones still using [old] that it's retired, for the next few hours. */
    fun retire(old: GigGroup, nowMs: Long) {
        if (retired.any { it.group.key.contentEquals(old.key) }) return
        retired += Retired(old, nowMs + RETIRED_FOR_MS, nowMs)
    }

    // ---- Saving ----

    /** Everything worth keeping if the app is killed: the outbox, what we carry, and what we've seen. */
    fun save(): ByteArray {
        val bytes = ByteArrayOutputStream()
        DataOutputStream(bytes).use { d ->
            d.writeByte(SAVE_VERSION)
            d.writeInt(parcels.size)
            for (p in parcels.values) {
                d.writeUTF(p.crewId)
                d.writeLong(p.id)
                d.writeInt(p.kind)
                d.writeLong(p.timeSec)
                d.writeLong(p.sender)
                d.writeLong(p.heldAtMs)
                d.writeByte(p.route.ordinal)
                d.writeByte((if (p.mine) 1 else 0) or (if (p.onServer) 2 else 0) or (if (p.durable) 4 else 0) or (if (p.nearby) 8 else 0) or (if (p.toldAtMs != 0L) 16 else 0) or (if (p.gaveUp) 32 else 0))
                d.writeByte(p.notified?.ordinal ?: -1)
                d.writeShort(p.sealed.size)
                d.write(p.sealed)
            }
            val ids = seen.toList().takeLast(MAX_SEEN_SAVED)
            d.writeInt(ids.size)
            ids.forEach { d.writeLong(it) }
            d.writeInt(retired.size)
            for (r in retired) {
                d.write(r.group.key)
                d.writeLong(r.untilMs)
            }
        }
        return bytes.toByteArray()
    }

    /** Load what [save] wrote. Anything unreadable is ignored: better an empty queue than a crash. */
    fun restore(saved: ByteArray?, nowMs: Long) {
        if (saved == null || saved.isEmpty()) return
        runCatching {
            val d = DataInputStream(ByteArrayInputStream(saved))
            if (d.readUnsignedByte() != SAVE_VERSION) return
            repeat(d.readInt().coerceIn(0, 2_000)) {
                val crewId = d.readUTF()
                val id = d.readLong()
                val kind = d.readInt()
                val timeSec = d.readLong()
                val sender = d.readLong()
                val heldAt = d.readLong()
                val route = Route.values()[d.readUnsignedByte().coerceAtMost(Route.values().size - 1)]
                val flags = d.readUnsignedByte()
                val notified = d.readByte().toInt()
                val sealed = ByteArray(d.readUnsignedShort()).also { d.readFully(it) }
                val p = Parcel(crewId, id, sealed, kind, timeSec, sender, mine = flags and 1 != 0, heldAtMs = minOf(heldAt, nowMs), route = route)
                p.onServer = flags and 2 != 0
                p.durable = flags and 4 != 0
                p.nearby = flags and 8 != 0
                if (flags and 16 != 0) p.toldAtMs = nowMs
                p.gaveUp = flags and 32 != 0
                p.notified = State.values().getOrNull(notified)
                // Already on air before the restart, as far as anyone waiting is concerned: don't re-send unasked.
                p.aired = if (p.mine && !p.onServer && !p.nearby) 0 else 1
                p.boosted = true
                parcels[id] = p
                blobIds[blobHash(sealed)] = id
                seen += id
            }
            repeat(d.readInt().coerceIn(0, MAX_SEEN_SAVED)) { seen += d.readLong() }
            repeat(d.readInt().coerceIn(0, 16)) {
                val key = ByteArray(32).also { d.readFully(it) }
                val until = d.readLong()
                if (until > nowMs) retired += Retired(GigGroup(key, "", 0L), until, nowMs)
            }
        }
    }

    // ---- Small things ----

    /** How many messages are held for [crewId] (ours and carried). */
    fun held(crewId: String): Int = parcels.values.count { it.crewId == crewId }

    /** How many of our own for [crewId] haven't reached the relay. */
    fun unsent(crewId: String): Int = parcels.values.count { it.crewId == crewId && it.mine && !it.onServer && !it.durable }

    private fun remember(hash: Long, id: Long) {
        blobIds[hash] = id
        while (blobIds.size > 3_000) blobIds.remove(blobIds.keys.first())
    }

    private fun trimSeen() {
        while (seen.size > MAX_SEEN) seen.remove(seen.first())
    }

    private fun blobHash(sealed: ByteArray): Long = ByteBuffer.wrap(MessageDigest.getInstance("SHA-256").digest(sealed)).long

    companion object {
        /** [Message.kind] for a meet-up pin (ping kinds are 1 and up). */
        const val KIND_PIN = -1

        /** The relay keeps 200 records per chat mailbox; a helper never fills it past this. */
        const val HELD_LIMIT = 180
        /** Uploads for crew mates per look at the mailbox. */
        const val HELPER_BATCH = 5
        const val MAX_PER_CREW = 200

        private const val SAVE_VERSION = 1
        private const val MAX_SEEN = 4_000
        private const val MAX_SEEN_SAVED = 2_000
        private const val MAX_IN_FLIGHT = 2
        private const val MAX_REFUSALS = 3
        /** Back on signal: wait this long, plus up to [HELPER_SPREAD_MS], before uploading for others. */
        private const val HELPER_WAIT_MS = 10_000L
        private const val HELPER_SPREAD_MS = 50_000
        /** Handed a message while we do have signal: a short random wait, so two helpers don't both upload it. */
        private const val HELPER_SETTLE_MS = 3_000L
        private const val HELPER_SETTLE_SPREAD_MS = 12_000
        private const val FETCH_ASK_GAP_MS = 30_000L
        /** Back on signal with a message a mate already holds: how long to wait for a look at the mailbox before uploading it ourselves. */
        private const val LOOK_FIRST_MS = 15_000L
        /** How long after a crew phone says "I uploaded yours" before a mailbox without it counts as proof it didn't. */
        private const val TOLD_CHECK_AFTER_MS = 30_000L
        private const val SAFETY_RETRY_MS = 15_000L
        private const val PIN_REPOST_MS = 10 * 60_000L
        private const val PIN_LAPSE_MS = 60_000L
        private const val PIN_CARRY_MS = 18 * 3600_000L
        private const val OWN_KEEP_MS = 72 * 3600_000L

        private const val AIR_GRACE_MS = 3_000L
        private const val OFFLINE_PEER_MS = 3 * 60_000L
        private const val HAVE_EVERY_MS = 45_000L
        private const val HAVE_SPREAD_MS = 30_000
        private const val HAVE_REPLY_GAP_MS = 20_000L
        private const val HAVE_MAX_BYTES = 160
        private const val BLOOM_HASHES = 4
        private const val PUSH_BATCH = 6
        private const val PUSH_SPREAD_MS = 3_000
        private const val HEARD_QUIET_MS = 8_000L
        private const val RECEIPT_WAIT_MS = 1_500L
        private const val MAX_RECEIPT_IDS = 16
        private const val ENVELOPE_MAX_AGE_SEC = 3600L
        private const val RETIRED_EVERY_MS = 60_000L
        private const val RETIRED_FOR_MS = 6 * 3600_000L
        private const val PAUSE_MS = 30 * 60_000L

        /** Safety pings first, then the pin, then other pings, then chat. */
        private fun rank(kind: Int): Int = when {
            kind == KIND_PIN -> 1
            PingPolicy.group(kind) == PingPolicy.Group.SAFETY -> 0
            PingPolicy.group(kind) == PingPolicy.Group.CHAT -> 3
            else -> 2
        }

        private fun primaryBox(kind: Int): Box = when {
            kind == KIND_PIN -> Box.PIN
            PingPolicy.group(kind) == PingPolicy.Group.CHAT -> Box.CHAT
            else -> Box.PING
        }

        private fun carryMs(kind: Int): Long = if (kind == KIND_PIN) PIN_CARRY_MS else PingPolicy.carrySec(kind) * 1000
    }
}
