package nz.waveformlabs.moshpoint.locate

import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.core.SharedLocation

/**
 * What the app plugs into the finder for the whole process (docs/FINDER_MODULE.md). Set them
 * once, before any finder runs: the phone app does it first thing in `Application.onCreate`.
 *
 * Every one is optional. Left unset, the finder still finds by Bluetooth, UWB, Wi-Fi Aware, the
 * crowd relay's Bluetooth cache and the compass; it just has no server to ask, nobody to tell,
 * and no status lines. Things that differ between finders (who we are, who to find, what to do
 * with a reading) are passed to each finder instead.
 */
object FinderPlugins {
    /** Live status lines and a log for a debug panel. Test builds only (see [FinderLog]). */
    @Volatile var status: FinderStatus? = null

    /** Field recordings (CSV lines, core `RecordLine`). Test builds only. */
    @Volatile var recorder: FinderRecorder? = null

    /** The internet side of GPS finding and the crowd relay: sealed boxes looked up and passed up. */
    @Volatile var mailbox: FinderMailbox? = null

    /** Every sealed location the GPS finder opens (where a mate last shared their position). */
    @Volatile var sharedLocations: SharedLocationSink? = null

    /** Fixes made from our own GPS position besides the mates' shared ones (e.g. a pinned spot). */
    @Volatile var extraFixes: ExtraFixSource? = null

    /** Other packets that take turns in the crowd relay's advertising set (e.g. messages). */
    @Volatile var relayLane: RelayLane? = null
}

/** A debug panel: one line per technology, and a log. */
interface FinderStatus {
    /** e.g. "UWB (looking)" -> "ranging 2 peer(s): 3.20 m, az 12°". */
    fun set(key: String, value: String)

    /** A notable event, newest first in the panel. */
    fun log(line: String)
}

/** A field recording in progress. */
interface FinderRecorder {
    /** Recording right now. */
    val active: Boolean

    /** One CSV line (core `RecordLine`). */
    fun line(csv: String)
}

/** A relay server holding sealed boxes under rotating ids. Only ids and sealed bytes ever pass through it. */
interface FinderMailbox {
    /** How often the GPS finder asks, in ms. */
    val pollMs: Long

    /** Which relay, for the status line. */
    val label: String

    /** For each id, the sealed records posted under it, newest first; null if the relay couldn't be reached. */
    suspend fun lookup(ids: List<ByteArray>): List<List<ByteArray>>?

    /** Pass crowd-relay packets heard over Bluetooth up to the relay (so far-away mates get them too). */
    val relayUpload: Boolean

    /** Post one sealed record under [id]. */
    suspend fun put(id: ByteArray, sealed: ByteArray): Boolean
}

/** Where a mate last shared their GPS position. */
fun interface SharedLocationSink {
    fun update(mateId: String, loc: SharedLocation)
}

/** A fix the GPS finder can make for [mateId] from our own position besides their shared GPS. */
fun interface ExtraFixSource {
    fun fixFor(mateId: String, me: LatLon, myAccuracyM: Double, nowMs: Long): Fix?
}

/** Packets that share the crowd relay's one advertising set, taking turns with locations (core `RelaySchedule`). */
interface RelayLane {
    /** A relay-UUID packet that isn't a location. */
    fun onPacket(bytes: ByteArray)

    /** Something waiting to go on air. */
    fun hasPacket(): Boolean

    /** The next packet to put on air, if any. */
    fun nextPacket(): ByteArray?
}
