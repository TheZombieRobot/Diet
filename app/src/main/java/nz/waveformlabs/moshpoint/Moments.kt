package nz.waveformlabs.moshpoint

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import java.io.ByteArrayOutputStream

/**
 * Crew moments: a photo someone in the crew snapped, pinned where and when they took it.
 * "Bevan · 3 min ago" + the photo is often the fastest way to find someone: you recognise
 * the spot (the bar, the left speaker stack) before any radio can tell you.
 *
 * Encrypted with the crew key and passed through the relay as a file, which the public
 * relay deletes after a few hours. Nothing is uploaded unless you choose to share.
 */
object Moments {
    class Item(
        val key: String,
        val from: String,
        val timeSec: Long,
        val lat: Double?,
        val lon: Double?,
        val caption: String,
        val image: ImageBitmap,
        val mine: Boolean,
        /** A clip: [image] is its first frame, this is the playable file. */
        val videoFile: java.io.File? = null,
        /** The full photo (or a clip's first frame), kept in the gig's folder. */
        val photoFile: java.io.File? = null,
        /** Your own photo at full camera quality (only for yours), used by "Save to phone". */
        val originalFile: java.io.File? = null,
    ) {
        val isVideo get() = videoFile != null
    }

    /** Newest first (Compose state for home and map). */
    val items = mutableStateListOf<Item>()
    private val seenUrls = HashSet<String>()
    private var lastCheckMs = 0L

    /** Share a photo with the crew. Returns false if it couldn't be sent (no crew, no internet). */
    suspend fun share(c: Context, photo: Bitmap, caption: String, lat: Double?, lon: Double?): Boolean {
        val g = GroupSync.group.value ?: return false
        if (!RelayClient.filesEnabled) return false
        val app = c.applicationContext
        val (maxPx, q) = ShareQuality.photo
        val jpeg = withContext(Dispatchers.Default) { shrink(photo, maxPx, q) }
        // Your own original, full quality, kept on your phone for "Save to phone".
        val original = withContext(Dispatchers.Default) {
            ByteArrayOutputStream().also { photo.compress(Bitmap.CompressFormat.JPEG, 94, it) }.toByteArray()
        }
        val m = GigGroup.Moment(VisibilityPrefs.myName(app).ifBlank { "Mate" }, System.currentTimeMillis() / 1000, lat, lon, caption.trim(), jpeg)
        val sealed = g.sealMoment(m)
        val ok = RelayClient.putFile(g.momentsIdForDay(Math.floorDiv(m.timeSec, 86_400L)), sealed)
        if (ok) {
            add(app, m, "mine-${m.timeSec}", mine = true, original = original)
            NightStats.moment(app)
        }
        DebugStatus.log(if (ok) "Moment shared with the crew" else "Moment not sent (no internet?)")
        return ok
    }

    /** While the Story is open: check every 30 s (the board feels live). */
    suspend fun refreshNow(c: Context, g: GigGroup) = refresh(c, g, minGapMs = 25_000)

    /** Check for new moments (at most every 2 minutes). Called from the crew sync loop. */
    suspend fun refresh(c: Context, g: GigGroup, minGapMs: Long = 120_000) {
        if (!RelayClient.filesEnabled) return
        val now = System.currentTimeMillis()
        if (now - lastCheckMs < minGapMs) return
        lastCheckMs = now
        val day = Math.floorDiv(now / 1000, 86_400L)
        val files = RelayClient.listFiles(listOf(g.momentsIdForDay(day), g.momentsIdForDay(day - 1))) ?: return
        for ((_, url) in files.take(12)) {
            if (url in seenUrls || items.any { it.key == url }) continue
            val blob = RelayClient.download(url) ?: continue // try again next time
            seenUrls += url
            val m = g.openMoment(blob) ?: continue
            val myName = VisibilityPrefs.myName(c).ifBlank { "Mate" }
            // Our own upload comes back too: we already have it.
            if (m.from == myName && items.any { it.mine && it.timeSec == m.timeSec }) continue
            add(c, m, url, mine = false)
            if (now / 1000 - m.timeSec < 15 * 60) {
                CrewNotifications.post(c, title = "${m.from} shared a moment", text = m.caption.ifBlank { "Tap to see where" })
            }
        }
    }

    /** On app start: put tonight's Story back from the gig's folder. */
    suspend fun loadCurrent(c: Context) {
        val g = GroupSync.group.value ?: return
        val kept = GigArchive.load(c, GigArchive.idFor(g))
        if (kept.isEmpty()) return
        val have = items.map { it.key }.toSet()
        items.addAll(kept.filter { it.key !in have })
        items.sortByDescending { it.timeSec }
    }

