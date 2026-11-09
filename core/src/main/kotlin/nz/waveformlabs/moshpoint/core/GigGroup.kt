package nz.waveformlabs.moshpoint.core

import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * One-QR gig groups.
 *
 * One person starts a group: a random [key] goes into a QR code. Everyone who scans it
 * joins. Members then introduce themselves to each other automatically, by broadcasting
 * an [Intro] (their finding secret + name) encrypted with the group key, over Bluetooth
 * and, when there's signal, via the relay server. Anyone in the group who receives it
 * adds that member to their gig group. Outsiders only see random-looking bytes under a
 * tag that rotates every few minutes.
 */
class GigGroup(
    val key: ByteArray,
    val name: String,
    val createdAtMs: Long,
    /** When the gig starts (unix s), or 0 for "tonight / now". */
    val startsAtSec: Long = 0L,
    /** Where it is ("Spark Arena, Auckland"), may be blank. */
    val venue: String = "",
    /** The venue's position, when known (from gig search), for "at the venue" on followers' screens. */
    val venueLat: Double? = null,
    val venueLon: Double? = null,
) {
    init {
        require(key.size == 32)
    }

    /**
     * A crew for a gig that's still days away sleeps: no Bluetooth, no location sharing, no
     * battery. It wakes [WAKE_BEFORE_SEC] before the start.
     */
    fun dormant(nowMs: Long) = startsAtSec > 0 && nowMs / 1000 < startsAtSec - WAKE_BEFORE_SEC

    /** When the wake-up happens (unix s), or 0 if it isn't sleeping. */
    val wakeAtSec: Long get() = if (startsAtSec > 0) startsAtSec - WAKE_BEFORE_SEC else 0L

    /** The crew ends the morning after: 12 h after the start, or 18 h after it was made for "tonight". */
    val expiresAtMs: Long get() = if (startsAtSec > 0) (startsAtSec + 12 * 3600) * 1000 else createdAtMs + 18L * 3600 * 1000

    /** Rotating 8-byte tag that marks "this is an intro for group X" (only members can compute it). */
    fun tagAt(nowMs: Long): ByteArray = tagForEpoch(Math.floorDiv(nowMs, EphemeralId.DEFAULT_ROTATION_MS))

    fun tagForEpoch(epoch: Long): ByteArray =
        hmac(key, "moshpoint-group-tag".toByteArray() + ByteBuffer.allocate(8).putLong(epoch).array()).copyOf(TAG_BYTES)

    fun matchesTag(tag: ByteArray, nowMs: Long): Boolean {
        val e = Math.floorDiv(nowMs, EphemeralId.DEFAULT_ROTATION_MS)
        return (-3L..3L).any { tagForEpoch(e + it).contentEquals(tag) }
    }

    /** Server mailbox id where members post intros (16 bytes, rotates with the epoch). */
    fun rosterIdForEpoch(epoch: Long): ByteArray =
        hmac(key, "moshpoint-group-roster".toByteArray() + ByteBuffer.allocate(8).putLong(epoch).array()).copyOf(16)

    /** What a member broadcasts: `[tag:8][time:4][AES-GCM(secret:32, colourHint:1, name)+tag:12]`. */
    fun sealIntro(intro: Intro, nowMs: Long): ByteArray {
        val nameBytes = intro.name.toByteArray(Charsets.UTF_8).let { trimUtf8(it, MAX_NAME_BYTES) }
        val plain = intro.secret + byteArrayOf(nameBytes.size.toByte()) + nameBytes
        val time = ByteBuffer.allocate(4).putInt((nowMs / 1000).toInt()).array()
        val tag = tagAt(nowMs)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, aesKey(), GCMParameterSpec(96, nonce(tag, time, intro.secret)))
        c.updateAAD(tag + time)
        return tag + time + intro.secret.copyOf(4) + c.doFinal(plain)
    }

    /** Returns the intro if this blob is for our group and intact. */
    fun openIntro(blob: ByteArray, nowMs: Long): Intro? {
        if (blob.size < TAG_BYTES + 4 + 4 + 33 + 12) return null
        val tag = blob.copyOfRange(0, TAG_BYTES)
        if (!matchesTag(tag, nowMs)) return null
        val time = blob.copyOfRange(TAG_BYTES, TAG_BYTES + 4)
        val hint = blob.copyOfRange(TAG_BYTES + 4, TAG_BYTES + 8)
        return runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, aesKey(), GCMParameterSpec(96, nonceFromHint(tag, time, hint)))
            c.updateAAD(tag + time)
            val plain = c.doFinal(blob, TAG_BYTES + 8, blob.size - TAG_BYTES - 8)
            val secret = plain.copyOfRange(0, 32)
            require(secret.copyOf(4).contentEquals(hint))
            val n = plain[32].toInt() and 0xFF
            Intro(secret, String(plain, 33, n, Charsets.UTF_8))
        }.getOrNull()
    }

    /** Mailbox id for the crew's meet-up pin (changes daily so old pins fade away). */
    fun rallyIdForDay(day: Long): ByteArray =
        hmac(key, "moshpoint-group-rally".toByteArray() + ByteBuffer.allocate(8).putLong(day).array()).copyOf(16)

    /**
     * A meet-up pin for the crew: `[time:4][nonce:8][AES-GCM(lat:8, lon:8, nameLen:1, name)+tag]`.
     * [rally] with a blank name and 0,0 means "pin removed".
     */
    fun sealRally(rally: Rally, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray {
        val name = trimUtf8(rally.name.toByteArray(Charsets.UTF_8), MAX_NAME_BYTES)
        val plain = ByteBuffer.allocate(17 + name.size).putDouble(rally.lat).putDouble(rally.lon).put(name.size.toByte()).put(name).array()
        val time = ByteBuffer.allocate(4).putInt(rally.timeSec.toInt()).array()
        val nonce = ByteArray(8).also { random.nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, rallyKey(), GCMParameterSpec(96, time + nonce))
        c.updateAAD("rally".toByteArray())
        return time + nonce + c.doFinal(plain)
    }

    fun openRally(blob: ByteArray): Rally? {
        if (blob.size < 12 + 17 + 12) return null
        return runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, rallyKey(), GCMParameterSpec(96, blob.copyOfRange(0, 12)))
            c.updateAAD("rally".toByteArray())
            val plain = ByteBuffer.wrap(c.doFinal(blob, 12, blob.size - 12))
            val lat = plain.double
            val lon = plain.double
            val n = plain.get().toInt() and 0xFF
            val name = ByteArray(n).also { plain.get(it) }
            Rally(lat, lon, String(name, Charsets.UTF_8), (ByteBuffer.wrap(blob, 0, 4).int.toLong() and 0xFFFFFFFFL))
        }.getOrNull()
    }

    /** Mailbox id for crew pings ("Coming", "Need help"...), rotating with the epoch. */
    fun pingIdForEpoch(epoch: Long): ByteArray =
        hmac(key, "moshpoint-group-ping".toByteArray() + ByteBuffer.allocate(8).putLong(epoch).array()).copyOf(16)

    /** Mailbox id for the crew chat and pinned plan (daily; the relay keeps these much longer than pings). */
    fun chatIdForDay(day: Long): ByteArray =
        hmac(key, "moshpoint-group-chat".toByteArray() + ByteBuffer.allocate(8).putLong(day).array()).copyOf(16)

    /** A quick message to the whole crew, optionally with where the sender is. */
    data class Ping(
        val kind: Int,
        val from: String,
        val timeSec: Long,
        val lat: Double? = null,
        val lon: Double? = null,
        /** [CHECK_IN]: minutes until they should be home. [FLARE]: minutes it lasts. */
        val minutes: Int = 0,
        /** [CHAT] message, [FLARE] vibe, or the [PLAN] text (up to [MAX_TEXT_BYTES]). */
        val text: String = "",
    ) {
        companion object {
            const val COMING = 1
            const val STAY_PUT = 2
            const val WHERE_ARE_YOU = 3
            const val MEET_AT_PIN = 4
            const val ALL_GOOD = 5
            const val GOING_HOME = 6
            const val NEED_HELP = 7
            /** "Heading home: worry if I haven't checked in within [minutes]." */
            const val CHECK_IN = 8
            /** "Home safe": ends a check-in. */
            const val HOME_SAFE = 9
            /** A short text message to the crew. */
            const val CHAT = 10
            /** "Here, for the next half hour" with a vibe ("Bar time 🍺"), shown on the map. */
            const val FLARE = 11
            /** The crew's pinned plan ("Meet at the sound desk after the encore"). Blank clears it. */
            const val PLAN = 12
            const val MAX_TEXT_BYTES = 160
        }
    }

    /** `[time:4][nonce:8][AES-GCM(kind:1, lat:4, lon:4, nameLen:1, name)+tag]` (lat/lon 1e-7 deg, both 0 = none). */
    fun sealPing(p: Ping, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray {
        val name = trimUtf8(p.from.toByteArray(Charsets.UTF_8), MAX_NAME_BYTES)
        val text = trimUtf8(p.text.toByteArray(Charsets.UTF_8), Ping.MAX_TEXT_BYTES)
        // Older builds stop reading after the minutes, so the text tail is ignored there.
        val plain = ByteBuffer.allocate(12 + name.size + (if (text.isEmpty()) 0 else 1 + text.size)).put(p.kind.toByte())
            .putInt(((p.lat ?: 0.0) * 1e7).toInt()).putInt(((p.lon ?: 0.0) * 1e7).toInt())
            .put(name.size.toByte()).put(name).putShort(p.minutes.coerceIn(0, 32767).toShort())
            .apply { if (text.isNotEmpty()) put(text.size.toByte()).put(text) }.array()
        val time = ByteBuffer.allocate(4).putInt(p.timeSec.toInt()).array()
        val nonce = ByteArray(8).also { random.nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, rallyKey(), GCMParameterSpec(96, time + nonce))
        c.updateAAD("ping".toByteArray())
        return time + nonce + c.doFinal(plain)
    }

    fun openPing(blob: ByteArray): Ping? {
        if (blob.size < 12 + 10 + 12) return null
        return runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, rallyKey(), GCMParameterSpec(96, blob.copyOfRange(0, 12)))
            c.updateAAD("ping".toByteArray())
            val b = ByteBuffer.wrap(c.doFinal(blob, 12, blob.size - 12))
            val kind = b.get().toInt() and 0xFF
            val lat = b.int
            val lon = b.int
            val n = b.get().toInt() and 0xFF
            val name = ByteArray(n).also { b.get(it) }
            val minutes = if (b.remaining() >= 2) b.short.toInt() else 0
            val text = if (b.remaining() >= 1) {
                val tn = minOf(b.get().toInt() and 0xFF, b.remaining())
                String(ByteArray(tn).also { b.get(it) }, Charsets.UTF_8)
            } else ""
            val hasLoc = lat != 0 || lon != 0
            Ping(
                kind, String(name, Charsets.UTF_8), ByteBuffer.wrap(blob, 0, 4).int.toLong() and 0xFFFFFFFFL,
                if (hasLoc) lat / 1e7 else null, if (hasLoc) lon / 1e7 else null, minutes, text,
            )
        }.getOrNull()
    }

    /** Mailbox id for crew photo "moments" (daily: they fade out by morning). */
    fun momentsIdForDay(day: Long): ByteArray =
        hmac(key, "moshpoint-group-moments".toByteArray() + ByteBuffer.allocate(8).putLong(day).array()).copyOf(16)

    /** A photo shared with the crew, with where and when it was taken. */
    class Moment(val from: String, val timeSec: Long, val lat: Double?, val lon: Double?, val caption: String, val jpeg: ByteArray)

    /** `[time:4][nonce:8][AES-GCM(lat:4, lon:4, nameLen:1, name, capLen:1, caption, jpeg)+tag]`. */
    fun sealMoment(m: Moment, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray {
        val name = trimUtf8(m.from.toByteArray(Charsets.UTF_8), MAX_NAME_BYTES)
        val cap = trimUtf8(m.caption.toByteArray(Charsets.UTF_8), 80)
        val plain = ByteBuffer.allocate(10 + name.size + cap.size + m.jpeg.size)
            .putInt(((m.lat ?: 0.0) * 1e7).toInt()).putInt(((m.lon ?: 0.0) * 1e7).toInt())
            .put(name.size.toByte()).put(name).put(cap.size.toByte()).put(cap).put(m.jpeg).array()
        val time = ByteBuffer.allocate(4).putInt(m.timeSec.toInt()).array()
        val nonce = ByteArray(8).also { random.nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, rallyKey(), GCMParameterSpec(96, time + nonce))
        c.updateAAD("moment".toByteArray())
        return time + nonce + c.doFinal(plain)
    }

    fun openMoment(blob: ByteArray): Moment? {
        if (blob.size < 12 + 10 + 12) return null
        return runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, rallyKey(), GCMParameterSpec(96, blob.copyOfRange(0, 12)))
            c.updateAAD("moment".toByteArray())
            val b = ByteBuffer.wrap(c.doFinal(blob, 12, blob.size - 12))
            val lat = b.int
            val lon = b.int
            val name = ByteArray(b.get().toInt() and 0xFF).also { b.get(it) }
            val cap = ByteArray(b.get().toInt() and 0xFF).also { b.get(it) }
            val jpeg = ByteArray(b.remaining()).also { b.get(it) }
            val hasLoc = lat != 0 || lon != 0
            Moment(
                String(name, Charsets.UTF_8), ByteBuffer.wrap(blob, 0, 4).int.toLong() and 0xFFFFFFFFL,
                if (hasLoc) lat / 1e7 else null, if (hasLoc) lon / 1e7 else null, String(cap, Charsets.UTF_8), jpeg,
            )
        }.getOrNull()
    }

    private fun rallyKey() = SecretKeySpec(hmac(key, "moshpoint-group-rally-aes".toByteArray()).copyOf(16), "AES")

    data class Rally(val lat: Double, val lon: Double, val name: String, val timeSec: Long) {
        val removed get() = name.isBlank() && lat == 0.0 && lon == 0.0
    }

    private fun aesKey() = SecretKeySpec(hmac(key, "moshpoint-group-aes".toByteArray()).copyOf(16), "AES")

    // Nonce unique per (member, second): first 4 bytes of their secret + time + tag prefix.
    private fun nonce(tag: ByteArray, time: ByteArray, secret: ByteArray) = nonceFromHint(tag, time, secret.copyOf(4))
    private fun nonceFromHint(tag: ByteArray, time: ByteArray, hint: ByteArray) = hint + time + tag.copyOf(4)

    data class Intro(val secret: ByteArray, val name: String) {
        override fun equals(other: Any?) = other is Intro && secret.contentEquals(other.secret) && name == other.name
        override fun hashCode() = secret.contentHashCode()
    }

    companion object {
        const val TAG_BYTES = 8
        const val MAX_NAME_BYTES = 24
        /** Upper bound for an intro: fits a BT5 extended advert and a server record (128). */
        const val MAX_INTRO_BYTES = TAG_BYTES + 4 + 4 + 32 + 1 + MAX_NAME_BYTES + 12

        private val enc = java.util.Base64.getUrlEncoder().withoutPadding()
        private val dec = java.util.Base64.getUrlDecoder()
        private const val PREFIX = "moshpoint:group?key="

        /**
         * QR contents for joining. [host] (the person showing the QR) rides along, so whoever
         * scans it can find the host straight away, before any Bluetooth or internet intro
         * arrives. Host fields go before `name` so older versions still read the name.
         */
        fun qr(group: GigGroup, host: Intro? = null, follower: Boolean = false): String {
            val h = host?.let {
                "&h=${enc.encodeToString(it.secret)}&hn=${java.net.URLEncoder.encode(it.name.take(40), "UTF-8")}"
            }.orEmpty()
            val gig = (if (group.startsAtSec > 0) "&at=${group.startsAtSec}" else "") +
                (if (group.venue.isNotBlank()) "&v=${java.net.URLEncoder.encode(group.venue.take(60), "UTF-8")}" else "") +
                (if (group.venueLat != null && group.venueLon != null) "&vl=%.5f,%.5f".format(java.util.Locale.ROOT, group.venueLat, group.venueLon) else "") +
                (if (follower) "&f=1" else "")
            return "$PREFIX${enc.encodeToString(group.key)}$h$gig&name=${java.net.URLEncoder.encode(group.name, "UTF-8")}"
        }

        /** The host's intro carried in a group QR, if any. */
        fun hostOf(text: String): Intro? {
            val t = text.trim()
            if (!t.startsWith(PREFIX)) return null
            val params = t.removePrefix(PREFIX).split('&').drop(1)
                .mapNotNull { p -> p.indexOf('=').takeIf { it > 0 }?.let { p.substring(0, it) to p.substring(it + 1) } }
                .toMap()
            val secret = params["h"]?.let { runCatching { dec.decode(it) }.getOrNull() }?.takeIf { it.size == 32 } ?: return null
            val name = params["hn"]?.let { runCatching { java.net.URLDecoder.decode(it, "UTF-8") }.getOrNull() }.orEmpty()
            return Intro(secret, name.ifBlank { "Host" })
        }

        fun parseQr(text: String, nowMs: Long): GigGroup? {
            val t = text.trim()
            if (!t.startsWith(PREFIX)) return null
            val rest = t.removePrefix(PREFIX)
            val key = runCatching { dec.decode(rest.substringBefore('&')) }.getOrNull()?.takeIf { it.size == 32 } ?: return null
            val name = rest.substringAfter("&name=", "").let { runCatching { java.net.URLDecoder.decode(it, "UTF-8") }.getOrDefault("") }
            val params = rest.substringBefore("&name=").split('&').drop(1)
                .mapNotNull { p -> p.indexOf('=').takeIf { it > 0 }?.let { p.substring(0, it) to p.substring(it + 1) } }
                .toMap()
            val at = params["at"]?.toLongOrNull() ?: 0L
            val venue = params["v"]?.let { runCatching { java.net.URLDecoder.decode(it, "UTF-8") }.getOrNull() }.orEmpty()
            val vl = params["vl"]?.split(',')?.mapNotNull { it.toDoubleOrNull() }?.takeIf { it.size == 2 }
            return GigGroup(key, name.ifBlank { "Gig group" }.take(40), nowMs, at, venue, vl?.get(0), vl?.get(1))
        }

        /** A "follow along" invite: for loved ones at home. They watch; they're never findable. */
        fun isFollowInvite(text: String): Boolean {
            val t = text.trim()
            return t.startsWith(PREFIX) && t.substringBefore("&name=").split('&').any { it == "f=1" }
        }

        fun create(
            name: String,
            nowMs: Long,
            random: java.security.SecureRandom = java.security.SecureRandom(),
            startsAtSec: Long = 0L,
            venue: String = "",
            venueLat: Double? = null,
            venueLon: Double? = null,
        ): GigGroup = GigGroup(ByteArray(32).also { random.nextBytes(it) }, name.ifBlank { "Gig group" }.take(40), nowMs, startsAtSec, venue, venueLat, venueLon)

        /** Followers' intros start with this (invisible) mark, so the crew lists them apart and never "finds" them. */
        const val FOLLOWER_MARK = "\u2063"

        /** Wake a sleeping crew this long before the gig starts. */
        const val WAKE_BEFORE_SEC = 3 * 3600L

        private fun hmac(key: ByteArray, msg: ByteArray): ByteArray {
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(key, "HmacSHA256"))
            return mac.doFinal(msg)
        }

        /** Cut UTF-8 at a character boundary so the name never ends in half a character. */
        private fun trimUtf8(b: ByteArray, max: Int): ByteArray {
            if (b.size <= max) return b
            var end = max
            while (end > 0 && (b[end].toInt() and 0xC0) == 0x80) end--
            return b.copyOf(end)
        }
    }
}
