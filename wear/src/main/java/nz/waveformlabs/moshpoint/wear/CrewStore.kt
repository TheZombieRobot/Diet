package nz.waveformlabs.moshpoint.wear

import android.content.Context
import android.graphics.BitmapFactory
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import nz.waveformlabs.moshpoint.core.watch.WatchState
import java.io.File

/**
 * What the watch knows about the crew: the last status the phone pushed, and the faces it has
 * been sent. Kept on the watch so the tile, the complication and the list can draw at once,
 * phone in reach or not. Faces arrive once each and stay (they're named by their content).
 */
object CrewStore {
    private val _state = MutableStateFlow<WatchState?>(null)
    val state: StateFlow<WatchState?> = _state

    /** Face key -> picture. Compose state, so a face appears the moment it lands. */
    val faces = mutableStateMapOf<String, ImageBitmap>()

    private val main = Handler(Looper.getMainLooper())
    private var dir: File? = null

    @Synchronized
    fun init(context: Context) {
        if (dir != null) return
        val d = context.applicationContext.filesDir
        dir = d
        runCatching { File(d, STATE_FILE).takeIf { it.exists() }?.readBytes()?.let(WatchState::decode) }.getOrNull()?.let { _state.value = it }
        File(d, FACES).listFiles()?.forEach { f ->
            runCatching { BitmapFactory.decodeFile(f.path)?.let { faces[f.name] = it.asImageBitmap() } }
        }
    }

    /** The phone pushed a new status. Returns it, or null if these bytes aren't one this build reads. */
    fun onState(context: Context, bytes: ByteArray): WatchState? {
        init(context)
        val s = WatchState.decode(bytes) ?: return null
        // A stale copy read back from the data layer must not replace a newer push.
        if ((_state.value?.sentAtSec ?: 0L) > s.sentAtSec) return _state.value
        runCatching { File(dir, STATE_FILE).writeBytes(bytes) }
        _state.value = s
        // Faces nobody in the crew wears any more go (the picture changed, or they left).
        val wanted = s.mates.map { it.faceKey }.filter { it.isNotBlank() }.toSet()
        main.post {
            (faces.keys - wanted).forEach { key ->
                faces.remove(key)
                runCatching { File(File(dir, FACES), key).delete() }
            }
        }
        return s
    }

    fun hasFace(key: String): Boolean = dir?.let { File(File(it, FACES), key).exists() } == true

    fun onFace(context: Context, key: String, jpeg: ByteArray) {
        init(context)
        if (!key.all { it.isLetterOrDigit() }) return // it becomes a file name
        val bitmap = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.size) ?: return
        runCatching {
            File(dir, FACES).mkdirs()
            File(File(dir, FACES), key).writeBytes(jpeg)
        }
        main.post { faces[key] = bitmap.asImageBitmap() }
    }

    private const val STATE_FILE = "crew.bin"
    private const val FACES = "faces"
}
