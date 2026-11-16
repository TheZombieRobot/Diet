package nz.waveformlabs.moshpoint.discover

import android.content.Context
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.chat.ChatSync
import nz.waveformlabs.moshpoint.core.ComingAnswer
import nz.waveformlabs.moshpoint.core.DiscoverPlace
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.ui.home.ComingStatus
import nz.waveformlabs.moshpoint.ui.home.ComingUpView

/**
 * "Coming up near you" on the home's No crew state, for Moshpoint+ members (ComingUp.png,
 * docs/DISCOVER_APP.md). Asks the relay for the country and at most the region: the phone's
 * coarse position picks the region here (New Zealand's island, or the nearest region the relay
 * listed) and never leaves the phone. Answers are kept for an hour per scope.
 */
object ComingUp {
    const val NEAR = "near"
    const val COUNTRY = "country"
    const val TRAVEL = "travel"

    /** The chip that's on. Compose state. */
    val scope = mutableStateOf(NEAR)
    private val answers = mutableStateMapOf<String, ComingAnswer>()
    private val status = mutableStateOf(ComingStatus.LOADING)
    private val fetchedAt = HashMap<String, Long>()
    private var job: Job? = null
    private var asked: String? = null
    private val io = CoroutineScope(SupervisorJob() + Dispatchers.Main + nz.waveformlabs.moshpoint.safety.AppErrors.handler("ComingUp"))

    /** The relay said no (403 or 503): no card this session; the Plan a gig row is back. */
    val closed: Boolean get() = status.value == ComingStatus.CLOSED

    private const val FRESH_MS = 3600_000L
    private const val NOT_READY_RETRY_MS = 30_000L

    /** Make sure the answer for the current scope is there (asked again after an hour). */
    fun load(c: Context, me: LatLon?) {
        val app = c.applicationContext
        if (!DiscoverClient.available || closed) return
        val sc = scope.value
        val fresh = System.currentTimeMillis() - (fetchedAt[sc] ?: 0L) < FRESH_MS && answers[sc]?.ready == true
        if (fresh || (asked == sc && job?.isActive == true)) return
        job?.cancel()
        asked = sc
        job = io.launch {
            val country = DiscoverWhere.country(app)
            if (answers[sc] == null) status.value = ComingStatus.LOADING
            var region = DiscoverWhere.region(app, country, me)
            while (true) {
                when (val a = DiscoverClient.coming(country, region, sc)) {
                    is DiscoverClient.Answer.Ok -> {
                        DiscoverWhere.rememberRegions(app, country, a.value.regions)
                        // First time in this country: now its regions are known, ask again for ours.
                        val better = if (region == null && !country.equals("NZ", true)) DiscoverPlace.region(country, me, a.value.regions) else null
                        if (better != null && sc != COUNTRY) {
                            region = better
                            continue
                        }
                        answers[sc] = a.value
                        fetchedAt[sc] = System.currentTimeMillis()
                        status.value = if (a.value.ready) ComingStatus.READY else ComingStatus.NOT_READY
                        if (a.value.ready) return@launch
                    }
                    DiscoverClient.Answer.Closed -> {
                        status.value = ComingStatus.CLOSED
                        return@launch
                    }
                    DiscoverClient.Answer.Failed -> {
                        if (answers[sc] == null) status.value = ComingStatus.FAILED
                        return@launch
                    }
                }
                delay(NOT_READY_RETRY_MS)
            }
        }
    }

    /** The card as it stands. Reads Compose state. */
    fun view(c: Context): ComingUpView {
        val sc = scope.value
        val a = answers[sc]
        val country = DiscoverWhere.country(c)
        val near = a?.region ?: answers[NEAR]?.region
        return ComingUpView(
            scope = sc,
            regionName = DiscoverWhere.regionName(c, country, near),
            shows = a?.shows.orEmpty(),
            status = if (a != null && a.ready) ComingStatus.READY else status.value,
            planned = DiscoverPlanned.all(c),
        )
    }

    fun choose(c: Context, newScope: String, me: LatLon?) {
        scope.value = newScope
        load(c, me)
    }
}

/** Which Discover shows have a crew on this phone: show id → crew id, kept while that crew is. */
object DiscoverPlanned {
    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("discover", Context.MODE_PRIVATE)
    private val version = mutableStateOf(0)

    fun remember(c: Context, showId: String, crewId: String) {
        if (showId.isBlank()) return
        prefs(c).edit().putString("planned_$showId", crewId).apply()
        version.value++
    }

    /** Show id → crew id, for crews that still exist (main or Up next). Reads Compose state. */
    fun all(c: Context): Map<String, String> {
        version.value
        val live = ChatSync.allCrews(c).map { GigArchive.idFor(it) }.toSet()
        val p = prefs(c)
        val out = HashMap<String, String>()
        p.all.forEach { (k, v) ->
            if (!k.startsWith("planned_")) return@forEach
            val crew = v as? String ?: return@forEach
            if (crew in live) out[k.removePrefix("planned_")] = crew else p.edit().remove(k).apply()
        }
        return out
    }
}
