package nz.waveformlabs.moshpoint.core.watch

import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream

/*
 * What the phone and the watch say to each other (docs/WATCH.md, problem 5).
 *
 * Every frame starts with three bytes: MAGIC, the protocol version, the message type. The
 * rules that keep an older watch and a newer phone (or the other way round) working:
 *
 * 1. Inside one version, fields are only ever ADDED AT THE END. A reader ignores bytes after
 *    the ones it knows, and a new reader treats missing new fields as defaults.
 * 2. A message type the reader doesn't know is ignored, not an error.
 * 3. Enums travel as fixed numbers (never their position in the Kotlin enum); a number the
 *    reader doesn't know becomes that enum's "unknown" value.
 * 4. Anything that breaks those rules bumps [WatchProtocol.VERSION]. A frame from a newer
 *    version is answered with a [WatchMessage.VersionNotice], whose layout never changes, so
 *    each side can tell the wearer which device needs updating instead of guessing.
 */
object WatchProtocol {
    /** The version this build writes. */
    const val VERSION = 1

    /** The oldest version this build still reads. */
    const val MIN_VERSION = 1
    internal const val MAGIC = 0x4D // 'M'

    // Wear Data Layer names. Messages are live and never stored; data items are small state
    // the watch keeps (crew status, faces).
    const val PATH_TO_PHONE = "/mosh/to-phone"
    const val PATH_TO_WATCH = "/mosh/to-watch"
    const val PATH_STATE = "/mosh/state"
    const val PATH_FACE_PREFIX = "/mosh/face/"
    const val KEY_PAYLOAD = "p"
    const val KEY_IMAGE = "img"
    const val CAPABILITY_PHONE = "moshpoint_phone"
    const val CAPABILITY_WATCH = "moshpoint_watch"

    // Pace. About two updates a second while the arrow can be seen, one every two seconds
    // for buzzes alone, nothing at all when no find is on.
    const val FAST_INTERVAL_MS = 500L
    const val SLOW_INTERVAL_MS = 2_000L

    /** The watch re-asks this often while a find is on... */
    const val RENEW_EVERY_MS = 5_000L

    /** ...and the phone stops finding when it hasn't been asked for this long. */
    const val LEASE_MS = 15_000L

    /** The watch ends a find after this long; the phone's own cap is a little longer. */
    const val WATCH_SESSION_MAX_MS = 15 * 60_000L
    const val PHONE_SESSION_MAX_MS = 20 * 60_000L

    /** How long the watch waits for the phone's answer to a ping before calling it not sent. */
    const val PING_ANSWER_TIMEOUT_MS = 12_000L

    private const val T_FIND_START = 1
    private const val T_FIND_RENEW = 2
    private const val T_FIND_STOP = 3
    private const val T_PING = 4
    private const val T_SYNC_REQUEST = 5
    private const val T_FIND_UPDATE = 16
    private const val T_FIND_ENDED = 17
    private const val T_PING_RESULT = 18
    internal const val T_STATE = 32
    private const val T_VERSION_NOTICE = 127

    private const val NO_U16 = 0xFFFF
    private const val NO_U32 = 0xFFFFFFFFL

    fun encode(m: WatchMessage): ByteArray = frame(typeOf(m)) { out ->
        when (m) {
            is WatchMessage.FindStart -> {
                out.writeInt(m.sessionId)
                out.writeByte(if (m.fast) 1 else 0)
                out.writeInt(m.watchClockMs)
                out.writeString(m.mateId)
            }
            is WatchMessage.FindRenew -> {
                out.writeInt(m.sessionId)
                out.writeByte(if (m.fast) 1 else 0)
                out.writeInt(m.watchClockMs)
            }
            is WatchMessage.FindStop -> out.writeInt(m.sessionId)
            is WatchMessage.Ping -> {
                out.writeInt(m.requestId)
                out.writeByte(m.kind.code)
            }
            WatchMessage.SyncRequest -> Unit
            is WatchMessage.FindUpdate -> {
                val r = m.reading
                out.writeInt(m.sessionId)
                out.writeShort(m.seq and 0xFFFF)
                out.writeByte(m.status.code)
                out.writeByte(kindCode(r.kind))
                out.writeByte(if (r.unsure) 1 else 0)
                out.writeByte(methodCode(r.method))
                out.writeByte(trendCode(r.trend))
                out.writeShort(r.bearingTrueDeg?.let { Math.floorMod(Math.round(it * 100), 36_000L).toInt() } ?: NO_U16)
                out.writeInt(r.distanceM?.let { Math.round(it * 100).coerceIn(0L, NO_U32 - 1).toInt() } ?: NO_U32.toInt())
                out.writeShort(ageCode(r.directionAgeMs))
                out.writeShort(ageCode(r.distanceAgeMs))
                out.writeShort(Math.round(r.declinationDeg * 100).coerceIn(-18_000L, 18_000L).toInt())
                out.writeInt(m.echoWatchClockMs)
                out.writeShort(if (m.echoHeldMs < 0) NO_U16 else m.echoHeldMs.coerceAtMost(NO_U16 - 1))
            }
            is WatchMessage.FindEnded -> {
                out.writeInt(m.sessionId)
                out.writeByte(m.reason.code)
            }
            is WatchMessage.PingResult -> {
                out.writeInt(m.requestId)
                out.writeByte(m.outcome.code)
            }
            is WatchMessage.VersionNotice -> {
                out.writeByte(m.minVersion)
                out.writeByte(m.maxVersion)
            }
        }
    }

