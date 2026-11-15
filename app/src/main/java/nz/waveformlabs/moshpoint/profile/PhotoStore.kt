package nz.waveformlabs.moshpoint

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Photos shown at the arrow tips and in the lists. Small square JPEGs in app-private storage.
 *
 * - [ME]: your own photo, which [AvatarSync] shares (encrypted) with your friends.
 * - A friend's id: their photo. Usually the one they shared ("auto"); if you pick one
 *   for them yourself, yours wins and their shared one won't overwrite it.
 */
object PhotoStore {
    const val ME = "me"
    private const val SIZE = 256
    private var dir: File? = null

    /** id -> photo. Compose state, so screens update when a photo arrives. */
    val photos = mutableStateMapOf<String, ImageBitmap>()

    fun init(context: Context) {
        if (dir != null) return
        val d = File(context.filesDir, "photos").apply { mkdirs() }
        dir = d
        d.listFiles { f -> f.extension == "jpg" }?.forEach { f ->
            BitmapFactory.decodeFile(f.path)?.let { photos[f.nameWithoutExtension] = it.asImageBitmap() }
        }
    }

    /**
     * Your own pick (gallery). Decodes and saves off the main thread (gallery photos can
     * be big, or still downloading from the cloud). Returns false if it couldn't be read.
     */
    suspend fun set(context: Context, id: String, uri: Uri): Boolean {
        val bmp = withContext(Dispatchers.IO) { decode(context.applicationContext, uri)?.let { save(id, it, auto = false) } } ?: return false
        photos[id] = bmp.asImageBitmap()
        return true
    }

    /** Your own pick from a camera preview (selfie). */
    suspend fun set(id: String, bitmap: Bitmap): Boolean {
        val bmp = withContext(Dispatchers.IO) { save(id, bitmap, auto = false) } ?: return false
        photos[id] = bmp.asImageBitmap()
        return true
    }

    /** A photo a friend shared. Ignored if you've picked one for them yourself. */
    suspend fun setShared(id: String, jpeg: ByteArray): Boolean {
        val d = dir ?: return false
        if (File(d, "$id.jpg").exists() && !File(d, "$id.auto").exists()) return false // your pick wins
        val bmp = withContext(Dispatchers.IO) {
            BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size)?.let { save(id, it, auto = true) }
        } ?: return false
        photos[id] = bmp.asImageBitmap()
        return true
    }

    /** True if this friend's photo is one you picked (not their shared one). */
    fun isManual(id: String): Boolean {
        val d = dir ?: return false
        return File(d, "$id.jpg").exists() && !File(d, "$id.auto").exists()
    }

    /** The saved JPEG bytes (for sharing your own photo). */
    fun jpeg(id: String): ByteArray? = dir?.let { File(it, "$id.jpg") }?.takeIf { it.exists() }?.readBytes()

    fun remove(id: String) {
        dir?.let {
            File(it, "$id.jpg").delete()
            File(it, "$id.auto").delete()
        }
        photos.remove(id)
    }

    private fun decode(context: Context, uri: Uri): Bitmap? = runCatching {
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
            // Decode small: we only need SIZE px, and gallery photos can be huge.
            val scale = maxOf(1, minOf(info.size.width, info.size.height) / SIZE)
            decoder.setTargetSize(info.size.width / scale, info.size.height / scale)
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    }.getOrNull()

    private fun save(id: String, src: Bitmap, auto: Boolean): Bitmap? {
        val d = dir ?: return null
        val square = centreSquare(src, SIZE)
        val bytes = ByteArrayOutputStream().also { square.compress(Bitmap.CompressFormat.JPEG, 82, it) }.toByteArray()
        File(d, "$id.jpg").writeBytes(bytes)
        val marker = File(d, "$id.auto")
        if (auto) marker.writeText("") else marker.delete()
        return square
    }

    private fun centreSquare(b: Bitmap, size: Int): Bitmap {
        val side = minOf(b.width, b.height)
        val cropped = Bitmap.createBitmap(b, (b.width - side) / 2, (b.height - side) / 2, side, side)
        return Bitmap.createScaledBitmap(cropped, size, size, true)
    }
}
