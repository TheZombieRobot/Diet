package nz.waveformlabs.moshpoint

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Live status of every locating technology, for the debug panel.
 *
 * Debug builds only: in release builds `BuildConfig.DEBUG` is false, so every call
 * returns straight away and R8 strips the rest. Nothing here reaches users.
 */
object DebugStatus {
    val enabled get() = BuildConfig.DEBUG

    private val _tech = MutableStateFlow<Map<String, String>>(sortedMapOf())
    /** e.g. "UWB looking" -> "ranging 2 peers, ch 9". */
    val tech: StateFlow<Map<String, String>> = _tech.asStateFlow()

    private val _log = MutableStateFlow<List<String>>(emptyList())
    /** Newest first: method switches and notable events. */
    val log: StateFlow<List<String>> = _log.asStateFlow()

    private val time = SimpleDateFormat("HH:mm:ss", Locale.US)

    fun set(key: String, value: String) {
        if (!enabled) return
        _tech.update { if (it[key] == value) it else (it + (key to value)).toSortedMap() }
    }

    fun log(line: String) {
        if (!enabled) return
        val stamped = "${time.format(Date())}  $line"
        _log.update { (listOf(stamped) + it).take(MAX_LOG) }
    }

    fun clearLog() = _log.update { emptyList() }

    private const val MAX_LOG = 60
}
