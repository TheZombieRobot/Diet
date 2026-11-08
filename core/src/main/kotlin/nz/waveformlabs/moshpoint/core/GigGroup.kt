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
class GigGroup(val key: ByteArray, val name: String, val createdAtMs: Long) {
    init {
        require(key.size == 32)
    }

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

    /** A quick message to the whole crew, optionally with where the sender is. */
    data class Ping(val kind: Int, val from: String, val timeSec: Long, val lat: Double? = null, val lon: Double? = null) {
        companion object {
            const val COMING = 1
            const val STAY_PUT = 2
            const val WHERE_ARE_YOU = 3
            const val MEET_AT_PIN = 4
            const val ALL_GOOD = 5
            const val GOING_HOME = 6
            const val NEED_HELP = 7
        }
    }

    /** `[time:4][nonce:8][AES-GCM(kind:1, lat:4, lon:4, nameLen:1, name)+tag]` (lat/lon 1e-7 deg, both 0 = none). */
    fun sealPing(p: Ping, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray {
        val name = trimUtf8(p.from.toByteArray(Charsets.UTF_8), MAX_NAME_BYTES)
        val plain = ByteBuffer.allocate(10 + name.size).put(p.kind.toByte())
            .putInt(((p.lat ?: 0.0) * 1e7).toInt()).putInt(((p.lon ?: 0.0) * 1e7).toInt())
            .put(name.size.toByte()).put(name).array()
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
            val hasLoc = lat != 0 || lon != 0
            Ping(
                kind, String(name, Charsets.UTF_8), ByteBuffer.wrap(blob, 0, 4).int.toLong() and 0xFFFFFFFFL,
                if (hasLoc) lat / 1e7 else null, if (hasLoc) lon / 1e7 else null,
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
        fun qr(group: GigGroup, host: Intro? = null): String {
            val h = host?.let {
                "&h=${enc.encodeToString(it.secret)}&hn=${java.net.URLEncoder.encode(it.name.take(40), "UTF-8")}"
            }.orEmpty()
            return "$PREFIX${enc.encodeToString(group.key)}$h&name=${java.net.URLEncoder.encode(group.name, "UTF-8")}"
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
            return GigGroup(key, name.ifBlank { "Gig group" }.take(40), nowMs)
        }

        fun create(name: String, nowMs: Long, random: java.security.SecureRandom = java.security.SecureRandom()): GigGroup =
            GigGroup(ByteArray(32).also { random.nextBytes(it) }, name.ifBlank { "Gig group" }.take(40), nowMs)

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
