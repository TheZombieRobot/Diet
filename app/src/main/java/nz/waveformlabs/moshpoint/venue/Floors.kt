package nz.waveformlabs.moshpoint.venue

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import androidx.compose.runtime.mutableStateMapOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.FieldRecorder
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.GroupSync
import nz.waveformlabs.moshpoint.Identity
import nz.waveformlabs.moshpoint.core.Baro
import nz.waveformlabs.moshpoint.core.Closeness
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.Floor
import nz.waveformlabs.moshpoint.core.FloorBox
import nz.waveformlabs.moshpoint.core.FloorConfig
import nz.waveformlabs.moshpoint.core.FloorTracker
import nz.waveformlabs.moshpoint.core.PressureAdvert
import nz.waveformlabs.moshpoint.core.PressureHistory
import nz.waveformlabs.moshpoint.core.RecordLine
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import org.json.JSONObject
import kotlin.math.abs

/**
 * Upstairs / downstairs, from the phones' pressure sensors (docs/VENUE_MAP.md, section 4; the
 * maths is in core `Floors.kt`).
 *
 * This phone reads its own pressure while you're live or the app is open. Mates' pressure
 * arrives two ways, neither of which touches the location box or the crowd-relay packet:
 *  - in their Bluetooth advert (two extra bytes): works with no signal, and it's how two
 *    phones side by side calibrate against each other;
 *  - as a small sealed record on our own relay server, for mates out of Bluetooth range.
 *
 * Each phone works out its own tags, relative to itself. A phone with no pressure sensor
 * sends nothing and shows no tags.
 */
object Floors {
    /** Friend id -> on a floor above or below us (Compose state for the map and the finder). */
    val tags = mutableStateMapOf<String, Floor>()

    /** Friend id -> metres above us, where we can say (a UWB mate upstairs is drawn closer along the ground). */
    val heights = mutableStateMapOf<String, Double>()

    private val cfg = FloorConfig()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val history = PressureHistory()

    private class Mate {
        val tracker = FloorTracker(cfg)
        var hPa: Double? = null
        var atMs = 0L
        var uwbM: Double? = null
        var uwbAtMs = 0L
        var lastPairMs = 0L

        /** The calibration as last written down (saved, logged, recorded). */
        var notedOffsetHpa: Double? = null
        var notedByUwb = false
        var notedAtMs = 0L
    }

    private val mates = HashMap<String, Mate>()
    private var app: Context? = null
    private var users = 0
    private var liveUsers = 0
    private var watchers = 0
    private var sensors: SensorManager? = null
    private var listening = false
    private var loop: Job? = null
    private var advertised: Double? = null
    private var advertisedAtMs = 0L
    private var published: Double? = null
    private var publishedAtMs = 0L
    private var lastRecordMs = 0L
    private var lastFetchMs = 0L

    /** Called (on the main thread) when our advert should be rebuilt with a new pressure. */
    @Volatile var onAdvertChange: (() -> Unit)? = null

    /** True once we know this phone has no pressure sensor. */
    var noSensor = false
        private set

    // ---- Switching on and off ----

    /**
     * Start reading pressure. [live] = we're visible to mates (the service): our pressure also
     * goes out. [watching] = the app is on screen: mates' relay records are fetched too.
     * Each call needs a matching [release] with the same flags.
     */
    @Synchronized
    fun acquire(c: Context, live: Boolean = false, watching: Boolean = false) {
        app = c.applicationContext
        if (users == 0) loadCalibrations()
        users++
        if (live) liveUsers++
        if (watching) watchers++
        startSensor()
        if (loop == null) {
            loop = scope.launch {
                while (true) {
                    delay(5_000)
                    tick()
                }
            }
        }
    }

