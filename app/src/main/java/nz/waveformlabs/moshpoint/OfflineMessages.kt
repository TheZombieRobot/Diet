package nz.waveformlabs.moshpoint

import android.bluetooth.BluetoothManager
import android.content.Context
import android.os.SystemClock
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.core.Courier
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.MessageClock
import nz.waveformlabs.moshpoint.core.MessagePacket
import nz.waveformlabs.moshpoint.core.OutboxState
import nz.waveformlabs.moshpoint.core.PingPolicy
import nz.waveformlabs.moshpoint.core.PutResult
import nz.waveformlabs.moshpoint.locate.CrowdRelayRadio
import nz.waveformlabs.moshpoint.locate.RelayClient
import java.io.File

/**
 * Messages without signal: the phone's side of core [Courier].
 *
 * The courier decides everything (what to upload, what to put on air, what's a duplicate,
 * how each message is doing). This object only connects it to the phone:
 *  - the relay ([RelayClient]) for uploads, with the mailbox id that is valid right now;
 *  - the crowd relay's Bluetooth adverts ([CrowdRelayRadio]) for packets in and out, only
 *    while you're live (the radio is switched on and off by VisibilityService, nowhere else);
 *  - [CrewChat] and [GroupSync] for showing what arrives and how your own messages went.
 *
 * Everything here runs on the main thread: the courier isn't thread-safe and neither is CrewChat.
 */
object OfflineMessages : Courier.Host, Courier.Uplink, Courier.Air {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val courier = Courier(this, this, this)
    private val uploads = Mutex()
    private var app: Context? = null
    private var loop: Job? = null
    private var crewSignature = ""
    private var saveQueued = false
    private var lastAskedFetchAt = 0L
    private val lastOwnSec = HashMap<String, Long>()

    /** The message radio is on (you're live). Set only by [startRadio] and [stopRadio]. */
    @Volatile private var radioOn = false
    private var canCarry = false
    private var bluetoothCheckedAt = 0L
    private var bluetoothOn = false

    /** Bluetooth messages for the main crew are on hold until the relay gives us its new key (Compose state). */
    val paused = mutableStateOf(false)

    /** Test builds: which way each message went, newest first. */
    val routes = mutableStateListOf<String>()

    private fun now() = System.currentTimeMillis()

    fun init(c: Context) {
        if (app != null) return
        val a = c.applicationContext
        app = a
        courier.restore(runCatching { file(a).takeIf { it.exists() }?.readBytes() }.getOrNull(), now())
        courier.setOnline(!RelayClient.offline, now())
        NetState.onChange { up ->
            courier.setOnline(up && !RelayClient.offline, now())
            // Signal's back: look at the mailboxes, then send what's waiting.
            if (up) askFetch(force = true)
        }
        loop = scope.launch {
            while (true) {
                runCatching { tick() }
                delay(if (radioOn || CrewChat.open) 1_000L else 5_000L)
            }
        }
    }

    private fun file(c: Context) = File(c.filesDir, "courier.bin")

    private fun tick() {
        val c = app ?: return
        syncCrews(c)
        val t = now()
        courier.setOnline(!RelayClient.offline, t)
        courier.tick(t)
        save()
    }

    /** Tell the courier which crews we're in. Only the main crew, on gig day and not followed from home, uses Bluetooth. */
    private fun syncCrews(c: Context) {
        val main = GroupSync.group.value
        val t = now()
        val onAir = main != null && !GroupSync.following && !main.dormant(t)
        val all = ChatSync.allCrews(c)
        val signature = all.joinToString(",") { GigArchive.idFor(it) } + "|" + (main?.let { GigArchive.idFor(it) } ?: "") + "|" + onAir
        if (signature == crewSignature) return
        crewSignature = signature
        courier.setCrews(
            all.map { g -> Courier.Crew(GigArchive.idFor(g), g, Identity.signer(c, g), main = onAir && main != null && g.key.contentEquals(main.key)) },
            t,
        )
    }

