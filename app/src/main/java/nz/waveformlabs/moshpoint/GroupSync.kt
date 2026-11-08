package nz.waveformlabs.moshpoint

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertisingSet
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.content.Context
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.locate.BleHub
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.service.VisibilityPrefs

/**
 * One-QR gig groups on the phone (the crypto is in core `GigGroup`).
 *
 * While a group is active and the app is open or you're visible:
 *  - broadcast our encrypted intro (finding secret + name) over Bluetooth 5 extended adverts,
 *  - listen for other members' intros and add them to the gig group,
 *  - with signal, also post our intro to the relay server and fetch everyone else's, so
 *    members whose phones can't do extended adverts still get the list.
 */
object GroupSync {
    /** PLACEHOLDER 16-bit UUID for group intros; register with the Bluetooth SIG before release. */
    private val INTRO_UUID: ParcelUuid = ParcelUuid.fromString("0000FFA9-0000-1000-8000-00805F9B34FB")
    private const val TAG = "GroupSync"
    private const val GROUP_TTL_MS = 18L * 60 * 60 * 1000

    /** The active group, if any (Compose state for the friends screen). */
    val group = mutableStateOf<GigGroup?>(null)

    /**
     * Who's in tonight's crew ([Friend.key]s), including people who were already on your
     * friends list: they belong in the crew too, not just one-night members.
     */
    val members = androidx.compose.runtime.mutableStateListOf<String>()