    fun decode(bytes: ByteArray): Decoded {
        if (bytes.size < 3 || (bytes[0].toInt() and 0xFF) != MAGIC) return Decoded.Garbage
        val version = bytes[1].toInt() and 0xFF
        val type = bytes[2].toInt() and 0xFF
        val r = Reader(bytes, 3)
        return try {
            // Readable whatever version sent it: that's the point of it.
            if (type == T_VERSION_NOTICE) return Decoded.Ok(WatchMessage.VersionNotice(r.u8(), r.u8()))
            if (version > VERSION) return Decoded.TooNew(version)
            if (version < MIN_VERSION) return Decoded.TooOld(version)
            val m: WatchMessage = when (type) {
                T_FIND_START -> {
                    val session = r.i32()
                    val fast = r.u8() != 0
                    val clock = r.i32()
                    WatchMessage.FindStart(session, r.str(), fast, clock)
                }
                T_FIND_RENEW -> WatchMessage.FindRenew(r.i32(), r.u8() != 0, r.i32())
                T_FIND_STOP -> WatchMessage.FindStop(r.i32())
                T_PING -> WatchMessage.Ping(r.i32(), PingKind.of(r.u8()))
                T_SYNC_REQUEST -> WatchMessage.SyncRequest
                T_FIND_UPDATE -> {
                    val session = r.i32()
                    val seq = r.u16()
                    val status = FindStatus.of(r.u8())
                    val kind = kindOf(r.u8())
                    val unsure = (r.u8() and 1) != 0
                    val method = methodOf(r.u8())
                    val trend = trendOf(r.u8())
                    val bearing = r.u16().takeIf { it != NO_U16 }?.let { it / 100.0 }
                    val distance = r.u32().takeIf { it != NO_U32 }?.let { it / 100.0 }
                    val directionAge = ageOf(r.u16())
                    val distanceAge = ageOf(r.u16())
                    val declination = r.i16() / 100.0
                    val echoClock = r.i32()
                    val echoHeld = r.u16().let { if (it == NO_U16) -1 else it }
                    WatchMessage.FindUpdate(
                        session, seq, status,
                        WristReading(
                            kind = if (kind == WristReading.Kind.POINTING && bearing == null) WristReading.Kind.DISTANCE_ONLY else kind,
                            bearingTrueDeg = bearing.takeIf { kind == WristReading.Kind.POINTING },
                            distanceM = distance, trend = trend, method = method, unsure = unsure,
                            directionAgeMs = directionAge, distanceAgeMs = distanceAge, declinationDeg = declination,
                        ),
                        echoClock, echoHeld,
                    )
                }
                T_FIND_ENDED -> WatchMessage.FindEnded(r.i32(), EndReason.of(r.u8()))
                T_PING_RESULT -> WatchMessage.PingResult(r.i32(), PingOutcome.of(r.u8()))
                else -> return Decoded.UnknownType(type)
            }
            Decoded.Ok(m)
        } catch (_: Truncated) {
            Decoded.Garbage
        }
    }

    /** The answer to a frame this build can't read. */
    fun versionNotice(): ByteArray = encode(WatchMessage.VersionNotice(MIN_VERSION, VERSION))

    /** Is a newer frame number than [last]? Sequence numbers wrap at 65536. */
    fun isNewer(seq: Int, last: Int): Boolean = ((seq - last) and 0xFFFF) in 1..0x7FFF

