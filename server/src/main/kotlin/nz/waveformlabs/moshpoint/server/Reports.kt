package nz.waveformlabs.moshpoint.server

import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/*
 * Reports of objectionable content (Google Play's User Generated Content policy; the app side is
 * docs/REPORT_BLOCK.md, reading them docs/MODERATION.md).
 *
 * Crew content is end-to-end encrypted, so the relay never sees it. A report is what the
 * reporter's phone could see and chose to send: the message text or a smaller copy of the photo
 * (a few frames of a clip), the sender's name and crew signing key, a hash of the crew's id
 * (never the crew key), the times, a reason and an optional note. Nothing about the reporter is
 * kept: no address, no install.
 */

/** What a report may hold, checked before it's stored. */
object ReportRules {
    val REASONS = setOf("harassment", "hate", "sexual", "violence", "spam", "other")
    val KINDS = setOf("message", "private", "photo", "clip", "person")

    /** The whole request (images included). */
    const val MAX_BODY = 1_200_000
    const val MAX_TEXT = 2_000
    const val MAX_NOTE = 1_000
    const val MAX_NAME = 80
    const val MAX_IMAGES = 4
    const val MAX_IMAGE_BYTES = 300_000

    private val HEX_KEY = Regex("^[0-9a-f]{66}$")
    private val HEX_HASH = Regex("^[0-9a-f]{64}$")

    /**
     * The report in [body] (JSON) as it will be stored, or null if anything is missing, too big
     * or not what it says: unknown reason or kind, a key that isn't a compressed P-256 key in hex,
     * a crew hash that isn't SHA-256 hex, an image that isn't a JPEG.
     */
    fun parse(body: ByteArray, nowSec: Long): JSONObject? = runCatching {
        if (body.size > MAX_BODY) return null
        val o = JSONObject(String(body, Charsets.UTF_8))
        val reason = o.getString("reason")
        val kind = o.getString("kind")
        if (reason !in REASONS || kind !in KINDS) return null
        val senderKey = o.optString("senderKey", "").lowercase()
        if (senderKey.isNotEmpty() && !HEX_KEY.matches(senderKey)) return null
        val crew = o.getString("crewHash").lowercase()
        if (!HEX_HASH.matches(crew)) return null
        val name = o.optString("senderName", "").trim()
        val text = o.optString("text", "")
        val note = o.optString("note", "").trim()
        if (name.length > MAX_NAME || text.length > MAX_TEXT || note.length > MAX_NOTE) return null
        val images = o.optJSONArray("images") ?: JSONArray()
        if (images.length() > MAX_IMAGES) return null
        val clean = JSONArray()
        for (i in 0 until images.length()) {
            val b64 = images.getString(i)
            val jpeg = Base64.getDecoder().decode(b64)
            if (jpeg.size > MAX_IMAGE_BYTES || jpeg.size < 4 || jpeg[0] != 0xFF.toByte() || jpeg[1] != 0xD8.toByte()) return null
            clean.put(Base64.getEncoder().encodeToString(jpeg))
        }
        // What the content needs: a message has text, a photo or clip an image.
        when (kind) {
            "message", "private" -> if (text.isBlank()) return null
            "photo", "clip" -> if (clean.length() == 0) return null
        }
        val postedSec = o.optLong("postedSec", 0L).takeIf { it in 1L..(nowSec + 86_400) } ?: 0L
        JSONObject()
            .put("reason", reason)
            .put("kind", kind)
            .put("senderName", name)
            .put("senderKey", senderKey)
            .put("crewHash", crew)
            .put("text", text)
            .put("caption", o.optString("caption", "").take(MAX_NAME * 2))
            .put("note", note)
            .put("postedSec", postedSec)
            .put("images", clean)
            .put("app", o.optString("app", "").take(40))
    }.getOrNull()
}

/**
 * Reports on the relay's volume, one JSON file each (`reports/<id>.json`), kept [ttlMs] (90 days)
 * and at most [maxCount] at a time. The id is the time it arrived and a random part, and the time
 * part only ever goes up (a report in the same millisecond as the last one is put a millisecond
 * later), so listing by id is the order they came in, every time.
 */
