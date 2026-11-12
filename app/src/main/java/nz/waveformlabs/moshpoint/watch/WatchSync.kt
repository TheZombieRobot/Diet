package nz.waveformlabs.moshpoint.watch

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.graphics.asAndroidBitmap
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.CrewStatus
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.FriendsRepository
import nz.waveformlabs.moshpoint.GroupSync
import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.PhotoStore
import nz.waveformlabs.moshpoint.core.watch.WatchMate
import nz.waveformlabs.moshpoint.core.watch.WatchProtocol
import nz.waveformlabs.moshpoint.core.watch.WatchState
import nz.waveformlabs.moshpoint.ui.DefaultAvatars
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Keeps the watch's copy of the crew up to date (docs/WATCH.md, problems 5 and 6): who's in
 * it, who's live, how far, their faces, and the Moshpoint+ answer.
 *
 * It is pushed when it changes and never asked for: the watch's tile and complication redraw
 * off these pushes. Nothing is written unless a watch with Moshpoint exists. The watch gets
 * only what its screen shows: names, colours, small faces, distances. No keys, no coordinates.
 * Without Moshpoint+ it gets no crew details at all.
 *
 * It reads the app's existing state (friends, crew, distances, photos) without those classes
 * knowing: they are Compose state, so a change to any of them is seen here.
 */
object WatchSync {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val main = Handler(Looper.getMainLooper())
    private val started = AtomicBoolean(false)
    private val publishing = Mutex()
    private var soon: Job? = null
    private var lastPublished: WatchState? = null
    private var lastPublishedAtMs = 0L

    /** Safe to call from anywhere, any number of times. */
    fun start(c: Context) {
        if (!started.compareAndSet(false, true)) return
        val app = c.applicationContext
        main.post {
            // With no screen up (a process woken by the watch, or just the live service), nothing
            // tells Compose state observers that something changed. This does.
            val pending = AtomicBoolean(false)
            Snapshot.registerGlobalWriteObserver {
                if (pending.compareAndSet(false, true)) {
                    main.post {
                        pending.set(false)
                        Snapshot.sendApplyNotifications()
                    }
                }
            }
            scope.launch {
                snapshotFlow { contentNow(app) }.collectLatest { publishSoon(app) }
            }
        }
    }

    /** Something changed: publish shortly (changes arrive in bursts; one push covers them). */
    fun publishSoon(c: Context) {
        val app = c.applicationContext
        main.post {
            soon?.cancel()
            soon = scope.launch {
                // Who's in the crew, a new face, Moshpoint+ changing: straight away. Distances
                // tick over with every sync: at most one push every [MIN_GAP_MS] for those.
                val now = contentNow(app)
                val last = lastPublished
                val structural = last == null || last.plus != now.plus || last.crewName != now.crewName ||
                    last.mates.map { Triple(it.id, it.name, it.faceKey) } != now.mates.map { Triple(it.id, it.name, it.faceKey) }
                delay(if (structural) SETTLE_MS else (lastPublishedAtMs + MIN_GAP_MS - System.currentTimeMillis()).coerceIn(SETTLE_MS, MIN_GAP_MS))
                publish(app, force = false)
            }
        }
    }

    /** The watch asked (its app just opened): publish now, changed or not. */
    fun publishNow(c: Context) {
        val app = c.applicationContext
        start(app)
        scope.launch {
            // The app may not be open: load the crew, as the live service does.
            FriendsRepository.init(app)
            if (GroupSync.group.value == null) GroupSync.load(app)
            publish(app, force = true)
        }
    }

    /** What the watch should know right now, without the timestamp (so "nothing changed" compares equal). */
    private fun contentNow(app: Context): WatchState {
        if (!Entitlements.plus(app)) return WatchState(plus = false)
        val group = GroupSync.group.value
        val members = GroupSync.members.toSet()
        val all = FriendsRepository.friends.toList()
        val crew = if (group != null) all.filter { it.gigGroupOnly || it.key in members } else emptyList()
        // No crew tonight: your saved friends, so finding one mate still works.
        val shown = (crew.ifEmpty { all }).filter { DebugStatus.enabled || !FriendsRepository.isSimulated(it.id) }
        val nowSec = System.currentTimeMillis() / 1000
        val mates = shown.map { f ->
            WatchMate(
                id = f.id,
                name = f.name.take(40),
                colour = f.color,
                // Rounded, so the push doesn't change every time a mate's spot ticks over.
                lastSeenSec = LocationBook.seen[f.id]?.timeSec?.let { it - it % 30 } ?: 0L,
                distanceM = CrewStatus.distances[f.id]?.let(::roundForWatch),
                faceKey = faceKeyFor(f),
            )
        }
        return WatchState(plus = true, crewName = group?.name.orEmpty(), mates = WatchState.order(mates, nowSec))
    }

    private fun roundForWatch(m: Double): Double = when {
        m < 100 -> Math.round(m / 5) * 5.0
        m < 1_000 -> Math.round(m / 25) * 25.0
        else -> Math.round(m / 100) * 100.0
    }

    // ---- Faces: sent once each, named by a hash of the picture ----

