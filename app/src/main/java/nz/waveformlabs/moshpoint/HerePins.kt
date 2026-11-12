package nz.waveformlabs.moshpoint

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.Floor
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.HereBook
import nz.waveformlabs.moshpoint.core.HereRule
import nz.waveformlabs.moshpoint.core.HereWatch
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.locate.MotionDetector
import nz.waveformlabs.moshpoint.locate.MyLocation
import nz.waveformlabs.moshpoint.venue.Floors

/**
 * "I'm here" on the phone (docs/IM_HERE.md; every rule is in core `Here.kt`):
 *  - the main crew's pins as Compose state for the map, the radar and the finder;
 *  - setting and clearing ours: sealed and signed here, then the courier gets them out
 *    (relay, Bluetooth, crowd relay) like the meet-up pin;
 *  - while ours stands and the app is open or we're live, watching for us walking away from
 *    it or changing floor, and clearing it when we do.
 *
 * Only the main crew, and never while following from home: the pin is for finding each other
 * at the venue. Everything runs on the main thread.
 */
object HerePins {
    /** Friend id -> their standing pin. */
    val pins = mutableStateMapOf<String, GigGroup.Here>()

    /** Friend id -> the floor of the spot they pinned, relative to us now (from the pin's own pressure). */
    val floors = mutableStateMapOf<String, Floor>()

    /** Our own standing pin, or null. */
    val mine = mutableStateOf<GigGroup.Here?>(null)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val book = HereBook()
    private var bookCrew: String? = null
    private var saved = ""
    private var app: Context? = null
    private var loop: Job? = null

    private fun now() = System.currentTimeMillis()

    fun init(c: Context) {
        if (app != null) return
        app = c.applicationContext
        loop = scope.launch {
            while (true) {
                runCatching { refresh() }
                delay(5_000)
            }
        }
    }

    /** Can we say "I'm here" right now: in a crew, on gig day, not following from home? */
    fun canSend(): Boolean {
        val g = GroupSync.group.value ?: return false
        return !GroupSync.following && !g.dormant(now())
    }

    /** [friendId]'s pin, if it stands (read by the finder: see GpsFinder). */
    fun pinOf(friendId: String): GigGroup.Here? = pins[friendId]?.takeIf { HereRule.live(it, now() / 1000) }

    /** Put our face on this spot for the crew. False if it couldn't be sent (no crew, or not now). */
    fun setHere(c: Context, lat: Double, lon: Double): Boolean {
        val a = c.applicationContext
        init(a)
        val g = GroupSync.group.value ?: return false
        if (!canSend()) return false
        useCrew(a, g)
        val signer = Identity.signer(a, g)
        // On the crew's message clock (never behind what we've seen there), and after our last pin.
        val t = HereRule.stamp(OfflineMessages.stamp(a, g), book.newestFrom(signer.tag))
        val h = GigGroup.Here(t, HereRule.LIFETIME_MIN, lat, lon, Floors.pressureUnits())
        val m = OfflineMessages.post(a, g, g.sealHere(h, signer)) ?: return false
        m.here?.let { book.offer(it, now() / 1000) }
        DebugStatus.log("I'm here: pinned" + (if (h.pressure == null) " (no pressure sensor: no floor)" else ""))
        save(a)
        refresh()
        return true
    }

    /** Take our pin down for everyone (✕ on the map, or we walked away). */
    fun clearHere(c: Context) {
        val a = c.applicationContext
        init(a)
        val g = GroupSync.group.value ?: return
        useCrew(a, g)
        val own = mine.value ?: return
        val nowSec = now() / 1000
        val signer = Identity.signer(a, g)
        val t = HereRule.stamp(OfflineMessages.stamp(a, g), book.newestFrom(signer.tag))
        // It matters for as long as the pin it clears would have stood.
        val clear = GigGroup.Here(t, HereRule.clearMinutes(own, nowSec), 0.0, 0.0, null, clear = true)
        OfflineMessages.post(a, g, g.sealHere(clear, signer))?.here?.let { book.offer(it, nowSec) }
        save(a)
        refresh()
    }

    /** An "I'm here" (or clear) for crew [g], from the relay or by Bluetooth. */
    fun arrived(c: Context, g: GigGroup, h: GigGroup.Here) {
        val a = c.applicationContext
        init(a)
        val main = GroupSync.group.value ?: return
        if (!main.key.contentEquals(g.key) || GroupSync.following) return
        useCrew(a, main)
        val changed = book.offer(h, now() / 1000)
        save(a)
        if (changed) refresh()
    }

