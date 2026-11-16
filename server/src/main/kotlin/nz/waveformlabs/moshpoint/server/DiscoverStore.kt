package nz.waveformlabs.moshpoint.server

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate

/**
 * Discover's settings. The source keys come from the relay's secrets (docs/SECRETS.md), the
 * same ones gig search uses; nothing here is ever in the repo. Budgets and sizes:
 * docs/DISCOVER_SERVER.md.
 */
data class DiscoverConfig(
    /** DATA_DIR/discover on the volume. */
    val dir: File,
    val ticketmasterKey: String? = null,
    val seatgeekClientId: String? = null,
    val bandsintownAppId: String? = null,
    /** Run the refresher (off in tests, which refresh by hand). */
    val autoRefresh: Boolean = true,
    /** A country someone asked about: refreshed 4 times a day. A neighbour kept for "worth travelling for": twice. */
    val refreshEveryMs: Long = 6 * HOUR_MS,
    val nearbyRefreshEveryMs: Long = 12 * HOUR_MS,
    /** A country nobody has asked about for this long stops being refreshed (and costs nothing). */
    val keepAskedMs: Long = 7 * DAY_MS,
    /** A refresh that failed is tried again after this long. */
    val retryMs: Long = 30 * 60_000L,
    /** The biggest this many shows are kept per country (see docs/DISCOVER_SERVER.md for why 2,000). */
    val maxShows: Int = 2_000,
    val maxNearbyShows: Int = 300,
    /** Countries kept fresh at once; past these, the one asked about longest ago is dropped. */
    val maxCountries: Int = 40,
    val maxNearby: Int = 80,
    /** Calls per full refresh: Ticketmaster pages of 200 (5 reach its 1,000-result limit), SeatGeek pages of 100, Bandsintown acts looked up. */
    val tmPages: Int = 5,
    val sgPages: Int = 10,
    val bitActs: Int = 150,
    /** Calls a day (UTC). Ticketmaster allows 5,000 a key: gig search keeps the rest. */
    val tmPerDay: Int = 3_000,
    val sgPerDay: Int = 1_000,
    val bitPerDay: Int = 2_000,
    /** Bandsintown acts remembered (each looked up at most once a day), and their shows altogether. */
    val maxActs: Int = 3_000,
    val maxActShows: Int = 50_000,
) {
    val sources: List<String> get() = listOfNotNull(
        DiscoverSources.TICKETMASTER.takeIf { !ticketmasterKey.isNullOrBlank() },
        DiscoverSources.SEATGEEK.takeIf { !seatgeekClientId.isNullOrBlank() },
        DiscoverSources.BANDSINTOWN.takeIf { !bandsintownAppId.isNullOrBlank() },
    )

    /** At least one source key is set. Without one, the endpoints answer 503 "not configured". */
    val configured: Boolean get() = sources.isNotEmpty()

    companion object {
        const val HOUR_MS = 3_600_000L
        const val DAY_MS = 24 * HOUR_MS

        fun fromEnv(dataDir: File, env: (String) -> String? = System::getenv): DiscoverConfig {
            fun key(name: String) = env(name)?.trim()?.ifBlank { null }
            fun int(name: String, default: Int) = env(name)?.trim()?.toIntOrNull()?.takeIf { it >= 0 } ?: default
            return DiscoverConfig(
                dir = File(dataDir, "discover"),
                ticketmasterKey = key("TICKETMASTER_KEY"),
                seatgeekClientId = key("SEATGEEK_CLIENT_ID"),
                bandsintownAppId = key("BANDSINTOWN_APP_ID"),
                tmPerDay = int("DISCOVER_TM_PER_DAY", 3_000),
                sgPerDay = int("DISCOVER_SG_PER_DAY", 1_000),
                bitPerDay = int("DISCOVER_BIT_PER_DAY", 2_000),
                maxCountries = int("DISCOVER_MAX_COUNTRIES", 40).coerceAtLeast(1),
            )
        }
    }
}

/**
 * The one Moshpoint+ check for the relay's keyed endpoints (ROADMAP.md: anything that runs on a
 * paid API key is members only). Today it says no to everyone, unless MOSHPOINT_DISCOVER_OPEN=1
 * opens it for internal testing: never on the production relay. The billing work plugs in
 * purchase verification here (a Play purchase token checked with Google, cached per install).
 */
