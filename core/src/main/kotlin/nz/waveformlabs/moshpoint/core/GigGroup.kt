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
    /**
     * Who made the crew: the only one who can remove people (see [RekeyPolicy]). Null for a crew
     * made before crews had owners, where anyone in it still can.
     */
    val ownerPub: ByteArray? = null,
    /** Random salt behind the key: [key] = [ownedKey] (ownerPub, salt), so the owner can't be swapped. */
    val ownerSalt: ByteArray? = null,
) {
    init {
        require(key.size == 32)
    }

    /**
     * Does this crew have an owner, bound to its key? The key is a commitment to the owner's
     * public key, so a forwarded invite can't name somebody else: whoever changes the owner
     * would have to change the key too, and then it's a different crew.
     */
    val owned: Boolean
        get() = ownerPub != null && ownerSalt != null && ownerPub.size == CrewKeys.PUB_BYTES && ownerSalt.size == 32 &&
            ownedKey(ownerPub, ownerSalt).contentEquals(key)

    /** The owner's signing tag, or null if the crew has no owner. */
    val ownerTag: Long? get() = if (owned) CrewKeys.tagOf(ownerPub!!) else null

    /** The same crew under a new key, after a removal or a reset (with its owner, if it has one). */
    fun moved(newKey: ByteArray, ownerPub: ByteArray? = null, ownerSalt: ByteArray? = null): GigGroup =
        GigGroup(newKey, name, createdAtMs, startsAtSec, venue, venueLat, venueLon, ownerPub, ownerSalt)

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

    /**
     * What a member broadcasts. Two forms:
     *  - the first, `[tag:8][time:4][secret prefix:4][AES-GCM(secret:32, nameLen:1, name, pub, sig)+tag:12]`,
     *    which every build reads. Its weakness: the 4-byte prefix of the member's crew pass is in
     *    the clear and never changes, so anyone listening can follow one person all night.
     *  - [form2], `[tag:8][time:4][salt:8][AES-GCM(...)]`: 8 random bytes instead. Older builds
     *    can't open it and drop it. Sent alongside the first form until the whole crew reads it.
     */
    fun sealIntro(intro: Intro, nowMs: Long, form2: Boolean = false, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray {
        val nameBytes = intro.name.toByteArray(Charsets.UTF_8).let { trimUtf8(it, MAX_NAME_BYTES) }
        val plain = intro.secret + byteArrayOf(nameBytes.size.toByte()) + nameBytes + (intro.pub ?: ByteArray(0)) +
            (if (intro.pub != null) intro.sig ?: ByteArray(0) else ByteArray(0))
        val time = ByteBuffer.allocate(4).putInt((nowMs / 1000).toInt()).array()
        val tag = tagAt(nowMs)
        if (form2) {
            val salt = ByteArray(8).also { random.nextBytes(it) }
            val c2 = Cipher.getInstance("AES/GCM/NoPadding")
            c2.init(Cipher.ENCRYPT_MODE, aesKey(), GCMParameterSpec(96, salt + time))
            c2.updateAAD(tag + time + INTRO_FORM2)
            return tag + time + salt + c2.doFinal(plain)
        }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, aesKey(), GCMParameterSpec(96, nonce(tag, time, intro.secret)))
        c.updateAAD(tag + time)
        return tag + time + intro.secret.copyOf(4) + c.doFinal(plain)
    }

    /** Returns the intro if this blob is for our group and intact (either form, see [sealIntro]). */
    fun openIntro(blob: ByteArray, nowMs: Long): Intro? {
        if (blob.size < TAG_BYTES + 4 + 4 + 33 + 12) return null
        val tag = blob.copyOfRange(0, TAG_BYTES)
        if (!matchesTag(tag, nowMs)) return null
        val time = blob.copyOfRange(TAG_BYTES, TAG_BYTES + 4)
        val hint = blob.copyOfRange(TAG_BYTES + 4, TAG_BYTES + 8)
        return openIntroPlain(false) {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, aesKey(), GCMParameterSpec(96, nonceFromHint(tag, time, hint)))
            c.updateAAD(tag + time)
            c.doFinal(blob, TAG_BYTES + 8, blob.size - TAG_BYTES - 8).also { require(it.copyOf(4).contentEquals(hint)) }
        } ?: openIntroPlain(true) {
            require(blob.size >= TAG_BYTES + 4 + 8 + 33 + 12)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, aesKey(), GCMParameterSpec(96, blob.copyOfRange(TAG_BYTES + 4, TAG_BYTES + 12) + time))
            c.updateAAD(tag + time + INTRO_FORM2)
            c.doFinal(blob, TAG_BYTES + 12, blob.size - TAG_BYTES - 12)
        }
    }

    private fun openIntroPlain(form2: Boolean, decrypt: () -> ByteArray): Intro? {
        return runCatching {
            val plain = decrypt()
            val secret = plain.copyOfRange(0, 32)
            val n = plain[32].toInt() and 0xFF
            val pub = if (plain.size >= 33 + n + CrewKeys.PUB_BYTES) plain.copyOfRange(33 + n, 33 + n + CrewKeys.PUB_BYTES) else null
            val at = 33 + n + CrewKeys.PUB_BYTES
            // A signature that doesn't check out is ignored (the intro still counts, unsigned).
            val sig = if (pub != null && plain.size >= at + CrewKeys.SIG_BYTES) {
                plain.copyOfRange(at, at + CrewKeys.SIG_BYTES).takeIf { CrewKeys.verify(pub, introSigned(secret, plain.copyOfRange(33, 33 + n), pub), it) }
            } else null
            Intro(secret, String(plain, 33, n, Charsets.UTF_8), pub, sig, form2)
        }.getOrNull()
    }

    /** Mailbox id for the crew's meet-up pin (changes daily so old pins fade away). */
    fun rallyIdForDay(day: Long): ByteArray =
        hmac(key, "moshpoint-group-rally".toByteArray() + ByteBuffer.allocate(8).putLong(day).array()).copyOf(16)

    /**
     * A meet-up pin for the crew: `[time:4][nonce:8][AES-GCM(lat:8, lon:8, nameLen:1, name, pub:33, sig:64)+tag]`.
     * [rally] with a blank name and 0,0 means "pin removed".
     *
     * Signed with [signer] when given (older builds read a signed pin as a plain one: they stop
     * after the name). Unsigned, anyone holding the crew key could move the pin as anyone.
     */
    fun sealRally(rally: Rally, signer: CrewKeys.Signer? = null, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray {
        val name = trimUtf8(rally.name.toByteArray(Charsets.UTF_8), MAX_NAME_BYTES)
        val proof = signer?.let { it.pub + CrewKeys.sign(it, pinSigned(rally.timeSec, rally.lat, rally.lon, name)) } ?: ByteArray(0)
        val plain = ByteBuffer.allocate(17 + name.size + proof.size).putDouble(rally.lat).putDouble(rally.lon).put(name.size.toByte()).put(name).put(proof).array()
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
            val time = ByteBuffer.wrap(blob, 0, 4).int.toLong() and 0xFFFFFFFFL
            // Signed: the signature must check out, or the pin is dropped.
            var pub: ByteArray? = null
            if (plain.remaining() >= CrewKeys.PUB_BYTES + CrewKeys.SIG_BYTES) {
                val k = ByteArray(CrewKeys.PUB_BYTES).also { plain.get(it) }
                val s = ByteArray(CrewKeys.SIG_BYTES).also { plain.get(it) }
                if (!CrewKeys.verify(k, pinSigned(time, lat, lon, name), s)) return null
                pub = k
            }
            Rally(
                lat, lon, String(name, Charsets.UTF_8), time,
                pub?.let { CrewKeys.tagOf(it) } ?: 0L,
                pub?.let { pinId(it, time, lat, lon, name) } ?: 0L,
            )
        }.getOrNull()
    }

    /** What a pin's signature covers: this crew, when, where and its name. */
    private fun pinSigned(timeSec: Long, lat: Double, lon: Double, name: ByteArray): ByteArray =
        ByteBuffer.allocate(7 + 8 + 4 + 16 + 1 + name.size)
            .put("mp-pin1".toByteArray()).put(hmac(key, "moshpoint-group-sig".toByteArray()).copyOf(8))
            .putInt(timeSec.toInt()).putDouble(lat).putDouble(lon).put(name.size.toByte()).put(name).array()

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
        /**
         * Who sent it: the tag of the key that signed it (0 = unsigned). Names aren't unique
         * ("Mate"), so "is this mine?" and "same person?" use this, and it can't be faked.
         */
        val sender: Long = 0L,
        /** The signer's public key (checked), or null if unsigned. */
        val pub: ByteArray? = null,
        /** The signature, kept with the message so history copies can be checked too. */
        val sig: ByteArray? = null,
        /**
         * The message's id (see [messageId]): the same for every copy of it, however it was
         * sealed and whichever way it arrived. 0 if unsigned. Set by [openPing].
         */
        val id: Long = 0L,
    ) {
        override fun equals(other: Any?) = other is Ping && kind == other.kind && from == other.from && timeSec == other.timeSec &&
            lat == other.lat && lon == other.lon && minutes == other.minutes && text == other.text && sender == other.sender
        override fun hashCode() = (kind * 31 + from.hashCode()) * 31 + timeSec.hashCode()
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
            /** "I'm in": a new member says hello (in the crew chat), with their name and key. */
            const val JOIN = 14
            const val MAX_TEXT_BYTES = 160
        }
    }

    /**
     * What a crew message's signature covers: this crew, and every field of the message.
     * Name and text are the trimmed bytes as sent.
     */
    private fun signedBytes(kind: Int, timeSec: Long, minutes: Int, latE7: Int, lonE7: Int, name: ByteArray, text: ByteArray): ByteArray =
        ByteBuffer.allocate(7 + 8 + 1 + 4 + 2 + 8 + 2 + name.size + text.size)
            .put("mp-sig1".toByteArray()).put(hmac(key, "moshpoint-group-sig".toByteArray()).copyOf(8))
            .put(kind.toByte()).putInt(timeSec.toInt()).putShort(minutes.coerceIn(0, 32767).toShort())
            .putInt(latE7).putInt(lonE7).put(name.size.toByte()).put(name).put(text.size.toByte()).put(text).array()

    /**
     * `[time:4][nonce:8][AES-GCM(kind:1, lat:4, lon:4, nameLen:1, name, minutes:2, textLen:1, text, pub:33, sig:64)+tag]`
     * (lat/lon 1e-7 deg, both 0 = none). Signed with [signer] when given: receivers check it,
     * and [Ping.sender] becomes the signer's tag.
     */
    fun sealPing(p: Ping, signer: CrewKeys.Signer? = null, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray {
        val name = trimUtf8(p.from.toByteArray(Charsets.UTF_8), MAX_NAME_BYTES)
        val text = trimUtf8(p.text.toByteArray(Charsets.UTF_8), Ping.MAX_TEXT_BYTES)
        // Rounded, not cut off: a message opened and sealed again (after the crew moves to a new
        // key) must come out with exactly the same position, or it would count as a new message.
        val latE7 = Math.round((p.lat ?: 0.0) * 1e7).toInt()
        val lonE7 = Math.round((p.lon ?: 0.0) * 1e7).toInt()
        val minutes = p.minutes.coerceIn(0, 32767)
        val proof = signer?.let { it.pub + CrewKeys.sign(it, signedBytes(p.kind, p.timeSec, minutes, latE7, lonE7, name, text)) } ?: ByteArray(0)
        val plain = ByteBuffer.allocate(12 + name.size + 1 + text.size + proof.size).put(p.kind.toByte())
            .putInt(latE7).putInt(lonE7)
            .put(name.size.toByte()).put(name).putShort(minutes.toShort())
            .put(text.size.toByte()).put(text).put(proof).array()
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
            val textBytes = if (b.remaining() >= 1) {
                val tn = minOf(b.get().toInt() and 0xFF, b.remaining())
                ByteArray(tn).also { b.get(it) }
            } else ByteArray(0)
            val time = ByteBuffer.wrap(blob, 0, 4).int.toLong() and 0xFFFFFFFFL
            // Signed: the signature must check out, or the message is dropped.
            var pub: ByteArray? = null
            var sig: ByteArray? = null
            if (b.remaining() >= CrewKeys.PUB_BYTES + CrewKeys.SIG_BYTES) {
                val k = ByteArray(CrewKeys.PUB_BYTES).also { b.get(it) }
                val s = ByteArray(CrewKeys.SIG_BYTES).also { b.get(it) }
                if (!CrewKeys.verify(k, signedBytes(kind, time, minutes, lat, lon, name, textBytes), s)) return null
                pub = k
                sig = s
            }
            val hasLoc = lat != 0 || lon != 0
            Ping(
                kind, String(name, Charsets.UTF_8), time,
                if (hasLoc) lat / 1e7 else null, if (hasLoc) lon / 1e7 else null, minutes, String(textBytes, Charsets.UTF_8),
                pub?.let { CrewKeys.tagOf(it) } ?: 0L, pub, sig,
                pub?.let { messageId(it, kind, time, minutes, lat, lon, textBytes) } ?: 0L,
            )
        }.getOrNull()
    }

    /** One chat line in a [History] bundle. */
    /**
     * One chat line in a [History] bundle, with the original signature ([pub], [sig]) so it can
     * be checked: a history copy can't put words in anyone's mouth.
     */
    data class HistoryLine(
        val kind: Int,
        val from: String,
        val sender: Long,
        val timeSec: Long,
        val text: String,
        val minutes: Int = 0,
        val latE7: Int = 0,
        val lonE7: Int = 0,
        val pub: ByteArray? = null,
        val sig: ByteArray? = null,
    ) {
        /** The same id the live message has (see [messageId]); 0 if it carries no key. */
        val id: Long get() = pub?.let { messageId(it, kind, timeSec, minutes, latE7, lonE7, text.toByteArray(Charsets.UTF_8)) } ?: 0L

        override fun equals(other: Any?) = other is HistoryLine && kind == other.kind && from == other.from && sender == other.sender &&
            timeSec == other.timeSec && text == other.text && minutes == other.minutes
        override fun hashCode() = (from.hashCode() * 31 + text.hashCode()) * 31 + timeSec.hashCode()
    }

    /** True if [l] carries a valid signature from the key it names. */
    fun verifyLine(l: HistoryLine): Boolean {
        val pub = l.pub ?: return false
        val sig = l.sig ?: return false
        return CrewKeys.verify(pub, signedBytes(l.kind, l.timeSec, l.minutes, l.latE7, l.lonE7, l.from.toByteArray(Charsets.UTF_8), l.text.toByteArray(Charsets.UTF_8)), sig)
    }

    /**
     * A phone's recent copy of the crew chat (and the pinned plan), shared now and then so
     * mates whose phones were off or out of signal catch up on what they missed, even after
     * the relay has let the original messages go.
     */
    data class History(val lines: List<HistoryLine>, val plan: HistoryLine?)

    /**
     * `[time:4][nonce:8][AES-GCM(deflate(lines))+tag]`, trimmed (oldest lines first) to fit
     * [maxBytes]. Null if even the plan alone won't fit.
     */
    fun sealHistory(h: History, timeSec: Long, maxBytes: Int = MAX_HISTORY_BYTES, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray? {
        // Only lines that can be checked are shared.
        var lines = h.lines.filter { it.pub != null && it.sig != null }
        val plan = h.plan?.takeIf { it.pub != null && it.sig != null }
        while (true) {
            val out = java.io.ByteArrayOutputStream()
            java.util.zip.DeflaterOutputStream(out, java.util.zip.Deflater(9)).use { z ->
                val d = java.io.DataOutputStream(z)
                fun write(l: HistoryLine) {
                    d.writeByte(l.kind)
                    d.writeInt(l.timeSec.toInt())
                    d.writeShort(l.minutes)
                    d.writeInt(l.latE7)
                    d.writeInt(l.lonE7)
                    d.writeUTF(l.from)
                    d.writeUTF(l.text)
                    d.write(l.pub ?: ByteArray(CrewKeys.PUB_BYTES))
                    d.write(l.sig ?: ByteArray(CrewKeys.SIG_BYTES))
                }
                d.writeByte(if (plan != null) 1 else 0)
                plan?.let { write(it) }
                d.writeShort(lines.size)
                lines.forEach { write(it) }
                d.flush()
            }
            val time = ByteBuffer.allocate(4).putInt(timeSec.toInt()).array()
            val nonce = ByteArray(8).also { random.nextBytes(it) }
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.ENCRYPT_MODE, rallyKey(), GCMParameterSpec(96, time + nonce))
            c.updateAAD("history".toByteArray())
            val sealed = time + nonce + c.doFinal(out.toByteArray())
            if (sealed.size <= maxBytes) return sealed
            if (lines.isEmpty()) return null
            lines = lines.drop(maxOf(1, lines.size / 5))
        }
    }

    fun openHistory(blob: ByteArray): History? {
        if (blob.size < 12 + 16 + 2) return null
        return runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, rallyKey(), GCMParameterSpec(96, blob.copyOfRange(0, 12)))
            c.updateAAD("history".toByteArray())
            val plain = c.doFinal(blob, 12, blob.size - 12)
            val d = java.io.DataInputStream(java.util.zip.InflaterInputStream(plain.inputStream()))
            fun readLine(): HistoryLine {
                val kind = d.readUnsignedByte()
                val time = d.readInt().toLong() and 0xFFFFFFFFL
                val minutes = d.readShort().toInt()
                val lat = d.readInt()
                val lon = d.readInt()
                val from = d.readUTF()
                val text = d.readUTF()
                val pub = ByteArray(CrewKeys.PUB_BYTES).also { d.readFully(it) }
                val sig = ByteArray(CrewKeys.SIG_BYTES).also { d.readFully(it) }
                return HistoryLine(kind, from, CrewKeys.tagOf(pub), time, text, minutes, lat, lon, pub, sig)
            }
            val plan = if (d.readUnsignedByte() == 1) readLine() else null
            val n = d.readUnsignedShort().coerceAtMost(500)
            // Anything that doesn't check out is dropped.
            History(List(n) { readLine() }.filter { verifyLine(it) }, plan?.takeIf { verifyLine(it) })
        }.getOrNull()
    }

    /**
     * A message only one crew member can read (e.g. "keep as friend"): sealed for the crew,
     * then again with a key only the two of them share ([CrewKeys.agree]).
     * `[time:4][nonce:8][AES-GCM(toTag:8, fromPub:33, kind:1, nonce:12, AES-GCM(shared, payload))]`
     */
    fun sealDirect(from: CrewKeys.Signer, toPub: ByteArray, kind: Int, payload: ByteArray, timeSec: Long, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray? {
        val shared = CrewKeys.agree(from, toPub) ?: return null
        val innerNonce = ByteArray(12).also { random.nextBytes(it) }
        val ic = Cipher.getInstance("AES/GCM/NoPadding")
        ic.init(Cipher.ENCRYPT_MODE, SecretKeySpec(shared.copyOf(16), "AES"), GCMParameterSpec(128, innerNonce))
        ic.updateAAD(byteArrayOf(kind.toByte()) + from.pub + toPub)
        val inner = ic.doFinal(payload)
        val plain = ByteBuffer.allocate(8 + CrewKeys.PUB_BYTES + 1 + 12 + inner.size)
            .putLong(CrewKeys.tagOf(toPub)).put(from.pub).put(kind.toByte()).put(innerNonce).put(inner).array()
        val time = ByteBuffer.allocate(4).putInt(timeSec.toInt()).array()
        val nonce = ByteArray(8).also { random.nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, rallyKey(), GCMParameterSpec(96, time + nonce))
        c.updateAAD("direct".toByteArray())
        return time + nonce + c.doFinal(plain)
    }

    data class Direct(val fromPub: ByteArray, val kind: Int, val payload: ByteArray, val timeSec: Long)

    /** Opens a direct message if it's for [me]; null for anyone else (even crew members). */
    fun openDirect(blob: ByteArray, me: CrewKeys.Signer): Direct? {
        if (blob.size < 12 + 8 + CrewKeys.PUB_BYTES + 1 + 12 + 16 + 12) return null
        return runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, rallyKey(), GCMParameterSpec(96, blob.copyOfRange(0, 12)))
            c.updateAAD("direct".toByteArray())
            val b = ByteBuffer.wrap(c.doFinal(blob, 12, blob.size - 12))
            if (b.long != me.tag) return null
            val fromPub = ByteArray(CrewKeys.PUB_BYTES).also { b.get(it) }
            val kind = b.get().toInt() and 0xFF
            val innerNonce = ByteArray(12).also { b.get(it) }
            val inner = ByteArray(b.remaining()).also { b.get(it) }
            val shared = CrewKeys.agree(me, fromPub) ?: return null
            val ic = Cipher.getInstance("AES/GCM/NoPadding")
            ic.init(Cipher.DECRYPT_MODE, SecretKeySpec(shared.copyOf(16), "AES"), GCMParameterSpec(128, innerNonce))
            ic.updateAAD(byteArrayOf(kind.toByte()) + fromPub + me.pub)
            Direct(fromPub, kind, ic.doFinal(inner), ByteBuffer.wrap(blob, 0, 4).int.toLong() and 0xFFFFFFFFL)
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

    data class Rally(
        val lat: Double,
        val lon: Double,
        val name: String,
        val timeSec: Long,
        /** Who set it: the tag of the key that signed it (0 = unsigned, from an older build). */
        val sender: Long = 0L,
        /** The pin's message id (see [messageId]); 0 for an unsigned pin. */
        val id: Long = 0L,
    ) {
        val removed get() = name.isBlank() && lat == 0.0 && lon == 0.0
    }

    // ---- Envelope for new kinds of crew message ----

    /**
     * A sealed crew message of a kind older builds don't know: `[time:4][nonce:8][AES-GCM(type:1,
     * len:2, body, padding)+tag]`. It has its own key and its own label ("mp2"), so an older
     * build can't open it at all, and so can't show it as "pinged the crew". Padded so the whole
     * thing is a multiple of 16 bytes: a listener learns less from its size.
     */
    class Envelope(val type: Int, val body: ByteArray, val timeSec: Long)

    fun sealEnvelope(type: Int, body: ByteArray, timeSec: Long, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray {
        require(type in 0..255 && body.size <= 0xFFFF)
        val pad = (16 - (12 + 3 + body.size + 12) % 16) % 16
        val plain = ByteBuffer.allocate(3 + body.size + pad).put(type.toByte()).putShort(body.size.toShort()).put(body).array()
        val time = ByteBuffer.allocate(4).putInt(timeSec.toInt()).array()
        val nonce = ByteArray(8).also { random.nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, envelopeKey(), GCMParameterSpec(96, time + nonce))
        c.updateAAD("mp2".toByteArray())
        return time + nonce + c.doFinal(plain)
    }

    fun openEnvelope(blob: ByteArray): Envelope? {
        if (blob.size < 12 + 3 + 12) return null
        return runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, envelopeKey(), GCMParameterSpec(96, blob.copyOfRange(0, 12)))
            c.updateAAD("mp2".toByteArray())
            val b = ByteBuffer.wrap(c.doFinal(blob, 12, blob.size - 12))
            val type = b.get().toInt() and 0xFF
            val body = ByteArray(b.short.toInt() and 0xFFFF).also { b.get(it) }
            Envelope(type, body, ByteBuffer.wrap(blob, 0, 4).int.toLong() and 0xFFFFFFFFL)
        }.getOrNull()
    }

    private fun envelopeKey() = SecretKeySpec(hmac(key, "moshpoint-group-mp2".toByteArray()).copyOf(16), "AES")

    // ---- "I'm here" (docs/IM_HERE.md) ----

    /**
     * "I'm here": the spot a crew mate chose on the map as where they're standing, the pressure
     * there (for floors), when, and for how long; or [clear], which takes their pin down.
     *
     * Travels in the [Envelope] as type [ENV_HERE], so builds from before it can't open it and
     * builds with the envelope ignore a type they don't know: nobody can misread it as a ping
     * or as the crew's meet-up point. Body:
     * `[ver:1][flags:1][minutes:1][lat:4][lon:4][pressure:2]` (lat/lon 1e-7 degrees, pressure in
     * [Baro] units, 0xFFFF = none; flag 1 = clear), then `[pub:33][sig:64]`. A reader takes the
     * fields it knows; anything a later version adds before the key is covered by the signature.
     */
    data class Here(
        /** When it was set (or cleared), by the sender's clock (unix s). Newest per sender wins. */
        val timeSec: Long,
        /** How long it lasts from [timeSec] (see [HereRule]): a pin's life, or for a clear, what was left of the pin. */
        val minutes: Int,
        val lat: Double,
        val lon: Double,
        /** Pressure at the spot in [Baro] units when it was pinned; null if the sender's phone has no sensor. */
        val pressure: Int? = null,
        /** True: "I'm not there any more" (no spot). */
        val clear: Boolean = false,
        /** The tag of the key that signed it. Set by [openHere]. */
        val sender: Long = 0L,
        /** The message id (the same for every copy and route, and after a re-sign under a new crew key). Set by [openHere]. */
        val id: Long = 0L,
    ) {
        val spot: LatLon? get() = if (clear) null else LatLon(lat, lon)
    }

    /** Seal and sign an "I'm here" (or a clear) for this crew. */
    fun sealHere(h: Here, signer: CrewKeys.Signer, random: java.security.SecureRandom = java.security.SecureRandom()): ByteArray {
        val fields = hereFields(h)
        val sig = CrewKeys.sign(signer, hereSigned(h.timeSec, fields))
        return sealEnvelope(ENV_HERE, fields + signer.pub + sig, h.timeSec, random)
    }

    /** An "I'm here" for this crew, signed and intact, or null (anything else, or a bad signature). */
    fun openHere(blob: ByteArray): Here? = openEnvelope(blob)?.let { hereOf(it) }

    /** The "I'm here" inside an opened envelope, checked; null for other types or a bad signature. */
    fun hereOf(env: Envelope): Here? {
        if (env.type != ENV_HERE) return null
        val body = env.body
        val signedLen = body.size - CrewKeys.PUB_BYTES - CrewKeys.SIG_BYTES
        if (signedLen < HERE_FIELDS_BYTES) return null
        return runCatching {
            val fields = body.copyOfRange(0, signedLen)
            val pub = body.copyOfRange(signedLen, signedLen + CrewKeys.PUB_BYTES)
            val sig = body.copyOfRange(signedLen + CrewKeys.PUB_BYTES, body.size)
            if (!CrewKeys.verify(pub, hereSigned(env.timeSec, fields), sig)) return null
            val b = ByteBuffer.wrap(fields)
            b.get() // version: fields this build knows come first in every version
            val flags = b.get().toInt() and 0xFF
            val minutes = b.get().toInt() and 0xFF
            val latE7 = b.int
            val lonE7 = b.int
            val p = b.short.toInt() and 0xFFFF
            val clear = flags and HERE_CLEAR != 0
            Here(
                env.timeSec, minutes,
                if (clear) 0.0 else latE7 / 1e7, if (clear) 0.0 else lonE7 / 1e7,
                if (clear || p == NO_PRESSURE) null else p,
                clear, CrewKeys.tagOf(pub), hereId(pub, env.timeSec, fields),
            )
        }.getOrNull()
    }

    private fun hereFields(h: Here): ByteArray {
        // Rounded, not cut off: opened and sealed again (the crew moved to a new key), it must
        // come out the same, or it would count as a new message.
        val latE7 = if (h.clear) 0 else Math.round(h.lat * 1e7).toInt()
        val lonE7 = if (h.clear) 0 else Math.round(h.lon * 1e7).toInt()
        val p = h.pressure?.takeIf { !h.clear && it in 0 until NO_PRESSURE } ?: NO_PRESSURE
        return ByteBuffer.allocate(HERE_FIELDS_BYTES)
            .put(HERE_VERSION.toByte()).put((if (h.clear) HERE_CLEAR else 0).toByte()).put(h.minutes.coerceIn(1, 255).toByte())
            .putInt(latE7).putInt(lonE7).putShort(p.toShort()).array()
    }

    /** What an "I'm here" signature covers: this crew, when, and every field. */
    private fun hereSigned(timeSec: Long, fields: ByteArray): ByteArray =
        "mp-here1".toByteArray() + hmac(key, "moshpoint-group-sig".toByteArray()).copyOf(8) +
            ByteBuffer.allocate(4).putInt(timeSec.toInt()).array() + fields

    private fun aesKey() = SecretKeySpec(hmac(key, "moshpoint-group-aes".toByteArray()).copyOf(16), "AES")

    // Nonce unique per (member, second): first 4 bytes of their secret + time + tag prefix.
    private fun nonce(tag: ByteArray, time: ByteArray, secret: ByteArray) = nonceFromHint(tag, time, secret.copyOf(4))
    private fun nonceFromHint(tag: ByteArray, time: ByteArray, hint: ByteArray) = hint + time + tag.copyOf(4)

    /**
     * "I'm in the crew": the member's crew pass ([secret], for finding them tonight) and their
     * signing key for this crew ([pub], so their messages can be checked).
     */
    data class Intro(
        val secret: ByteArray,
        val name: String,
        val pub: ByteArray? = null,
        val sig: ByteArray? = null,
        /** How it arrived: true for the form with no constant prefix (see [sealIntro]). Not part of who it is. */
        val form2: Boolean = false,
    ) {
        override fun equals(other: Any?) = other is Intro && secret.contentEquals(other.secret) && name == other.name &&
            pub.contentEquals(other.pub)
        override fun hashCode() = secret.contentHashCode()
    }

    /** What an intro's signature covers: this crew, the pass, the key and the name. */
    private fun introSigned(secret: ByteArray, name: ByteArray, pub: ByteArray): ByteArray =
        "mp-intro1".toByteArray() + hmac(key, "moshpoint-group-sig".toByteArray()).copyOf(8) + secret + pub + name

    /** Our intro, signed so nobody else in the crew can claim our key with their own pass. */
    fun signedIntro(secret: ByteArray, name: String, signer: CrewKeys.Signer): Intro {
        val n = trimUtf8(name.toByteArray(Charsets.UTF_8), MAX_NAME_BYTES)
        return Intro(secret, String(n, Charsets.UTF_8), signer.pub, CrewKeys.sign(signer, introSigned(secret, n, signer.pub)))
    }

    companion object {
        const val TAG_BYTES = 8

        /** [Envelope] types. */
        const val ENV_HAVE = 1
        const val ENV_RECEIPT = 2
        const val ENV_RETIRED = 3
        /** "I'm here": a crew mate's chosen spot, or its clear (see [Here]). */
        const val ENV_HERE = 4
        private const val HERE_VERSION = 1
        private const val HERE_CLEAR = 1
        private const val HERE_FIELDS_BYTES = 13
        private const val NO_PRESSURE = 0xFFFF
        /** Kept for private messages (roadmap step 4): sealed to one person, with no sender or recipient tag here. */
        const val ENV_PRIVATE = 16

        /** Direct-message kinds 1 and 2 are "keep as friend" (see the app's Friendship). */
        const val DIRECT_REKEY = 3
        /** A rekey that also says whose key was removed (see core RekeyPolicy). Older builds ignore it. */
        const val DIRECT_REKEY2 = 4
        /** A rekey of an owned crew: also carries the salt and owner the new key is bound to (see RekeyPolicy). */
        const val DIRECT_REKEY3 = 5

        /** The key of an owned crew: a commitment to its owner's public key (see [owned]). */
        fun ownedKey(ownerPub: ByteArray, salt: ByteArray): ByteArray =
            java.security.MessageDigest.getInstance("SHA-256").digest("moshpoint-crew-owner-v1".toByteArray() + ownerPub + salt)

        private val INTRO_FORM2 = byteArrayOf(2)

        /**
         * One id per crew message, the same on every phone and for every copy: a retry that was
         * sealed again, a copy in someone's History bundle, the same bytes arriving by Bluetooth
         * and by the relay, and a re-sign after the crew moved to a new key.
         *
         * It's worked out from what the signature covers plus the signer's key, so nothing new
         * has to be signed or sent. It leaves out the display name and the crew-key tag on
         * purpose: neither changes which message it is.
         */
        fun messageId(pub: ByteArray, kind: Int, timeSec: Long, minutes: Int, latE7: Int, lonE7: Int, text: ByteArray): Long {
            val md = java.security.MessageDigest.getInstance("SHA-256")
            md.update("mp-id1".toByteArray())
            md.update(pub)
            md.update(ByteBuffer.allocate(15).put(kind.toByte()).putInt(timeSec.toInt()).putShort(minutes.toShort()).putInt(latE7).putInt(lonE7).array())
            md.update(text)
            val id = ByteBuffer.wrap(md.digest()).long
            return if (id == 0L) 1L else id
        }

        /** The same idea for a signed meet-up pin. */
        internal fun pinId(pub: ByteArray, timeSec: Long, lat: Double, lon: Double, name: ByteArray): Long {
            val md = java.security.MessageDigest.getInstance("SHA-256")
            md.update("mp-pin1".toByteArray())
            md.update(pub)
            md.update(ByteBuffer.allocate(20).putInt(timeSec.toInt()).putDouble(lat).putDouble(lon).array())
            md.update(name)
            val id = ByteBuffer.wrap(md.digest()).long
            return if (id == 0L) 1L else id
        }

        /** The same idea for an "I'm here": the signer's key, when, and the signed fields. */
        internal fun hereId(pub: ByteArray, timeSec: Long, fields: ByteArray): Long {
            val md = java.security.MessageDigest.getInstance("SHA-256")
            md.update("mp-here1".toByteArray())
            md.update(pub)
            md.update(ByteBuffer.allocate(4).putInt(timeSec.toInt()).array())
            md.update(fields)
            val id = ByteBuffer.wrap(md.digest()).long
            return if (id == 0L) 1L else id
        }

        /** How ids are written down (chat rows, logs). */
        fun idText(id: Long): String = java.lang.Long.toHexString(id)
        /** A history bundle fits one public-relay message (4 KB of base64). */
        const val MAX_HISTORY_BYTES = 2_900
        const val MAX_NAME_BYTES = 24
        /** Upper bound for an intro: fits a BT5 extended advert and a server record (255). */
        const val MAX_INTRO_BYTES = TAG_BYTES + 4 + 4 + 32 + 1 + MAX_NAME_BYTES + CrewKeys.PUB_BYTES + CrewKeys.SIG_BYTES + 12
        /** The second form (see [sealIntro]) is 4 bytes longer. */
        const val MAX_INTRO2_BYTES = MAX_INTRO_BYTES + 4

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
                "&h=${enc.encodeToString(it.secret)}&hn=${java.net.URLEncoder.encode(it.name.take(40), "UTF-8")}" +
                    (it.pub?.let { k -> "&hk=${enc.encodeToString(k)}" } ?: "")
            }.orEmpty()
            // The invite stops working when the crew ends, so an old screenshot can't get anyone in.
            val life = "&c=${group.createdAtMs / 1000}&exp=${group.expiresAtMs / 1000}"
            val owner = if (group.owned) "&o=${enc.encodeToString(group.ownerPub)}&os=${enc.encodeToString(group.ownerSalt)}" else ""
            val gig = owner + (if (group.startsAtSec > 0) "&at=${group.startsAtSec}" else "") +
                (if (group.venue.isNotBlank()) "&v=${java.net.URLEncoder.encode(group.venue.take(60), "UTF-8")}" else "") +
                (if (group.venueLat != null && group.venueLon != null) "&vl=%.5f,%.5f".format(java.util.Locale.ROOT, group.venueLat, group.venueLon) else "") +
                (if (follower) "&f=1" else "")
            return "$PREFIX${enc.encodeToString(group.key)}$h$gig$life&name=${java.net.URLEncoder.encode(group.name, "UTF-8")}"
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
            val pub = params["hk"]?.let { runCatching { dec.decode(it) }.getOrNull() }?.takeIf { it.size == CrewKeys.PUB_BYTES }
            return Intro(secret, name.ifBlank { "Host" }, pub)
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
            // Invites carry when the crew ends; past that (or with none: an old-style invite), no entry.
            val exp = params["exp"]?.toLongOrNull() ?: return null
            if (nowMs / 1000 > exp) return null
            val created = params["c"]?.toLongOrNull()?.let { it * 1000 } ?: nowMs
            val at = params["at"]?.toLongOrNull() ?: 0L
            val venue = params["v"]?.let { runCatching { java.net.URLDecoder.decode(it, "UTF-8") }.getOrNull() }.orEmpty()
            val vl = params["vl"]?.split(',')?.mapNotNull { it.toDoubleOrNull() }?.takeIf { it.size == 2 }
            // An owned crew's invite names its owner. It must match the key: anything else is a
            // forged or damaged invite, and isn't joined. (One with no owner at all is a crew made
            // before crews had owners.)
            val ownerPub = params["o"]?.let { runCatching { dec.decode(it) }.getOrNull() }
            val ownerSalt = params["os"]?.let { runCatching { dec.decode(it) }.getOrNull() }
            val g = GigGroup(key, name.ifBlank { "Gig group" }.take(40), created, at, venue, vl?.get(0), vl?.get(1), ownerPub, ownerSalt)
            if ((ownerPub != null || ownerSalt != null || params.containsKey("o") || params.containsKey("os")) && !g.owned) return null
            return g
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

        /** A new crew owned by whoever signs with [ownerPub]: only they will be able to remove people. */
        fun createOwned(
            name: String,
            nowMs: Long,
            ownerPub: ByteArray,
            random: java.security.SecureRandom = java.security.SecureRandom(),
            startsAtSec: Long = 0L,
            venue: String = "",
            venueLat: Double? = null,
            venueLon: Double? = null,
        ): GigGroup {
            require(ownerPub.size == CrewKeys.PUB_BYTES)
            val salt = ByteArray(32).also { random.nextBytes(it) }
            return GigGroup(ownedKey(ownerPub, salt), name.ifBlank { "Gig group" }.take(40), nowMs, startsAtSec, venue, venueLat, venueLon, ownerPub, salt)
        }

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