    /** The book belongs to the main crew: when that changes, start the new crew's (pins don't follow you between crews). */
    private fun useCrew(c: Context, g: GigGroup?) {
        val id = g?.let { GigArchive.idFor(it) }
        if (id == bookCrew) return
        bookCrew = id
        val p = prefs(c)
        if (id != null && p.getString("crew", null) == id) book.restore(p.getString("book", null), now() / 1000) else book.clear()
        saved = ""
    }

    private fun save(c: Context) {
        val id = bookCrew ?: return
        val snap = book.snapshot()
        if (snap == saved) return
        saved = snap
        prefs(c).edit().putString("crew", id).putString("book", snap).apply()
    }

    private fun prefs(c: Context) = c.getSharedPreferences("here", Context.MODE_PRIVATE)

    /** Bring the Compose state in line with the book: pins that ran out go, senders become friends. */
    private fun refresh() {
        val c = app ?: return
        val g = GroupSync.group.value
        useCrew(c, g)
        val nowSec = now() / 1000
        if (book.expire(nowSec)) save(c)
        val myTag = g?.let { Identity.tag(c, it) }
        val byFriend = HashMap<String, GigGroup.Here>()
        var own: GigGroup.Here? = null
        if (g != null && !GroupSync.following) {
            for (h in book.standing(nowSec)) {
                if (h.sender == myTag) own = h else friendOf(h.sender)?.let { byFriend[it] = h }
            }
        }
        pins.keys.retainAll(byFriend.keys)
        byFriend.forEach { (id, h) -> if (pins[id] != h) pins[id] = h }
        if (mine.value != own) mine.value = own
        // The spot's own floor, from the pressure in the pin (core FloorTracker.pinned).
        val tags = byFriend.mapNotNull { (id, h) -> Floors.pinnedFloor(id, h.pressure, h.timeSec)?.let { id to it } }.toMap()
        floors.keys.retainAll(tags.keys)
        tags.forEach { (id, f) -> if (floors[id] != f) floors[id] = f }
        watchOwn(c, own)
    }

    private fun friendOf(tag: Long): String? =
        GroupSync.secretOfTag(tag)?.let { s -> FriendsRepository.friends.firstOrNull { it.secret.contentEquals(s) }?.id }

    // ---- Walking away from our own pin (core HereWatch) ----

    private var watch: HereWatch? = null
    private var watchFor = 0L
    private var watchJobs = emptyList<Job>()
    private var motion: MotionDetector? = null

    /** While our pin stands and the app is open or we're live (the times our location is shared anyway). */
    private fun watchOwn(c: Context, own: GigGroup.Here?) {
        if (own == null || !GroupSync.inUse) {
            stopSensors()
            if (own == null) {
                watch = null
                watchFor = 0L
            }
            return
        }
        if (own.id != watchFor) {
            stopSensors()
            watch = HereWatch(own)
            watchFor = own.id
        }
        if (watchJobs.isNotEmpty()) return
        val w = watch ?: return
        val hasMotion = runCatching { c.getSystemService(SensorManager::class.java)?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) != null }.getOrDefault(false)
        val md = MotionDetector(c).also { it.start() }
        motion = md
        watchJobs = listOf(
            scope.launch {
                MyLocation(c).updates(intervalMs = 10_000, minDistanceM = 0f).collect { loc ->
                    w.onLocation(LatLon(loc.latitude, loc.longitude), loc.accuracy.toDouble(), hasMotion)?.let { left(c, it) }
                }
            },
            scope.launch {
                while (true) {
                    delay(1_000)
                    val t = now()
                    w.onMotion(md.moving, t)
                    Floors.currentHpa()?.let { p -> w.onPressure(p, t)?.let { left(c, it) } }
                }
            },
        )
    }

    private fun stopSensors() {
        watchJobs.forEach { it.cancel() }
        watchJobs = emptyList()
        motion?.stop()
        motion = null
    }

    private fun left(c: Context, why: HereWatch.Left) {
        if (mine.value == null) return
        DebugStatus.log(if (why == HereWatch.Left.OTHER_FLOOR) "I'm here: cleared (changed floor)" else "I'm here: cleared (walked away)")
        stopSensors()
        clearHere(c)
    }
}
