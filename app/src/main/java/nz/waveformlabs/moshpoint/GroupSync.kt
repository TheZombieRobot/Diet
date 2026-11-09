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
import nz.waveformlabs.moshpoint.core.LocationBox
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
    private var startedAtMs = 0L
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
        RelayClient.init(c)
        val p = prefs(c)
        val key = p.getString("key", null) ?: return
        val created = p.getLong("created", 0)
        val g = GigGroup(
            Base64.decode(key, Base64.NO_WRAP), p.getString("name", "Gig group") ?: "Gig group", created,
            p.getLong("at", 0L), p.getString("venue", "") ?: "",
            p.getString("vlat", null)?.toDoubleOrNull(), p.getString("vlon", null)?.toDoubleOrNull(),
        )
        followingState.value = p.getBoolean("following", false)
        if (System.currentTimeMillis() > g.expiresAtMs) {
            // The night's over: close the crew. The photos and clips stay in Your gigs.
            val hadMoments = runCatching { java.io.File(java.io.File(c.filesDir, "gigs"), GigArchive.idFor(g)).list()?.isNotEmpty() == true }.getOrDefault(false)
            clear(c)
            CrewNotifications.post(
                c, title = "${g.name} is done",
                text = if (hadMoments) "Your photos and clips are saved in Your gigs." else "Hope it was a good one. Start a new crew any time.",
                openMap = false,
            )
            return
        }
        group.value = g
        GigWake.schedule(c, g)
        rallyClearedAt = p.getLong("rallyCleared", 0L)
        rallyMine = p.getBoolean("rallyMine", false)
        rally.value = p.getString("rally", null)?.split(',', limit = 4)?.takeIf { it.size == 4 }?.let {
            runCatching { GigGroup.Rally(it[0].toDouble(), it[1].toDouble(), it[3], it[2].toLong()) }.getOrNull()
        }
        members.clear()
        p.getString("members", null)?.split(',')?.filter { it.length == 64 }?.let { members.addAll(it) }
    }

    fun startNew(c: Context, name: String, startsAtSec: Long = 0L, venue: String = "", venueLat: Double? = null, venueLon: Double? = null) {
        followingState.value = false
        prefs(c.applicationContext).edit().putBoolean("following", false).apply()
        set(c.applicationContext, GigGroup.create(name, System.currentTimeMillis(), startsAtSec = startsAtSec, venue = venue, venueLat = venueLat, venueLon = venueLon))
    }

    /** The crew is for a gig that's still days away: everything stays off until the day. */
    val sleeping: Boolean get() = group.value?.dormant(System.currentTimeMillis()) == true

    // ---- Following from home ----

    private val followingState = mutableStateOf(false)

    /** We're following a crew from home: we see their story and whereabouts, and are never findable. */
    val following: Boolean get() = followingState.value

    /**
     * One quiet sync with the app closed (followers' background check): pings, help alerts,
     * check-ins, moments and whereabouts. Posts our follower intro so the crew sees us.
     */
    suspend fun syncOnce(c: Context) {
        val app = c.applicationContext
        if (group.value == null) load(app)
        val g = group.value ?: return
        if (g.dormant(System.currentTimeMillis())) return
        val now = System.currentTimeMillis()
        val name = (if (following) GigGroup.FOLLOWER_MARK else "") + VisibilityPrefs.myName(app).ifBlank { "Mate" }
        syncServer(app, g, g.sealIntro(GigGroup.Intro(VisibilityPrefs.mySecret(app), name), now), now)
    }

    /** Loved ones following this crew from home (names), so everyone knows who can see. */
    val followers = androidx.compose.runtime.mutableStateListOf<String>()

    /** Returns false if [qrText] isn't a group QR. A follow-along invite joins as a follower. */
    fun join(c: Context, qrText: String): Boolean {
        val g = GigGroup.parseQr(qrText, System.currentTimeMillis()) ?: return false
        val app = c.applicationContext
        val same = group.value?.key?.contentEquals(g.key) == true
        val asFollower = GigGroup.isFollowInvite(qrText)
        // A crew member who opens a follow link stays a crew member.
        if (!same) {
            followingState.value = asFollower
            prefs(app).edit().putBoolean("following", asFollower).apply()
            set(app, g)
            if (asFollower) FollowCheck.schedule(app) else FollowCheck.cancel(app)
        }
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
        runCatching { GigArchive.remember(c, g) }
        if (!g.dormant(System.currentTimeMillis())) NightStats.startIfNeeded(c)
        GigWake.schedule(c, g)
        prefs(c).edit()
            .putString("key", Base64.encodeToString(g.key, Base64.NO_WRAP))
            .putString("name", g.name)
            .putLong("created", g.createdAtMs)
            .putLong("at", g.startsAtSec)
            .putString("venue", g.venue)
            .putString("vlat", g.venueLat?.toString())
            .putString("vlon", g.venueLon?.toString())
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
        followingState.value = false
        followers.clear()
        FollowCheck.cancel(app)
        GigWake.cancel(app)
        Moments.clear()
        runCatching { CrewWidget.update(app, emptyList()) }
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
        if (g.dormant(System.currentTimeMillis())) {
            // Hibernating until the gig: no Bluetooth, no relay traffic. Wake on time if the
            // app is still around then (otherwise GigWake's alarm does it).
            DebugStatus.set("Gig group", "${g.name}: sleeping until the day")
            job = scope.launch {
                delay((g.wakeAtSec * 1000 - System.currentTimeMillis()).coerceAtLeast(1_000))
                if (group.value === g && users > 0) restart(c)
            }
            return
        }
        val mySecret = VisibilityPrefs.mySecret(c)
        val follower = following
        // Followers are marked so the crew lists them apart; they never use Bluetooth.
        val myName = (if (follower) GigGroup.FOLLOWER_MARK else "") + VisibilityPrefs.myName(c).ifBlank { "Mate" }
        if (!follower) startListening(c, g)
        postedEpoch = Long.MIN_VALUE
        startedAtMs = System.currentTimeMillis()
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
                if (!follower) advertise(c, out)
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
        // On the free public relay (250 messages a day) post the intro every rotation only for
        // the first half hour, then every third (by then the crew mostly knows each other,
        // and Bluetooth gossip fills gaps). Own server: every rotation.
        val frugal = !RelayClient.ownServer && now - startedAtMs > 30 * 60_000L && epoch % 3 != 0L
        if (epoch != postedEpoch && !frugal && RelayClient.put(g.rosterIdForEpoch(epoch), intro)) postedEpoch = epoch
        val day = Math.floorDiv(now / 1000, 86_400L)
        // Our meet-up pin: post when set, then every 10 min (the public relay only keeps recent posts).
        val myRally = rally.value?.takeIf { rallyMine }
        if (myRally != null && now - rallyPostedAt > 10 * 60_000L) {
            if (RelayClient.put(g.rallyIdForDay(day), g.sealRally(myRally))) rallyPostedAt = now
        }
        // One request for everything the crew shares: intros, meet-up pin, pings, and where
        // each crew member is (so the home screen and notification show distances without
        // anyone opening the map).
        val crew = FriendsRepository.friends.filter { (it.gigGroupOnly || it.key in members) && !FriendsRepository.isSimulated(it.id) }.take(25)
        val crewIds = crew.flatMap { f ->
            val e = f.ephemeralId.epochAt(now)
            listOf(f to f.ephemeralId.idForEpoch(e), f to f.ephemeralId.idForEpoch(e - 1))
        }
        val ids = listOf(
            g.rosterIdForEpoch(epoch), g.rosterIdForEpoch(epoch - 1), g.rallyIdForDay(day), g.rallyIdForDay(day - 1),
            g.pingIdForEpoch(epoch), g.pingIdForEpoch(epoch - 1),
        ) + crewIds.map { it.second }
        Moments.refresh(c, g)
        AvatarSync.publishMine(c) // our face on the crew's tiles (re-shared every couple of hours)
        AvatarSync.fetchFriends(c)
        checkOverdue(c)
        val found = RelayClient.lookup(ids) ?: return
        found.subList(0, 2).flatten().forEach { received(c, g, it) }
        found.subList(4, 6).flatten().forEach { blob -> g.openPing(blob)?.let { onPing(c, it, blob) } }
        crewIds.forEachIndexed { i, (f, id) ->
            found[6 + i].forEach { sealed -> LocationBox.open(f.secret, id, sealed)?.let { LocationBook.update(f.id, it) } }
        }
        CrewStatus.refresh(c)
        val rallyBoxes = found.subList(2, 4)
        // Newest pin from anyone in the crew wins (including "removed").
        rallyBoxes.flatten().mapNotNull { g.openRally(it) }.maxByOrNull { it.timeSec }?.let { r ->
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
    fun sendPing(c: Context, kind: Int, lat: Double? = null, lon: Double? = null, minutes: Int = 0) {
        val g = group.value ?: return
        val app = c.applicationContext
        val p = GigGroup.Ping(kind, VisibilityPrefs.myName(app).ifBlank { "Mate" }, System.currentTimeMillis() / 1000, lat, lon, minutes)
        val blob = g.sealPing(p)
        seenPings += blob.contentHashCode().toString()
        NightStats.ping(app)
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
        val lat = p.lat
        val lon = p.lon
        if (lat != null && lon != null) {
            FriendsRepository.friends.firstOrNull { it.name.equals(p.from, true) }?.let {
                LocationBook.update(it.id, nz.waveformlabs.moshpoint.core.SharedLocation(lat, lon, p.timeSec, 30))
            }
        }
        pings.add(0, p)
        while (pings.size > 20) pings.removeAt(pings.size - 1)
        when (p.kind) {
            GigGroup.Ping.CHECK_IN -> checkIns[p.from] = p.timeSec + p.minutes * 60L
            GigGroup.Ping.HOME_SAFE -> {
                checkIns.remove(p.from)
                overdueAlerted.remove(p.from)
            }
        }
        CrewNotifications.ping(c, p)
    }

    // ---- Check in ("tell the crew if I'm not home in 45 min") ----

    /** Crew members heading home: name -> when they should have checked in (unix s). */
    val checkIns = androidx.compose.runtime.mutableStateMapOf<String, Long>()
    private val overdueAlerted = HashSet<String>()

    /** Our own check-in deadline (unix s), or 0. */
    val myCheckInBy = mutableStateOf(0L)

    /** Heading home: the crew's phones raise the alarm if we don't tap "Home safe" in time. */
    fun startCheckIn(c: Context, minutes: Int, lat: Double?, lon: Double?) {
        myCheckInBy.value = System.currentTimeMillis() / 1000 + minutes * 60L
        sendPing(c, GigGroup.Ping.CHECK_IN, lat, lon, minutes)
    }

    fun homeSafe(c: Context) {
        myCheckInBy.value = 0L
        sendPing(c, GigGroup.Ping.HOME_SAFE)
    }

    /** Called from the sync loop: anyone past their check-in time gets flagged to the crew, once. */
    private fun checkOverdue(c: Context) {
        val now = System.currentTimeMillis() / 1000
        for ((who, by) in checkIns) {
            if (now > by + 120 && overdueAlerted.add(who)) {
                CrewNotifications.post(
                    c, title = "$who hasn't checked in",
                    text = "They were heading home and should be there by now. Give them a call. Tap for their last spot.",
                    urgent = true,
                )
            }
        }
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
        GigGroup.Ping.CHECK_IN -> "is heading home and will check in"
        GigGroup.Ping.HOME_SAFE -> "is home safe"
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
        if (intro.name.startsWith(GigGroup.FOLLOWER_MARK)) {
            // Someone following from home: shown to the crew, never added as a findable mate.
            val who = intro.name.removePrefix(GigGroup.FOLLOWER_MARK).ifBlank { "Someone" }
            if (who !in followers) followers += who
            return
        }
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