    @Synchronized
    fun release(live: Boolean = false, watching: Boolean = false) {
        users = (users - 1).coerceAtLeast(0)
        if (live) liveUsers = (liveUsers - 1).coerceAtLeast(0)
        if (watching) watchers = (watchers - 1).coerceAtLeast(0)
        if (users > 0) return
        saveCalibrations() // the latest, for when we're switched back on
        stopSensor()
        loop?.cancel()
        loop = null
        history.clear()
        advertised = null
        tags.clear()
        heights.clear()
        DebugStatus.set(K, "off")
    }

    private fun startSensor() {
        if (listening || noSensor) return
        val sm = app?.getSystemService(SensorManager::class.java)
        val sensor = sm?.getDefaultSensor(Sensor.TYPE_PRESSURE)
        if (sm == null || sensor == null) {
            noSensor = true
            DebugStatus.set(K, "this phone has no pressure sensor")
            return
        }
        sensors = sm
        // Once a second is plenty. Up to 10 s of readings may be held back and delivered
        // together, so reading pressure never wakes a sleeping phone by itself.
        listening = sm.registerListener(listener, sensor, 1_000_000, 10_000_000)
        DebugStatus.set(K, if (listening) "pressure sensor on" else "pressure sensor FAILED to start")
    }

    private fun stopSensor() {
        if (!listening) return
        sensors?.unregisterListener(listener)
        listening = false
    }

