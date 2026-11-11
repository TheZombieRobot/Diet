package nz.waveformlabs.moshpoint.locate

import android.content.Context
import android.location.Location
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.GroupSync
import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.core.LocationBox

/**
 * Feeds the map while it's open: our own position, plus everyone's shared locations from
 * the relay (and the Bluetooth crowd relay), into [LocationBook].
 *
 * Crew first, then friends; at most 32 people per lookup (two rotating ids each).
 */
class MapFeed(context: Context, private val scope: CoroutineScope) {
    private val myLocation = MyLocation(context)
    private var jobs = listOf<Job>()

    /** Our own position (null until the first fix). */
    val me = mutableStateOf<Location?>(null)

    /** "Updated just now" / "No connection" line for the map. */
    val status = mutableStateOf(nz.waveformlabs.moshpoint.Txt.s(nz.waveformlabs.moshpoint.R.string.find_map_status_looking))

    fun start() {
        if (jobs.isNotEmpty()) return
        jobs = listOf(
            scope.launch { myLocation.updates(intervalMs = 5_000, minDistanceM = 0f).collect { me.value = it } },
            scope.launch {
                while (true) {
                    poll()
                    delay(maxOf(RelayClient.pollMs, 20_000L))
                }
            },
        )
    }

    fun stop() {
        jobs.forEach { it.cancel() }
        jobs = emptyList()
    }

    private fun people(): List<Friend> {
        val all = FriendsRepository.friends.filterNot { FriendsRepository.isSimulated(it.id) }
        val crew = all.filter { it.gigGroupOnly || it.key in GroupSync.members }
        return (crew + (all - crew.toSet())).take(32)
    }

    private suspend fun poll() {
        val list = people()
        if (list.isEmpty()) {
            status.value = nz.waveformlabs.moshpoint.Txt.s(nz.waveformlabs.moshpoint.R.string.find_map_status_no_mates)
            return
        }
        val now = System.currentTimeMillis()
        val asks = list.flatMap { f ->
            val e = f.ephemeralId.epochAt(now)
            listOf(f to f.ephemeralId.idForEpoch(e), f to f.ephemeralId.idForEpoch(e - 1))
        }
        asks.forEach { (f, id) ->
            CrowdRelayRadio.cache.lookup(id, now / 1000)?.let { p ->
                LocationBox.open(f.secret, id, p.sealed)?.let { LocationBook.update(f.id, it) }
            }
        }
        val results = RelayClient.lookup(asks.map { it.second })
        if (results == null) {
            status.value = nz.waveformlabs.moshpoint.Txt.s(nz.waveformlabs.moshpoint.R.string.find_map_status_offline)
            return
        }
        asks.forEachIndexed { i, (f, id) ->
            results[i].forEach { sealed -> LocationBox.open(f.secret, id, sealed)?.let { LocationBook.update(f.id, it) } }
        }
        status.value = nz.waveformlabs.moshpoint.Txt.s(nz.waveformlabs.moshpoint.R.string.find_map_status_updated)
    }
}