interface EntitlementCheck {
    /** May the request with these [headers] use the keyed [feature] ("discover")? */
    suspend fun allows(feature: String, headers: (String) -> String?): Boolean

    companion object {
        val NOBODY: EntitlementCheck = object : EntitlementCheck {
            override suspend fun allows(feature: String, headers: (String) -> String?) = false
        }
        val EVERYONE: EntitlementCheck = object : EntitlementCheck {
            override suspend fun allows(feature: String, headers: (String) -> String?) = true
        }

        /** Only the exact value "1" opens it. */
        fun fromEnv(env: (String) -> String? = System::getenv): EntitlementCheck =
            if (env("MOSHPOINT_DISCOVER_OPEN")?.trim() == "1") EVERYONE else NOBODY
    }
}

/** Calls a day per source (UTC days), kept on the volume so a restart doesn't hand out a fresh day. */
class DailyBudget(private val perDay: Map<String, Int>, private val clock: () -> Long) {
    private var day = today()
    private val used = HashMap<String, Int>()

    private fun today() = LocalDate.ofEpochDay(Math.floorDiv(clock(), DiscoverConfig.DAY_MS)).toString()

    private fun roll() {
        val t = today()
        if (t != day) {
            day = t
            used.clear()
        }
    }

    @Synchronized fun take(source: String, n: Int = 1): Boolean {
        roll()
        val u = used[source] ?: 0
        if (u + n > (perDay[source] ?: 0)) return false
        used[source] = u + n
        return true
    }

    @Synchronized fun left(source: String): Int {
        roll()
        return (perDay[source] ?: 0) - (used[source] ?: 0)
    }

    @Synchronized fun used(source: String): Int {
        roll()
        return used[source] ?: 0
    }

    @Synchronized fun toJson(): JSONObject = JSONObject().put("day", day).put("used", JSONObject(used.toMap()))

    @Synchronized fun load(o: JSONObject?) {
        if (o == null || o.optString("day") != today()) return
        val u = o.optJSONObject("used") ?: return
        u.keySet().forEach { used[it] = u.optInt(it) }
    }
}

/** At most one call per [gapMs] to a source (Ticketmaster allows 5 a second; we make 4). Used by the refresher alone. */
class Pacer(private val gapMs: Long, private val clock: () -> Long, private val sleep: suspend (Long) -> Unit) {
    private var next = 0L

    suspend fun await() {
        val now = clock()
        val wait = next - now
        next = maxOf(now, next) + gapMs
        if (wait > 0) sleep(wait)
    }
}

/**
 * Bandsintown acts we've looked up (at most once a day each), shared by every country: their
 * followers, tour size and shows anywhere. Least recently used go first past [maxActs] acts or
 * [maxShows] shows altogether.
 */
class ArtistCache(private val maxActs: Int, private val maxShows: Int) {
    /** [found] false: Bandsintown doesn't know the act (remembered too, so it isn't asked again today). */
    class Entry(val name: String, val followers: Int, val upcoming: Int, val image: String, val shows: List<Show>, val fetchedAtMs: Long, val found: Boolean)

    private val map = LinkedHashMap<String, Entry>(256, 0.75f, true)
    private var showCount = 0

    @Synchronized fun get(key: String): Entry? = map[key]

    @Synchronized fun put(key: String, e: Entry) {
        map.remove(key)?.let { showCount -= it.shows.size }
        map[key] = e
        showCount += e.shows.size
        val it = map.entries.iterator()
        while ((map.size > maxActs || showCount > maxShows) && it.hasNext()) {
            val old = it.next()
            if (old.key == key) continue
            showCount -= old.value.shows.size
            it.remove()
        }
    }

    @Synchronized fun showsIn(country: String): List<Show> = map.values.flatMap { e -> e.shows.filter { it.country == country } }

    @Synchronized fun snapshot(): List<Pair<String, Entry>> = map.entries.map { it.key to it.value }

    @Synchronized fun size(): Int = map.size

    @Synchronized fun toJson(): String = JSONArray(
        map.entries.map { (k, e) ->
            JSONObject().put("key", k).put("name", e.name).put("followers", e.followers).put("upcoming", e.upcoming).put("image", e.image)
                .put("at", e.fetchedAtMs).put("found", e.found).put("shows", JSONArray(e.shows.map { it.toStored() }))
        },
    ).toString()

