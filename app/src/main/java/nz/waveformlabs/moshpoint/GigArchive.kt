package nz.waveformlabs.moshpoint

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.provider.MediaStore
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.core.GigGroup
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest

/**
 * Your gigs: every photo and clip from a night is kept on this phone, in that gig's own
 * folder, the moment it arrives. So the Story survives app restarts and the relay
 * forgetting, and after the night it lives on in "Your gigs" to look back through, save to
 * the gallery ("Moshpoint / Iron Maiden"), or delete.
 *
 * App-private storage (filesDir/gigs/<id>/): nobody else can read it; uninstalling removes it.
 */
object GigArchive {
    data class Summary(
        val id: String,
        val name: String,
        val whenSec: Long,
        val venue: String,
        val photos: Int,
        val clips: Int,
        val people: List<String>,
        val cover: File?,
        val bytes: Long,
    )

    /** Past and current gigs, newest first (Compose state for the home screen). */
    val gigs = mutableStateListOf<Summary>()

    fun idFor(g: GigGroup): String =
        MessageDigest.getInstance("SHA-256").digest(g.key).take(8).joinToString("") { "%02x".format(it) }

    private fun root(c: Context) = File(c.applicationContext.filesDir, "gigs").apply { mkdirs() }
    private fun dir(c: Context, id: String) = File(root(c), id).apply { mkdirs() }

    /** Note the gig's details (name, time, venue) so it shows properly in the list. */
    fun remember(c: Context, g: GigGroup) {
        val d = dir(c, idFor(g))
        val meta = File(d, "meta.json")
        val o = runCatching { JSONObject(meta.readText()) }.getOrDefault(JSONObject())
        o.put("name", g.name).put("when", if (g.startsAtSec > 0) g.startsAtSec else g.createdAtMs / 1000).put("venue", g.venue)
        meta.writeText(o.toString())
    }

    /**
     * Keep one moment: the JPEG (for a clip, its first frame) and the clip itself. Returns the
     * kept files (photo, clip) so the Story can show them.
     */
    fun keep(c: Context, g: GigGroup, key: String, m: GigGroup.Moment, mine: Boolean, jpeg: ByteArray, clip: File?, original: ByteArray? = null): Pair<File, File?> {
        val d = dir(c, idFor(g))
        val name = safeName(key)
        val photo = File(d, "$name.jpg")
        val alreadyKept = photo.exists()
        if (!alreadyKept) photo.writeBytes(jpeg)
        if (original != null) File(d, "$name.orig.jpg").let { if (!it.exists()) it.writeBytes(original) }
        val video = clip?.let { src ->
            File(d, "$name.mp4").also { if (!it.exists()) runCatching { src.copyTo(it) } }
        }
        val line = JSONObject()
            .put("key", key).put("from", m.from).put("t", m.timeSec).put("cap", m.caption).put("mine", mine)
            .put("photo", photo.name).put("clip", video?.name ?: "")
            .apply {
                m.lat?.let { put("lat", it) }
                m.lon?.let { put("lon", it) }
            }
        if (!alreadyKept) File(d, "items.jsonl").appendText(line.toString() + "\n")
        if (!File(d, "meta.json").exists()) remember(c, g)
        return photo to video
    }

    /** A photo or video from the phone's own camera roll, taken during a gig. */
    data class Found(val uri: android.net.Uri, val video: Boolean, val takenSec: Long, val thumb: android.graphics.Bitmap?)

