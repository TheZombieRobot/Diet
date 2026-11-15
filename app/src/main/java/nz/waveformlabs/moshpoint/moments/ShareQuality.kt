package nz.waveformlabs.moshpoint

import android.content.Context
import androidx.compose.runtime.mutableStateOf

/**
 * How big shared photos and clips are. High quality by default (photos up to 2048 px,
 * clips 720p), so everyone's "Save to phone" is crisp. Data saver goes lighter (1280 px,
 * 480p) for weak signal at big festivals. Your own originals are always kept full quality.
 */
object ShareQuality {
    val dataSaver = mutableStateOf(false)

    fun init(c: Context) {
        dataSaver.value = prefs(c).getBoolean("data_saver", false)
    }

    fun setDataSaver(c: Context, on: Boolean) {
        dataSaver.value = on
        prefs(c).edit().putBoolean("data_saver", on).apply()
    }

    /** Longest side and JPEG quality for photos we send. */
    val photo: Pair<Float, Int> get() = if (dataSaver.value) 1280f to 78 else 2048f to 90

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("quality", Context.MODE_PRIVATE)
}