    fun load(text: String) {
        val a = JSONArray(text)
        for (i in 0 until a.length()) {
            val o = a.optJSONObject(i) ?: continue
            val shows = o.optJSONArray("shows")?.let { s -> (0 until s.length()).mapNotNull { s.optJSONObject(it)?.let(Show::fromStored) } }.orEmpty()
            put(o.getString("key"), Entry(o.optString("name"), o.optInt("followers", -1), o.optInt("upcoming"), o.optString("image"), shows, o.optLong("at"), o.optBoolean("found")))
        }
    }
}

/** A region in a country list: how many shows it has and its middle (the phone picks its own region from these). */
data class RegionInfo(val id: String, val name: String, val shows: Int, val lat: Double?, val lon: Double?) {
    fun toJson(): JSONObject = JSONObject().put("id", id).put("name", name).put("shows", shows)
        .apply { if (lat != null && lon != null) put("lat", Math.round(lat * 100) / 100.0).put("lon", Math.round(lon * 100) / 100.0) }
}

/**
 * One country's upcoming shows, biggest first, as last built. [nearby]: a neighbour's short list,
 * kept for "worth travelling for" and small countries' "near", not asked about itself.
 */
class CountryList(val country: String, val builtAtMs: Long, val shows: List<Show>, val nearby: Boolean) {
    /** [Fold.key] of each show's act, in the same order as [shows]. */
    val keys: List<String> = shows.map { Fold.key(it.artist) }

    val regions: List<RegionInfo> by lazy {
        shows.filter { it.region.isNotEmpty() }.groupBy { it.region }.map { (id, s) ->
            val placed = s.filter { it.lat != null && it.lon != null }
            RegionInfo(
                id, s.firstOrNull { it.regionName.isNotBlank() }?.regionName ?: id, s.size,
                placed.takeIf { it.isNotEmpty() }?.map { it.lat!! }?.average(), placed.takeIf { it.isNotEmpty() }?.map { it.lon!! }?.average(),
            )
        }.sortedByDescending { it.shows }
    }

    fun toJson(): String = JSONObject().put("country", country).put("builtAtMs", builtAtMs).put("nearby", nearby)
        .put("shows", JSONArray(shows.map { it.toStored() })).toString()

    companion object {
        fun parse(text: String): CountryList? = runCatching {
            val o = JSONObject(text)
            val a = o.getJSONArray("shows")
            CountryList(o.getString("country"), o.getLong("builtAtMs"), (0 until a.length()).mapNotNull { Show.fromStored(a.getJSONObject(it)) }, o.optBoolean("nearby"))
        }.getOrNull()
    }
}

/**
 * Discover's files on the volume, each written whole and then renamed into place (a crash leaves
 * the old file, never half a new one): `lists/NZ.json` per country, `acts.json`, `state.json`.
 */
class DiscoverStore(val dir: File) {
    private val lists = File(dir, "lists")

    init {
        // Leftovers of a write cut off by a crash.
        listOf(dir, lists).forEach { d -> d.listFiles { f -> f.name.endsWith(".part") }?.forEach { it.delete() } }
    }

    fun saveList(l: CountryList) = write(File(lists, "${l.country}.json"), l.toJson())

    fun loadList(country: String): CountryList? = File(lists, "$country.json").takeIf { it.isFile }?.let { f ->
        runCatching { CountryList.parse(f.readText()) }.getOrNull()
    }

    /** Lists not rebuilt for [olderThanMs] (nobody asks about that country any more). */
    fun dropListsOlderThan(olderThanMs: Long, now: Long): Int =
        lists.listFiles { f -> f.name.endsWith(".json") && now - f.lastModified() > olderThanMs }?.count { it.delete() } ?: 0

    fun save(name: String, text: String) = write(File(dir, name), text)

    fun load(name: String): String? = File(dir, name).takeIf { it.isFile }?.let { runCatching { it.readText() }.getOrNull() }

    private fun write(f: File, text: String) {
        f.parentFile.mkdirs()
        val tmp = Disk.writeTemp(f.parentFile, text.toByteArray())
        try {
            Disk.move(tmp, f)
        } finally {
            tmp.delete()
        }
    }
}
