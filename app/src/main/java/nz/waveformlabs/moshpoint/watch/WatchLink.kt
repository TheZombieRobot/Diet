package nz.waveformlabs.moshpoint.watch

import android.content.Context
import com.google.android.gms.tasks.Task
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.suspendCancellableCoroutine
import nz.waveformlabs.moshpoint.core.watch.WatchMessage
import nz.waveformlabs.moshpoint.core.watch.WatchProtocol
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Waits for a Play services task without blocking a thread. */
internal suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { c ->
    addOnSuccessListener { c.resume(it) }
    addOnFailureListener { c.resumeWithException(it) }
    addOnCanceledListener { c.cancel() }
}

/** The phone's end of the link to the watch (the Wear Data Layer; docs/WATCH.md, problem 5). */
internal object WatchLink {
    /** Fire and forget: live messages are never queued. If the watch isn't there, it's gone. */
    fun send(c: Context, node: String, message: WatchMessage) {
        runCatching { Wearable.getMessageClient(c.applicationContext).sendMessage(node, WatchProtocol.PATH_TO_WATCH, WatchProtocol.encode(message)) }
    }

    /** True once it has been handed to the watch's node. */
    suspend fun sendNow(c: Context, node: String, message: WatchMessage): Boolean = runCatching {
        Wearable.getMessageClient(c.applicationContext).sendMessage(node, WatchProtocol.PATH_TO_WATCH, WatchProtocol.encode(message)).await()
    }.isSuccess

    @Volatile private var watchKnown = false
    @Volatile private var checkedAtMs = 0L

    /** A watch just spoke to us: no need to ask Play services whether one exists. */
    fun heardFromWatch() {
        watchKnown = true
        checkedAtMs = System.currentTimeMillis()
    }

    /**
     * Is there a watch with Moshpoint on it (connected right now or not)? Asked at most every
     * ten minutes; with no such watch the phone publishes nothing at all.
     */
    suspend fun hasWatch(c: Context): Boolean {
        val now = System.currentTimeMillis()
        if (now - checkedAtMs < RECHECK_MS && checkedAtMs != 0L) return watchKnown
        checkedAtMs = now
        watchKnown = runCatching {
            Wearable.getCapabilityClient(c.applicationContext)
                .getCapability(WatchProtocol.CAPABILITY_WATCH, CapabilityClient.FILTER_ALL).await().nodes.isNotEmpty()
        }.getOrDefault(false)
        return watchKnown
    }

    private const val RECHECK_MS = 10 * 60_000L
}