    /**
     * Photos and videos on this phone taken during gig [id] (from 2 h before it started to
     * 8 h after), newest first, not already added. Needs photo access (asked first).
     */
    suspend fun findOnPhone(c: Context, id: String): List<Found> = withContext(Dispatchers.IO) {
        val meta = runCatching { JSONObject(File(File(root(c), id), "meta.json").readText()) }.getOrNull() ?: return@withContext emptyList()
        val start = (meta.optLong("when") - 2 * 3600) * 1000
        val end = (meta.optLong("when") + 8 * 3600) * 1000
        val have = File(File(root(c), id), "items.jsonl").takeIf { it.exists() }?.readText().orEmpty()
        val out = mutableListOf<Found>()
        for ((collection, video) in listOf(MediaStore.Images.Media.EXTERNAL_CONTENT_URI to false, MediaStore.Video.Media.EXTERNAL_CONTENT_URI to true)) {
            runCatching {
                c.contentResolver.query(
                    collection, arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DATE_TAKEN),
                    "${MediaStore.MediaColumns.DATE_TAKEN} BETWEEN ? AND ?", arrayOf(start.toString(), end.toString()),
                    "${MediaStore.MediaColumns.DATE_TAKEN} DESC",
                )?.use { cur ->
                    while (cur.moveToNext() && out.size < 200) {
                        val mid = cur.getLong(0)
                        if (have.contains("roll-${if (video) "v" else "p"}$mid")) continue
                        val uri = android.content.ContentUris.withAppendedId(collection, mid)
                        val thumb = runCatching { c.contentResolver.loadThumbnail(uri, android.util.Size(300, 300), null) }.getOrNull()
                        out += Found(uri, video, cur.getLong(1) / 1000, thumb)
                    }
                }
            }
        }
        out.sortedByDescending { it.takenSec }
    }

    /** Copy picked camera-roll photos/videos into gig [id] (yours; they stay even if you delete them from the gallery). */
    suspend fun addFromPhone(c: Context, id: String, picked: List<Found>, myName: String): Int = withContext(Dispatchers.IO) {
        val d = File(root(c), id)
        var n = 0
        for (f in picked) {
            runCatching {
                val key = "roll-${if (f.video) "v" else "p"}${android.content.ContentUris.parseId(f.uri)}"
                val name = safeName(key)
                val photo = File(d, "$name.jpg")
                if (photo.exists()) return@runCatching
                if (f.video) {
                    val clip = File(d, "$name.mp4")
                    c.contentResolver.openInputStream(f.uri)?.use { input -> clip.outputStream().use { input.copyTo(it) } }
                    val frame = (f.thumb ?: runCatching { c.contentResolver.loadThumbnail(f.uri, android.util.Size(1280, 1280), null) }.getOrNull())
                    photo.writeBytes(java.io.ByteArrayOutputStream().also { frame?.compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray())
                    appendItem(d, key, myName, f.takenSec, "", true, photo.name, clip.name)
                } else {
                    // Board copy (2048 px) plus the untouched original for "Save to phone".
                    val bytes = c.contentResolver.openInputStream(f.uri)?.use { it.readBytes() } ?: return@runCatching
                    File(d, "$name.orig.jpg").writeBytes(bytes)
                    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                    var sample = 1
                    while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 2048) sample *= 2
                    val bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
                        ?: return@runCatching
                    photo.writeBytes(java.io.ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 88, it) }.toByteArray())
                    appendItem(d, key, myName, f.takenSec, "", true, photo.name, "")
                }
                n++
            }
        }
        refreshList(c)
        n
    }

    private fun appendItem(d: File, key: String, from: String, t: Long, cap: String, mine: Boolean, photo: String, clip: String) {
        val o = JSONObject().put("key", key).put("from", from).put("t", t).put("cap", cap).put("mine", mine).put("photo", photo).put("clip", clip)
        File(d, "items.jsonl").appendText(o.toString() + "\n")
    }

    /** The moments kept for gig [id], newest first, as Story items (small images for the board). */
    suspend fun load(c: Context, id: String): List<Moments.Item> = withContext(Dispatchers.IO) {
        val d = File(root(c), id)
        val index = File(d, "items.jsonl")
        if (!index.exists()) return@withContext emptyList()
        index.readLines().mapNotNull { l ->
            runCatching {
                val o = JSONObject(l)
                val photo = File(d, o.getString("photo"))
                val clip = o.optString("clip").takeIf { it.isNotBlank() }?.let { File(d, it) }?.takeIf { it.exists() }
                val bmp = thumbnail(photo) ?: return@runCatching null
                Moments.Item(
                    key = o.getString("key"), from = o.getString("from"), timeSec = o.getLong("t"),
                    lat = if (o.has("lat")) o.getDouble("lat") else null, lon = if (o.has("lon")) o.getDouble("lon") else null,
                    caption = o.optString("cap"), image = bmp.asImageBitmap(), mine = o.optBoolean("mine"),
                    videoFile = clip, photoFile = photo,
                    originalFile = File(d, photo.nameWithoutExtension + ".orig.jpg").takeIf { it.exists() },
                )
            }.getOrNull()
        }.distinctBy { it.key }.sortedByDescending { it.timeSec }
    }

    /** Refresh [gigs] from disk. */
    suspend fun refreshList(c: Context) {
        val list = withContext(Dispatchers.IO) {
            root(c).listFiles().orEmpty().filter { it.isDirectory }.mapNotNull { d ->
                val meta = runCatching { JSONObject(File(d, "meta.json").readText()) }.getOrNull() ?: return@mapNotNull null
                val lines = File(d, "items.jsonl").takeIf { it.exists() }?.readLines().orEmpty()
                    .mapNotNull { runCatching { JSONObject(it) }.getOrNull() }.distinctBy { it.optString("key") }
                if (lines.isEmpty()) return@mapNotNull null
                val clips = lines.count { it.optString("clip").isNotBlank() }
                val cover = lines.maxByOrNull { it.optLong("t") }?.let { File(d, it.getString("photo")) }
                Summary(
                    id = d.name, name = meta.optString("name", "Gig"), whenSec = meta.optLong("when"), venue = meta.optString("venue"),
                    photos = lines.size - clips, clips = clips,
                    people = lines.map { if (it.optBoolean("mine")) "You" else it.optString("from") }.distinct(),
                    cover = cover, bytes = d.walkTopDown().filter { it.isFile }.sumOf { it.length() },
                )
            }.sortedByDescending { it.whenSec }
        }
        gigs.clear()
        gigs.addAll(list)
    }

    /** Debug: a pretend gig from exactly a year ago today, with a few Polaroids, to preview Your gigs and Memories. */
    suspend fun addSample(c: Context) {
        withContext(Dispatchers.IO) {
            val whenSec = java.util.Calendar.getInstance().apply {
                add(java.util.Calendar.YEAR, -1); set(java.util.Calendar.HOUR_OF_DAY, 20); set(java.util.Calendar.MINUTE, 0)
            }.timeInMillis / 1000
            val d = dir(c, "sample-" + System.currentTimeMillis().toString(36))
            File(d, "meta.json").writeText(JSONObject().put("name", "Sample gig (test)").put("when", whenSec).put("venue", "Spark Arena, Auckland").toString())
            val people = listOf("You" to 0xFFFF2E93.toInt(), "Bevan" to 0xFF22E4FF.toInt(), "Jo" to 0xFFFFB020.toInt(), "Bevan" to 0xFFB6FF3B.toInt())
            val captions = listOf("Front row!!", "the crew", "by the sound desk", "")
            people.forEachIndexed { i, (who, colour) ->
                val bmp = Bitmap.createBitmap(800, 800, Bitmap.Config.ARGB_8888)
                val cv = android.graphics.Canvas(bmp)
                val p = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG)
                p.shader = android.graphics.LinearGradient(0f, 0f, 800f, 800f, colour, 0xFF0F0B1C.toInt(), android.graphics.Shader.TileMode.CLAMP)
                cv.drawRect(0f, 0f, 800f, 800f, p)
                p.shader = null
                p.color = 0x66FFFFFF
                for (k in 0 until 6) cv.drawCircle(120f + k * 120f, 600f - (k % 3) * 90f, 40f + k * 6f, p) // "stage lights"
                val name = "sample$i"
                File(d, "$name.jpg").writeBytes(java.io.ByteArrayOutputStream().also { bmp.compress(Bitmap.CompressFormat.JPEG, 85, it) }.toByteArray())
                val o = JSONObject().put("key", "sample-$i").put("from", who).put("t", whenSec + i * 1500).put("cap", captions[i])
                    .put("mine", who == "You").put("photo", "$name.jpg").put("clip", "")
                File(d, "items.jsonl").appendText(o.toString() + "\n")
            }
        }
        refreshList(c)
    }

    suspend fun removeSamples(c: Context) {
        withContext(Dispatchers.IO) { root(c).listFiles().orEmpty().filter { it.name.startsWith("sample-") }.forEach { it.deleteRecursively() } }
        refreshList(c)
    }

    suspend fun delete(c: Context, id: String) {
        withContext(Dispatchers.IO) { File(root(c), id).deleteRecursively() }
        refreshList(c)
    }

    /** Save one moment to the phone's gallery, in an album named after the gig. */
    suspend fun saveToPhone(c: Context, item: Moments.Item, album: String): Boolean = withContext(Dispatchers.IO) {
        val folder = "Moshpoint/" + album.replace(Regex("[^A-Za-z0-9 ._-]"), "").trim().ifBlank { "Gig" }.take(40)
        val stamp = java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.ROOT).format(java.util.Date(item.timeSec * 1000))
        val who = item.from.replace(Regex("[^A-Za-z0-9]"), "").take(16).ifBlank { "mate" }
        val video = item.videoFile
        // Best version we have: your own full-quality original, else what the crew sent.
        val src = video ?: item.originalFile?.takeIf { it.exists() } ?: item.photoFile ?: return@withContext false
        if (!src.exists()) return@withContext false
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, "${stamp}_$who.${if (video != null) "mp4" else "jpg"}")
            put(MediaStore.MediaColumns.MIME_TYPE, if (video != null) "video/mp4" else "image/jpeg")
            put(MediaStore.MediaColumns.RELATIVE_PATH, (if (video != null) "Movies/" else "Pictures/") + folder)
            put(MediaStore.MediaColumns.DATE_TAKEN, item.timeSec * 1000)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val collection = if (video != null) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        val resolver = c.contentResolver
        val uri = runCatching { resolver.insert(collection, values) }.getOrNull() ?: return@withContext false
        val ok = runCatching { resolver.openOutputStream(uri)?.use { out -> src.inputStream().use { it.copyTo(out) } } != null }.getOrDefault(false)
        if (ok) {
            resolver.update(uri, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
        } else {
            runCatching { resolver.delete(uri, null, null) }
        }
        ok
    }

    /** Save every photo and clip from a gig. Returns how many were saved. */
    suspend fun saveAllToPhone(c: Context, items: List<Moments.Item>, album: String): Int =
        items.count { saveToPhone(c, it, album) }

    /** A small version for the board (about 540 px, 16-bit colour) so a long night fits in memory. */
    internal fun thumbnail(f: File): Bitmap? {
        if (!f.exists()) return null
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(f.absolutePath, bounds)
        var sample = 1
        while (maxOf(bounds.outWidth, bounds.outHeight) / (sample * 2) >= 540) sample *= 2
        return BitmapFactory.decodeFile(f.absolutePath, BitmapFactory.Options().apply { inSampleSize = sample; inPreferredConfig = Bitmap.Config.RGB_565 })
    }

    private fun safeName(key: String) = MessageDigest.getInstance("SHA-1").digest(key.toByteArray()).take(10).joinToString("") { "%02x".format(it) }
}
