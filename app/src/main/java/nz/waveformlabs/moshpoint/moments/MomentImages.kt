package nz.waveformlabs.moshpoint.moments

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.graphics.asImageBitmap
import nz.waveformlabs.moshpoint.gigs.GigArchive
import java.io.File

/**
 * The Story's board images (performance P1-7): read from the gig's folder only when a Polaroid
 * is shown, at the board's size ([GigArchive.thumbnail], unchanged), and kept in a small cache.
 * A night of 200 photos used to be decoded whole at every start (about 300 MB).
 */
object MomentImages {
    /** About 16 board images (1.5 MB each), less on a phone with a small memory allowance. */
    private val cache = object : LruCache<String, ImageBitmap>(
        minOf(24L * 1024 * 1024, Runtime.getRuntime().maxMemory() / 8).toInt(),
    ) {
        override fun sizeOf(key: String, value: ImageBitmap) = value.asAndroidBitmap().byteCount
    }

    /** The board image for [f] if it's in memory now (never reads the disk). */
    fun cached(f: File): ImageBitmap? = cache.get(f.path)

    /** The board image for [f], read from disk if needed. Off the main thread. [keep]: into the cache. */
    fun load(f: File, keep: Boolean = true): ImageBitmap? {
        cache.get(f.path)?.let { return it }
        val img = GigArchive.thumbnail(f)?.asImageBitmap() ?: return null
        if (keep) cache.put(f.path, img)
        return img
    }

    /**
     * Is [f] a picture at all? Reads only its header (the Story used to leave out a photo that
     * wouldn't decode; this keeps that without decoding them all).
     */
    fun readable(f: File): Boolean {
        if (!f.exists()) return false
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(f.absolutePath, bounds)
        return bounds.outWidth > 0 && bounds.outHeight > 0
    }
}