class ReportStore(
    private val dir: File,
    private val ttlMs: Long,
    private val maxCount: Int,
    private val clock: () -> Long,
    private val random: SecureRandom = SecureRandom(),
) {
    init {
        dir.mkdirs()
    }

    private fun files(): List<File> = dir.listFiles { f -> f.isFile && f.name.endsWith(".json") && ID.matches(f.name.removeSuffix(".json")) }?.toList().orEmpty()

    /** The newest id's time part (from the reports already kept, after a restart): every new one is later. */
    private var last: Long = files().maxOfOrNull { it.name.substringBefore('-').toLong() } ?: 0L

    val count: Int get() = files().size

    /** Stores [report] and returns its id, or null when the store is full. */
    @Synchronized
    fun add(report: JSONObject): String? {
        if (files().size >= maxCount) return null
        // Two reports in one millisecond used to tie on time and list in either order (the random
        // part decided). Never earlier than the last one, even if the clock is set back.
        val now = maxOf(clock(), last + 1)
        last = now
        val id = "%013d-%s".format(now, ByteArray(6).also { random.nextBytes(it) }.joinToString("") { "%02x".format(it) })
        val out = JSONObject(report.toString()).put("id", id).put("receivedSec", now / 1000)
        val tmp = File(dir, "$id.tmp")
        tmp.writeText(out.toString(), Charsets.UTF_8)
        if (!tmp.renameTo(File(dir, "$id.json"))) {
            tmp.delete()
            return null
        }
        return id
    }

    /** Newest first (the order they came in, reversed), at most [limit]. */
    fun list(limit: Int): List<JSONObject> =
        files().sortedByDescending { it.name }.take(limit).mapNotNull { f -> runCatching { JSONObject(f.readText(Charsets.UTF_8)) }.getOrNull() }

    /** Deletes the report [id]; false if there's no such report. */
    @Synchronized
    fun delete(id: String): Boolean {
        if (!ID.matches(id)) return false
        return File(dir, "$id.json").delete()
    }

    /** Deletes reports older than the retention time (and leftovers of an interrupted write). */
    fun sweep(): Int {
        val cutoff = clock() - ttlMs
        var n = 0
        dir.listFiles()?.forEach { f ->
            val at = f.name.substringBefore('-').toLongOrNull()
            val stale = f.name.endsWith(".tmp") && f.lastModified() < clock() - 60_000
            if ((at != null && at < cutoff) || stale) {
                if (f.delete()) n++
            }
        }
        return n
    }

    companion object {
        val ID = Regex("^[0-9]{13}-[0-9a-f]{12}$")
        const val TTL_MS = 90L * 24 * 3_600_000
    }
}

/** How often one phone (by install, else by address) may report: a few at once, then a few a day. */
class ReportLimits(clock: () -> Long) {
    private val perInstall = RateLimiter(5.0, 20.0 / 86_400, clock)
    private val perAddress = RateLimiter(20.0, 200.0 / 86_400, clock)

    fun allow(c: Client): Boolean {
        if (c.install != null && !perInstall.allow(c.install)) return false
        if (!perAddress.allow(c.address)) {
            if (c.install != null) perInstall.refund(c.install, 1.0)
            return false
        }
        return true
    }

    fun sweep() {
        perInstall.sweep()
        perAddress.sweep()
    }
}

/**
 * The owner's admin token (MOSHPOINT_ADMIN_TOKEN, a Fly secret; never in the repo). No token set:
 * the admin routes are off. Compared in constant time, on hashes so the lengths don't matter.
 */
class AdminAuth(token: String?) {
    private val want: ByteArray? = token?.trim()?.takeIf { it.isNotEmpty() }?.let(::sha256)

    val enabled: Boolean get() = want != null

    /** Is [authorization] ("Bearer <token>") the admin token? */
    fun allows(authorization: String?): Boolean {
        val w = want ?: return false
        val given = authorization?.trim()?.takeIf { it.startsWith("Bearer ", ignoreCase = true) }?.substring(7)?.trim() ?: ""
        return MessageDigest.isEqual(w, sha256(given)) && given.isNotEmpty()
    }

    private fun sha256(s: String): ByteArray = MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8))
}
