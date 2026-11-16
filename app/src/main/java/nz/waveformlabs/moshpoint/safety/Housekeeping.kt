package nz.waveformlabs.moshpoint.safety

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Old files go (reliability P2: nothing ever cleaned them up), once a day, off the main thread,
 * from app start: cached clips more than a few days old (the Story keeps its own copies in
 * Your gigs, and a clip of tonight's is unpacked again if needed), half-written temp files in
 * Your gigs, and empty gig folders. Never a kept photo, clip or gig.
 */
object Housekeeping {
    private const val EVERY_MS = 24 * 3600_000L
    private const val CLIP_KEEP_MS = 3 * 24 * 3600_000L
    private const val TMP_KEEP_MS = 24 * 3600_000L

    suspend fun run(c: Context) = withContext(Dispatchers.IO) {
        val app = c.applicationContext
        val p = app.getSharedPreferences("housekeeping", Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val last = p.getLong("at", 0L)
        if (now >= last && now - last < EVERY_MS) return@withContext
        p.edit().putLong("at", now).apply()
        AppErrors.guard("Housekeeping") {
            File(app.cacheDir, "clips").listFiles()?.forEach { f ->
                if (f.isFile && now - f.lastModified() > CLIP_KEEP_MS) f.delete()
            }
            File(app.filesDir, "gigs").listFiles()?.forEach { dir ->
                if (!dir.isDirectory) return@forEach
                dir.listFiles()?.forEach { f ->
                    if (f.isFile && f.name.endsWith(".tmp") && now - f.lastModified() > TMP_KEEP_MS) f.delete()
                }
                if (dir.list()?.isEmpty() == true && now - dir.lastModified() > TMP_KEEP_MS) dir.delete()
            }
        }
    }
}