    private fun crewById(c: Context, id: String): GigGroup? = ChatSync.allCrews(c).firstOrNull { GigArchive.idFor(it) == id }

    private fun isMain(g: GigGroup) = GroupSync.group.value?.key?.contentEquals(g.key) == true

    private fun save() {
        if (!courier.dirty || saveQueued) return
        val c = app ?: return
        saveQueued = true
        scope.launch {
            delay(1_500)
            saveQueued = false
            courier.dirty = false
            val bytes = courier.save()
            withContext(Dispatchers.IO) {
                runCatching {
                    val tmp = File(c.filesDir, "courier.tmp")
                    tmp.writeBytes(bytes)
                    tmp.renameTo(file(c))
                }
            }
        }
    }

    // ---- Sending ----

    /**
     * A message of ours for [g], already sealed and signed. The courier takes it from here:
     * the relay if there's signal, Bluetooth if not, and the relay again when signal's back.
     * Returns it opened (for its id), or null if it couldn't be queued.
     */
    fun post(c: Context, g: GigGroup, sealed: ByteArray): Courier.Message? {
        init(c)
        val a = c.applicationContext
        syncCrews(a)
        val t = now()
        courier.setOnline(!RelayClient.offline, t)
        val m = courier.post(GigArchive.idFor(g), sealed, t)
        courier.tick(t)
        save()
        return m
    }

    /** The state to show for a message just handed to [post]: still trying, or already known to be waiting. */
    fun firstState(): Int = if (RelayClient.offline) CrewChat.WAITING else CrewChat.SENDING

    /** Is the courier still looking after the message with this id? */
    fun holds(id: Long): Boolean = id != 0L && courier.stateOf(id) != null

    /** The user tapped "tap to retry": try everything waiting again now. */
    fun retryNow(c: Context) {
        init(c)
        RelayClient.networkBack()
        courier.retryNow(now())
        save()
    }

    /**
     * The time to stamp on a new message for [g]: this phone's clock, but never earlier than
     * the newest message it has seen there, so a reply can't sort above what it answers.
     */
    fun stamp(c: Context, g: GigGroup): Long {
        val id = GigArchive.idFor(g)
        val t = MessageClock.stamp(now() / 1000, CrewChat.newestSeen(c, g), lastOwnSec[id] ?: 0L)
        lastOwnSec[id] = t
        return t
    }

    // ---- The relay ----

    /**
     * Everything the app just fetched from one of [g]'s mailboxes. The courier notes what's
     * on the relay (so nothing is uploaded twice) and keeps the main crew's messages to pass
     * on by Bluetooth. The caller still shows them as it always did.
     */
    fun fetched(c: Context, g: GigGroup, box: Courier.Box, blobs: List<ByteArray>) {
        init(c)
        val a = c.applicationContext
        syncCrews(a)
        val t = now()
        courier.setOnline(!RelayClient.offline, t)
        courier.fetched(GigArchive.idFor(g), box, blobs, t)
        courier.tick(t)
        save()
    }

    private fun askFetch(force: Boolean = false) {
        val c = app ?: return
        val t = SystemClock.elapsedRealtime()
        if (!force && t - lastAskedFetchAt < 10_000) return
        lastAskedFetchAt = t
        scope.launch {
            // A moment for the network to settle, and so a crowd leaving a venue doesn't all ask at once.
            delay(500L + (Math.random() * 2_500).toLong())
            runCatching { GroupSync.pollPingsNow(c) }
        }
    }

    override fun fetchWanted(crewId: String) = askFetch()

