package nz.waveformlabs.moshpoint

import android.content.Context
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.RecordLine
import java.io.File
import java.io.FileWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * Field recorder (debug builds only): writes every raw reading to a CSV so a real-world
 * test can be analysed and the constants tuned afterwards (RSSI path loss, spin-scan
 * thresholds, method trust weights, ...).
 *
 * Use "Mark" during a test to note ground truth, e.g. "Sam 20 m, due north", so readings
 * can be compared with reality.
 */
object FieldRecorder {
    /** Each recording gets its own queue, so a quick stop/start never mixes two files. */
    @Volatile private var queue = ConcurrentLinkedQueue<String>()
    private val io = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var writerJob: Job? = null
    @Volatile private var current: Any? = null
    private var file: File? = null

    private val _recording = MutableStateFlow(false)
    val recording: StateFlow<Boolean> = _recording.asStateFlow()

    private val _rows = MutableStateFlow(0)
    val rows: StateFlow<Int> = _rows.asStateFlow()

    /** Most recent finished (or current) recording, for sharing. */
    var lastFile: File? = null
        private set

    val active get() = DebugStatus.enabled && _recording.value

    fun start(context: Context) {
        if (!DebugStatus.enabled || _recording.value) return
        val dir = File(context.cacheDir, "recordings").apply { mkdirs() }
        val name = "moshpoint-" + SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(Date()) + ".csv"
        val f = File(dir, name)
        file = f
        lastFile = f
        _rows.value = 0
        val q = ConcurrentLinkedQueue<String>()
        queue = q
        val session = Any()
        current = session
        q.add(RecordLine.HEADER)
        q.add(RecordLine.of(System.currentTimeMillis(), "device", note = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} Android ${android.os.Build.VERSION.RELEASE}"))
        _recording.value = true
        DebugStatus.log("Recording to $name")
        writerJob = io.launch {
            FileWriter(f, true).use { w ->
                while (true) {
                    var n = 0
                    while (true) {
                        val line = q.poll() ?: break
                        w.write(line)
                        w.write("\n")
                        n++
                    }
                    if (n > 0) {
                        w.flush()
                        _rows.value += n
                    }
                    if (current !== session && q.isEmpty()) break
                    delay(1_000)
                }
            }
        }
    }

    fun stop() {
        if (!_recording.value) return
        line(RecordLine.of(System.currentTimeMillis(), "stop"))
        _recording.value = false
        current = null // this session's writer drains its queue and finishes
        DebugStatus.log("Recording stopped (${_rows.value} rows)")
    }

    fun line(csvLine: String) {
        if (!active) return
        queue.add(csvLine)
    }

    fun mark(note: String) {
        if (!active) return
        line(RecordLine.of(System.currentTimeMillis(), "mark", note = note))
        DebugStatus.log("Mark: $note")
    }

    /** All recordings on the phone, newest first. */
    fun files(context: Context): List<File> =
        File(context.cacheDir, "recordings").listFiles()?.sortedByDescending { it.lastModified() } ?: emptyList()
}
