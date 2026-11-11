package nz.waveformlabs.moshpoint.venue

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.util.Log
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.snapshotFlow
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.CrewStatus
import nz.waveformlabs.moshpoint.Crews
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.GigArchive
import nz.waveformlabs.moshpoint.GroupSync
import nz.waveformlabs.moshpoint.core.ArrivalPlanner
import nz.waveformlabs.moshpoint.core.AtGig
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.VenueMapPlan
import nz.waveformlabs.moshpoint.core.VenueQuery
import nz.waveformlabs.moshpoint.ui.MAP_STYLES
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.MapLibre
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.offline.OfflineManager
import org.maplibre.android.offline.OfflineRegion
import org.maplibre.android.offline.OfflineRegionError
import org.maplibre.android.offline.OfflineRegionStatus
import org.maplibre.android.offline.OfflineTilePyramidRegionDefinition
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import kotlin.coroutines.resume

/**
 * The venue's street map, saved on the phone by itself when you make or join a crew, so the
 * map works at the gig with no signal (docs/VENUE_MAP.md, section 1). Replaces the old
 * "Save this area" button.
 *
 * For every crew you're in (not ones you follow from home) it saves a 4 km square around the
 * venue: a "venue pack". MapLibre downloads and keeps the map tiles (one offline region per
 * area); the small parts (three map looks, one font) we fetch and hand to MapLibre's store.
 * If nobody knows where the venue is, the square is saved around you once you're at the gig.
 *
 * Everything here can be repeated safely: [sync] starts again from the first unfinished step,
 * which is also how an interrupted download resumes.
 */
object VenueMaps {
    /** The one line on the crew card. */
    enum class Line { NONE, SAVING, SAVED, WAITING, ON_ARRIVAL }

    data class Status(val line: Line, val percent: Int = 0)

    /** For the main crew (Compose state). */
    val status = mutableStateOf(Status(Line.NONE))

    /** Goes up whenever a saved map appears or goes, so the map screen looks again. */
    val savedChanges = mutableIntStateOf(0)

    /** A saved map look, ready for `Style.Builder().fromJson()`. [key] changes when the content does. */
    class Saved(val key: String, val json: String)

    private const val TAG = "VenueMaps"
    private const val INDEX_URL = "https://tiles.openfreemap.org/planet"
    private const val META_FRESH_MS = 24L * 3600 * 1000
    private const val RETRY_MS = 5 * 60_000L
    private const val LOOKUP_RETRY_MS = 30 * 60_000L
    private const val LEGACY_METADATA = "venue" // what "Save this area" labelled its regions
    private const val OUR_METADATA = "mp-venue:"

    /** One saved (or being saved) square. */
    private class Area(val key: String, val lat: Double, val lon: Double, val aroundYou: Boolean) {
        val crews = LinkedHashSet<String>()
        var version = ""
        var done = false
        var percent = 0
        var madeAtMs = 0L
        var gigEndsAtMs = 0L
        var leftAtMs = 0L
        var deleteAfterMs = Long.MAX_VALUE
        val centre get() = LatLon(lat, lon)
    }

    private class Meta(val tiles: VenueStyle.Tiles, val sprite: String?, val glyphs: String, val atMs: Long)

    private class Want(val id: String, val group: GigGroup)

    private var app: Context? = null
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val areas = ArrayList<Area>()
    private val positions = HashMap<String, LatLon>() // venue positions we looked up, by crew
    private val lookupTriedAt = HashMap<String, Long>()
    private val active = HashMap<String, OfflineRegion>() // downloading now (kept so they aren't collected)
    private val styleCache = HashMap<String, Saved>()
    private var meta: Meta? = null
    private var legacySeenAtMs = 0L
    private var worldFontsAtMs = 0L
    private var running = false
    private var again = false
    private var lastTryMs = 0L
    private var lastWants = ""
    private var planner = ArrivalPlanner()
    private var plannerCrew = ""
    private var lastSaveMs = 0L

    private val root get() = File(app!!.filesDir, "venue")
    private val styleRoot get() = File(root, "styles")
    private val fontDir get() = File(root, "fonts")

    // ---- For the rest of the app ----

