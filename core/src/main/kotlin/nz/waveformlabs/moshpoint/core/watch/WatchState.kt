package nz.waveformlabs.moshpoint.core.watch

import nz.waveformlabs.moshpoint.core.watch.WatchProtocol.writeString

/**
 * One mate as the watch knows them: just what its screen shows. No keys, no coordinates.
 *
 * @param id the mate's id in the phone's own list (already exists there; nothing new is made).
 * @param lastSeenSec when the phone last had a shared spot from them (unix seconds, 0 = never).
 * @param distanceM metres from the phone, when both spots were recent.
 * @param faceKey names the data item holding their face (a hash of the picture), "" = none.
 */
data class WatchMate(
    val id: String,
    val name: String,
    val colour: Int,
    val lastSeenSec: Long = 0,
    val distanceM: Double? = null,
    val faceKey: String = "",
) {
    fun live(nowSec: Long): Boolean = lastSeenSec > 0 && nowSec - lastSeenSec < WatchState.LIVE_WITHIN_SEC
}

/**
 * The crew status the phone pushes to the watch whenever it changes (a Wear data item, so it
 * waits for the watch if the link is down). The tile, the complication and the mate list are
 * all drawn from the latest one; the watch never polls for it.
 *
 * @param plus the phone's Moshpoint+ check, synced. False = [mates] is empty: nothing about
 *   the crew is sent to a watch that isn't entitled to show it.
 * @param sentAtSec the phone's clock when it wrote this (unix seconds).
 */
data class WatchState(
    val plus: Boolean,
    val crewName: String = "",
    val sentAtSec: Long = 0,
    val mates: List<WatchMate> = emptyList(),
    /** The versions the phone can read, so the watch can ask for an update before trying. */
    val phoneMinVersion: Int = WatchProtocol.MIN_VERSION,
    val phoneMaxVersion: Int = WatchProtocol.VERSION,
) {
    /** Still worth calling current? After this the "live" claims are dropped, not re-fetched. */
    fun fresh(nowSec: Long): Boolean = nowSec - sentAtSec < FRESH_FOR_SEC

    fun liveCount(nowSec: Long): Int = mates.count { it.live(nowSec) }

    /** The closest mate with a known distance who is live right now. */
    fun nearest(nowSec: Long): WatchMate? = mates.filter { it.distanceM != null && it.live(nowSec) }.minByOrNull { it.distanceM!! }

    fun encode(): ByteArray = WatchProtocol.frame(WatchProtocol.T_STATE) { out ->
        out.writeByte(phoneMinVersion)
        out.writeByte(phoneMaxVersion)
        out.writeByte(if (plus) 1 else 0)
        out.writeInt(sentAtSec.toInt())
        out.writeString(crewName)
        val list = mates.take(MAX_MATES)
        out.writeByte(list.size)
        for (m in list) {
            // Each mate is length-prefixed, so a later version can add fields per mate and
            // this one will step over them.
            val one = java.io.ByteArrayOutputStream()
            java.io.DataOutputStream(one).use { o ->
                o.writeString(m.id)
                o.writeString(m.name)
                o.writeInt(m.colour)
                o.writeInt(m.lastSeenSec.toInt())
                o.writeInt(m.distanceM?.let { Math.round(it * 100).coerceIn(0L, 0xFFFFFFFEL).toInt() } ?: -1)
                o.writeString(m.faceKey)
            }
            out.writeShort(one.size())
            one.writeTo(out)
        }
    }

    companion object {
        /** The same rule the phone uses for its "live" label. */
        const val LIVE_WITHIN_SEC = 120L
        const val FRESH_FOR_SEC = 180L

        /** A watch list isn't the place for a festival-sized crew: nearest and live first. */
        const val MAX_MATES = 24

        /** Null if these bytes aren't a state this build can read. */
        fun decode(bytes: ByteArray): WatchState? {
            if (bytes.size < 3 || (bytes[0].toInt() and 0xFF) != WatchProtocol.MAGIC) return null
            val version = bytes[1].toInt() and 0xFF
            if (version > WatchProtocol.VERSION || version < WatchProtocol.MIN_VERSION) return null
            if ((bytes[2].toInt() and 0xFF) != WatchProtocol.T_STATE) return null
            val r = Reader(bytes, 3)
            return try {
                val min = r.u8()
                val max = r.u8()
                val plus = (r.u8() and 1) != 0
                val sentAt = r.u32()
                val crew = r.str()
                val mates = List(r.u8()) {
                    val m = r.slice(r.u16())
                    WatchMate(
                        id = m.str(), name = m.str(), colour = m.i32(), lastSeenSec = m.u32(),
                        distanceM = m.u32().takeIf { it != 0xFFFFFFFFL }?.let { it / 100.0 },
                        faceKey = m.str(),
                    )
                }
                WatchState(plus, crew, sentAt, mates, min, max)
            } catch (_: Truncated) {
                null
            }
        }

        /**
         * Which crew mates go to the watch, in what order: live ones first by distance, then
         * the rest by how recently they were seen. The watch shows them in this order.
         */
        fun order(mates: List<WatchMate>, nowSec: Long): List<WatchMate> = mates.sortedWith(
            compareBy<WatchMate> { !it.live(nowSec) }
                .thenBy { it.distanceM ?: Double.MAX_VALUE }
                .thenByDescending { it.lastSeenSec }
                .thenBy { it.name.lowercase() },
        ).take(MAX_MATES)
    }
}

/** The one thing a complication (or the top of the tile) has room to say. */
sealed interface CrewGlance {
    /** The watch has never heard from the phone. */
    data object NoPhone : CrewGlance

    /** Not Moshpoint+. */
    data object Locked : CrewGlance

    /** Moshpoint+, but no crew tonight. */
    data object NoCrew : CrewGlance

    /** The last status is too old to claim anyone is live. */
    data class Stale(val total: Int) : CrewGlance

    /** "Sam · 40 m": the nearest mate. */
    data class Nearest(val name: String, val distanceM: Double, val live: Int, val total: Int) : CrewGlance

    /** "4 of 5 live": nobody's distance is known. */
    data class LiveCount(val live: Int, val total: Int) : CrewGlance

    companion object {
        fun of(state: WatchState?, nowSec: Long): CrewGlance = when {
            state == null -> NoPhone
            !state.plus -> Locked
            state.mates.isEmpty() -> NoCrew
            !state.fresh(nowSec) -> Stale(state.mates.size)
            else -> state.nearest(nowSec)?.let { Nearest(it.name, it.distanceM!!, state.liveCount(nowSec), state.mates.size) }
                ?: LiveCount(state.liveCount(nowSec), state.mates.size)
        }
    }
}
