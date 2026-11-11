package nz.waveformlabs.moshpoint.wear

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Task
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.core.watch.WatchMessage
import nz.waveformlabs.moshpoint.core.watch.WatchProtocol
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Waits for a Play services task without blocking a thread. */
suspend fun <T> Task<T>.await(): T = suspendCancellableCoroutine { c ->
    addOnSuccessListener { c.resume(it) }
    addOnFailureListener { c.resumeWithException(it) }
    addOnCanceledListener { c.cancel() }
}

/**
 * The watch's end of the link to the phone (the Wear Data Layer; docs/WATCH.md, problem 5).
 *
 * Messages are live and unstored: find requests and updates, pings and their answers.
 * Everything the phone says arrives through [WatchListenerService] and comes out of
 * [incoming]. Data items (crew status, faces) are kept by Play services and read here.
 */
object PhoneLink {
    private val _incoming = MutableSharedFlow<WatchMessage>(extraBufferCapacity = 32, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    /** Everything the phone sends, as it arrives. */
    val incoming: SharedFlow<WatchMessage> = _incoming

    fun dispatch(message: WatchMessage) {
        _incoming.tryEmit(message)
    }

    /**
     * The phone running Moshpoint, or null if there's none in reach.
     * @param nearbyOnly only a phone on a direct Bluetooth link. Finding insists on it: a phone
     *   left at home and reached through the cloud would point from the wrong place.
     */
    suspend fun phone(context: Context, nearbyOnly: Boolean): String? = runCatching {
        val nodes = Wearable.getCapabilityClient(context)
            .getCapability(WatchProtocol.CAPABILITY_PHONE, CapabilityClient.FILTER_REACHABLE).await().nodes
        (nodes.firstOrNull { it.isNearby } ?: if (nearbyOnly) null else nodes.firstOrNull())?.id
    }.getOrNull()

    /** True once the message has been handed to the phone's node. False = it did not go. */
    suspend fun send(context: Context, message: WatchMessage, nearbyOnly: Boolean = false): Boolean {
        val node = phone(context, nearbyOnly) ?: return false
        return runCatching {
            Wearable.getMessageClient(context).sendMessage(node, WatchProtocol.PATH_TO_PHONE, WatchProtocol.encode(message)).await()
        }.isSuccess
    }

    /**
     * Reads what the phone has already published (crew status and faces), for when the app
     * opens before any change has been pushed to it. Cheap: it's all local to the watch.
     */
    suspend fun loadPublished(context: Context) = withContext(Dispatchers.IO) {
        val client = Wearable.getDataClient(context)
        runCatching {
            val items = client.getDataItems(Uri.parse("wear://*" + WatchProtocol.PATH_STATE)).await()
            try {
                items.firstOrNull()?.let { stateBytes(it) }?.let { CrewStore.onState(context, it) }
            } finally {
                items.release()
            }
        }
        runCatching {
            val items = client.getDataItems(Uri.parse("wear://*" + WatchProtocol.PATH_FACE_PREFIX), DataClient.FILTER_PREFIX).await()
            try {
                for (item in items) loadFace(context, client, item)
            } finally {
                items.release()
            }
        }
    }

    fun stateBytes(item: DataItem): ByteArray? = DataMapItem.fromDataItem(item).dataMap.getByteArray(WatchProtocol.KEY_PAYLOAD)

    /** Copies one face out of its data item into the watch's own cache (once: it's named by its content). */
    suspend fun loadFace(context: Context, client: DataClient, item: DataItem) {
        val key = item.uri.path?.removePrefix(WatchProtocol.PATH_FACE_PREFIX)?.takeIf { it.isNotBlank() } ?: return
        if (CrewStore.hasFace(key)) return
        val asset = DataMapItem.fromDataItem(item).dataMap.getAsset(WatchProtocol.KEY_IMAGE) ?: return
        runCatching {
            val response = client.getFdForAsset(asset).await()
            try {
                response.inputStream?.use { it.readBytes() }?.let { CrewStore.onFace(context, key, it) }
            } finally {
                response.release()
            }
        }
    }
}