    /**
     * Check every crew's venue map and carry on with whatever isn't finished. Cheap when there
     * is nothing to do. Call it whenever something may have changed; it also runs by itself
     * when crews change, when the connection comes back, and every few minutes while unfinished.
     */
    fun sync(c: Context) {
        start(c)
        if (running) {
            again = true
            return
        }
        running = true
        scope.launch {
            try {
                do {
                    again = false
                    pipeline()
                } while (again)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Log.w(TAG, "venue map sync failed", e)
            } finally {
                running = false
                save(force = true)
                publish()
            }
        }
    }

    /** The main crew's venue position, if anyone knows it: from the crew, or looked up by name. */
    fun venue(c: Context): LatLon? {
        start(c)
        return GroupSync.group.value?.let(::venueOf)
    }

    /** "At the gig" for this phone right now (see core `AtGig`). */
    fun atGig(c: Context, me: android.location.Location?): Boolean {
        start(c)
        val g = GroupSync.group.value ?: return false
        me ?: return false
        val now = System.currentTimeMillis()
        return AtGig.atGig(g, GroupSync.following, venueOf(g), LatLon(me.latitude, me.longitude), me.accuracy.toDouble(), now - me.time, now)
    }

    /** True if the phone has a working internet connection, as far as Android can tell. */
    fun online(c: Context): Boolean = runCatching {
        val cm = c.applicationContext.getSystemService(ConnectivityManager::class.java) ?: return true
        val caps = cm.getNetworkCapabilities(cm.activeNetwork ?: return false) ?: return false
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }.getOrDefault(true)

    /**
     * The saved map for map look number [look] (Bright, Night, Dark), or null if nothing is
     * saved yet. The main crew's venue first, else the newest saved area.
     */
    fun saved(c: Context, look: Int): Saved? {
        start(c)
        val mainId = GroupSync.group.value?.let(GigArchive::idFor)
        val a = areas.filter { it.done }.let { done ->
            done.firstOrNull { mainId != null && mainId in it.crews && !it.aroundYou } ?: done.firstOrNull { mainId != null && mainId in it.crews }
                ?: done.maxByOrNull { it.madeAtMs }
        } ?: return null
        val key = "pack:${a.version}:$look"
        styleCache[key]?.let { return it }
        val json = runCatching { File(styleRoot, "${a.version}/$look.json").readText() }.getOrNull() ?: return null
        return Saved(key, json).also { styleCache[key] = it }
    }

    // ---- Start-up ----

