package nz.waveformlabs.moshpoint.safety

import android.app.NotificationManager
import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Old files go (reliability P2: nothing ever cleaned them up), once a day, off the main thread,
 * from app start: cached clips more than a few days old (the Story keeps its own copies in
 * Your gigs, and a clip of tonight's is unpacked again if needed), half-written temp files in
 * Your gigs, and empty gig folders. Never a kept photo, clip or gig.
 *
 * At every start, before that: what older builds kept for the features removed on 16 November
 * 2026 ([forgetRemovedFeatures]).
 */
object Housekeeping {
    private const val EVERY_MS = 24 * 3600_000L
    private const val CLIP_KEEP_MS = 3 * 24 * 3600_000L
    private const val TMP_KEEP_MS = 24 * 3600_000L

    suspend fun run(c: Context) = withContext(Dispatchers.IO) {
        val app = c.applicationContext
        AppErrors.guard("Removed features") { forgetRemovedFeatures(app) }
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

    /**
     * Need help and check-ins were removed (16 November 2026). Older builds kept, on the phone:
     * the emergency contact's name and number ("safety"), and the check-in reminder's state
     * ("checkin_alarm"). Nothing reads them any more, and someone's number shouldn't stay on a
     * phone for nothing, so both go. So does a "Home yet?" reminder still showing from before
     * the update (its button no longer does anything). Each is a no-op once done.
     */
    private fun forgetRemovedFeatures(app: Context) {
        listOf("safety", "checkin_alarm").forEach { app.deleteSharedPreferences(it) }
        app.getSystemService(NotificationManager::class.java)?.cancel(OLD_CHECK_IN_REMINDER)
    }

    /** The id older builds gave their "Home yet?" reminder. */
    private const val OLD_CHECK_IN_REMINDER = 0x30000001
}