    private fun typeOf(m: WatchMessage) = when (m) {
        is WatchMessage.FindStart -> T_FIND_START
        is WatchMessage.FindRenew -> T_FIND_RENEW
        is WatchMessage.FindStop -> T_FIND_STOP
        is WatchMessage.Ping -> T_PING
        WatchMessage.SyncRequest -> T_SYNC_REQUEST
        is WatchMessage.FindUpdate -> T_FIND_UPDATE
        is WatchMessage.FindEnded -> T_FIND_ENDED
        is WatchMessage.PingResult -> T_PING_RESULT
        is WatchMessage.VersionNotice -> T_VERSION_NOTICE
    }

    internal fun frame(type: Int, body: (DataOutputStream) -> Unit): ByteArray {
        val bytes = ByteArrayOutputStream()
        DataOutputStream(bytes).use { out ->
            out.writeByte(MAGIC)
            out.writeByte(VERSION)
            out.writeByte(type)
            body(out)
        }
        return bytes.toByteArray()
    }

    internal fun DataOutputStream.writeString(s: String) {
        // Cut on a character boundary so a long name can't produce broken UTF-8.
        var text = s
        var b = text.toByteArray(Charsets.UTF_8)
        while (b.size > MAX_STRING_BYTES) {
            text = text.dropLast(1)
            b = text.toByteArray(Charsets.UTF_8)
        }
        writeShort(b.size)
        write(b)
    }

    internal const val MAX_STRING_BYTES = 200

    // Ages travel in tenths of a second: 0..6553 s is far more than any fix lives.
    private fun ageCode(ms: Long): Int = (ms.coerceAtLeast(0) / 100).coerceAtMost((NO_U16 - 1).toLong()).toInt()
    private fun ageOf(code: Int): Long = if (code == NO_U16) 0L else code * 100L

    private fun methodCode(m: Method?): Int = when (m) {
        null -> 0
        Method.UWB -> 1
        Method.GPS_SERVER -> 2
        Method.SPIN_SCAN -> 3
        Method.WALK -> 4
        Method.CROWD_RELAY -> 5
        Method.WIFI_AWARE -> 6
        Method.BLE_RSSI -> 7
    }

    private fun methodOf(code: Int): Method? = when (code) {
        1 -> Method.UWB
        2 -> Method.GPS_SERVER
        3 -> Method.SPIN_SCAN
        4 -> Method.WALK
        5 -> Method.CROWD_RELAY
        6 -> Method.WIFI_AWARE
        7 -> Method.BLE_RSSI
        else -> null
    }

    private fun kindCode(k: WristReading.Kind) = when (k) {
        WristReading.Kind.NO_SIGNAL -> 0
        WristReading.Kind.DISTANCE_ONLY -> 1
        WristReading.Kind.POINTING -> 2
    }

    private fun kindOf(code: Int) = when (code) {
        1 -> WristReading.Kind.DISTANCE_ONLY
        2 -> WristReading.Kind.POINTING
        else -> WristReading.Kind.NO_SIGNAL
    }

    private fun trendCode(t: Trend) = when (t) {
        Trend.STEADY -> 0
        Trend.WARMER -> 1
        Trend.COLDER -> 2
    }

    private fun trendOf(code: Int) = when (code) {
        1 -> Trend.WARMER
        2 -> Trend.COLDER
        else -> Trend.STEADY
    }
}

internal class Truncated : RuntimeException()

internal class Reader(private val b: ByteArray, private var i: Int) {
    val left: Int get() = b.size - i
    fun u8(): Int {
        if (left < 1) throw Truncated()
        return b[i++].toInt() and 0xFF
    }
    fun u16(): Int = (u8() shl 8) or u8()
    fun i16(): Int = u16().toShort().toInt()
    fun i32(): Int = (u16() shl 16) or u16()
    fun u32(): Long = i32().toLong() and 0xFFFFFFFFL
    fun str(): String {
        val n = u16()
        if (left < n) throw Truncated()
        return String(b, i, n, Charsets.UTF_8).also { i += n }
    }
    fun skip(n: Int) {
        if (left < n) throw Truncated()
        i += n
    }
    /** A reader over the next [n] bytes; this one moves past them whatever the inner one reads. */
    fun slice(n: Int): Reader {
        if (left < n) throw Truncated()
        return Reader(b.copyOfRange(i, i + n), 0).also { i += n }
    }
}

sealed interface Decoded {
    data class Ok(val message: WatchMessage) : Decoded

    /** From a newer build than this one: answer with [WatchProtocol.versionNotice]. */
    data class TooNew(val version: Int) : Decoded

    /** From a build too old to talk to. */
    data class TooOld(val version: Int) : Decoded

    /** A message this build doesn't know. Ignore it. */
    data class UnknownType(val type: Int) : Decoded

