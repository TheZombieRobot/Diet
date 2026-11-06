package nz.waveformlabs.moshpoint

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Friend photos shown at the arrow tips and in the lists.
 *
 * For now you pick a photo for each friend yourself (from your gallery). Once there are
 * accounts, friends' own profile photos will come from the server instead.
 * Stored as small square JPEGs in app-private storage.
 */
object PhotoStore {
    private const val SIZE = 256
    private var dir: File? = null

    /** friendId -> photo. Compose state, so screens update when a photo is set. */
    val photos = mutableStateMapOf<String, ImageBitmap>()

    fun init(context: Context) {
        if (dir != null) return
        val d = File(context.filesDir, "photos").apply { mkdirs() }
        dir = d
        d.listFiles()?.forEach { f ->
            BitmapFactory.decodeFile(f.path)?.let { photos[f.nameWithoutExtension] = it.asImageBitmap() }
        }
    }

    /**
     * Decodes and saves off the main thread (gallery photos can be big, or still
     * downloading from the cloud). Returns false if the image couldn't be read.
     */
    suspend fun set(context: Context, friendId: String, uri: Uri): Boolean {
        val bmp = withContext(Dispatchers.IO) { decodeAndSave(context.applicationContext, friendId, uri) } ?: return false
        photos[friendId] = bmp.asImageBitmap()
        return true
    }

    private fun decodeAndSave(context: Context, friendId: String, uri: Uri): Bitmap? {
        val d = dir ?: return null
        val src = runCatching {
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(context.contentResolver, uri)) { decoder, info, _ ->
                // Decode small: we only need SIZE px, and gallery photos can be huge.
                val scale = maxOf(1, minOf(info.size.width, info.size.height) / SIZE)
                decoder.setTargetSize(info.size.width / scale, info.size.height / scale)
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        }.getOrNull() ?: return null
        val square = centreSquare(src, SIZE)
        File(d, "$friendId.jpg").outputStream().use { square.compress(Bitmap.CompressFormat.JPEG, 85, it) }
        return square
    }

    fun remove(friendId: String) {
        dir?.let { File(it, "$friendId.jpg").delete() }
        photos.remove(friendId)
    }

    private fun centreSquare(b: Bitmap, size: Int): Bitmap {
        val side = minOf(b.width, b.height)
        val cropped = Bitmap.createBitmap(b, (b.width - side) / 2, (b.height - side) / 2, side, side)
        return Bitmap.createScaledBitmap(cropped, size, size, true)
    }
}