    private val listener = object : SensorEventListener {
        override fun onSensorChanged(e: SensorEvent) {
            // The event's own time (nanoseconds since boot), not when it reached us: batches arrive late.
            val at = System.currentTimeMillis() - (SystemClock.elapsedRealtimeNanos() - e.timestamp) / 1_000_000
            history.add(at, e.values[0].toDouble())
            advertIfMoved()
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }

    // ---- Our pressure, going out ----

    /** Our pressure for the advert, in [Baro] units; null with no sensor or no recent reading. */
    fun advertPressure(): Int? {
        val now = System.currentTimeMillis()
        val hPa = history.current(now) ?: return null
        advertised = hPa
        advertisedAtMs = now
        return Baro.toUnits(hPa)
    }

    /**
     * Rebuild the advert when our pressure has moved enough (core `PressureAdvert`): half a
     * metre normally, one step while a mate is [together] with us and calibrating against
     * what they hear. Never more than every 15 s.
     */
    private fun advertIfMoved(together: Boolean = false) {
        if (liveUsers == 0) return
        val now = System.currentTimeMillis()
        val hPa = history.current(now) ?: return
        if (PressureAdvert.due(advertised, advertisedAtMs, hPa, now, together)) {
            advertised = hPa
            advertisedAtMs = now
            onAdvertChange?.invoke()
        }
    }

    // ---- Mates' pressure, coming in ----

    /**
     * A mate's advert was heard: how far Bluetooth thinks they are, and their pressure if the
     * advert carries one. Same-moment readings side by side are what calibration is made of.
     */
    fun onBluetooth(friendId: String, distanceM: Double, pressure: Int?) {
        if (users == 0 || pressure == null) return
        val now = System.currentTimeMillis()
        val m = mates.getOrPut(friendId) { Mate() }
        val their = Baro.toHpa(pressure)
        m.hPa = their
        m.atMs = now
        if (now - m.lastPairMs < 1_000) return // adverts can come ten a second; one pair a second is plenty
        m.lastPairMs = now
        val mine = history.current(now)
        if (mine != null) {
            // UWB knows exactly how close; believe it over Bluetooth's guess whenever it's fresh.
            val uwb = m.uwbM?.takeIf { now - m.uwbAtMs <= 3_000 }
            val close = when {
                uwb != null -> if (uwb <= cfg.togetherUwbM) Closeness.UWB else Closeness.NOT_CLOSE
                distanceM <= cfg.togetherBleM -> Closeness.BLUETOOTH
                else -> Closeness.NOT_CLOSE
            }
            // They calibrate against the pressure they hear from us: while side by side, keep it current.
            if (close != Closeness.NOT_CLOSE) advertIfMoved(together = true)
            val c = if (m.tracker.onPair(mine, their, now, close)) m.tracker.calibration else null
            if (c != null) {
                // Side by side they recalibrate every second. Write it down when it has changed
                // by a step, and otherwise once a minute (to keep its age right if we're stopped).
                val noted = m.notedOffsetHpa
                val changed = noted == null || abs(c.offsetHpa - noted) >= Baro.HPA_PER_UNIT || c.byUwb != m.notedByUwb
                if (changed || now - m.notedAtMs >= NOTE_GAP_MS) {
                    m.notedOffsetHpa = c.offsetHpa
                    m.notedByUwb = c.byUwb
                    m.notedAtMs = now
                    saveCalibrations()
                }
                if (changed) {
                    DebugStatus.log("Floors: calibrated with ${nameOf(friendId)} by ${if (c.byUwb) "UWB" else "Bluetooth"} (offset %.2f hPa)".format(c.offsetHpa))
                    record(now, "baro_cal", friendId, if (c.byUwb) "UWB" else "BLE_RSSI", uwb ?: distanceM, "offset_hPa=%.3f".format(java.util.Locale.ROOT, c.offsetHpa))
                }
            }
            record(now, "baro_mate", friendId, "BLE_RSSI", uwb ?: distanceM, "hPa=%.2f;mine=%.2f".format(java.util.Locale.ROOT, their, mine))
        }
        judge(friendId, m, now)
    }

    /** UWB measured the distance to a mate (it has no pressure of its own). */
    fun onUwb(friendId: String, distanceM: Double?) {
        if (users == 0 || distanceM == null) return
        val m = mates.getOrPut(friendId) { Mate() }
        m.uwbM = distanceM
        m.uwbAtMs = System.currentTimeMillis()
    }

    /** Work out one mate's tag from the freshest readings; clear it when we can't honestly say. */
    private fun judge(friendId: String, m: Mate, now: Long) {
        val their = m.hPa
        val mine = if (their == null) null else history.at(m.atMs)
        val e = m.tracker.update(mine, their, m.atMs, now)
        val floor = e?.floor
        if (floor == null) tags.remove(friendId) else if (tags[friendId] != floor) tags[friendId] = floor
        if (e == null) heights.remove(friendId) else heights[friendId] = e.heightM
    }

    private fun tick() {
        val c = app ?: return
        val now = System.currentTimeMillis()
        for ((id, m) in mates) judge(id, m, now)
        val mine = history.current(now)
        DebugStatus.set(
            K,
            when {
                noSensor -> "this phone has no pressure sensor"
                mine == null -> "waiting for a pressure reading"
                else -> "%.2f hPa, ".format(mine) + mates.entries.joinToString(", ") { (id, m) ->
                    val e = m.tracker.update(history.at(m.atMs), m.hPa, m.atMs, now)
                    nameOf(id) + if (e == null) " ?" else " %+.1f m ±%.1f".format(e.heightM, e.sigmaM)
                }.ifEmpty { "no mates' pressure yet" }
            },
        )
        if (mine != null && FieldRecorder.active && now - lastRecordMs >= 5_000) {
            lastRecordMs = now
            FieldRecorder.line(RecordLine.of(now, "baro", note = "hPa=%.2f".format(java.util.Locale.ROOT, mine)))
        }
        // Over the internet too, for mates out of Bluetooth range. Our own relay only: the free
        // public one is rationed, and floors must never cost a location update.
        if (!RelayClient.ownServer) return
        if (mine != null && liveUsers > 0 && !VisibilityPrefs.ghost(c)) publish(c, mine, now)
        if (watchers > 0 && !noSensor && now - lastFetchMs >= FETCH_GAP_MS) {
            lastFetchMs = now
            fetch(now)
        }
    }

    private fun publish(c: Context, hPa: Double, now: Long) {
        val last = published
        val due = last == null || now - publishedAtMs >= PUBLISH_REFRESH_MS || (now - publishedAtMs >= PUBLISH_GAP_MS && abs(hPa - last) >= PressureAdvert.MOVED_HPA)
        if (!due) return
        val units = Baro.toUnits(hPa) ?: return
        published = hPa
        publishedAtMs = now
        val secret = Identity.current(c)
        val id = FloorBox.idFor(secret, EphemeralId(secret).epochAt(now))
        val sealed = FloorBox.seal(secret, id, FloorBox.Reading(units, now / 1000))
        scope.launch { RelayClient.put(id, sealed) }
    }

    private fun fetch(now: Long) {
        // The crew first, then friends: the same people the map shows.
        val all = FriendsRepository.friends.filterNot { FriendsRepository.isSimulated(it.id) }
        val crew = all.filter { it.gigGroupOnly || it.key in GroupSync.members }
        val people = (crew + (all - crew.toSet())).take(60)
        if (people.isEmpty()) return
        val asks = people.flatMap { f ->
            val e = f.ephemeralId.epochAt(now)
            listOf(f to FloorBox.idFor(f.secret, e), f to FloorBox.idFor(f.secret, e - 1))
        }
        scope.launch {
            val found = RelayClient.lookup(asks.map { it.second }) ?: return@launch
            val t = System.currentTimeMillis()
            asks.forEachIndexed { i, (f, id) ->
                val newest = found.getOrNull(i).orEmpty().mapNotNull { FloorBox.open(f.secret, id, it) }.maxByOrNull { it.timeSec } ?: return@forEachIndexed
                val m = mates.getOrPut(f.id) { Mate() }
                val at = newest.timeSec * 1000
                // Bluetooth's reading is fresher whenever we have one.
                if (at > m.atMs) {
                    m.hPa = newest.hPa
                    m.atMs = at
                    judge(f.id, m, t)
                    history.at(at)?.let { mine -> record(t, "baro_mate", f.id, "GPS_SERVER", null, "hPa=%.2f;mine=%.2f".format(java.util.Locale.ROOT, newest.hPa, mine)) }
                }
            }
        }
    }

    // ---- Remembering calibrations for the night ----

    private fun prefs() = app?.getSharedPreferences("floors", Context.MODE_PRIVATE)

    private fun loadCalibrations() {
        val raw = prefs()?.getString("cal", null) ?: return
        runCatching {
            val o = JSONObject(raw)
            val now = System.currentTimeMillis()
            for (id in o.keys()) {
                val c = o.getJSONObject(id)
                val at = c.getLong("at")
                if (now - at > KEEP_CALIBRATION_MS || at > now + 60_000) continue
                mates.getOrPut(id) { Mate() }.tracker.calibration = FloorTracker.Calibration(c.getDouble("offset"), at, c.getBoolean("uwb"))
            }
        }
    }

    private fun saveCalibrations() {
        val o = JSONObject()
        for ((id, m) in mates) {
            val c = m.tracker.calibration ?: continue
            o.put(id, JSONObject().put("offset", c.offsetHpa).put("at", c.atMs).put("uwb", c.byUwb))
        }
        prefs()?.edit()?.putString("cal", o.toString())?.apply()
    }

    // ---- Debug ----

    private fun nameOf(friendId: String) = FriendsRepository.byId(friendId)?.name ?: friendId

    private fun record(now: Long, event: String, friendId: String, method: String, distanceM: Double?, note: String) {
        if (!FieldRecorder.active) return
        FieldRecorder.line(RecordLine.of(now, event, nameOf(friendId), method, distanceM = distanceM, note = note))
    }

    private const val K = "Floors"

    private const val NOTE_GAP_MS = 60_000L
    private const val PUBLISH_GAP_MS = 30_000L
    private const val PUBLISH_REFRESH_MS = 120_000L
    private const val FETCH_GAP_MS = 20_000L

    /** A calibration this old says nothing any more (the tracker stops trusting it well before). */
    private const val KEEP_CALIBRATION_MS = 12L * 3600 * 1000
}
