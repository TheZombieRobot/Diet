package nz.waveformlabs.moshpoint.server

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import org.slf4j.LoggerFactory
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.math.roundToInt

/**
 * Discover and hype, the relay's half (docs/DISCOVER_SERVER.md). A Moshpoint+ feature: the
 * routes check [EntitlementCheck] before anything here runs.
 *
 * - **Country lists.** For each country members have asked about in the last week, a refresher
 *   builds the next 12 months of music shows from the sources whose keys are set, a few times a
 *   day, within each source's daily budget. Duplicates are merged ([ShowMerge]), every show is
 *   scored ([Popularity]) and the biggest [DiscoverConfig.maxShows] are kept on the volume. A
 *   country nobody asks about costs nothing.
 * - **[suggest]:** acts whose name (or a word in it) starts with what was typed, biggest first,
 *   grouped near / elsewhere in the country / worldwide. Matches are cached per (country, prefix)
 *   and come only from the lists: never a source call per keystroke.
 * - **[coming]:** the next 12 months for a region, the whole country, or worth travelling for.
 */
class Discover(
    val config: DiscoverConfig,
    private val fetch: suspend (String) -> String? = { GigSearch.httpGet(it) },
    private val clock: () -> Long = System::currentTimeMillis,
    private val sleep: suspend (Long) -> Unit = { delay(it) },
) : AutoCloseable {
    private val log = LoggerFactory.getLogger("nz.waveformlabs.moshpoint.server")
    private val store = DiscoverStore(config.dir)
    private val lists = ConcurrentHashMap<String, CountryList>()
    private val acts = ArtistCache(config.maxActs, config.maxActShows)
    private val budget = DailyBudget(mapOf(TM to config.tmPerDay, SG to config.sgPerDay, BIT to config.bitPerDay), clock)
    private val pacers = mapOf(TM to Pacer(250, clock, sleep), SG to Pacer(500, clock, sleep), BIT to Pacer(500, clock, sleep))

    /** Country → when someone last asked about it; neighbour → when a country near it was asked about. */
    private val asked = ConcurrentHashMap<String, Long>()
    private val nearby = ConcurrentHashMap<String, Long>()
    private val tried = ConcurrentHashMap<String, Long>()
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private val version = AtomicLong()

    @Volatile private var actsSavedAt = 0L

    @Volatile private var actsDirty = false

    /** Least recently used first. */
    private val matchCache = object : LinkedHashMap<String, Matches>(512, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, Matches>?) = size > MAX_CACHED
    }

    /** Calls made to the sources (the tests check that answering never makes one). */
    val sourceCalls = AtomicInteger()

    /** How often a (country, prefix) match was worked out rather than served from the cache. */
    val matchesWorkedOut = AtomicInteger()

    val configured: Boolean get() = config.configured

    init {
        load()
    }

    // ---- Demand ----

    /**
     * Someone asked about [country]: keep its list fresh for [DiscoverConfig.keepAskedMs], and its
     * neighbours' short lists too (for "worth travelling for" and small countries' "near").
     */
    fun ask(country: String) {
        val now = clock()
        val before = asked.put(country, now)
        if (before == null || now - before > 60_000) {
            Regions.around(country, Regions.TRAVEL_KM).forEach { nearby[it] = now }
            trim(asked, config.maxCountries)
            trim(nearby, config.maxNearby)
        }
        if (lists[country] == null) wake.trySend(Unit)
    }

    private fun trim(m: ConcurrentHashMap<String, Long>, max: Int) {
        while (m.size > max) m.entries.minByOrNull { it.value }?.let { m.remove(it.key, it.value) } ?: break
    }

    // ---- The refresher ----

    /** Start the refresher, if any source is configured: it wakes when a new country is asked about, and every minute. */
    fun start(scope: CoroutineScope): Job? {
        if (!config.configured || !config.autoRefresh) return null
        log.info("Discover: sources {}", config.sources.joinToString(", "))
        return scope.launch(Dispatchers.IO) {
            var tidiedAt = 0L
            while (isActive) {
                try {
                    if (!refreshDue()) {
                        val now = clock()
                        if (now - tidiedAt > DiscoverConfig.DAY_MS) {
                            tidiedAt = now
                            tidy(now)
                        }
                        withTimeoutOrNull(60_000) { wake.receive() }
                    }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    log.warn("Discover: refresh failed: {}", e::class.java.simpleName)
                    delay(60_000)
                }
            }
        }
    }

    /** Refresh the country most in need of it, if any is due. True if one was. The refresher's step (and the tests'). */
    suspend fun refreshDue(): Boolean {
        val (country, full) = due(clock()) ?: return false
        refresh(country, full)
        return true
    }

    /** Never built first, then the stalest; countries asked about before neighbours. */
    private fun due(now: Long): Pair<String, Boolean>? {
        fun age(c: String): Long {
            val l = lists[c] ?: store.loadList(c)?.also { lists[c] = it }
            return l?.let { now - it.builtAtMs } ?: Long.MAX_VALUE
        }
        fun ready(c: String) = now - (tried[c] ?: 0L) >= config.retryMs
        val wanted = asked.filter { now - it.value < config.keepAskedMs }.keys
        wanted.filter { ready(it) && (age(it) >= config.refreshEveryMs || lists[it]?.nearby == true) }.maxByOrNull { age(it) }?.let { return it to true }
        return nearby.filter { now - it.value < config.keepAskedMs && it.key !in wanted }.keys
            .filter { ready(it) && age(it) >= config.nearbyRefreshEveryMs }.maxByOrNull { age(it) }?.let { it to false }
    }

    /** Lists nobody wants any more leave memory; files not rebuilt for 30 days leave the volume. */
    private fun tidy(now: Long) {
        asked.entries.removeIf { now - it.value > config.keepAskedMs }
        nearby.entries.removeIf { now - it.value > config.keepAskedMs }
        lists.keys.removeIf { !asked.containsKey(it) && !nearby.containsKey(it) }
        store.dropListsOlderThan(30 * DiscoverConfig.DAY_MS, now)
        saveState()
    }

    private suspend fun get(source: String, url: String): String? {
        pacers.getValue(source).await()
        sourceCalls.incrementAndGet()
        return fetch(url)
    }

    /**
     * Build [country]'s list now: a full list (every page we budget for, Bandsintown followers
     * and tour dates for its biggest acts) or a neighbour's short one ([full] false). False if
     * the sources failed and the old list was kept.
     */
    suspend fun refresh(country: String, full: Boolean = true): Boolean {
        val now = clock()
        tried[country] = now
        val fromSec = now / 1000
        val toSec = fromSec + YEAR_SEC
        val found = ArrayList<Show>()
        var short = false // a source failed, or its budget ran out, part way
        config.ticketmasterKey?.takeIf { it.isNotBlank() }?.let { key ->
            for (page in 0 until minOf(if (full) config.tmPages else 1, DiscoverSources.TM_DEEPEST / DiscoverSources.TM_PAGE)) {
                if (!budget.take(TM)) { short = true; break }
                val p = get(TM, DiscoverSources.ticketmasterUrl(key, country, page, fromSec, toSec))
                    ?.let { runCatching { DiscoverSources.ticketmaster(it, page * DiscoverSources.TM_PAGE) }.getOrNull() }
                if (p == null) { short = true; break }
                found += p.shows
                if (page + 1 >= p.pages) break
            }
        }
        config.seatgeekClientId?.takeIf { it.isNotBlank() && country in DiscoverSources.SEATGEEK_COUNTRIES }?.let { id ->
            for (page in 0 until if (full) config.sgPages else 1) {
                if (!budget.take(SG)) { short = true; break }
                val p = get(SG, DiscoverSources.seatgeekUrl(id, country, page, fromSec, toSec))
                    ?.let { runCatching { DiscoverSources.seatgeek(it, page * DiscoverSources.SG_PAGE) }.getOrNull() }
                if (p == null) { short = true; break }
                found += p.shows
                if (page + 1 >= p.pages) break
            }
        }
        if (full) lookUpActs(if (found.isNotEmpty()) biggestActs(found) else biggestActsAnywhere(), now)
        found += acts.showsIn(country)
        val old = lists[country]
        if (short && old != null && found.size < old.shows.size / 2) {
            log.info("Discover: {} kept its last list (the sources answered too little)", country)
            return false
        }
        val list = build(country, found, full, now)
        lists[country] = list
        version.incrementAndGet()
        store.saveList(list)
        if (actsDirty && (now - actsSavedAt > 10 * 60_000L || actsSavedAt == 0L)) saveActs(now)
        saveState()
        log.info(
            "Discover: {} list built, {} shows (calls today: ticketmaster {}, seatgeek {}, bandsintown {})",
            country, list.shows.size, budget.used(TM), budget.used(SG), budget.used(BIT),
        )
        return true
    }

    /** Followers, tour size and tour dates from Bandsintown, for acts not looked up in the last day. Biggest first, within the budget. */
    private suspend fun lookUpActs(names: List<String>, now: Long) {
        val appId = config.bandsintownAppId?.takeIf { it.isNotBlank() } ?: return
        var looked = 0
        for (name in names) {
            if (looked >= config.bitActs || budget.left(BIT) < 2) break
            val key = Fold.key(name)
            if (key.isEmpty()) continue
            val known = acts.get(key)
            if (known != null && now - known.fetchedAtMs < DiscoverConfig.DAY_MS) continue
            looked++
            budget.take(BIT)
            val body = get(BIT, DiscoverSources.bandsintownActUrl(appId, name)) ?: break // down or turning us away: try another time
            val act = runCatching { DiscoverSources.bandsintownAct(body) }.getOrNull()
            if (act == null) {
                acts.put(key, ArtistCache.Entry(name, -1, 0, "", emptyList(), now, found = false))
                continue
            }
            budget.take(BIT)
            val shows = get(BIT, DiscoverSources.bandsintownEventsUrl(appId, act.name))
                ?.let { runCatching { DiscoverSources.bandsintownEvents(it, act) }.getOrNull() }.orEmpty()
                .filter { it.startsAtSec in now / 1000 - 6 * 3600 until now / 1000 + YEAR_SEC }
                .map { it.copy(score = Popularity.score(it)) }
            acts.put(key, ArtistCache.Entry(act.name, act.followers, act.upcoming, act.image, shows, now, found = true))
            actsDirty = true
        }
    }

    private fun biggestActs(shows: List<Show>): List<String> = shows.groupBy { Fold.key(it.artist) }
        .map { (_, s) -> s.first().artist to s.maxOf { Popularity.score(it.copy(tourDates = maxOf(it.tourDates, s.size))) } }
        .sortedByDescending { it.second }.map { it.first }

    /** For a country the other sources don't cover: the biggest acts we know anywhere (their tours may come here). */
    private fun biggestActsAnywhere(): List<String> = lists.values.flatMap { l -> l.shows.take(200) }
        .groupBy { Fold.key(it.artist) }.map { (_, s) -> s.first().artist to s.maxOf { it.score } }
        .sortedByDescending { it.second }.map { it.first }

    private fun build(country: String, found: List<Show>, full: Boolean, now: Long): CountryList {
        val nowSec = now / 1000
        val inWindow = found.filter { it.country == country && it.startsAtSec > nowSec - 6 * 3600 && it.startsAtSec < nowSec + YEAR_SEC }
        val merged = ShowMerge.merge(unifyRegions(inWindow))
        val counts = merged.groupingBy { Fold.key(it.artist) }.eachCount()
        val scored = merged.map { s ->
            val key = Fold.key(s.artist)
            val act = acts.get(key)?.takeIf { it.found }
            // Tour dates: the act's shows here, or the whole tour as the sources tell it, whichever is more.
            val signals = s.copy(
                followers = maxOf(s.followers, act?.followers ?: -1),
                tourDates = maxOf(s.tourDates, counts[key] ?: 1, act?.upcoming ?: 0),
                image = s.image.ifBlank { act?.image.orEmpty() },
            )
            signals.copy(score = Popularity.score(signals))
        }
        val cap = if (full) config.maxShows else config.maxNearbyShows
        return CountryList(country, now, scored.sortedWith(compareByDescending<Show> { it.score }.thenBy { it.startsAtSec }).take(cap), nearby = !full)
    }

    /** Bandsintown may name a region ("New South Wales") that another source gave a code for ("NSW"): use the code. */
    private fun unifyRegions(shows: List<Show>): List<Show> {
        val byName = HashMap<String, Pair<String, String>>()
        shows.forEach { if (it.region.length in 1..3 && it.regionName.isNotBlank()) byName.putIfAbsent(Fold.text(it.regionName), it.region to it.regionName) }
        if (byName.isEmpty()) return shows
        return shows.map { s ->
            if (s.region.length <= 3) s else byName[Fold.text(s.regionName)]?.let { (id, name) -> s.copy(region = id, regionName = name) } ?: s
        }
    }

    // ---- Answers (from the lists only) ----

    /** An act that matched, with its shows soonest first. */
    private class Hit(val key: String, val artist: String, val score: Double, val image: String, val shows: List<Show>)

    private class Matches(val version: Long, val local: List<Hit>, val world: List<Hit>)

    /** The shows "in" [country], with their acts' keys: a small country's include those just over the border. */
    private fun local(country: String): List<Pair<Show, String>> {
        val own = lists[country]?.let { l -> l.shows.indices.map { l.shows[it] to l.keys[it] } }.orEmpty()
        if (country !in Regions.SMALL) return own
        val c = Regions.centre(country) ?: return own
        return own + lists.values.filter { it.country != country }.flatMap { l ->
            l.shows.indices.filter { i -> (l.shows[i].kmFrom(c) ?: Double.MAX_VALUE) <= Regions.NEAR_KM }.map { l.shows[it] to l.keys[it] }
        }
    }

    private fun matches(country: String, q: String): Matches {
        val v = version.get()
        val cacheKey = "$country|$q"
        synchronized(matchCache) { matchCache[cacheKey] }?.takeIf { it.version == v }?.let { return it }
        matchesWorkedOut.incrementAndGet()
        val local = hits(local(country).filter { Fold.prefixMatch(it.second, q) })
        val localKeys = local.mapTo(HashSet()) { it.key }
        val world = ArrayList<Pair<Show, String>>()
        lists.values.forEach { l ->
            if (l.country != country) l.shows.indices.forEach { i -> if (l.keys[i] !in localKeys && Fold.prefixMatch(l.keys[i], q)) world += l.shows[i] to l.keys[i] }
        }
        acts.snapshot().forEach { (key, e) ->
            if (key !in localKeys && Fold.prefixMatch(key, q)) e.shows.forEach { if (it.country != country) world += it to key }
        }
        val m = Matches(v, local, hits(world))
        synchronized(matchCache) { matchCache[cacheKey] = m }
        return m
    }

    private fun hits(pairs: List<Pair<Show, String>>): List<Hit> = pairs.groupBy({ it.second }, { it.first }).map { (key, shows) ->
        val distinct = shows.distinctBy { it.date + "|" + it.city.lowercase() }.sortedBy { it.startsAtSec }
        val best = distinct.maxBy { it.score }
        Hit(key, best.artist, best.score, distinct.firstOrNull { it.image.isNotBlank() }?.image.orEmpty(), distinct)
    }.sortedWith(compareByDescending<Hit> { it.score }.thenBy { it.artist })

    /** The id of [country]'s region that [asked] names (by id or name, any case or accents), or null. */
    private fun regionId(country: String, asked: String): String? {
        val a = Fold.text(asked)
        return lists[country]?.regions?.firstOrNull { Fold.text(it.id) == a || Fold.text(it.name) == a }?.id
    }

    private fun hitJson(h: Hit, shows: List<Show>, inCountry: Int?): JSONObject = JSONObject().put("artist", h.artist).put("score", h.score)
        .put("image", h.image).put("shows", shows.size).apply { if (inCountry != null) put("countryShows", inCountry) }
        .put("next", shows.first().toApi())

    /**
     * Acts with upcoming shows whose name, or a word in it, starts with [typed]: `near` (the
     * region; for a small country, the country and just over the border), `elsewhere` (the rest
     * of the country; everything, when no region is given) and `worldwide`, each biggest first.
     * `ready` is false until the country's first list is built (seconds to minutes after the first ask).
     */
    fun suggest(country: String, typed: String, region: String?, limit: Int = 10): JSONObject {
        ask(country)
        val q = Fold.text(typed).take(MAX_PREFIX)
        val list = lists[country]
        val regionAsked = Regions.asked(country, region)
        val id = regionAsked?.let { regionId(country, it) }
        val m = if (q.isEmpty()) Matches(0, emptyList(), emptyList()) else matches(country, q)
        val near = ArrayList<JSONObject>()
        val elsewhere = ArrayList<JSONObject>()
        val small = country in Regions.SMALL
        for (h in m.local) {
            val nearShows = when {
                small -> h.shows
                id != null -> h.shows.filter { it.country == country && it.region == id }
                else -> emptyList()
            }
            if (nearShows.isNotEmpty()) {
                if (near.size < limit) near += hitJson(h, nearShows, h.shows.count { it.country == country })
            } else if (elsewhere.size < limit) {
                elsewhere += hitJson(h, h.shows, h.shows.size)
            }
        }
        return JSONObject().put("country", country).put("q", typed.trim().take(MAX_PREFIX)).put("region", id ?: JSONObject.NULL)
            .put("ready", list != null).put("updatedAtSec", (list?.builtAtMs ?: 0L) / 1000)
            .put("near", JSONArray(near)).put("elsewhere", JSONArray(elsewhere))
            .put("worldwide", JSONArray(m.world.take(limit).map { hitJson(it, it.shows, null) }))
    }

    /**
     * The next 12 months, biggest first. [scope]: `near` (default: the [region] if it's one of
     * the country's, a small country with just over the border, else the whole country),
     * `country`, or `travel` (big shows abroad within [Regions.TRAVEL_KM] of the region or country).
     */
    fun coming(country: String, region: String?, scope: String?, limit: Int = 50): JSONObject {
        ask(country)
        val list = lists[country]
        val nowSec = clock() / 1000
        val id = Regions.asked(country, region)?.let { regionId(country, it) }
        val view = when (scope?.trim()?.lowercase()) {
            "country", "all" -> "country"
            "travel" -> "travel"
            else -> "near"
        }
        val shows: List<Pair<Show, Int?>> = when (view) {
            "travel" -> travel(country, id)
            "country" -> list?.shows.orEmpty().map { it to null }
            else -> when {
                country in Regions.SMALL -> local(country).map { it.first }.sortedByDescending { it.score }.map { it to null }
                id != null -> list?.shows.orEmpty().filter { it.region == id }.map { it to null }
                else -> list?.shows.orEmpty().map { it to null }
            }
        }.filter { it.first.startsAtSec > nowSec - 3 * 3600 }
        return JSONObject().put("country", country).put("scope", view).put("region", id ?: JSONObject.NULL)
            .put("ready", list != null).put("updatedAtSec", (list?.builtAtMs ?: 0L) / 1000).put("total", shows.size)
            .put("shows", JSONArray(shows.take(limit).map { (s, km) -> s.toApi().apply { if (km != null) put("km", km) } }))
            .put("regions", JSONArray(list?.regions.orEmpty().map { it.toJson() }))
    }

    /**
     * Worth travelling for: a stadium, festival or big outdoor show, a venue for 15,000 or more,
     * or a show scoring [BIG_SCORE] or more, in another country within [Regions.TRAVEL_KM] of the
     * region's middle (or the country's).
     */
    private fun travel(country: String, regionId: String?): List<Pair<Show, Int?>> {
        val list = lists[country]
        val origin = list?.regions?.firstOrNull { it.id == regionId && it.lat != null }?.let { doubleArrayOf(it.lat!!, it.lon!!) }
            ?: Regions.centre(country)
            ?: list?.shows?.filter { it.lat != null && it.lon != null }?.takeIf { it.isNotEmpty() }?.let { s -> doubleArrayOf(s.map { it.lat!! }.average(), s.map { it.lon!! }.average()) }
            ?: return emptyList()
        val abroad = lists.values.filter { it.country != country }.flatMap { it.shows } + acts.snapshot().flatMap { it.second.shows }.filter { it.country != country }
        return abroad.filter { big(it) }.mapNotNull { s -> s.kmFrom(origin)?.takeIf { it <= Regions.TRAVEL_KM }?.let { s to it.roundToInt() } }
            .distinctBy { it.first.id }.sortedByDescending { it.first.score }.map { it.first to it.second }
    }

    private fun big(s: Show) = s.kind == VenueKind.STADIUM || s.kind == VenueKind.FESTIVAL || s.kind == VenueKind.OUTDOOR ||
        s.capacity >= 15_000 || s.score >= BIG_SCORE

    /** Calls made today to [source] (for the logs and the tests). */
    fun callsToday(source: String): Int = budget.used(source)

    /** For tests: put a list in place as if the refresher had built it. */
    internal fun putList(list: CountryList) {
        lists[list.country] = list
        version.incrementAndGet()
    }

    // ---- On the volume ----

    private fun load() {
        val now = clock()
        store.load(STATE)?.let { text ->
            runCatching {
                val o = JSONObject(text)
                budget.load(o.optJSONObject("budget"))
                o.optJSONObject("asked")?.let { a -> a.keySet().forEach { k -> a.optLong(k).takeIf { now - it < config.keepAskedMs }?.let { asked[k] = it } } }
                o.optJSONObject("nearby")?.let { a -> a.keySet().forEach { k -> a.optLong(k).takeIf { now - it < config.keepAskedMs }?.let { nearby[k] = it } } }
            }
        }
        store.load(ACTS)?.let { runCatching { acts.load(it) } }
        (asked.keys + nearby.keys).forEach { c -> store.loadList(c)?.let { lists[c] = it } }
    }

    private fun saveState() = runCatching {
        store.save(STATE, JSONObject().put("budget", budget.toJson()).put("asked", JSONObject(asked.toMap())).put("nearby", JSONObject(nearby.toMap())).toString())
    }.onFailure { log.warn("Discover: couldn't save its state: {}", it::class.java.simpleName) }

    private fun saveActs(now: Long) = runCatching {
        store.save(ACTS, acts.toJson())
        actsSavedAt = now
        actsDirty = false
    }.onFailure { log.warn("Discover: couldn't save the acts: {}", it::class.java.simpleName) }

    override fun close() {
        if (actsDirty) saveActs(clock())
        saveState()
    }

    companion object {
        private const val TM = DiscoverSources.TICKETMASTER
        private const val SG = DiscoverSources.SEATGEEK
        private const val BIT = DiscoverSources.BANDSINTOWN
        private const val STATE = "state.json"
        private const val ACTS = "acts.json"
        const val YEAR_SEC = 366L * 24 * 3600
        const val MAX_PREFIX = 40
        const val MAX_CACHED = 20_000
        const val BIG_SCORE = 0.7

        private val ISO = java.util.Locale.getISOCountries().toHashSet()

        /** An ISO country code from a query parameter, or null. */
        fun country(s: String?): String? = s?.trim()?.uppercase()?.takeIf { it.length == 2 && it in ISO }
    }
}