    override fun upload(job: Courier.Upload) {
        val c = app
        val g = c?.let { crewById(it, job.crewId) }
        if (c == null || g == null) {
            courier.onUploaded(job, PutResult.REFUSED, now())
            return
        }
        scope.launch {
            // One at a time: a helper's batch goes out in order, not as five requests at once.
            val result = uploads.withLock {
                // The mailbox id that is valid now: readers look at today and yesterday, this ping id and the last.
                val ms = now()
                val day = Math.floorDiv(ms / 1000, 86_400L)
                when (job.box) {
                    Courier.Box.CHAT -> RelayClient.send(g.chatIdForDay(day), job.sealed, job.use, held = true)
                    Courier.Box.PING -> RelayClient.send(g.pingIdForEpoch(Math.floorDiv(ms, EphemeralId.DEFAULT_ROTATION_MS)), job.sealed, job.use)
                    Courier.Box.PIN -> RelayClient.send(g.rallyIdForDay(day), job.sealed, job.use)
                }
            }
            val t = now()
            courier.onUploaded(job, result, t)
            courier.tick(t)
            save()
        }
    }

    // ---- Bluetooth (the crowd relay's adverts) ----

    /** You went live: start carrying messages over Bluetooth. Called from VisibilityService.begin() only. */
    fun startRadio(c: Context) {
        init(c)
        val a = c.applicationContext
        val adapter = a.getSystemService(BluetoothManager::class.java)?.adapter
        // Needs Bluetooth 5 extended adverts with room for a whole packet (plus the advert's own header).
        canCarry = runCatching {
            adapter != null && adapter.isLeExtendedAdvertisingSupported && adapter.leMaximumAdvertisingDataLength >= MessagePacket.MAX_SIZE + 8
        }.getOrDefault(false)
        bluetoothCheckedAt = 0L
        radioOn = true
        DebugStatus.set(K, if (canCarry) "on" else "this phone can't carry messages (needs Bluetooth 5 adverts)")
    }

    /** You went hidden (or the service stopped). Called from VisibilityService.onDestroy() only. */
    fun stopRadio() {
        radioOn = false
        DebugStatus.set(K, "off (not live)")
    }

    /** Can this phone carry messages over Bluetooth at all (Bluetooth 5 extended adverts)? */
    fun supported(c: Context): Boolean = CrowdRelayRadio.supported(c)

    override fun ready(): Boolean {
        if (!radioOn || !canCarry) return false
        val t = SystemClock.elapsedRealtime()
        if (t - bluetoothCheckedAt > 2_000) {
            bluetoothCheckedAt = t
            bluetoothOn = runCatching { app?.getSystemService(BluetoothManager::class.java)?.adapter?.isEnabled == true }.getOrDefault(false)
        }
        return bluetoothOn
    }

    /** A version 2 relay packet was heard. */
    fun onPacket(bytes: ByteArray) {
        if (!radioOn) return
        courier.onPacket(bytes, now())
        save()
    }

    fun hasPacket(): Boolean = radioOn && courier.hasPacket(now())

    fun nextPacket(): ByteArray? = if (radioOn) courier.nextPacket(now()) else null

    // ---- What arrives over Bluetooth ----

    override fun deliver(crew: Courier.Crew, message: Courier.Message, route: Courier.Route) {
        val c = app ?: return
        val g = crew.group
        val pin = message.pin
        val ping = message.ping
        when {
            pin != null -> if (isMain(g)) GroupSync.onRally(c, pin)
            ping == null -> Unit
            PingPolicy.group(ping.kind) == PingPolicy.Group.CHAT -> ChatSync.arrived(c, g, ping)
            else -> if (isMain(g)) GroupSync.arrived(c, ping, message.sealed)
        }
    }

    override fun stateChanged(crewId: String, id: Long, state: Courier.State) {
        val c = app ?: return
        val g = crewById(c, crewId) ?: return
        CrewChat.setStateById(
            c, g, GigGroup.idText(id),
            when (state) {
                Courier.State.WAITING -> OutboxState.WAITING
                Courier.State.NEARBY -> OutboxState.NEARBY
                Courier.State.SENT -> OutboxState.SENT
                Courier.State.GAVE_UP -> OutboxState.FAILED
            },
        )
    }