    private fun start(c: Context) {
        if (app != null) return
        app = c.applicationContext
        load()
        // Loaded here, once: the crew list is read below from places that may only read.
        Crews.load(c.applicationContext)
        // The connection came back: carry on.
        runCatching {
            c.applicationContext.getSystemService(ConnectivityManager::class.java)?.registerDefaultNetworkCallback(
                object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        scope.launch {
                            delay(2_000) // let it settle (and be checked by Android) first
                            app?.let { sync(it) }
                        }
                    }

                    override fun onLost(network: Network) {
                        scope.launch { publish() }
                    }
                },
            )
        }
        // Crews changed (made, joined, ended, a waiting one stepped up): look again.
        scope.launch {
            snapshotFlow { wantsKey() }.collect { app?.let { sync(it) } }
        }
        // And a slow heartbeat, for when the screen is off or nothing told us: arriving, crews, retries.
        scope.launch {
            while (true) {
                delay(60_000)
                tick()
            }
        }
        publish()
    }

    private fun wants(): List<Want> {
        if (app == null) return emptyList()
        val out = ArrayList<Want>()
        // Following from home: you're not going, so no map.
        GroupSync.group.value?.takeIf { !GroupSync.following }?.let { out += Want(GigArchive.idFor(it), it) }
        Crews.others.forEach { e -> if (!e.following) out += Want(e.id, e.group) }
        return out.distinctBy { it.id }
    }

    private fun wantsKey(): String = wants().joinToString("|") { "${it.id}:${it.group.venueLat}:${it.group.venueLon}:${it.group.venue}" }

    private fun venueOf(g: GigGroup): LatLon? {
        val lat = g.venueLat
        val lon = g.venueLon
        if (lat != null && lon != null) LatLon(lat, lon).takeIf(VenueMapPlan::usable)?.let { return it }
        return positions[GigArchive.idFor(g)]
    }

    private fun tick() {
        val c = app ?: return
        val now = System.currentTimeMillis()
        arrivalCheck(now)
        val key = wantsKey()
        val unfinished = areas.any { !it.done && it.key !in active } || areas.any { now > it.deleteAfterMs }
        if (key != lastWants || (unfinished && now - lastTryMs > RETRY_MS)) sync(c) else publish()
    }

    /** "Download around you when you arrive": see core `ArrivalPlanner`. */
    private fun arrivalCheck(now: Long) {
        val c = app ?: return
        val g = GroupSync.group.value ?: return
        if (GroupSync.following || !AtGig.gigTime(g, now)) return
        val id = GigArchive.idFor(g)
        if (id != plannerCrew) {
            plannerCrew = id
            planner = ArrivalPlanner()
        }
        val loc = CrewStatus.myLocation(c) ?: return
        val mine = areas.filter { id in it.crews }
        val fix = ArrivalPlanner.Fix(LatLon(loc.latitude, loc.longitude), loc.accuracy.toDouble(), if (loc.hasSpeed()) loc.speed.toDouble() else null, loc.time)
        val centre = planner.onFix(fix, mine.map { it.centre }, mine.count { it.aroundYou })?.takeIf(VenueMapPlan::usable) ?: return
        if (areas.any { VenueMapPlan.sameArea(it.centre, centre) }) return
        areas += Area(VenueMapPlan.areaKey(centre), centre.lat, centre.lon, aroundYou = true).also {
            it.crews += id
            it.madeAtMs = now
        }
        DebugStatus.log("Venue map: saving the area around you")
        save(force = true)
        sync(c)
    }

    // ---- The work ----

    private suspend fun pipeline() {
        val c = app ?: return
        val now = System.currentTimeMillis()
        lastTryMs = now
        val wants = wants()
        lastWants = wantsKey()
        lookUpVenues(c, wants, now)
        reconcile(wants, now)
        arrivalCheck(now)
        publish()
        val needsMapLibre = areas.isNotEmpty() || legacySeenAtMs == 0L || now - legacySeenAtMs > VenueMapPlan.LEGACY_KEEP_MS
        if (!needsMapLibre) return
        val om = runCatching {
            MapLibre.getInstance(c)
            OfflineManager.getInstance(c)
        }.getOrNull() ?: return
        val regions = list(om) ?: return
        cleanUp(om, regions, now)
        // A saved area whose files have gone (storage cleared, database rebuilt) is not saved.
        for (a in areas) {
            if (a.done && (regions.none { areaKeyOf(it) == a.key } || !styleFilesExist(a.version))) {
                a.done = false
                a.percent = 0
                savedChanges.intValue++
            }
        }
        publish()
        val todo = areas.filter { !it.done && it.key !in active }
        if (!online(c)) return
        if (todo.isNotEmpty()) {
            val m = ensureMeta(now) ?: return
            val world = VenueMapPlan.needsWorldFonts(languages(c))
            if (!ensureFonts(VenueMapPlan.CORE_RANGES, m.glyphs)) return
            // Someone who reads Arabic, Thai, Hindi... gets those letters with the first map, not later.
            if (world && ensureFonts(VenueMapPlan.WORLD_RANGES, m.glyphs)) worldFontsAtMs = now
            seedFonts(om)
            for (a in todo) begin(c, om, regions, a, m)
        }
        // Other alphabets for everyone else: when it costs nothing (Wi-Fi), once.
        val m = meta
        if (worldFontsAtMs == 0L && m != null && areas.isNotEmpty() && unmetered(c) && ensureFonts(VenueMapPlan.WORLD_RANGES, m.glyphs)) {
            worldFontsAtMs = now
            seedFonts(om)
            styleCache.clear()
        }
    }

    /** A crew with a venue name but no position (made by an older version, or the maker's lookup failed): ask once. */
    private suspend fun lookUpVenues(c: Context, wants: List<Want>, now: Long) {
        for (w in wants) {
            if (venueOf(w.group) != null || !VenueQuery.usable(w.group.venue)) continue
            if (now - (lookupTriedAt[w.id] ?: 0L) < LOOKUP_RETRY_MS || !online(c)) continue
            lookupTriedAt[w.id] = now
            val near = CrewStatus.myLocation(c)?.let { LatLon(it.latitude, it.longitude) }
            val found = VenueLookup.find(c, w.group.venue, near) as? VenueLookup.Result.Found ?: continue
            if (VenueMapPlan.usable(found.at)) {
                positions[w.id] = found.at
                save(force = true)
            }
        }
    }

    /** Make the list of areas match the crews we're in. */
    private fun reconcile(wants: List<Want>, now: Long) {
        for (w in wants) {
            val venue = venueOf(w.group) ?: continue
            val a = areas.firstOrNull { !it.aroundYou && VenueMapPlan.sameArea(it.centre, venue) }
                ?: areas.firstOrNull { VenueMapPlan.sameArea(it.centre, venue) }
                ?: Area(VenueMapPlan.areaKey(venue), venue.lat, venue.lon, aroundYou = false).also {
                    it.madeAtMs = now
                    areas += it
                }
            a.crews += w.id
        }
        val live = wants.associateBy { it.id }
        for (a in areas) {
            val still = a.crews.filter { it in live }
            a.crews.clear()
            a.crews += still
            if (still.isNotEmpty()) {
                a.gigEndsAtMs = still.maxOf { live.getValue(it).group.expiresAtMs }
                a.leftAtMs = 0L
                a.deleteAfterMs = VenueMapPlan.deleteAfterMs(a.gigEndsAtMs)
            } else {
                // No crew of ours needs it any more: the gig ended, or we left or cancelled.
                if (a.leftAtMs == 0L) a.leftAtMs = now
                a.deleteAfterMs = VenueMapPlan.deleteAfterMs(if (a.gigEndsAtMs > 0) a.gigEndsAtMs else now, a.leftAtMs)
            }
        }
    }

    private suspend fun cleanUp(om: OfflineManager, regions: List<OfflineRegion>, now: Long) {
        val expired = areas.filter { now > it.deleteAfterMs }
        // Too many: gigs that are over go first (oldest first), then the ones furthest ahead.
        val kept = areas - expired.toSet()
        val overflow = kept.sortedWith(compareBy<Area> { if (it.gigEndsAtMs < now) 0 else 1 }.thenBy { if (it.gigEndsAtMs < now) it.gigEndsAtMs else -it.gigEndsAtMs })
            .take((kept.size - VenueMapPlan.MAX_PACKS).coerceAtLeast(0))
        for (a in expired + overflow) {
            active.remove(a.key)?.let { r -> runCatching { r.setObserver(null) } }
            regions.filter { areaKeyOf(it) == a.key }.forEach { delete(it) }
            areas.remove(a)
            DebugStatus.log("Venue map: deleted the saved area ${a.key}")
            savedChanges.intValue++
        }
        // Ours, but we've no record of it (app data partly cleared): don't leave it pinned for ever.
        regions.filter { r -> areaKeyOf(r)?.let { k -> areas.none { it.key == k } } == true }.forEach { delete(it) }
        // Areas saved with the old "Save this area" button: nobody could ever remove them.
        val legacy = regions.filter { runCatching { String(it.metadata) }.getOrNull() == LEGACY_METADATA }
        if (legacySeenAtMs == 0L) {
            legacySeenAtMs = now
        } else if (now - legacySeenAtMs > VenueMapPlan.LEGACY_KEEP_MS) {
            legacy.forEach { delete(it) }
        }
        // Map looks for a week's data that no area uses any more.
        val current = meta?.tiles?.version
        withContext(Dispatchers.IO) {
            styleRoot.listFiles()?.forEach { dir -> if (dir.name != current && areas.none { it.version == dir.name }) dir.deleteRecursively() }
        }
        styleCache.clear()
        save(force = true)
    }

    /**
     * This week's tile address, and the three map looks rewritten around it. Kept for a day,
     * then looked at again; an area keeps the week it started with.
     */
    private suspend fun ensureMeta(now: Long): Meta? {
        val old = meta?.takeIf { styleFilesExist(it.tiles.version) }
        if (old != null && now - old.atMs < META_FRESH_MS) return old
        val fresh = withContext(Dispatchers.IO) {
            runCatching {
                val tiles = VenueStyle.parseTiles(String(get(INDEX_URL, 200_000) ?: return@runCatching null, Charsets.UTF_8)) ?: return@runCatching null
                val dir = File(styleRoot, tiles.version)
                dir.mkdirs()
                var sprite: String? = null
                var glyphs: String? = null
                MAP_STYLES.forEachIndexed { i, (_, url) ->
                    val raw = String(get(url, 2_000_000) ?: return@runCatching null, Charsets.UTF_8)
                    val pinned = VenueStyle.pin(raw, tiles) ?: return@runCatching null
                    if (sprite == null) sprite = VenueStyle.spriteOf(raw)
                    if (glyphs == null) glyphs = VenueStyle.glyphsOf(raw)
                    write(File(dir, "$i.json"), pinned.toByteArray(Charsets.UTF_8))
                }
                val g = glyphs ?: return@runCatching null
                write(File(dir, "pack.json"), VenueStyle.packStyle(tiles, sprite).toByteArray(Charsets.UTF_8))
                Meta(tiles, sprite, g, now)
            }.getOrNull()
        }
        if (fresh == null) return old // couldn't reach it: last time's will do if we have it
        meta = fresh
        styleCache.clear()
        save(force = true)
        return fresh
    }

    private fun styleFilesExist(version: String): Boolean {
        if (version.isEmpty()) return false
        val dir = File(styleRoot, version)
        return File(dir, "pack.json").length() > 0 && MAP_STYLES.indices.all { File(dir, "$it.json").length() > 0 }
    }

    /** The real font files we want, kept in our own folder so later venues need no font download. */
    private suspend fun ensureFonts(ranges: List<Int>, glyphs: String): Boolean = withContext(Dispatchers.IO) {
        fontDir.mkdirs()
        for (r in ranges) {
            val f = File(fontDir, "$r.pbf")
            if (f.length() > 0) continue
            val bytes = get(VenueStyle.fontFileUrl(glyphs, r), 1_000_000) ?: return@withContext false
            if (bytes.isNotEmpty()) write(f, bytes)
        }
        true
    }

    /**
     * Every font file MapLibre can ask the saved map for, put into its store under the private
     * address: the real file where we have it, a valid empty one where we don't. A map tile
     * waits for all its fonts before drawing anything, so none may go unanswered.
     */
    private suspend fun seedFonts(om: OfflineManager) {
        val files = withContext(Dispatchers.IO) {
            VenueMapPlan.ALL_RANGES.map { r ->
                val f = File(fontDir, "$r.pbf")
                r to (if (f.length() > 0) runCatching { f.readBytes() }.getOrNull() else null)
            }
        }
        val never = farFuture()
        for ((r, bytes) in files) om.putResourceWithUrl(VenueMapPlan.glyphUrl(r), bytes ?: VenueMapPlan.emptyGlyphs(r), 0L, never, null, false)
    }

    /** Start (or carry on) one area's download. MapLibre resumes a half-done region where it stopped. */
    private suspend fun begin(c: Context, om: OfflineManager, regions: List<OfflineRegion>, a: Area, m: Meta) {
        var region = regions.firstOrNull { areaKeyOf(it) == a.key }
        if (!styleFilesExist(a.version)) {
            // New, or its week's files have gone: (re)start on this week's map.
            region?.let { delete(it) }
            region = null
            a.version = m.tiles.version
            a.percent = 0
        }
        val pack = withContext(Dispatchers.IO) { runCatching { File(styleRoot, "${a.version}/pack.json").readBytes() }.getOrNull() } ?: return
        val styleUrl = VenueMapPlan.packStyleUrl(a.version)
        om.putResourceWithUrl(styleUrl, pack, 0L, farFuture(), null, false)
        if (region == null) {
            val box = VenueMapPlan.box(a.centre)
            val definition = OfflineTilePyramidRegionDefinition(
                styleUrl, LatLngBounds.from(box.north, box.east, box.south, box.west),
                VenueMapPlan.MIN_ZOOM.toDouble(), VenueMapPlan.MAX_ZOOM.toDouble(), c.resources.displayMetrics.density, false,
            )
            region = create(om, definition, (OUR_METADATA + a.key).toByteArray()) ?: return
        }
        val r = region
        active[a.key] = r
        r.setObserver(object : OfflineRegion.OfflineRegionObserver {
            override fun onStatusChanged(status: OfflineRegionStatus) {
                if (active[a.key] !== r) return
                val required = status.requiredResourceCount
                if (status.isRequiredResourceCountPrecise && required > 0) {
                    a.percent = (100 * status.completedResourceCount / required).toInt().coerceIn(0, 100)
                }
                // Complete, and it really has map tiles in it (not just an unreadable style).
                if (status.isComplete && status.isRequiredResourceCountPrecise && status.completedTileCount > 0) {
                    a.done = true
                    a.percent = 100
                    active.remove(a.key)
                    runCatching {
                        r.setObserver(null)
                        r.setDownloadState(OfflineRegion.STATE_INACTIVE)
                    }
                    DebugStatus.log("Venue map saved: ${a.key}, ${status.completedTileCount} tiles, ${status.completedResourceSize / 1024} KB")
                    savedChanges.intValue++
                    save(force = true)
                } else {
                    save(force = false)
                }
                publish()
            }

            override fun onError(error: OfflineRegionError) {
                // MapLibre keeps trying by itself; this is only for the debug log.
                DebugStatus.set("Venue map", "${a.key}: ${error.reason} ${error.message}")
            }

            override fun mapboxTileCountLimitExceeded(limit: Long) {
                DebugStatus.log("Venue map: tile limit $limit reached for ${a.key}")
            }
        })
        r.setDownloadState(OfflineRegion.STATE_ACTIVE)
        DebugStatus.log("Venue map: saving ${a.key} (map data ${a.version})")
    }

    // ---- The crew card line ----

    private fun publish() {
        val c = app ?: return
        val g = GroupSync.group.value
        val s = if (g == null || GroupSync.following) {
            Status(Line.NONE)
        } else {
            val id = GigArchive.idFor(g)
            val venueKnown = venueOf(g) != null
            val mine = areas.filter { id in it.crews }
            val a = if (venueKnown) {
                mine.firstOrNull { !it.aroundYou } ?: mine.firstOrNull()
            } else {
                mine.filter { it.done }.maxByOrNull { it.madeAtMs } ?: mine.maxByOrNull { it.madeAtMs }
            }
            when {
                a == null && !venueKnown -> Status(Line.ON_ARRIVAL)
                a != null && a.done -> Status(Line.SAVED)
                online(c) -> Status(Line.SAVING, a?.percent ?: 0)
                else -> Status(Line.WAITING)
            }
        }
        if (status.value != s) status.value = s
    }

    // ---- MapLibre's callbacks as suspending calls ----

    private suspend fun list(om: OfflineManager): List<OfflineRegion>? = suspendCancellableCoroutine { k ->
        om.listOfflineRegions(object : OfflineManager.ListOfflineRegionsCallback {
            override fun onList(offlineRegions: Array<OfflineRegion>?) {
                if (k.isActive) k.resume(offlineRegions?.toList().orEmpty())
            }

            override fun onError(error: String) {
                Log.w(TAG, "listing offline regions failed: $error")
                if (k.isActive) k.resume(null)
            }
        })
    }

    private suspend fun create(om: OfflineManager, definition: OfflineTilePyramidRegionDefinition, metadata: ByteArray): OfflineRegion? =
        suspendCancellableCoroutine { k ->
            om.createOfflineRegion(definition, metadata, object : OfflineManager.CreateOfflineRegionCallback {
                override fun onCreate(offlineRegion: OfflineRegion) {
                    if (k.isActive) k.resume(offlineRegion)
                }

                override fun onError(error: String) {
                    Log.w(TAG, "creating an offline region failed: $error")
                    if (k.isActive) k.resume(null)
                }
            })
        }

    private suspend fun delete(region: OfflineRegion): Unit = suspendCancellableCoroutine { k ->
        runCatching {
            region.setObserver(null)
            region.delete(object : OfflineRegion.OfflineRegionDeleteCallback {
                override fun onDelete() {
                    if (k.isActive) k.resume(Unit)
                }

                override fun onError(error: String) {
                    Log.w(TAG, "deleting an offline region failed: $error")
                    if (k.isActive) k.resume(Unit)
                }
            })
        }.onFailure { if (k.isActive) k.resume(Unit) }
    }

    private fun areaKeyOf(region: OfflineRegion): String? =
        runCatching { String(region.metadata) }.getOrNull()?.takeIf { it.startsWith(OUR_METADATA) }?.removePrefix(OUR_METADATA)

    // ---- Small helpers ----

    /** "Never goes stale", for MapLibre's store (seconds since 1970). */
    private fun farFuture(): Long = System.currentTimeMillis() / 1000 + 10L * 365 * 24 * 3600

    private fun unmetered(c: Context): Boolean = runCatching {
        val cm = c.getSystemService(ConnectivityManager::class.java) ?: return false
        cm.getNetworkCapabilities(cm.activeNetwork ?: return false)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true
    }.getOrDefault(false)

    private fun languages(c: Context): List<String> {
        val locales = c.resources.configuration.locales
        return (0 until locales.size()).map { locales[it].language }
    }

    private fun get(url: String, maxBytes: Int): ByteArray? = runCatching {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 8_000
        c.readTimeout = 15_000
        c.setRequestProperty("User-Agent", "Moshpoint/${BuildConfig.VERSION_NAME} (${BuildConfig.APPLICATION_ID})")
        try {
            if (c.responseCode != 200) return@runCatching null
            c.inputStream.use { input ->
                val out = java.io.ByteArrayOutputStream()
                val chunk = ByteArray(16 * 1024)
                while (true) {
                    val n = input.read(chunk)
                    if (n < 0) break
                    out.write(chunk, 0, n)
                    if (out.size() > maxBytes) return@runCatching null
                }
                out.toByteArray()
            }
        } finally {
            c.disconnect()
        }
    }.getOrNull()

    /** Written whole or not at all, so a half-written file is never mistaken for a finished one. */
    private fun write(file: File, bytes: ByteArray) {
        file.parentFile?.mkdirs()
        val tmp = File(file.parentFile, file.name + ".tmp")
        tmp.writeBytes(bytes)
        if (!tmp.renameTo(file)) {
            file.delete()
            tmp.renameTo(file)
        }
    }

    // ---- Remembering ----

    private fun prefs() = app!!.getSharedPreferences("venue_maps", Context.MODE_PRIVATE)

    private fun load() {
        val p = prefs()
        legacySeenAtMs = p.getLong("legacy_seen", 0L)
        worldFontsAtMs = p.getLong("world_fonts", 0L)
        runCatching {
            val arr = JSONArray(p.getString("areas", "[]"))
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                areas += Area(o.getString("key"), o.getDouble("lat"), o.getDouble("lon"), o.optBoolean("around")).also { a ->
                    o.optJSONArray("crews")?.let { cs -> for (j in 0 until cs.length()) a.crews += cs.getString(j) }
                    a.version = o.optString("version")
                    a.done = o.optBoolean("done")
                    a.percent = o.optInt("percent")
                    a.madeAtMs = o.optLong("made")
                    a.gigEndsAtMs = o.optLong("ends")
                    a.leftAtMs = o.optLong("left")
                    a.deleteAfterMs = o.optLong("delete", Long.MAX_VALUE)
                }
            }
        }
        runCatching {
            val o = JSONObject(p.getString("positions", "{}") ?: "{}")
            for (k in o.keys()) o.getJSONObject(k).let { positions[k] = LatLon(it.getDouble("lat"), it.getDouble("lon")) }
        }
        runCatching {
            val o = JSONObject(p.getString("meta", null) ?: return@runCatching)
            meta = Meta(
                VenueStyle.Tiles(o.getString("template"), o.getString("version"), o.getInt("minzoom"), o.getInt("maxzoom"), o.getString("attribution")),
                o.optString("sprite").ifBlank { null }, o.getString("glyphs"), o.getLong("at"),
            )
        }
    }

    private fun save(force: Boolean) {
        if (app == null) return
        val now = System.currentTimeMillis()
        if (!force && now - lastSaveMs < 5_000) return // progress ticks: a few times a minute is plenty
        lastSaveMs = now
        val arr = JSONArray()
        for (a in areas) {
            arr.put(
                JSONObject().put("key", a.key).put("lat", a.lat).put("lon", a.lon).put("around", a.aroundYou)
                    .put("crews", JSONArray(a.crews.toList())).put("version", a.version).put("done", a.done).put("percent", a.percent)
                    .put("made", a.madeAtMs).put("ends", a.gigEndsAtMs).put("left", a.leftAtMs).put("delete", a.deleteAfterMs),
            )
        }
        val pos = JSONObject()
        for ((k, v) in positions) pos.put(k, JSONObject().put("lat", v.lat).put("lon", v.lon))
        val e = prefs().edit().putString("areas", arr.toString()).putString("positions", pos.toString())
            .putLong("legacy_seen", legacySeenAtMs).putLong("world_fonts", worldFontsAtMs)
        meta?.let { m ->
            e.putString(
                "meta",
                JSONObject().put("template", m.tiles.template).put("version", m.tiles.version).put("minzoom", m.tiles.minZoom)
                    .put("maxzoom", m.tiles.maxZoom).put("attribution", m.tiles.attribution).put("sprite", m.sprite ?: "")
                    .put("glyphs", m.glyphs).put("at", m.atMs).toString(),
            )
        }
        e.apply()
    }
}
