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
    )

    /** Newest first (Compose state for home and map). */
    val items = mutableStateListOf<Item>()
    private val seenUrls = HashSet<String>()
    private var lastCheckMs = 0L

    /** Share a photo with the crew. Returns false if it couldn't be sent (no crew, no internet). */
    suspend fun share(c: Context, photo: Bitmap, caption: String, lat: Double?, lon: Double?): Boolean {
        val g = GroupSync.group.value ?: return false
        if (!RelayClient.filesEnabled) return false
        val app = c.applicationContext
        val jpeg = withContext(Dispatchers.Default) { shrink(photo) }
        val m = GigGroup.Moment(VisibilityPrefs.myName(app).ifBlank { "Mate" }, System.currentTimeMillis() / 1000, lat, lon, caption.trim(), jpeg)
        val sealed = g.sealMoment(m)
        val ok = RelayClient.putFile(g.momentsIdForDay(Math.floorDiv(m.timeSec, 86_400L)), sealed)
        if (ok) add(m, "mine-${m.timeSec}", mine = true)
        DebugStatus.log(if (ok) "Moment shared with the crew" else "Moment not sent (no internet?)")
        return ok
    }

    /** Check for new moments (at most every 2 minutes). Called from the crew sync loop. */
    suspend fun refresh(c: Context, g: GigGroup) {
        if (!RelayClient.filesEnabled) return
        val now = System.currentTimeMillis()
        if (now - lastCheckMs < 120_000) return
        lastCheckMs = now
        val day = Math.floorDiv(now / 1000, 86_400L)
        val files = RelayClient.listFiles(listOf(g.momentsIdForDay(day), g.momentsIdForDay(day - 1))) ?: return
        for ((_, url) in files.take(12)) {
            if (url in seenUrls) continue
            val blob = RelayClient.download(url) ?: continue // try again next time
            seenUrls += url
            val m = g.openMoment(blob) ?: continue
            val myName = VisibilityPrefs.myName(c).ifBlank { "Mate" }
            // Our own upload comes back too: we already have it.
            if (m.from == myName && items.any { it.mine && it.timeSec == m.timeSec }) continue
            add(m, url, mine = false)
            if (now / 1000 - m.timeSec < 15 * 60) {
                CrewNotifications.post(c, title = "${m.from} shared a moment", text = m.caption.ifBlank { "Tap to see where" })
            }
        }
    }

    fun clear() {
        items.clear()
        seenUrls.clear()
        lastCheckMs = 0L
    }

    private fun add(m: GigGroup.Moment, key: String, mine: Boolean) {
        if (items.any { it.key == key }) return
        val bmp = BitmapFactory.decodeByteArray(m.jpeg, 0, m.jpeg.size) ?: return
        val item = Item(key, m.from, m.timeSec, m.lat, m.lon, m.caption, bmp.asImageBitmap(), mine)
        val i = items.indexOfFirst { it.timeSec < m.timeSec }.let { if (it < 0) items.size else it }
        items.add(i, item)
        while (items.size > 30) items.removeAt(items.size - 1)
    }

    /** Longest side 720 px, JPEG ~60%: roughly 40-80 KB, plenty to recognise a spot. */
    private fun shrink(src: Bitmap): ByteArray {
        val scale = minOf(1f, 720f / maxOf(src.width, src.height))
        val bmp = if (scale < 1f) Bitmap.createScaledBitmap(src, (src.width * scale).toInt(), (src.height * scale).toInt(), true) else src
        return ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 60, it) }.toByteArray()
    }
}