    private class FaceEntry(val source: Any?, val key: String, val jpeg: ByteArray)

    private val faceCache = HashMap<String, FaceEntry>()
    private val facesOnWatch = HashSet<String>()

    /** Reads [PhotoStore.photos] (so a new photo is noticed) and returns the key already worked out, if any. */
    private fun faceKeyFor(f: Friend): String {
        val photo = PhotoStore.photos[f.id]
        val cached = faceCache[f.id]
        return if (cached != null && same(cached.source, photo ?: f.name)) cached.key else ""
    }

    /** The same picture object, or the same name (for a drawn default avatar). */
    private fun same(a: Any?, b: Any?) = a === b || (a is String && a == b)

    /** The phone's face for [f], as on the phone: their photo, else their drawn default avatar. */
    private suspend fun makeFace(f: Friend): FaceEntry? {
        val photo = PhotoStore.photos[f.id]
        val source: Any = photo ?: f.name
        faceCache[f.id]?.let { if (same(it.source, source)) return it }
        val entry = withContext(Dispatchers.Default) {
            runCatching {
                val big: Bitmap = (if (photo != null) PhotoStore.jpeg(f.id)?.let { BitmapFactory.decodeByteArray(it, 0, it.size) } else null)
                    ?: DefaultAvatars.image(f.name)?.asAndroidBitmap()
                    ?: return@runCatching null
                val small = Bitmap.createScaledBitmap(big, FACE_PX, FACE_PX, true)
                val jpeg = ByteArrayOutputStream().also { small.compress(Bitmap.CompressFormat.JPEG, 82, it) }.toByteArray()
                val key = MessageDigest.getInstance("SHA-256").digest(jpeg).take(8).joinToString("") { "%02x".format(it) }
                FaceEntry(source, key, jpeg)
            }.getOrNull()
        } ?: return null
        faceCache[f.id] = entry
        return entry
    }

    private suspend fun publish(app: Context, force: Boolean) = publishing.withLock {
        if (!WatchLink.hasWatch(app)) return@withLock
        val data = runCatching { Wearable.getDataClient(app) }.getOrNull() ?: return@withLock
        // A process with no screen up hasn't loaded these yet (all three are no-ops if it has).
        FriendsRepository.init(app)
        PhotoStore.init(app)
        LocationBook.init(app)
        var content = contentNow(app)
        if (content.plus) {
            // Work out any faces not made yet, then read the content again with their keys in it.
            val byId = FriendsRepository.friends.associateBy { it.id }
            val faces = content.mates.mapNotNull { m -> byId[m.id]?.let { makeFace(it) } }
            content = contentNow(app)
            for (face in faces) {
                if (!facesOnWatch.add(face.key)) continue
                val put = PutDataMapRequest.create(WatchProtocol.PATH_FACE_PREFIX + face.key)
                put.dataMap.putAsset(WatchProtocol.KEY_IMAGE, Asset.createFromBytes(face.jpeg))
                if (runCatching { data.putDataItem(put.asPutDataRequest().setUrgent()).await() }.isFailure) facesOnWatch.remove(face.key)
            }
        }
        if (!force && content == lastPublished) return@withLock
        val put = PutDataMapRequest.create(WatchProtocol.PATH_STATE)
        put.dataMap.putByteArray(WatchProtocol.KEY_PAYLOAD, content.copy(sentAtSec = System.currentTimeMillis() / 1000).encode())
        if (runCatching { data.putDataItem(put.asPutDataRequest().setUrgent()).await() }.isSuccess) {
            lastPublished = content
            lastPublishedAtMs = System.currentTimeMillis()
            DebugStatus.set("Watch", "crew status sent (${content.mates.size} mates${if (content.plus) "" else ", locked"})")
        }
        // Faces nobody wears any more come off the watch (and all of them if Moshpoint+ has gone).
        val wanted = content.mates.map { it.faceKey }.filter { it.isNotBlank() }.toSet()
        runCatching {
            val items = data.getDataItems(Uri.parse("wear://*" + WatchProtocol.PATH_FACE_PREFIX), DataClient.FILTER_PREFIX).await()
            val stale = try {
                items.mapNotNull { it.uri }.filter { it.path?.removePrefix(WatchProtocol.PATH_FACE_PREFIX) !in wanted }
            } finally {
                items.release()
            }
            for (uri in stale) {
                data.deleteDataItems(uri).await()
                facesOnWatch.remove(uri.path?.removePrefix(WatchProtocol.PATH_FACE_PREFIX))
            }
        }
        Unit
    }

    private const val FACE_PX = 96
    private const val SETTLE_MS = 1_500L
    private const val MIN_GAP_MS = 45_000L
}

/**
 * Starts [WatchSync] with the app's process, so the watch's tile keeps up whenever the phone
 * app is alive in any form (open, or just live in the background). A provider only because
 * Android creates those at start-up without the Application class having to know: it serves
 * no data.
 */
class WatchSyncStarter : ContentProvider() {
    override fun onCreate(): Boolean {
        context?.let { WatchSync.start(it) }
        return true
    }

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor? = null
    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int = 0
}