    private fun markMember(c: Context, secret: ByteArray) {
        val k = secret.joinToString("") { "%02x".format(it) }
        if (k in members) return
        members += k
        prefs(c.applicationContext).edit().putString("members", members.joinToString(",")).apply()
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var users = 0
    private var job: Job? = null
    private var listening = false
    private var postedEpoch = Long.MIN_VALUE
    /** True while the app is on screen: scan for intros fast so people join in seconds. */
    @Volatile var appOpen = false
        private set

    /** The app came on screen or went away: switch the intro scan between fast and low power. */
    @Synchronized
    fun setAppOpen(c: Context, open: Boolean) {
        if (appOpen == open) return
        appOpen = open
        val g = group.value
        if (listening && g != null) startListening(c.applicationContext, g)
    }
    private var advertCallback: AdvertisingSetCallback? = null
    private var advertSet: AdvertisingSet? = null

    // ---- Persistence ----

    private fun prefs(c: Context) = c.getSharedPreferences("group", Context.MODE_PRIVATE)

    fun load(c: Context) {
        val p = prefs(c)
        val key = p.getString("key", null) ?: return
        val created = p.getLong("created", 0)
        if (System.currentTimeMillis() - created > GROUP_TTL_MS) {
            clear(c)
            return
        }
        group.value = GigGroup(Base64.decode(key, Base64.NO_WRAP), p.getString("name", "Gig group") ?: "Gig group", created)
        rallyClearedAt = p.getLong("rallyCleared", 0L)
        rallyMine = p.getBoolean("rallyMine", false)
        rally.value = p.getString("rally", null)?.split(',', limit = 4)?.takeIf { it.size == 4 }?.let {
            runCatching { GigGroup.Rally(it[0].toDouble(), it[1].toDouble(), it[3], it[2].toLong()) }.getOrNull()
        }
        members.clear()
        p.getString("members", null)?.split(',')?.filter { it.length == 64 }?.let { members.addAll(it) }
    }

    fun startNew(c: Context, name: String) = set(c.applicationContext, GigGroup.create(name, System.currentTimeMillis()))

    /** Returns false if [qrText] isn't a group QR. */
    fun join(c: Context, qrText: String): Boolean {
        val g = GigGroup.parseQr(qrText, System.currentTimeMillis()) ?: return false
        val app = c.applicationContext
        val same = group.value?.key?.contentEquals(g.key) == true
        if (!same) set(app, g)
        // The person whose QR it was is in it: add them now, no waiting for an intro.
        GigGroup.hostOf(qrText)?.let { host ->
            if (!host.secret.contentEquals(VisibilityPrefs.mySecret(app))) {
                FriendsRepository.unremove(host.secret)
                FriendsRepository.addFromIntro(host.secret, host.name)
                markMember(app, host.secret)
            }
        }
        return true
    }

    private fun set(c: Context, g: GigGroup) {
        prefs(c).edit()
            .putString("key", Base64.encodeToString(g.key, Base64.NO_WRAP))
            .putString("name", g.name)
            .putLong("created", g.createdAtMs)
            .remove("members")
            .remove("rally")
            .remove("rallyCleared")
            .apply()
        group.value = g
        members.clear()
        rally.value = null
        rallyMine = false
        rallyClearedAt = 0L
        DebugStatus.log("Gig group: ${g.name}")
        if (users > 0) restart(c)
    }

    /** "End night": leave the group and drop its members. */
    fun clear(c: Context) {
        val app = c.applicationContext
        prefs(app).edit().clear().apply()
        group.value = null
        members.clear()
        rally.value = null
        rallyMine = false
        rallyClearedAt = 0L
        FriendsRepository.clearGigGroup()
        stopRadio(app)
    }

    /** Bluetooth toggled: the scan and advert died with it, so start them again. */
    @Synchronized
    fun onBluetooth(c: Context, on: Boolean) {
        advertSet = null
        advertCallback = null
        if (on && users > 0) restart(c.applicationContext)
    }

    // ---- Running ----

    /** Ref-counted: the activity (while open) and the visibility service both call this. */
    @Synchronized
    fun acquire(c: Context) {
        users++
        if (users == 1) restart(c.applicationContext)
    }

    @Synchronized
    fun release(c: Context) {
        users = (users - 1).coerceAtLeast(0)
        if (users == 0) stopRadio(c.applicationContext)
    }

    private fun restart(c: Context) {
        stopRadio(c)
        val g = group.value ?: return
        val mySecret = VisibilityPrefs.mySecret(c)
        val myName = VisibilityPrefs.myName(c).ifBlank { "Mate" }
        startListening(c, g)
        postedEpoch = Long.MIN_VALUE
        job = scope.launch {
            var lastServer = 0L
            var slot = 0
            // Sealed intros, re-made once per rotation (the tag must keep changing). Reusing
            // the bytes within a rotation lets the server de-duplicate repeat posts.
            val sealed = HashMap<String, Pair<Long, ByteArray>>()
            fun introFor(secret: ByteArray, name: String, now: Long): ByteArray {
                val epoch = Math.floorDiv(now, EphemeralId.DEFAULT_ROTATION_MS)
                val k = secret.joinToString("") { "%02x".format(it) }
                sealed[k]?.let { if (it.first == epoch) return it.second }
                return g.sealIntro(GigGroup.Intro(secret, name), now).also { sealed[k] = epoch to it }
            }
            while (true) {
                val now = System.currentTimeMillis()
                val mine = introFor(mySecret, myName, now)
                // Gossip: every other slot we pass on a crew member we know about, so the
                // whole crew spreads through the room even if two of them never get close.
                val members = FriendsRepository.friends.filter { it.gigGroupOnly }
                val out = if (slot % 2 == 1 && members.isNotEmpty()) {
                    val m = members[(slot / 2) % members.size]
                    introFor(m.secret, m.name, now)
                } else {
                    mine
                }
                slot++
                advertise(c, out)
                if (now - lastServer > (if (RelayClient.ownServer) 30_000L else 55_000L)) {
                    lastServer = now
                    syncServer(c, g, mine, now)
                }
                delay(2_500)
            }
        }
    }

    private suspend fun syncServer(c: Context, g: GigGroup, intro: ByteArray, now: Long) {
        val epoch = Math.floorDiv(now, EphemeralId.DEFAULT_ROTATION_MS)
        // Post once per rotation (the box id changes with it); just look the rest of the time.
        if (epoch != postedEpoch && RelayClient.put(g.rosterIdForEpoch(epoch), intro)) postedEpoch = epoch
        val day = Math.floorDiv(now / 1000, 86_400L)
        // Our meet-up pin: post when set, then every 10 min (the public relay only keeps recent posts).
        val myRally = rally.value?.takeIf { rallyMine }
        if (myRally != null && now - rallyPostedAt > 10 * 60_000L) {
            if (RelayClient.put(g.rallyIdForDay(day), g.sealRally(myRally))) rallyPostedAt = now
        }
        val ids = listOf(
            g.rosterIdForEpoch(epoch), g.rosterIdForEpoch(epoch - 1), g.rallyIdForDay(day), g.rallyIdForDay(day - 1),
            g.pingIdForEpoch(epoch), g.pingIdForEpoch(epoch - 1),
        )
        val found = RelayClient.lookup(ids) ?: return
        found.take(2).flatten().forEach { received(c, g, it) }
        found.drop(4).flatten().forEach { blob -> g.openPing(blob)?.let { onPing(c, it, blob) } }
        // Newest pin from anyone in the crew wins (including "removed").
        found.drop(2).take(2).flatten().mapNotNull { g.openRally(it) }.maxByOrNull { it.timeSec }?.let { r ->
            val latest = maxOf(rally.value?.timeSec ?: 0L, rallyClearedAt)
            if (r.timeSec > latest) {
                rallyMine = false
                saveRally(c, if (r.removed) null else r, r.timeSec)
                if (!r.removed) DebugStatus.log("Crew meet-up: ${r.name}")
            }
        }
    }

    // ---- Crew pings ----

    /** Recent pings from the crew, newest first (Compose state for the home screen). */
    val pings = androidx.compose.runtime.mutableStateListOf<GigGroup.Ping>()
    private val seenPings = HashSet<String>()

    /** Send a quick message to the whole crew. Arrives within about a minute. */
    fun sendPing(c: Context, kind: Int, lat: Double? = null, lon: Double? = null) {
        val g = group.value ?: return
        val app = c.applicationContext
        val p = GigGroup.Ping(kind, VisibilityPrefs.myName(app).ifBlank { "Mate" }, System.currentTimeMillis() / 1000, lat, lon)
        val blob = g.sealPing(p)
        seenPings += blob.contentHashCode().toString()
        scope.launch {
            val epoch = Math.floorDiv(System.currentTimeMillis(), EphemeralId.DEFAULT_ROTATION_MS)
            val ok = RelayClient.put(g.pingIdForEpoch(epoch), blob)
            DebugStatus.log(if (ok) "Ping sent: ${pingText(kind)}" else "Ping not sent (no internet?)")
        }
    }

    private fun onPing(c: Context, p: GigGroup.Ping, blob: ByteArray) {
        if (!seenPings.add(blob.contentHashCode().toString())) return
        if (System.currentTimeMillis() / 1000 - p.timeSec > 20 * 60) return // stale
        // Where they were when they sent it: put it on the map too.
        if (p.lat != null && p.lon != null) {
            FriendsRepository.friends.firstOrNull { it.name.equals(p.from, true) }?.let {
                LocationBook.update(it.id, nz.waveformlabs.moshpoint.core.SharedLocation(p.lat, p.lon, p.timeSec, 30))
            }
        }
        pings.add(0, p)
        while (pings.size > 20) pings.removeAt(pings.size - 1)
        CrewNotifications.ping(c, p)
    }

    /** What a ping says, e.g. "is coming to you". */
    fun pingText(kind: Int) = when (kind) {
        GigGroup.Ping.COMING -> "is on their way"
        GigGroup.Ping.STAY_PUT -> "says stay where you are"
        GigGroup.Ping.WHERE_ARE_YOU -> "is asking where you are"
        GigGroup.Ping.MEET_AT_PIN -> "says meet at the pin"
        GigGroup.Ping.ALL_GOOD -> "is all good"
        GigGroup.Ping.GOING_HOME -> "is heading home"
        GigGroup.Ping.NEED_HELP -> "NEEDS HELP"
        else -> "pinged the crew"
    }

    // ---- Crew meet-up pin ----

    /** Where the crew is meeting, if anyone has dropped a pin (Compose state for map + home). */
    val rally = mutableStateOf<GigGroup.Rally?>(null)
    private var rallyMine = false
    private var rallyPostedAt = 0L
    private var rallyClearedAt = 0L

    /** Drop (or move) the crew's meet-up pin. Everyone in the crew gets it within a minute or so. */
    fun setRally(c: Context, name: String, lat: Double, lon: Double) {
        val r = GigGroup.Rally(lat, lon, name.trim().ifBlank { "Meet here" }.take(24), System.currentTimeMillis() / 1000)
        rallyMine = true
        rallyPostedAt = 0L
        saveRally(c, r, r.timeSec)
        postRallyNow(c)
    }

    /** Remove the pin for everyone. */
    fun clearRally(c: Context) {
        val r = GigGroup.Rally(0.0, 0.0, "", System.currentTimeMillis() / 1000)
        rallyMine = false
        saveRally(c, null, r.timeSec)
        val g = group.value ?: return
        scope.launch { RelayClient.put(g.rallyIdForDay(Math.floorDiv(r.timeSec, 86_400L)), g.sealRally(r)) }
    }

    private fun postRallyNow(c: Context) {
        val g = group.value ?: return
        val r = rally.value ?: return
        scope.launch {
            if (RelayClient.put(g.rallyIdForDay(Math.floorDiv(r.timeSec, 86_400L)), g.sealRally(r))) {
                rallyPostedAt = System.currentTimeMillis()
            }
        }
    }

    private fun saveRally(c: Context, r: GigGroup.Rally?, timeSec: Long) {
        // A removal still counts as "newer": remember when, so an older pin can't come back.
        rally.value = r
        if (r == null) rallyClearedAt = timeSec
        val e = prefs(c.applicationContext).edit()
        if (r == null) e.remove("rally") else e.putString("rally", "${r.lat},${r.lon},${r.timeSec},${r.name.replace(',', ' ')}")
        e.putBoolean("rallyMine", rallyMine).putLong("rallyCleared", rallyClearedAt).apply()
    }

    private fun received(c: Context, g: GigGroup, blob: ByteArray) {
        val intro = g.openIntro(blob, System.currentTimeMillis()) ?: return
        if (intro.secret.contentEquals(VisibilityPrefs.mySecret(c))) return // our own
        if (FriendsRepository.addFromIntro(intro.secret, intro.name)) {
            DebugStatus.log("Gig group: ${intro.name} joined")
        }
        markMember(c, intro.secret)
    }

    /** Listens through the app's one shared scan (see BleHub). Fast while the app is open. */
    private fun startListening(c: Context, g: GigGroup) {
        val adapter = c.getSystemService(BluetoothManager::class.java)?.adapter ?: return
        if (!adapter.isLeExtendedAdvertisingSupported) {
            DebugStatus.set("Gig group", "Bluetooth intros unavailable on this phone (internet only)")
            return
        }
        BleHub.subscribe(c, this, BleHub.Sub(listOf(INTRO_UUID), fast = appOpen, unfiltered = false) { r ->
            r.scanRecord?.getServiceData(INTRO_UUID)?.let { received(c, g, it) }
        })
        listening = true
        DebugStatus.set("Gig group", "${g.name}: listening for members")
    }

    @SuppressLint("MissingPermission")
    private fun advertise(c: Context, intro: ByteArray) {
        val adapter = c.getSystemService(BluetoothManager::class.java)?.adapter ?: return
        if (!adapter.isEnabled || !adapter.isLeExtendedAdvertisingSupported) return
        val data = AdvertiseData.Builder().addServiceData(INTRO_UUID, intro).build()
        try {
            val set = advertSet
            if (set != null) {
                set.setAdvertisingData(data)
                return
            }
            if (advertCallback != null) return // start pending
            val cb = object : AdvertisingSetCallback() {
                // Only the current set may change state: callbacks from a set we already
                // stopped can arrive late.
                override fun onAdvertisingSetStarted(s: AdvertisingSet?, txPower: Int, status: Int) {
                    if (advertCallback !== this) return
                    if (status == AdvertisingSetCallback.ADVERTISE_SUCCESS) advertSet = s else advertCallback = null
                }

                override fun onAdvertisingSetStopped(s: AdvertisingSet?) {
                    if (advertCallback !== this) return
                    advertSet = null
                    advertCallback = null
                }
            }
            advertCallback = cb
            adapter.bluetoothLeAdvertiser?.startAdvertisingSet(
                AdvertisingSetParameters.Builder()
                    .setLegacyMode(false).setConnectable(false).setScannable(false)
                    .setInterval(AdvertisingSetParameters.INTERVAL_MEDIUM) // ~250 ms: each intro in the rotation gets heard
                    .setTxPowerLevel(AdvertisingSetParameters.TX_POWER_MEDIUM)
                    .setPrimaryPhy(BluetoothDevice.PHY_LE_1M).setSecondaryPhy(BluetoothDevice.PHY_LE_1M)
                    .build(),
                data, null, null, null, cb,
            )
        } catch (e: Exception) {
            Log.w(TAG, "group advert failed", e)
            advertCallback = null
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopRadio(c: Context) {
        job?.cancel()
        job = null
        if (listening) BleHub.unsubscribe(c, this)
        listening = false
        val adapter = c.getSystemService(BluetoothManager::class.java)?.adapter
        try {
            advertCallback?.let { adapter?.bluetoothLeAdvertiser?.stopAdvertisingSet(it) }
        } catch (_: Exception) {
        }
        advertCallback = null
        advertSet = null
    }
}