    fun clear() {
        items.clear()
        seenUrls.clear()
        lastCheckMs = 0L
    }

    private fun add(c: Context, m: GigGroup.Moment, key: String, mine: Boolean, original: ByteArray? = null) {
        if (items.any { it.key == key }) return
        // A clip travels as "MPV1" + thumbnail length + thumbnail JPEG + the MP4.
        val (thumb, cached) = unpackClip(c, m.jpeg, key) ?: (m.jpeg to null)
        // Keep it in this gig's folder (survives restarts and the relay forgetting).
        val g = GroupSync.group.value
        val kept = g?.let { runCatching { GigArchive.keep(c, it, key, m, mine, thumb, cached, original) }.getOrNull() }
        val video = kept?.second ?: cached
        val bmp = kept?.first?.let { GigArchive.thumbnail(it) }
            ?: BitmapFactory.decodeByteArray(thumb, 0, thumb.size)
            ?: if (video != null) Bitmap.createBitmap(320, 320, Bitmap.Config.ARGB_8888).apply { eraseColor(0xFF1C1630.toInt()) } else return
        val item = Item(
            key, m.from, m.timeSec, m.lat, m.lon, m.caption, bmp.asImageBitmap(), mine, video, kept?.first,
            kept?.first?.let { java.io.File(it.parentFile, it.nameWithoutExtension + ".orig.jpg") }?.takeIf { it.exists() },
        )
        val i = items.indexOfFirst { it.timeSec < m.timeSec }.let { if (it < 0) items.size else it }
        items.add(i, item)
        while (items.size > 400) items.removeAt(items.size - 1)
    }

    /**
     * Share a short clip (already recorded to [file]). Its first frame becomes the Polaroid.
     * Returns false if it's too big for the relay, or couldn't be sent.
     */
    suspend fun shareClip(c: Context, file: java.io.File, caption: String, lat: Double?, lon: Double?): Boolean {
        val g = GroupSync.group.value ?: return false
        if (!RelayClient.filesEnabled || !file.exists()) return false
        val app = c.applicationContext
        if (file.length() > RelayClient.MAX_FILE - 200_000) return false
        val packed = withContext(Dispatchers.IO) {
            val frame = runCatching {
                android.media.MediaMetadataRetriever().use { r -> r.setDataSource(file.absolutePath); r.getFrameAtTime(0) }
            }.getOrNull()
            val thumb = frame?.let { shrink(it) } ?: ByteArray(0)
            val out = ByteArrayOutputStream()
            out.write("MPV1".toByteArray())
            out.write(java.nio.ByteBuffer.allocate(4).putInt(thumb.size).array())
            out.write(thumb)
            out.write(file.readBytes())
            out.toByteArray()
        }
        val m = GigGroup.Moment(VisibilityPrefs.myName(app).ifBlank { "Mate" }, System.currentTimeMillis() / 1000, lat, lon, caption.trim(), packed)
        val ok = RelayClient.putFile(g.momentsIdForDay(Math.floorDiv(m.timeSec, 86_400L)), g.sealMoment(m))
        if (ok) {
            add(app, m, "mine-${m.timeSec}", mine = true)
            NightStats.moment(app)
        }
        DebugStatus.log(if (ok) "Clip shared with the crew" else "Clip not sent")
        return ok
    }

    /** (thumbnail, playable file) for a packed clip, or null if [data] is a plain photo. */
    private fun unpackClip(c: Context, data: ByteArray, key: String): Pair<ByteArray, java.io.File>? {
        if (data.size < 8 || String(data, 0, 4, Charsets.US_ASCII) != "MPV1") return null
        val n = java.nio.ByteBuffer.wrap(data, 4, 4).int
        if (n < 0 || 8 + n > data.size) return null
        val dir = java.io.File(c.cacheDir, "clips").apply { mkdirs() }
        val f = java.io.File(dir, "m-${key.hashCode().toUInt()}.mp4")
        if (!f.exists()) f.writeBytes(data.copyOfRange(8 + n, data.size))
        return data.copyOfRange(8, 8 + n) to f
    }

    /** Longest side 1280 px, JPEG 78%: roughly 150-300 KB. Sharp on the timeline, quick to send. */
    private fun shrink(src: Bitmap, maxPx: Float = 1280f, quality: Int = 78): ByteArray {
        val scale = minOf(1f, maxPx / maxOf(src.width, src.height))
        val bmp = if (scale < 1f) Bitmap.createScaledBitmap(src, (src.width * scale).toInt(), (src.height * scale).toInt(), true) else src
        return ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, quality, it) }.toByteArray()
    }
}
