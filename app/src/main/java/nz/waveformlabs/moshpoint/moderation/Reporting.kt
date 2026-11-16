package nz.waveformlabs.moshpoint.moderation

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadataRetriever
import android.util.Base64
import androidx.compose.ui.graphics.asAndroidBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.BlockList
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.moments.Moments
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.security.MessageDigest

/**
 * Sending a report (docs/REPORT_BLOCK.md). Crew content is end-to-end encrypted, so the phone sends
 * what its person can see, as the report sheet says before sending: the message text, or the photo
 * (smaller) or a few frames of the clip (smaller) with its caption; the sender's name and crew
 * signing key; a hash of the crew's id (never its name or key); the times; the reason and note.
 * Nothing about the reporter goes with it. The relay keeps it 90 days (server Reports.kt).
 */
object Reporting {
    /** The reasons offered, in order, with the word the relay stores. */
    enum class Reason(val wire: String, val label: Int) {
        HARASSMENT("harassment", R.string.mod_reason_harassment),
        HATE("hate", R.string.mod_reason_hate),
        SEXUAL("sexual", R.string.mod_reason_sexual),
        VIOLENCE("violence", R.string.mod_reason_violence),
        SPAM("spam", R.string.mod_reason_spam),
        OTHER("other", R.string.mod_reason_other),
    }

    enum class Outcome { SENT, TOO_MANY, FAILED }

    const val MAX_NOTE = 300

    /** The relay's word for what's reported. */
    fun kind(content: Moderation.Content?): String = when (content) {
        is Moderation.Message -> if (content.private) "private" else "message"
        is Moderation.Moment -> if (content.item.isVideo) "clip" else "photo"
        null -> "person"
    }

    /** The crew, as a code that says which crew without naming it or giving its key. */
    fun crewHash(crewId: String): String =
        MessageDigest.getInstance("SHA-256").digest("moshpoint-report-crew:$crewId".toByteArray()).joinToString("") { "%02x".format(it) }

    suspend fun send(c: Context, s: Moderation.Subject, reason: Reason, note: String): Outcome {
        val json = withContext(Dispatchers.Default) { build(c, s, reason, note) } ?: return Outcome.FAILED
        return when (RelayClient.postReport(json.toString().toByteArray())) {
            201 -> Outcome.SENT
            429 -> Outcome.TOO_MANY
            else -> Outcome.FAILED
        }
    }

    private fun build(c: Context, s: Moderation.Subject, reason: Reason, note: String): JSONObject? = runCatching {
        val p = s.person
        val o = JSONObject()
            .put("reason", reason.wire)
            .put("kind", kind(s.content))
            .put("senderName", p.name.take(80))
            .put("senderKey", p.pub?.let { BlockList.hex(it) }.orEmpty())
            .put("crewHash", crewHash(p.crewId))
            .put("note", note.trim().take(MAX_NOTE))
            .put("app", BuildConfig.VERSION_NAME.take(40))
        when (val content = s.content) {
            is Moderation.Message -> o.put("text", content.text.take(2_000)).put("postedSec", content.timeSec)
            is Moderation.Moment -> {
                val m = content.item
                val images = if (m.isVideo) clipFrames(m) else listOfNotNull(photo(m))
                if (images.isEmpty()) return null
                o.put("caption", m.caption.take(160)).put("postedSec", m.timeSec)
                    .put("images", JSONArray().apply { images.forEach { put(Base64.encodeToString(it, Base64.NO_WRAP)) } })
            }
            null -> {}
        }
        o
    }.getOrNull()

    /** The photo as the crew saw it, at most 800 px, as a JPEG. */
    private fun photo(m: Moments.Item): ByteArray? {
        val bmp = m.photoFile?.takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.path) }
            ?: m.loadImage(keep = false)?.asAndroidBitmap()
            ?: return null
        return jpeg(bmp, 800, 75)
    }

    /** Four frames across the clip (its start, a third, two thirds, near the end), at most 480 px each. */
    private fun clipFrames(m: Moments.Item): List<ByteArray> {
        val file = m.videoFile?.takeIf { it.exists() } ?: return listOfNotNull(photo(m))
        val r = MediaMetadataRetriever()
        return try {
            r.setDataSource(file.path)
            val durUs = (r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L) * 1000
            listOf(0.0, 1 / 3.0, 2 / 3.0, 0.95).mapNotNull { f ->
                r.getFrameAtTime((durUs * f).toLong(), MediaMetadataRetriever.OPTION_CLOSEST_SYNC)?.let { jpeg(it, 480, 70) }
            }.ifEmpty { listOfNotNull(photo(m)) }
        } catch (e: Exception) {
            listOfNotNull(photo(m))
        } finally {
            runCatching { r.release() }
        }
    }

    private fun jpeg(src: Bitmap, maxPx: Int, quality: Int): ByteArray {
        val scale = minOf(1f, maxPx.toFloat() / maxOf(src.width, src.height))
        val b = if (scale < 1f) Bitmap.createScaledBitmap(src, (src.width * scale).toInt().coerceAtLeast(1), (src.height * scale).toInt().coerceAtLeast(1), true) else src
        return ByteArrayOutputStream().also { b.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
    }
}