    /** Not ours, or cut short. */
    data object Garbage : Decoded
}

sealed interface WatchMessage {
    // ---- watch -> phone ----

    /**
     * "Find this mate for me." Also sent again after the link drops and comes back.
     * @param sessionId picked by the watch for this find; everything about it carries it.
     * @param mateId the mate's id in the phone's own list (nothing new is minted for the watch).
     * @param fast the arrow can be seen: about two updates a second. False: buzzes only.
     * @param watchClockMs the watch's own clock (low 32 bits), echoed back to measure the link.
     */
    data class FindStart(val sessionId: Int, val mateId: String, val fast: Boolean, val watchClockMs: Int) : WatchMessage

    /** "Still looking." Renews the lease and sets the pace. */
    data class FindRenew(val sessionId: Int, val fast: Boolean, val watchClockMs: Int) : WatchMessage
    data class FindStop(val sessionId: Int) : WatchMessage

    /** A wrist ping. [requestId] is reused on a retry so one ping is never sent twice. */
    data class Ping(val requestId: Int, val kind: PingKind) : WatchMessage

    /** The watch app opened: please publish the crew status again if it's missing. */
    data object SyncRequest : WatchMessage

    // ---- phone -> watch ----

    /**
     * Where the mate is, about twice a second while finding.
     * @param echoHeldMs how long ago the phone got the watch clock it's echoing; -1 = nothing to echo.
     */
    data class FindUpdate(
        val sessionId: Int,
        val seq: Int,
        val status: FindStatus,
        val reading: WristReading,
        val echoWatchClockMs: Int = 0,
        val echoHeldMs: Int = -1,
    ) : WatchMessage

    data class FindEnded(val sessionId: Int, val reason: EndReason) : WatchMessage
    data class PingResult(val requestId: Int, val outcome: PingOutcome) : WatchMessage

    // ---- either way ----

    /** "I can only read versions [minVersion]..[maxVersion]." Its layout is frozen for good. */
    data class VersionNotice(val minVersion: Int, val maxVersion: Int) : WatchMessage {
        /** The other side is too new for this build: THIS device needs the update. */
        val thisDeviceIsOld: Boolean get() = minVersion > WatchProtocol.VERSION

        /** The other side is too old for this build: THAT device needs the update. */
        val otherDeviceIsOld: Boolean get() = maxVersion < WatchProtocol.MIN_VERSION
    }
}

enum class PingKind(val code: Int) {
    ON_MY_WAY(1), ALL_GOOD(2), NEED_HELP(3),

    /** "I'm OK now" after a wrist Need help: part of the safety feature, so free like it. */
    SOS_ALL_CLEAR(4),
    UNKNOWN(0);

    companion object {
        fun of(code: Int) = entries.firstOrNull { it.code == code } ?: UNKNOWN
    }
}

/** How the phone's finder is doing, sent with every update. */
enum class FindStatus(val code: Int) {
    OK(0),

    /** Android won't let the phone find from the background right now: open Moshpoint on it once. */
    NEEDS_PHONE(1),

    /** Not Moshpoint+. */
    NOT_ENTITLED(2),

    /** The phone doesn't know that mate (removed, or the crew ended). */
    NO_SUCH_MATE(3),
    BLUETOOTH_OFF(4),

    /** The phone app hasn't been given the permissions finding needs. */
    NO_PERMISSION(5),
    UNKNOWN(255);

    companion object {
        fun of(code: Int) = entries.firstOrNull { it.code == code } ?: UNKNOWN
    }
}

enum class EndReason(val code: Int) {
    /** Stop was tapped on the phone's notification. */
    STOPPED_ON_PHONE(1),
    LEASE_EXPIRED(2),
    TIME_LIMIT(3),
    NOT_ENTITLED(4),
    MATE_GONE(5),
    UNKNOWN(255);

    companion object {
        fun of(code: Int) = entries.firstOrNull { it.code == code } ?: UNKNOWN
    }
}

/** What became of a wrist ping, as far as the phone can honestly tell. */
enum class PingOutcome(val code: Int) {
    /** The phone found its own signed ping back on the relay: it is out there. */
    SENT(1),

    /** Handed to the phone's ping path, but it couldn't be seen on the relay (no signal?). */
    UNCONFIRMED(2),

    /** Not in a crew: there is no one to tell. */
    NO_CREW(3),
    NOT_ENTITLED(4),
    FAILED(5),
    UNKNOWN(255);

    companion object {
        fun of(code: Int) = entries.firstOrNull { it.code == code } ?: UNKNOWN
    }
}
