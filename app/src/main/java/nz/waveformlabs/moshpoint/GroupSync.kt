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
import nz.waveformlabs.moshpoint.core.CheckIns
import nz.waveformlabs.moshpoint.core.Courier
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.PinRule
import nz.waveformlabs.moshpoint.core.PingPolicy
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

    // ---- Crew mates' signing keys, by crew pass ----

    private val pubs = HashMap<String, ByteArray>()
    private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }

    /** Remember which signing key belongs to which crew mate (from their intro). First one wins. */
    private fun rememberPub(c: Context, secret: ByteArray, pub: ByteArray?) {
        pub ?: return
        val k = hex(secret)
        if (pubs.containsKey(k)) return
        pubs[k] = pub
        prefs(c.applicationContext).edit().putString("pubs", pubs.entries.joinToString(",") { "${it.key}:${Base64.encodeToString(it.value, Base64.NO_WRAP)}" }).apply()
    }

    /** A crew mate's signing key, if we've had their intro. */
    fun pubOf(secret: ByteArray): ByteArray? = pubs[hex(secret)]

    /** The crew pass of whoever signs with [tag], if they're in our crew. */
    fun secretOfTag(tag: Long): ByteArray? = pubs.entries.firstOrNull { nz.waveformlabs.moshpoint.core.CrewKeys.tagOf(it.value) == tag }
        ?.key?.chunked(2)?.map { it.toInt(16).toByte() }?.toByteArray()

    private fun loadPubs(c: Context) {
        pubs.clear()
        prefs(c).getString("pubs", null)?.split(',')?.forEach { e ->
            val k = e.substringBefore(':')
            runCatching { pubs[k] = Base64.decode(e.substringAfter(':'), Base64.NO_WRAP) }
        }
    }

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
        OfflineMessages.init(c)
        CrewChat.load(c)
        val p = prefs(c)
        Crews.load(c)
        Crews.dropExpired(c)
        val key = p.getString("key", null) ?: return promoteNext(c)
        val created = p.getLong("created", 0)
        val g = GigGroup(
            Base64.decode(key, Base64.NO_WRAP), p.getString("name", null) ?: Txt.s(R.string.crew_default_group_name), created,
            p.getLong("at", 0L), p.getString("venue", "") ?: "",
            p.getString("vlat", null)?.toDoubleOrNull(), p.getString("vlon", null)?.toDoubleOrNull(),
        )
        followingState.value = p.getBoolean("following", false)
        if (System.currentTimeMillis() > g.expiresAtMs) {
            // The night's over: close the crew. The photos and clips stay in Your gigs.
            val hadMoments = runCatching { java.io.File(java.io.File(c.filesDir, "gigs"), GigArchive.idFor(g)).list()?.isNotEmpty() == true }.getOrDefault(false)
            clear(c)
            CrewNotifications.post(
                c, title = Txt.s(R.string.crew_notif_done_title, g.name),
                text = if (hadMoments) Txt.s(R.string.crew_notif_done_saved) else Txt.s(R.string.crew_notif_done_text),
                openMap = false,
            )
            return
        }
        group.value = g
        // The main crew is still asleep but a waiting one is sooner: that one goes first.
        val sooner = Crews.others.firstOrNull()
        if (sooner != null && g.dormant(System.currentTimeMillis()) && Crews.sortKey(sooner.group) < Crews.sortKey(g)) {
            stashActive(c)
            activate(c, sooner)
            return
        }
        CrewChat.show(c, g)
        GigWake.schedule(c, g)
        // A pin (or a removal) saved with a date far ahead would beat every later one: cut it back.
        val nowSec = System.currentTimeMillis() / 1000
        rallyClearedAt = PinRule.capped(p.getLong("rallyCleared", 0L), nowSec)
        rallyMine = p.getBoolean("rallyMine", false)
        rally.value = p.getString("rally", null)?.split(',', limit = 4)?.takeIf { it.size == 4 }?.let {
            runCatching { GigGroup.Rally(it[0].toDouble(), it[1].toDouble(), it[3], PinRule.capped(it[2].toLong(), nowSec)) }.getOrNull()
        }
        checkInState = CheckIns.restore(p.getString("checkins", null))
        members.clear()
        p.getString("members", null)?.split(',')?.filter { it.length == 64 }?.let { members.addAll(it) }
        loadPubs(c)
    }

    /** The crew most recently made or joined (main or Up next): its QR is the one to show. */
    val newest = mutableStateOf<GigGroup?>(null)

    /** Returns the new crew. It only becomes the main crew if it's the soonest (see [set]). */
    fun startNew(c: Context, name: String, startsAtSec: Long = 0L, venue: String = "", venueLat: Double? = null, venueLon: Double? = null): GigGroup {
        val g = GigGroup.create(name, System.currentTimeMillis(), startsAtSec = startsAtSec, venue = venue, venueLat = venueLat, venueLon = venueLon)
        set(c.applicationContext, g, following = false)
        return g
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
        val name = (if (following) GigGroup.FOLLOWER_MARK else "") + VisibilityPrefs.myName(app).ifBlank { Txt.s(R.string.crew_default_name) }
        syncServer(app, g, g.sealIntro(Identity.intro(app, g, name), now), now)
    }

    /** Loved ones following this crew from home (names), so everyone knows who can see. */
    val followers = androidx.compose.runtime.mutableStateListOf<String>()

    /** Returns false if [qrText] isn't a group QR. A follow-along invite joins as a follower. */
    fun join(c: Context, qrText: String): Boolean {
        val g = GigGroup.parseQr(qrText, System.currentTimeMillis()) ?: return false
        val app = c.applicationContext
        Crews.load(app)
        val same = group.value?.key?.contentEquals(g.key) == true
        val waiting = Crews.find(g.key)
        val asFollower = GigGroup.isFollowInvite(qrText)
        // A crew member who opens a follow link stays a crew member.
        val main = when {
            same -> true
            waiting != null -> { newest.value = waiting.group; false }
            else -> set(app, g, asFollower)
        }
        // The person whose QR it was is in it: add them now, no waiting for an intro.
        GigGroup.hostOf(qrText)?.let { host ->
            if (Identity.isMine(app, host.secret)) return@let
            if (!main) {
                Crews.addMate(app, g.key, host.secret, host.name)
                return@let
            }
            run {
                FriendsRepository.unremove(host.secret)
                FriendsRepository.addFromIntro(host.secret, host.name)
                rememberPub(app, host.secret, host.pub)
            }
        }
        return true
    }

    /**
     * A new crew. It becomes the main crew if it's sooner than the current one (and the
     * current one isn't on right now); otherwise it waits in Up next. Never replaces a crew.
     * Returns true if it's now the main crew.
     */
    private fun set(c: Context, g: GigGroup, following: Boolean): Boolean {
        runCatching { GigArchive.remember(c, g) }
        newest.value = g
        ChatSync.schedule(c)
        val cur = group.value
        val now = System.currentTimeMillis()
        if (cur != null && !cur.key.contentEquals(g.key) && now < cur.expiresAtMs) {
            if (!cur.dormant(now) || Crews.sortKey(g) >= Crews.sortKey(cur)) {
                Crews.put(c, Crews.fresh(g, following))
                return false
            }
            stashActive(c)
        }
        followingState.value = following
        if (following) FollowCheck.schedule(c) else FollowCheck.cancel(c)
        CrewChat.show(c, g)
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
            .putBoolean("following", following)
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
        return true
    }

    /**
     * The main crew moved to a new key (someone was removed, or the invite was reset): same
     * crew, same mates (minus whoever signs with [removedPub]), new key from now on.
     */
    fun adoptKey(c: Context, fresh: GigGroup, removedPub: ByteArray?) {
        val app = c.applicationContext
        val removedTag = removedPub?.let { nz.waveformlabs.moshpoint.core.CrewKeys.tagOf(it) }
        if (removedTag != null) {
            secretOfTag(removedTag)?.let { s ->
                FriendsRepository.friends.firstOrNull { it.gigGroupOnly && it.secret.contentEquals(s) }?.let { FriendsRepository.remove(it.id) }
                pubs.remove(hex(s))
            }
        }
        prefs(app).edit().putString("key", Base64.encodeToString(fresh.key, Base64.NO_WRAP))
            .putString("pubs", pubs.entries.joinToString(",") { "${it.key}:${Base64.encodeToString(it.value, Base64.NO_WRAP)}" }).commit()
        group.value = fresh
        GigWake.schedule(app, fresh)
        DebugStatus.log("Crew moved to a new key")
        if (users > 0) restart(app)
    }

    // ---- Several crews (see Crews) ----

    private val longKeys = setOf("created", "at", "rallyCleared")
    private val boolKeys = setOf("following", "rallyMine")

    /** Put the main crew aside in Up next, keeping its settings and crew-only mates. */
    private fun stashActive(c: Context) {
        val g = group.value ?: return
        val settings = org.json.JSONObject()
        prefs(c).all.forEach { (k, v) -> if (v != null) settings.put(k, v) }
        val mates = FriendsRepository.friends.filter { it.gigGroupOnly && !FriendsRepository.isSimulated(it.id) }.map { it.secret to it.name }
        Crews.put(c, Crews.Entry(g, following, settings, mates))
        resetActive(c)
    }

    /** Make a waiting crew the main one: its settings and mates come back. */
    private fun activate(c: Context, e: Crews.Entry) {
        Crews.remove(c, e.id)
        val ed = prefs(c).edit().clear()
        e.settings.keys().forEach { k ->
            when (k) {
                in longKeys -> ed.putLong(k, e.settings.optLong(k))
                in boolKeys -> ed.putBoolean(k, e.settings.optBoolean(k))
                else -> ed.putString(k, e.settings.optString(k))
            }
        }
        ed.commit()
        FriendsRepository.clearGigGroup()
        e.mates.forEach { (secret, name) -> FriendsRepository.addFromIntro(secret, name) }
        load(c)
        if (following) FollowCheck.schedule(c) else FollowCheck.cancel(c)
        DebugStatus.log("Main crew now: ${e.group.name}")
        if (users > 0) restart(c)
    }

    /**
     * Two gigs on the same day: you choose which crew is the main one (finding, Bluetooth,
     * flares). The other waits in Up next with everything kept.
     */
    fun makeMain(c: Context, e: Crews.Entry) {
        val app = c.applicationContext
        if (group.value?.key?.contentEquals(e.group.key) == true) return
        stashActive(app)
        activate(app, e)
    }

    /** No main crew (or it just ended): the soonest waiting crew steps up. */
    private fun promoteNext(c: Context) {
        Crews.dropExpired(c)
        val next = Crews.others.firstOrNull() ?: return
        activate(c, next)
    }

    /** "End night": leave the group and drop its members. */
    fun clear(c: Context) {
        val app = c.applicationContext
        group.value?.let {
            CrewChat.forget(app, it)
            Identity.forget(app, it)
        }
        resetActive(app)
        promoteNext(app)
    }

    /** Drop a crew waiting in Up next. */
    fun leave(c: Context, e: Crews.Entry) {
        CrewChat.forget(c.applicationContext, e.group)
        Identity.forget(c.applicationContext, e.group)
        Crews.remove(c.applicationContext, e.id)
    }

    private fun resetActive(c: Context) {
        val app = c.applicationContext
        prefs(app).edit().clear().commit()
        group.value = null
        followingState.value = false
        followers.clear()
        FollowCheck.cancel(app)
        GigWake.cancel(app)
        Moments.clear()
        runCatching { CrewWidget.update(app, emptyList()) }
        members.clear()
        pubs.clear()
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
        val follower = following
        // Followers are marked so the crew lists them apart; they never use Bluetooth.
        val myName = (if (follower) GigGroup.FOLLOWER_MARK else "") + VisibilityPrefs.myName(c).ifBlank { Txt.s(R.string.crew_default_name) }
        if (!follower) startListening(c, g)
        postedEpoch = Long.MIN_VALUE
        startedAtMs = System.currentTimeMillis()
        job = scope.launch {
            var lastServer = 0L
            var slot = 0
            // Sealed intros, re-made once per rotation (the tag must keep changing). Reusing
            // the bytes within a rotation lets the server de-duplicate repeat posts.
            val sealed = HashMap<String, Pair<Long, ByteArray>>()
            fun introFor(intro: GigGroup.Intro, now: Long): ByteArray {
                val epoch = Math.floorDiv(now, EphemeralId.DEFAULT_ROTATION_MS)
                val k = intro.secret.joinToString("") { "%02x".format(it) }
                sealed[k]?.let { if (it.first == epoch) return it.second }
                return g.sealIntro(intro, now).also { sealed[k] = epoch to it }
            }
            // Our pass in this crew (never our permanent identity) and our signing key.
            val myIntro = Identity.intro(c, g, myName)
            while (true) {
                val now = System.currentTimeMillis()
                val mine = introFor(myIntro, now)
                // Gossip: every other slot we pass on a crew member we know about, so the
                // whole crew spreads through the room even if two of them never get close.
                val members = FriendsRepository.friends.filter { it.gigGroupOnly }
                val out = if (slot % 2 == 1 && members.isNotEmpty()) {
                    val m = members[(slot / 2) % members.size]
                    introFor(GigGroup.Intro(m.secret, m.name, pubOf(m.secret)), now)
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
        // (Our meet-up pin is kept on the relay by the courier: see OfflineMessages.)
        // One request for everything the crew shares: intros, meet-up pin, pings, and where
        // each crew member is (so the home screen and notification show distances without
        // anyone opening the map).
        val crew = FriendsRepository.friends.filter { (it.gigGroupOnly || it.key in members) && !FriendsRepository.isSimulated(it.id) }.take(60)
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
        CrewChat.tick(c)
        ChatSync.pollAll(c, minGapMs = 120_000)
        val found = RelayClient.lookup(ids) ?: return
        found.subList(0, 2).flatten().forEach { received(c, g, it) }
        // The courier notes what's on the relay, so nothing it carries is uploaded twice.
        OfflineMessages.fetched(c, g, Courier.Box.PING, found.subList(4, 6).flatten())
        OfflineMessages.fetched(c, g, Courier.Box.PIN, found.subList(2, 4).flatten())
        found.subList(4, 6).flatten().forEach { blob -> g.openPing(blob)?.let { onPing(c, it, blob) } }
        crewIds.forEachIndexed { i, (f, id) ->
            found[6 + i].forEach { sealed -> LocationBox.open(f.secret, id, sealed)?.let { LocationBook.update(f.id, it) } }
        }
        CrewStatus.refresh(c)
        val rallyBoxes = found.subList(2, 4)
        // Newest pin from anyone in the crew wins (including "removed"), unless it's dated in the future.
        rallyBoxes.flatten().mapNotNull { g.openRally(it) }.sortedBy { it.timeSec }.forEach { onRally(c, it) }
    }

    /** A meet-up pin from the crew, by the relay or by Bluetooth. The newest wins (see core PinRule). */
    internal fun onRally(c: Context, r: GigGroup.Rally) {
        val latest = maxOf(rally.value?.timeSec ?: 0L, rallyClearedAt)
        if (!PinRule.accepts(r.timeSec, latest, System.currentTimeMillis() / 1000)) return
        rallyMine = false
        saveRally(c, if (r.removed) null else r, r.timeSec)
        if (!r.removed) DebugStatus.log("Crew meet-up: ${r.name}")
    }

    /**
     * While the chat is open: fetch just the crew's pings (chat, plan, flares) now. Works for
     * a crew that's asleep until gig day too, without waking Bluetooth or location.
     */
    suspend fun pollPingsNow(c: Context) {
        ChatSync.pollAll(c, minGapMs = 10_000)
        val g = group.value ?: return
        if (g.dormant(System.currentTimeMillis())) return
        val epoch = Math.floorDiv(System.currentTimeMillis(), EphemeralId.DEFAULT_ROTATION_MS)
        val found = RelayClient.lookup(listOf(g.pingIdForEpoch(epoch), g.pingIdForEpoch(epoch - 1))) ?: return
        OfflineMessages.fetched(c, g, Courier.Box.PING, found.flatten())
        found.flatten().forEach { blob -> g.openPing(blob)?.let { onPing(c, it, blob) } }
    }

    // ---- Crew pings ----

    /** Recent pings from the crew, newest first (Compose state for the home screen). */
    val pings = androidx.compose.runtime.mutableStateListOf<GigGroup.Ping>()
    private val seenPings = HashSet<String>()

    /**
     * Send a quick message to the whole crew. Sealed once, then the courier gets it there: the
     * relay with signal (about a minute), crew phones nearby and the crowd relay without.
     */
    fun sendPing(c: Context, kind: Int, lat: Double? = null, lon: Double? = null, minutes: Int = 0, text: String = "", quiet: Boolean = false) {
        val g = group.value ?: return
        val app = c.applicationContext
        // "Meet at the pin" says which pin, so it still makes sense if the pin itself arrives later.
        val words = if (kind == GigGroup.Ping.MEET_AT_PIN && text.isEmpty()) rally.value?.name.orEmpty() else text
        // Pings go to a small mailbox: keep the text short enough that signed ones always fit.
        val short = words.toByteArray(Charsets.UTF_8).let { b -> if (b.size <= 80) words else String(b, 0, 80, Charsets.UTF_8).trimEnd('\uFFFD') }
        val p = GigGroup.Ping(kind, VisibilityPrefs.myName(app).ifBlank { Txt.s(R.string.crew_default_name) }, OfflineMessages.stamp(app, g), lat, lon, minutes, short, Identity.tag(app, g))
        val blob = g.sealPing(p, Identity.signer(app, g))
        seenPings += blob.contentHashCode().toString()
        if (!quiet) NightStats.ping(app)
        // The bubble shows how it's going, like a chat message (it used to say "sent" regardless).
        CrewChat.pingLine(app, g.openPing(blob) ?: p, mine = true, state = OfflineMessages.firstState())
        if (kind == GigGroup.Ping.MEET_AT_PIN) repostRally(app, g)
        if (OfflineMessages.post(app, g, blob) == null) DebugStatus.log("Ping not queued: ${pingText(kind)}")
    }

    /** A quick ping that arrived over Bluetooth (or was kept in the chat mailbox): handled like one from the ping mailbox. */
    internal fun arrived(c: Context, p: GigGroup.Ping, blob: ByteArray) = onPing(c, p, blob)

    private fun onPing(c: Context, signed: GigGroup.Ping, blob: ByteArray) {
        if (!seenPings.add(blob.contentHashCode().toString())) return
        if (signed.sender == 0L) return // unsigned: could be anyone claiming any name
        val nowSec = System.currentTimeMillis() / 1000
        // What to do with it depends on its kind and age (core PingPolicy). Need help is never
        // dropped; a kind this build doesn't know is ignored rather than announced.
        val verdict = PingPolicy.onArrival(signed.kind, signed.timeSec, signed.minutes, nowSec)
        if (!verdict.show) return
        val g = group.value ?: return
        if (signed.sender == Identity.tag(c, g)) return // our own
        // Two people with one name are shown apart ("Jo", "Jo (2)"): nobody can pass as someone else.
        val p = signed.copy(from = CrewChat.displayName(c, g, signed.sender, signed.from))
        // Where they were when they sent it: on the map too, but only on the sender's own pin
        // (and not from a ping that's only just arrived after a long time).
        val lat = p.lat
        val lon = p.lon
        val who = secretOfTag(p.sender)?.let { s -> FriendsRepository.friends.firstOrNull { it.secret.contentEquals(s) } }
        if (lat != null && lon != null && who != null && !verdict.late) {
            LocationBook.update(who.id, nz.waveformlabs.moshpoint.core.SharedLocation(lat, lon, p.timeSec, 30))
        }
        if (p.kind == GigGroup.Ping.CHAT || p.kind == GigGroup.Ping.FLARE || p.kind == GigGroup.Ping.PLAN) {
            val note = CrewChat.received(c, p) ?: return
            if (p.kind != GigGroup.Ping.CHAT || !CrewChat.open) {
                CrewNotifications.post(c, title = p.from, text = note, openMap = p.kind == GigGroup.Ping.FLARE, openChat = p.kind != GigGroup.Ping.FLARE)
            }
            return
        }
        if (PingPolicy.group(p.kind) == PingPolicy.Group.CHAT) return // "joined": a chat line, not a ping
        // Check in and Home safe update the state whatever order they arrive in (core CheckIns).
        if (checkInState.onPing(p.sender, p.from, p.kind, p.timeSec, p.minutes, nowSec)) saveCheckIns(c)
        // Already in the chat (the same message by another route, or from before a restart): don't announce it again.
        if (!CrewChat.pingLine(c, p, mine = false)) return
        // Newest by the sender's time first, so a late arrival slots in where it belongs.
        val at = pings.indexOfFirst { it.timeSec < p.timeSec }.let { if (it < 0) pings.size else it }
        pings.add(at, p)
        while (pings.size > 20) pings.removeAt(pings.size - 1)
        if (verdict.alert) CrewNotifications.ping(c, p, if (verdict.late) nz.waveformlabs.moshpoint.ui.ago(nowSec - verdict.timeSec) else null)
    }

    // ---- Check in ("tell the crew if I'm not home in 45 min") ----

    /** Who's heading home and whether they've checked in: kept per person and saved (core CheckIns). */
    private var checkInState = CheckIns()

    private fun saveCheckIns(c: Context) {
        prefs(c.applicationContext).edit().putString("checkins", checkInState.snapshot()).apply()
    }

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
        val due = checkInState.due(System.currentTimeMillis() / 1000)
        if (due.isEmpty()) return
        saveCheckIns(c)
        for (d in due) {
            CrewNotifications.post(
                c, title = Txt.s(R.string.crew_notif_overdue_title, d.name),
                text = Txt.s(R.string.crew_notif_overdue_text),
                urgent = true,
            )
        }
    }

    /** What a ping says, e.g. "is coming to you" (shown after the sender's name). */
    fun pingText(kind: Int): String = Txt.s(
        when (kind) {
            GigGroup.Ping.COMING -> R.string.crew_ping_coming
            GigGroup.Ping.STAY_PUT -> R.string.crew_ping_stay_put
            GigGroup.Ping.WHERE_ARE_YOU -> R.string.crew_ping_where
            GigGroup.Ping.MEET_AT_PIN -> R.string.crew_ping_meet_pin
            GigGroup.Ping.ALL_GOOD -> R.string.crew_ping_all_good
            GigGroup.Ping.GOING_HOME -> R.string.crew_ping_going_home
            GigGroup.Ping.NEED_HELP -> R.string.crew_ping_need_help
            GigGroup.Ping.CHECK_IN -> R.string.crew_ping_check_in
            GigGroup.Ping.HOME_SAFE -> R.string.crew_ping_home_safe
            GigGroup.Ping.CHAT -> R.string.crew_ping_chat
            GigGroup.Ping.FLARE -> R.string.crew_ping_flare
            GigGroup.Ping.PLAN -> R.string.crew_ping_plan
            else -> R.string.crew_ping_other
        },
    )

    /** A whole notification title for a ping from [name] ("Jo is on their way"). */
    fun pingTitle(kind: Int, name: String): String = Txt.s(
        when (kind) {
            GigGroup.Ping.COMING -> R.string.crew_ping_title_coming
            GigGroup.Ping.STAY_PUT -> R.string.crew_ping_title_stay_put
            GigGroup.Ping.WHERE_ARE_YOU -> R.string.crew_ping_title_where
            GigGroup.Ping.MEET_AT_PIN -> R.string.crew_ping_title_meet_pin
            GigGroup.Ping.ALL_GOOD -> R.string.crew_ping_title_all_good
            GigGroup.Ping.GOING_HOME -> R.string.crew_ping_title_going_home
            GigGroup.Ping.NEED_HELP -> R.string.crew_ping_title_need_help
            GigGroup.Ping.CHECK_IN -> R.string.crew_ping_title_check_in
            GigGroup.Ping.HOME_SAFE -> R.string.crew_ping_title_home_safe
            GigGroup.Ping.CHAT -> R.string.crew_ping_title_chat
            GigGroup.Ping.FLARE -> R.string.crew_ping_title_flare
            GigGroup.Ping.PLAN -> R.string.crew_ping_title_plan
            else -> R.string.crew_ping_title_other
        },
        name,
    )

    // ---- Crew meet-up pin ----

    /** Where the crew is meeting, if anyone has dropped a pin (Compose state for map + home). */
    val rally = mutableStateOf<GigGroup.Rally?>(null)
    private var rallyMine = false
    private var rallyClearedAt = 0L

    /** Drop (or move) the crew's meet-up pin. Everyone in the crew gets it within a minute or so. */
    fun setRally(c: Context, name: String, lat: Double, lon: Double) {
        // Stamped just after the pin it replaces, so it wins even if this phone's clock runs slow.
        val t = PinRule.stamp(System.currentTimeMillis() / 1000, maxOf(rally.value?.timeSec ?: 0L, rallyClearedAt))
        val r = GigGroup.Rally(lat, lon, name.trim().ifBlank { Txt.s(R.string.crew_rally_default) }.take(24), t)
        rallyMine = true
        saveRally(c, r, r.timeSec)
        postRally(c, r)
    }

    /** Remove the pin for everyone. */
    fun clearRally(c: Context) {
        val t = PinRule.stamp(System.currentTimeMillis() / 1000, maxOf(rally.value?.timeSec ?: 0L, rallyClearedAt))
        val r = GigGroup.Rally(0.0, 0.0, "", t)
        rallyMine = false
        saveRally(c, null, r.timeSec)
        postRally(c, r)
    }

    /** Signed with our key (a pin used to be something anyone holding the crew key could move as anyone), then over to the courier. */
    private fun postRally(c: Context, r: GigGroup.Rally) {
        val g = group.value ?: return
        val app = c.applicationContext
        OfflineMessages.post(app, g, g.sealRally(r, Identity.signer(app, g)))
    }

    /** "Meet at the pin" sends our own pin along again, so nobody gets the ping without the pin. */
    private fun repostRally(c: Context, g: GigGroup) {
        val r = rally.value?.takeIf { rallyMine } ?: return
        OfflineMessages.post(c, g, g.sealRally(r, Identity.signer(c, g)))
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
        if (Identity.isMine(c, intro.secret)) return // our own
        // Someone we know (same signing key) with a new crew pass: the crew moved to a new key.
        val pub = intro.pub
        if (pub != null && intro.sig != null && pubOf(intro.secret) == null) {
            pubs.entries.firstOrNull { it.value.contentEquals(pub) }?.let { old ->
                val oldSecret = old.key.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
                FriendsRepository.replaceSecret(oldSecret, intro.secret, intro.name)
                pubs.remove(old.key)
            }
        }
        rememberPub(c, intro.secret, intro.pub)
        if (intro.name.startsWith(GigGroup.FOLLOWER_MARK)) {
            // Someone following from home: shown to the crew, never added as a findable mate.
            val who = intro.name.removePrefix(GigGroup.FOLLOWER_MARK).ifBlank { Txt.s(R.string.crew_someone) }
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
