package nz.waveformlabs.moshpoint.safety

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import kotlinx.coroutines.CoroutineExceptionHandler
import nz.waveformlabs.moshpoint.core.StorageNotice
import nz.waveformlabs.moshpoint.debug.DebugStatus

/**
 * What happens when something fails in the background (reliability P1-6). A full phone used to
 * crash the app on every sync: writes weren't guarded, and long-lived scopes had no exception
 * handler, so one failure took the whole app (the live service too) down with it. Now writes
 * are guarded, every long-lived scope logs and carries on, and a full disk is told to you once
 * ([Notices], core [StorageNotice]).
 */
object AppErrors {
    private const val TAG = "Moshpoint"

    @Volatile private var app: Context? = null
    private val main by lazy { Handler(Looper.getMainLooper()) }

    /** From MoshpointApp.onCreate, first thing in every process. */
    fun init(c: Context) {
        app = c.applicationContext
    }

    /** For a long-lived background scope: an uncaught failure is logged and the app carries on. */
    fun handler(name: String): CoroutineExceptionHandler = CoroutineExceptionHandler { _, e -> failed(name, e) }

    /** Something failed and was caught: log it (test builds show it on the debug panel), and say so once if the disk is full. */
    fun failed(what: String, e: Throwable) {
        Log.w(TAG, "$what failed", e)
        DebugStatus.log("$what failed: ${e.javaClass.simpleName}")
        if (StorageNotice.isFull(e)) {
            val c = app ?: return
            main.post { Notices.storageFull(c) }
        }
    }

    /** A file write that must never take the app down. Null if it failed. */
    inline fun <T> guard(what: String, write: () -> T): T? = try {
        write()
    } catch (e: Exception) {
        failed(what, e)
        null
    }
}