    override fun paused(crewId: String, on: Boolean) {
        val c = app ?: return
        val g = crewById(c, crewId)
        if (g != null && !isMain(g)) return
        paused.value = on
        if (on && g != null) CrewChat.note(c, g, Txt.s(R.string.offline_hint_paused))
    }

    /**
     * This phone moved [old] to the key in [fresh] (see CrewRekey). Call it while [old] is
     * still the crew on record: the courier signs our unsent messages again under the new key.
     */
    fun onRekey(c: Context, old: GigGroup, fresh: GigGroup) {
        init(c)
        val a = c.applicationContext
        syncCrews(a)
        val wasMain = isMain(old)
        val t = now()
        val onAir = wasMain && !GroupSync.following && !fresh.dormant(t)
        courier.rekeyed(GigArchive.idFor(old), Courier.Crew(GigArchive.idFor(fresh), fresh, Identity.signer(a, fresh), main = onAir), t)
        crewSignature = ""
        if (wasMain) paused.value = false
        save()
    }

    // ---- What the chat says about being cut off ----

    /**
     * A line for the top of [g]'s chat when messages can't go the usual way, or null when
     * there's nothing to say. Read while drawing, so it only looks at state.
     */
    fun chatHint(c: Context, g: GigGroup): String? {
        val main = isMain(g)
        if (main && paused.value) return Txt.s(R.string.offline_hint_paused)
        // Reading the Compose state here redraws the chat when the network comes or goes.
        val noNetwork = !NetState.online.value || RelayClient.offline
        if (!noNetwork) return null
        if (!main || GroupSync.sleeping || GroupSync.following) return Txt.s(R.string.offline_hint_no_signal)
        return when {
            !radioOn -> Txt.s(R.string.offline_hint_go_live)
            !supported(c) -> Txt.s(R.string.offline_hint_unsupported)
            c.getSystemService(BluetoothManager::class.java)?.adapter?.isEnabled != true -> Txt.s(R.string.offline_hint_bluetooth_off)
            else -> Txt.s(R.string.offline_hint_bluetooth)
        }
    }

    // ---- Test builds: the route log ----

    private const val K = "Messages (Bluetooth)"

    override fun trace(id: Long, kind: Int, what: String) {
        if (!DebugStatus.enabled) return
        val name = when {
            id == 0L -> "crew"
            kind == Courier.KIND_PIN -> "pin"
            kind == GigGroup.Ping.CHAT -> "chat"
            kind == GigGroup.Ping.NEED_HELP -> "NEED HELP"
            kind == GigGroup.Ping.PLAN -> "plan"
            kind == GigGroup.Ping.JOIN -> "joined"
            kind == GigGroup.Ping.FLARE -> "flare"
            else -> "ping $kind"
        }
        val line = if (id == 0L) what else "$name ${GigGroup.idText(id).take(6)}: $what"
        DebugStatus.log("msg  $line")
        routes.add(0, java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.US).format(java.util.Date()) + "  " + line)
        while (routes.size > 80) routes.removeAt(routes.size - 1)
    }

    /** Test builds: a message came in from the relay (the courier only logs Bluetooth arrivals itself). */
    fun traceRelay(id: Long, kind: Int) {
        if (id != 0L) trace(id, kind, "in from the relay")
    }

    /** Test builds: pretend there's no internet, to try all this at a desk. */
    fun setNoInternet(on: Boolean) {
        if (!DebugStatus.enabled) return
        RelayClient.debugNoInternet = on
        val t = now()
        courier.setOnline(!RelayClient.offline, t)
        if (!on) {
            RelayClient.networkBack()
            askFetch(force = true)
        }
        DebugStatus.log(if (on) "msg  NO INTERNET (test switch on)" else "msg  internet back (test switch off)")
    }
}
