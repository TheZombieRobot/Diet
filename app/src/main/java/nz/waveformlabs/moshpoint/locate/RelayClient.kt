package nz.waveformlabs.moshpoint.locate

import android.os.SystemClock
import android.util.Base64
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.setup.NetState
import nz.waveformlabs.moshpoint.core.BatchPlan
import nz.waveformlabs.moshpoint.core.HeldMirror
import nz.waveformlabs.moshpoint.core.InstallToken
import nz.waveformlabs.moshpoint.core.InviteRelay
import nz.waveformlabs.moshpoint.core.PutResult
import nz.waveformlabs.moshpoint.core.RelayBudget
import nz.waveformlabs.moshpoint.core.RelayEndpoints
import nz.waveformlabs.moshpoint.core.RelayHolds
import nz.waveformlabs.moshpoint.core.RelayWire
import nz.waveformlabs.moshpoint.core.RelayUse
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Passes sealed boxes between phones over the internet. Only ever sends rotating ids and
 * encrypted bytes: whoever runs the relay can't tell who anyone is or where they are.
 *
 * Two backends:
 *  - **Our own relay server** (see `server/`) when a URL is set at build time
 *    (`-Pmoshpoint.server=https://...` or `moshpoint.serverUrl` in gradle.properties).
 *  - Otherwise the free public **ntfy.sh** service, so GPS sharing and crew lists work
 *    out of the box with no server to run. Each box id becomes a topic name (the rotating
 *    id, which changes every 5 minutes); the message is the sealed box in base64. ntfy.sh
 *    limits each internet address to about 250 messages a day and a request every 5 s on
 *    average, so this side is deliberately frugal (see core [RelayBudget]).
 *
 * Nothing here spends budget, or waits out a timeout, while the phone has no network at all
 * ([NetState]): it answers [PutResult.NO_NETWORK] straight away so Bluetooth can take over.
 */
object RelayClient {
    private const val LOOKUP_CHUNK = 60

    /** Asks in one chat poll at most (each answer carries up to 512 KB): the rest waits for the next poll. */
    private const val MAX_HELD_ROUNDS = 20

    /** Always on: our server if configured, else the public relay. */
    val enabled get() = true

    /** Our own server is configured (photos and the crowd-relay upload need it). */
    val ownServer get() = base.isNotBlank()

    /**
     * The build's own relays, in one place: the only relays a release build uses, or follows an
     * invite to (core [InviteRelay]). Today the production relay (`MOSHPOINT_SERVER`, a
     * Moshpoint+ feature); the free tier's relay joins this list with billing. Blank ones don't
     * count: with none, release builds use the public relay.
     */
    val ownRelays: List<String> get() = listOf(BuildConfig.MOSHPOINT_SERVER).filter { it.isNotBlank() }

    /**
     * A relay server chosen on this phone: in a test build from Settings > Relay server or a crew's
     * invite the person confirmed; in a release build only ever one of [ownRelays], from an
     * invite. Blank = the one built in, else the free public relay.
     */
    @Volatile var serverUrl: String = ""
        private set

    /** [serverUrl] came from someone's invite, so it's never passed on in ours ([shareableServer]). */
    @Volatile private var serverFromInvite = false

    fun init(c: android.content.Context) {
        val p = c.applicationContext.getSharedPreferences("relay", android.content.Context.MODE_PRIVATE)
        serverUrl = p.getString("url", null).orEmpty()
        // Saved by a version that didn't record where it came from: treat it as from an invite,
        // so it's never passed on in ours (it may be a stranger's). Retyping it in Settings
        // makes it this phone's own again.
        serverFromInvite = p.getBoolean("fromInvite", true)
        prefs = p
        tokens = InstallToken(p.getString("token", null))
        askToken()
    }

    /**
     * Use [url] as the relay (blank = public relay / build default); [fromInvite] = it came in a
     * crew's invite. Returns false if it isn't a valid https address.
     */
    fun setServer(c: android.content.Context, url: String, fromInvite: Boolean = false): Boolean {
        val u = url.trim().trimEnd('/')
        if (u.isNotEmpty() && !InviteRelay.valid(u)) return false
        serverUrl = u
        serverFromInvite = fromInvite && u.isNotEmpty()
        c.applicationContext.getSharedPreferences("relay", android.content.Context.MODE_PRIVATE).edit()
            .putString("url", u).putBoolean("fromInvite", serverFromInvite).apply()
        return true
    }

    /** Profile photos are too big for the public relay. */
    val avatarsEnabled get() = ownServer

    /** Shown in the debug panel. */
    val label get() = if (ownServer) "own server" else "ntfy.sh (public, encrypted)"

    /**
     * How often the crew sync talks to the relay: once a minute with batches (our own relay, one
     * request carrying everything); without them as before (30 s on our relay, 55 s on the public one).
     */
    val syncGapMs: Long get() = if (batching) 60_000L else if (ownServer) 30_000L else 55_000L

    /** How often finders should poll for locations. */
    val pollMs get() = if (ownServer) 4_000L else 15_000L

    /** Minimum gap between our own location posts. */
    val uploadGapMs get() = if (ownServer) 15_000L else 75_000L

    /**
     * The relay in use: the one chosen on this phone, else the one built in, else (blank) the
     * public relay, as before. A release build ignores a chosen relay that isn't one of its own.
     */
    private val base get() = InviteRelay.inUse(BuildConfig.MOSHPOINT_SERVER, serverUrl, BuildConfig.TEST_BUILD, ownRelays)

    /** The relay this phone uses now (blank = the public relay). */
    val serverInUse get() = base

    /** The relay in use came in someone's invite (test builds; Settings says so). */
    val serverFromCrew get() = BuildConfig.TEST_BUILD && serverFromInvite && serverUrl.isNotBlank()

    /**
     * The relay crew invites carry, and what gig search and venue lookups ask (blank = the public
     * relay). Release: the one in use, always one of [ownRelays]. In a test build, one typed into
     * Settings counts as its own; one that came in someone else's invite never does, so it can't
     * spread from phone to phone.
     */
    val shareableServer get() = InviteRelay.forInvites(BuildConfig.MOSHPOINT_SERVER, serverUrl, serverFromInvite, BuildConfig.TEST_BUILD, ownRelays)
    private const val NTFY = "https://ntfy.sh"

    /**
     * Location shares, floor boxes, crowd-relay packets and crew intros: [RelayUse.BACKGROUND]
     * unless the caller says otherwise. With our own relay these wait for the minute's batch
     * (docs/RELAY_API.md section 11.4), the newest copy for each rotating id; [soon] = someone is
     * waiting for it (a mate is looking for us): it goes within a couple of seconds. [alone]: never
     * batched (the last-gasp location at 5%). True once the relay has it, or it's waiting for the batch.
     */
    suspend fun put(id: ByteArray, sealed: ByteArray, use: RelayUse = RelayUse.BACKGROUND, soon: Boolean = false, alone: Boolean = false): Boolean {
        if (!alone && use == RelayUse.BACKGROUND && !offline && batching && sealed.size in RelayWire.MIN_RECORD..RelayWire.MAX_BOX_RECORD) {
            queue(BatchPlan.Put(id, sealed, held = false, replaceable = true), if (soon) BatchPlan.Timing.SOON else BatchPlan.Timing.MINUTE)
            return true
        }
        return send(id, sealed, use).ok
    }

    /**
     * Post one sealed record under [id] and say how it went. [held] = the crew-chat mailbox
     * (kept for days on our own server; the public relay has only one kind of mailbox).
     */
    suspend fun send(id: ByteArray, sealed: ByteArray, use: RelayUse, held: Boolean = false): PutResult = withContext(Dispatchers.IO) {
        waitForRoom(use)
        if (ownServer) {
            return@withContext ownPut("$base/v1/${if (held) "held" else "box"}/${id.hex()}", sealed, if (held) 6_000 else 5_000, use, RelayHolds.Traffic.RECORDS, id.hex())
        }
        exchange(use, message = true, RelayHolds.Traffic.RECORDS) {
            val c = URL("$NTFY/${topic(id)}").openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = 6_000
            c.readTimeout = 6_000
            c.setRequestProperty("Content-Type", "text/plain")
            c.setRequestProperty("Firebase", "no") // nobody needs a push notification for this
            c.outputStream.use { it.write(Base64.encodeToString(sealed, Base64.NO_WRAP or Base64.URL_SAFE).toByteArray()) }
            val code = c.responseCode
            c.disconnect()
            code to Unit
        }.first
    }

    /** Upload an encrypted profile photo (see core AvatarBox). Own server only. */
    suspend fun putAvatar(id: ByteArray, sealed: ByteArray): Boolean = withContext(Dispatchers.IO) {
        if (!avatarsEnabled) return@withContext false
        ownPut("$base/v1/avatar/${id.hex()}", sealed, 8_000, RelayUse.BACKGROUND, RelayHolds.Traffic.UPLOADS, id.hex()).ok
    }

    /** Fetch an encrypted profile photo, or null if there isn't one (or no network). */
    suspend fun getAvatar(id: ByteArray): ByteArray? = withContext(Dispatchers.IO) {
        if (!avatarsEnabled) return@withContext null
        exchange(RelayUse.BACKGROUND, message = false, RelayHolds.Traffic.DOWNLOADS) {
            val c = open("$base/v1/avatar/${id.hex()}")
            c.connectTimeout = 8_000
            c.readTimeout = 8_000
            val code = c.status()
            val bytes = if (code == 200) c.inputStream.use { it.readBytes() } else null
            c.disconnect()
            code to bytes
        }.second
    }

    /**
     * Crew chat: posted where it's kept for days on our own server (12 hours on the public
     * relay), so a crew can chat weeks before the gig and catch up when they open the app.
     */
    suspend fun putHeld(id: ByteArray, sealed: ByteArray, use: RelayUse = RelayUse.MESSAGE): Boolean = send(id, sealed, use, held = true).ok

    /** Chat records under [ids] (public relay: the last 12 hours). Null on network failure. */
    suspend fun lookupHeld(ids: List<ByteArray>): List<List<ByteArray>>? = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext null
        if (ids.size > LOOKUP_CHUNK) {
            val parts = ids.chunked(LOOKUP_CHUNK).map { lookupHeld(it) ?: return@withContext null }
            return@withContext parts.flatten()
        }
        if (ownServer) {
            val b = base
            // Only what's new since the last look; an older relay (404) gets the old lookup.
            if (endpoints.usable(RelayEndpoints.Endpoint.HELD_SINCE, b, SystemClock.elapsedRealtime())) {
                heldSince(ids, b)?.let { return@withContext it.lists }
            }
            return@withContext ownLookup(ids, "$b/v1/heldlookup", wide = true)
        }
        lookup(ids, "12h")
    }

    /** What a cursor poll came to: [lists] null = no answer (as a failed lookup). */
    private class Held(val lists: List<List<ByteArray>>?)

    /** Chat mailboxes as last seen, kept up to date with cursors (core [HeldMirror]). */
    private val mirror = HeldMirror()
    private val endpoints = RelayEndpoints()

    /** One chat poll at a time, so cursor answers never cross. */
    private val heldPolls = Mutex()

    /**
     * Crew chat with cursors (docs/RELAY_API.md sections 8 and 11.3): each mailbox is asked only
     * for what arrived since the last look (a poll with nothing new costs 14 bytes a mailbox), and
     * the answer is still every record in it, newest first, from core [HeldMirror], exactly as
     * `/v1/heldlookup` gave it. Null if [b] has no `/v1/heldsince` (an older relay): use the old lookup.
     */
    private suspend fun heldSince(ids: List<ByteArray>, b: String): Held? = heldPolls.withLock {
        val keys = ids.map { it.hex() }
        var asks = ids.indices.toList()
        var rounds = 0
        // On MORE (an answer filled up at 512 KB) the rest is asked for straight away.
        while (asks.isNotEmpty() && rounds++ < MAX_HELD_ROUNDS) {
            val cursors = asks.map { mirror.cursor(keys[it]) }
            val body = RelayWire.heldSince(asks.map { ids[it] }.zip(cursors))
            var code = 0
            var unreadable = false
            val blocks = exchange(RelayUse.MESSAGE, message = false) {
                val c = open("$b/v1/heldsince")
                c.requestMethod = "POST"
                c.doOutput = true
                c.connectTimeout = 5_000
                c.readTimeout = 5_000
                c.setFixedLengthStreamingMode(body.size)
                c.setRequestProperty("Content-Type", "application/octet-stream")
                c.outputStream.use { it.write(body) }
                code = c.status()
                if (code != 200) {
                    c.disconnect()
                    return@exchange code to null
                }
                val answer = c.inputStream.use { it.readBytes() }
                c.disconnect()
                val parsed = RelayWire.parseHeldSince(answer, asks.size)
                unreadable = parsed == null
                code to parsed
            }.second
            val now = SystemClock.elapsedRealtime()
            if (endpoints.answered(RelayEndpoints.Endpoint.HELD_SINCE, b, code, now, unreadable)) return@withLock null
            if (blocks == null) return@withLock Held(null)
            asks = asks.filterIndexed { j, i -> mirror.apply(keys[i], cursors[j], blocks[j], now) }
        }
        val now = SystemClock.elapsedRealtime()
        mirror.trim(keys, now)
        Held(keys.map { mirror.newestFirst(it, now) })
    }

    /** For each id, the sealed records posted under it (newest first). Null on network failure. */
    suspend fun lookup(ids: List<ByteArray>, sinceAgo: String = "15m"): List<List<ByteArray>>? = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext null
        // Big festival crews: one request per 60 mailboxes (the server's limit is 64).
        if (ids.size > LOOKUP_CHUNK) {
            val parts = ids.chunked(LOOKUP_CHUNK).map { lookup(it, sinceAgo) ?: return@withContext null }
            return@withContext parts.flatten()
        }
        if (ownServer) return@withContext ownLookup(ids)
        exchange(RelayUse.MESSAGE, message = false) {
            // One request for every topic: ntfy takes a comma-separated list.
            val topics = ids.map { topic(it) }
            val since = URLEncoder.encode(sinceAgo, "UTF-8")
            val c = URL("$NTFY/${topics.joinToString(",")}/json?poll=1&since=$since").openConnection() as HttpURLConnection
            c.connectTimeout = 6_000
            c.readTimeout = 8_000
            val code = c.responseCode
            if (code != 200) {
                c.disconnect()
                return@exchange code to null
            }
            val byTopic = HashMap<String, MutableList<Pair<Long, ByteArray>>>()
            c.inputStream.bufferedReader().useLines { lines ->
                for (line in lines) {
                    if (line.isBlank()) continue
                    val o = runCatching { JSONObject(line) }.getOrNull() ?: continue
                    if (o.optString("event") != "message") continue
                    val bytes = runCatching {
                        Base64.decode(o.optString("message"), Base64.NO_WRAP or Base64.URL_SAFE)
                    }.getOrNull() ?: continue
                    byTopic.getOrPut(o.optString("topic")) { mutableListOf() } += o.optLong("time") to bytes
                }
            }
            c.disconnect()
            code to topics.map { t -> byTopic[t].orEmpty().sortedByDescending { it.first }.map { it.second } }
        }.second
    }

    /** Photos (crew moments) go as encrypted file attachments: public relay only for now. */
    val filesEnabled get() = true

    /** Upload an encrypted file (e.g. a crew moment) under [id]. ntfy.sh keeps it a few hours. */
    suspend fun putFile(id: ByteArray, sealed: ByteArray): Boolean = withContext(Dispatchers.IO) {
        if (ownServer) return@withContext ownPut("$base/v1/file/${id.hex()}", sealed, 20_000, RelayUse.BACKGROUND, RelayHolds.Traffic.UPLOADS, id.hex()).ok
        if (!filesEnabled) return@withContext false
        exchange(RelayUse.BACKGROUND, message = true, RelayHolds.Traffic.UPLOADS) {
            val c = URL("$NTFY/${topic(id)}").openConnection() as HttpURLConnection
            c.requestMethod = "PUT"
            c.doOutput = true
            c.connectTimeout = 8_000
            c.readTimeout = 20_000
            c.setFixedLengthStreamingMode(sealed.size)
            c.setRequestProperty("Filename", "m.bin")
            c.setRequestProperty("Firebase", "no")
            c.outputStream.use { it.write(sealed) }
            val code = c.responseCode
            c.disconnect()
            code to Unit
        }.first.ok
    }

    /** Files posted under [ids] in the last [since] (e.g. "4h"): (time, download URL), newest first. */
    suspend fun listFiles(ids: List<ByteArray>, since: String = "4h"): List<Pair<Long, String>>? = withContext(Dispatchers.IO) {
        if (ownServer) {
            val sinceSec = System.currentTimeMillis() / 1000 - sinceSeconds(since)
            return@withContext ids.flatMap { ownList(it, sinceSec) ?: return@withContext null }.sortedByDescending { it.first }
        }
        if (!filesEnabled || ids.isEmpty()) return@withContext null
        exchange(RelayUse.BACKGROUND, message = false) {
            val c = URL("$NTFY/${ids.joinToString(",") { topic(it) }}/json?poll=1&since=${URLEncoder.encode(since, "UTF-8")}")
                .openConnection() as HttpURLConnection
            c.connectTimeout = 6_000
            c.readTimeout = 8_000
            val code = c.responseCode
            if (code != 200) {
                c.disconnect()
                return@exchange code to null
            }
            val out = mutableListOf<Pair<Long, String>>()
            c.inputStream.bufferedReader().useLines { lines ->
                for (line in lines) {
                    val o = runCatching { JSONObject(line) }.getOrNull() ?: continue
                    if (o.optString("event") != "message") continue
                    val url = o.optJSONObject("attachment")?.optString("url").orEmpty()
                    if (url.startsWith("https://")) out += o.optLong("time") to url
                }
            }
            c.disconnect()
            code to out.sortedByDescending { it.first }
        }.second
    }

    /** Biggest file we send or fetch: a short clip (the public relay allows ~15 MB). */
    const val MAX_FILE = 12_000_000

    /** For each id, the newest file posted under it in the last [since] (download URL), or null. One request. */
    suspend fun latestFiles(ids: List<ByteArray>, since: String = "12h"): List<String?>? = withContext(Dispatchers.IO) {
        if (ownServer) {
            val sinceSec = System.currentTimeMillis() / 1000 - sinceSeconds(since)
            return@withContext ids.map { (ownList(it, sinceSec) ?: return@withContext null).firstOrNull()?.second }
        }
        if (!filesEnabled || ids.isEmpty()) return@withContext null
        exchange(RelayUse.BACKGROUND, message = false) {
            val topics = ids.map { topic(it) }
            val c = URL("$NTFY/${topics.joinToString(",")}/json?poll=1&since=${URLEncoder.encode(since, "UTF-8")}")
                .openConnection() as HttpURLConnection
            c.connectTimeout = 6_000
            c.readTimeout = 8_000
            val code = c.responseCode
            if (code != 200) {
                c.disconnect()
                return@exchange code to null
            }
            val newest = HashMap<String, Pair<Long, String>>()
            c.inputStream.bufferedReader().useLines { lines ->
                for (line in lines) {
                    val o = runCatching { JSONObject(line) }.getOrNull() ?: continue
                    if (o.optString("event") != "message") continue
                    val url = o.optJSONObject("attachment")?.optString("url").orEmpty()
                    if (!url.startsWith("https://")) continue
                    val t = o.optLong("time")
                    val topicName = o.optString("topic")
                    if ((newest[topicName]?.first ?: -1) < t) newest[topicName] = t to url
                }
            }
            c.disconnect()
            code to topics.map { newest[it]?.second }
        }.second
    }

    /** Download a file from the relay (capped at [MAX_FILE]). */
    suspend fun download(url: String): ByteArray? = withContext(Dispatchers.IO) {
        val mine = ownServer && url.startsWith("$base/v1/file/")
        if (!mine && !url.startsWith("$NTFY/")) return@withContext null // only ever fetch from the relay itself
        exchange(RelayUse.BACKGROUND, message = false, RelayHolds.Traffic.DOWNLOADS) {
            val c = open(url)
            c.connectTimeout = 8_000
            c.readTimeout = 20_000
            val code = c.status()
            if (code != 200) {
                c.disconnect()
                return@exchange code to null
            }
            val bytes = c.inputStream.use { input ->
                val buf = java.io.ByteArrayOutputStream()
                val chunk = ByteArray(16 * 1024)
                var tooBig = false
                while (!tooBig) {
                    val n = input.read(chunk)
                    if (n < 0) break
                    buf.write(chunk, 0, n)
                    if (buf.size() > MAX_FILE) tooBig = true
                }
                if (tooBig) null else buf.toByteArray()
            }
            c.disconnect()
            code to bytes
        }.second
    }

    private fun topic(id: ByteArray) = "mp" + id.hex()

    /** Lower-case hex, as box ids appear in URLs and topic names. */
    private fun ByteArray.hex() = joinToString("") { "%02x".format(it) }

    /** Own server: (time, download URL) of files under [id] since [sinceSec]. */
    private fun ownList(id: ByteArray, sinceSec: Long): List<Pair<Long, String>>? =
        exchange(RelayUse.BACKGROUND, message = false) {
            val c = open("$base/v1/files/${id.hex()}?since=$sinceSec")
            c.connectTimeout = 6_000
            c.readTimeout = 8_000
            val code = c.status()
            if (code != 200) {
                c.disconnect()
                return@exchange code to null
            }
            val body = c.inputStream.bufferedReader().use { it.readText() }
            c.disconnect()
            code to body.lines().mapNotNull { l ->
                val parts = l.trim().split(' ')
                if (parts.size != 2) return@mapNotNull null
                parts[0].toLongOrNull()?.let { it to "$base/v1/file/${id.hex()}/${parts[1]}" }
            }
        }.second

    private fun sinceSeconds(s: String): Long {
        val n = s.dropLast(1).toLongOrNull() ?: return 4 * 3600
        return when (s.last()) {
            'h' -> n * 3600
            'm' -> n * 60
            'd' -> n * 86_400
            else -> n
        }
    }

    /**
     * A report of objectionable content (docs/REPORT_BLOCK.md), as JSON, to this build's relay: the
     * free one or the paid one, whichever the app uses. The HTTP status (201 = stored, 429 = too
     * many from this phone), 0 if the relay couldn't be reached, -1 with no relay of our own (the
     * public ntfy.sh fallback takes no reports).
     */
    suspend fun postReport(json: ByteArray): Int = withContext(Dispatchers.IO) {
        if (!ownServer) return@withContext -1
        runCatching {
            val c = open("$base/v1/report")
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = 15_000
            c.readTimeout = 20_000
            c.setRequestProperty("Content-Type", "application/json")
            c.outputStream.use { it.write(json) }
            val code = c.status()
            c.disconnect()
            code
        }.getOrDefault(0)
    }

    private fun ownPut(url: String, body: ByteArray, timeout: Int, use: RelayUse, traffic: RelayHolds.Traffic, mailbox: String): PutResult =
        exchange(use, message = true, traffic, mailbox) {
            val c = open(url)
            c.requestMethod = "PUT"
            c.doOutput = true
            c.connectTimeout = timeout
            c.readTimeout = timeout
            c.setRequestProperty("Content-Type", "application/octet-stream")
            c.outputStream.use { it.write(body) }
            val code = c.status()
            c.disconnect()
            code to Unit
        }.first

    private fun ownLookup(ids: List<ByteArray>, url: String = "$base/v1/lookup", wide: Boolean = false): List<List<ByteArray>>? =
        exchange(RelayUse.MESSAGE, message = false) {
            val c = open(url)
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = 5_000
            c.readTimeout = 5_000
            c.setRequestProperty("Content-Type", "application/octet-stream")
            c.outputStream.use { out -> ids.forEach { out.write(it) } }
            val code = c.status()
            if (code != 200) {
                c.disconnect()
                return@exchange code to null
            }
            val body = c.inputStream.use { it.readBytes() }
            c.disconnect()
            code to parseLookup(body, ids.size, wide)
        }.second

    /** `[count:1]([len:1 or 2][record])*` per id; [wide] = 2-byte lengths (chat mailbox). */
    private fun parseLookup(b: ByteArray, n: Int, wide: Boolean = false): List<List<ByteArray>> {
        var i = 0
        return List(n) {
            val count = b[i++].toInt() and 0xFF
            List(count) {
                val len = if (wide) ((b[i++].toInt() and 0xFF) shl 8) or (b[i++].toInt() and 0xFF) else b[i++].toInt() and 0xFF
                b.copyOfRange(i, i + len).also { i += len }
            }
        }
    }

    // ---- One batch a minute (docs/RELAY_API.md sections 9 and 11.4) ----

    /** Our own relay, and it takes batches (an older one answered 404 in the last hour: no). */
    val batching: Boolean get() = ownServer && endpoints.usable(RelayEndpoints.Endpoint.BATCH, base, SystemClock.elapsedRealtime())

    /** What waits for the next batch (core [BatchPlan]); [plan] and [waiters] are guarded by [batchLock]. */
    private val plan = BatchPlan()
    private val batchLock = Any()

    /** The courier's messages waiting in a batch, by their put's key: the answer goes back to the courier. */
    private val waiters = HashMap<Long, CompletableDeferred<PutResult>>()
    private var nextKey = 1L

    /** One batch request at a time. */
    private val batchSend = Mutex()
    private val nudges = Channel<Unit>(Channel.CONFLATED)
    @Volatile private var flusherStarted = false

    private const val MAX_SYNC_GETS = 150
    private const val MAX_BATCH_ROUNDS = 10

    /** The longest a crew message waits for its batch before the courier is told "no answer" (and tries again). */
    private const val BATCH_WAIT_MS = 90_000L

    /**
     * One of the courier's crew messages (never safety: that goes at once, on its own, with
     * [send]) in the next batch. Waits for the batch carrying it and says how it went, as [send]
     * does. [soon]: a message just written: it goes within a couple of seconds, taking whatever
     * else is waiting with it. Without batches, [send] as before.
     */
    suspend fun sendBatched(id: ByteArray, sealed: ByteArray, use: RelayUse, held: Boolean, soon: Boolean): PutResult {
        val max = if (held) RelayWire.MAX_HELD_RECORD else RelayWire.MAX_BOX_RECORD
        if (BatchPlan.route(use) == BatchPlan.Route.ALONE || offline || !batching || sealed.size !in RelayWire.MIN_RECORD..max) {
            return send(id, sealed, use, held)
        }
        val waiter = CompletableDeferred<PutResult>()
        val key = synchronized(batchLock) {
            val k = nextKey++
            waiters[k] = waiter
            plan.add(BatchPlan.Put(id, sealed, held, replaceable = false, key = k), if (soon) BatchPlan.Timing.SOON else BatchPlan.Timing.MINUTE, SystemClock.elapsedRealtime())
            k
        }
        startFlusher()
        nudges.trySend(Unit)
        return withTimeoutOrNull(BATCH_WAIT_MS) { waiter.await() } ?: synchronized(batchLock) {
            waiters.remove(key)
            plan.cancel(key)
            PutResult.NO_NETWORK
        }
    }

    /**
     * The crew sync's mailboxes, read in the minute's batch together with everything waiting to
     * go up: for each id its records, newest first, exactly as [lookup] answers. Without batches
     * (an older relay, the public relay), [lookup] as before.
     */
    suspend fun sync(ids: List<ByteArray>): List<List<ByteArray>>? = withContext(Dispatchers.IO) {
        if (ids.isEmpty()) return@withContext null
        if (batching && !offline && ids.size <= MAX_SYNC_GETS) {
            val gets = ids.map { BatchPlan.Get(it, held = false, since = 0L) }.toMutableList()
            val oldestFirst = List(ids.size) { ArrayList<ByteArray>() }
            var asking = ids.indices.toList()
            var rounds = 0
            var answered = true
            while (asking.isNotEmpty() && rounds++ < MAX_BATCH_ROUNDS) {
                when (val out = sendBatch(asking.map { gets[it] })) {
                    is BatchOut.Done -> asking = asking.filterIndexed { j, i ->
                        val block = out.blocks[j]
                        block?.records?.let { oldestFirst[i].addAll(it) }
                        // The answer filled up: the rest of this mailbox, from where it stopped.
                        (block?.status == RelayWire.MORE).also { more -> if (more) gets[i] = BatchPlan.Get(ids[i], held = false, since = block!!.next) }
                    }
                    BatchOut.Failed -> return@withContext null
                    BatchOut.Missing -> {
                        answered = false
                        break
                    }
                }
            }
            if (answered) return@withContext oldestFirst.map { it.asReversed().toList() }
        }
        lookup(ids)
    }

    /** How a batch went: [Done] with each get's block (null: none), [Failed] (no answer, too many), [Missing] (this relay has no batches). */
    private sealed class BatchOut {
        class Done(val blocks: List<RelayWire.Block?>) : BatchOut()
        object Failed : BatchOut()
        object Missing : BatchOut()
    }

    private fun queue(p: BatchPlan.Put, timing: BatchPlan.Timing) {
        synchronized(batchLock) { plan.add(p, timing, SystemClock.elapsedRealtime()) }
        startFlusher()
        if (timing == BatchPlan.Timing.SOON) nudges.trySend(Unit)
    }

    /**
     * Sends what's waiting when it's due and no crew sync has taken it first: a minute after the
     * oldest put, or a couple of seconds after one someone is waiting for. Asleep while nothing waits.
     */
    private fun startFlusher() {
        if (flusherStarted) return
        synchronized(batchLock) {
            if (flusherStarted) return
            flusherStarted = true
        }
        background.launch {
            while (true) {
                try {
                    val due = synchronized(batchLock) { plan.dueAtMs() }
                    val wait = if (due == Long.MAX_VALUE) Long.MAX_VALUE else due - SystemClock.elapsedRealtime()
                    when {
                        wait == Long.MAX_VALUE -> nudges.receive()
                        wait > 0 -> withTimeoutOrNull(wait) { nudges.receive() }
                        // The relay changed, or stopped taking batches: what's waiting goes one by one.
                        !batching -> sendAlone(synchronized(batchLock) { plan.drain() })
                        offline -> delay(5_000)
                        // No answer, or everything waiting is held (a busy mailbox, a byte budget): look again in a bit.
                        sendBatch(emptyList()) !is BatchOut.Done || synchronized(batchLock) { plan.dueAtMs() } <= SystemClock.elapsedRealtime() -> delay(5_000)
                    }
                } catch (e: Exception) {
                    delay(5_000)
                }
            }
        }
    }

    /**
     * One `POST /v1/batch`: everything waiting that may go now, after [gets]. Puts are answered to
     * their waiters (the courier), or wait again (locations) when the batch got no answer.
     */
    private suspend fun sendBatch(gets: List<BatchPlan.Get>): BatchOut = batchSend.withLock {
        val b = base
        val start = SystemClock.elapsedRealtime()
        val taken = synchronized(batchLock) {
            plan.take(gets, start) { p ->
                holds.heldUntil(RelayHolds.Traffic.RECORDS, p.id.hex(), if (p.replaceable) RelayUse.BACKGROUND else RelayUse.MESSAGE, start) <= start
            }
        }
        if (taken.isEmpty) return@withLock BatchOut.Done(emptyList())
        val ops = taken.ops
        val body = RelayWire.batch(ops)
        var code = 0
        var unreadable = false
        // A lookup when it reads mailboxes, else uploads: the budget treats it as either did before.
        val use = if (gets.isNotEmpty() || taken.puts.any { !it.replaceable }) RelayUse.MESSAGE else RelayUse.BACKGROUND
        val (result, answers) = exchange(use, message = taken.puts.isNotEmpty()) {
            val c = open("$b/v1/batch")
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = 8_000
            c.readTimeout = 10_000
            c.setFixedLengthStreamingMode(body.size)
            c.setRequestProperty("Content-Type", "application/octet-stream")
            c.outputStream.use { it.write(body) }
            code = c.status()
            if (code != 200) {
                c.disconnect()
                return@exchange code to null
            }
            val answer = c.inputStream.use { it.readBytes() }
            c.disconnect()
            val parsed = RelayWire.parseBatch(answer, ops)
            unreadable = parsed == null
            code to parsed
        }
        val now = SystemClock.elapsedRealtime()
        val missing = endpoints.answered(RelayEndpoints.Endpoint.BATCH, b, code, now, unreadable)
        if (missing || (code in 400..499 && code != 429)) {
            // An older relay, or one that won't take this batch (too big, refused): everything goes the old way, now.
            sendAlone(taken.puts + synchronized(batchLock) { plan.drain() })
            return@withLock BatchOut.Missing
        }
        if (answers == null) {
            // No answer, or "too many": locations wait for the next batch, the courier decides about its messages.
            synchronized(batchLock) { plan.putBack(taken.puts, now) }
            taken.puts.forEach { answer(it, result) }
            return@withLock BatchOut.Failed
        }
        val retry = ArrayList<BatchPlan.Put>()
        val alone = ArrayList<BatchPlan.Put>()
        taken.puts.forEachIndexed { i, p ->
            val r = when (answers[i].status) {
                RelayWire.OK -> PutResult.SENT
                RelayWire.BAD -> PutResult.REFUSED
                RelayWire.MAILBOX -> PutResult.THROTTLED.also { holds.mailboxBusy(p.id.hex(), now) }
                RelayWire.BYTES -> PutResult.THROTTLED.also { holds.recordsOverBudget(now) }
                RelayWire.UNKNOWN -> null.also { alone += p }
                else -> PutResult.NO_NETWORK // FULL: the relay is full or low on disk, as a 503
            }
            if (r != null && r != PutResult.SENT && r != PutResult.REFUSED) retry += p
            if (r != null) answer(p, r)
        }
        synchronized(batchLock) { plan.putBack(retry, now) }
        if (alone.isNotEmpty()) sendAlone(alone)
        BatchOut.Done(answers.drop(taken.puts.size).map { it.block })
    }

    /** A put's answer to whoever waits for it (the courier); locations have nobody waiting. */
    private fun answer(p: BatchPlan.Put, r: PutResult) {
        if (p.key == 0L) return
        synchronized(batchLock) { waiters.remove(p.key) }?.complete(r)
    }

    /** Puts that can't go in a batch after all: one request each, the old way, answered to their waiters. */
    private fun sendAlone(puts: List<BatchPlan.Put>) {
        if (puts.isEmpty()) return
        background.launch {
            for (p in puts) answer(p, send(p.id, p.record, if (p.replaceable) RelayUse.BACKGROUND else RelayUse.MESSAGE, p.held))
        }
    }

    // ---- Install token (docs/RELAY_API.md sections 7 and 11.1) ----

    private var prefs: android.content.SharedPreferences? = null

    /**
     * Our own relay's install token, so this phone gets limits of its own instead of sharing its
     * carrier address's with everyone behind it (the rule: core [InstallToken]). Never sent to
     * the public relay or to any other relay; requests work the same without one.
     */
    @Volatile private var tokens = InstallToken()
    private val background = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /**
     * Ask our own relay for an install token if the rule says it's time: at first start, then at
     * most once an hour while there isn't one. In the background: no request waits for it.
     */
    private fun askToken() {
        val b = base
        val t = tokens
        val now = System.currentTimeMillis()
        if (b.isEmpty() || offline || !t.shouldAsk(b, now)) return
        t.asking(now)
        background.launch {
            val answer = runCatching {
                val c = URL("$b/v1/install").openConnection() as HttpURLConnection
                try {
                    c.requestMethod = "POST"
                    c.doOutput = true
                    c.connectTimeout = 8_000
                    c.readTimeout = 8_000
                    c.setFixedLengthStreamingMode(0)
                    c.outputStream.close()
                    val code = c.responseCode
                    code to if (code == 200) readSmall(c, 256) else null
                } finally {
                    c.disconnect()
                }
            }.getOrNull()
            val at = System.currentTimeMillis()
            // The relay's host answering 5xx or 408 is no answer from the relay (as in [exchange]).
            if (answer == null || answer.first >= 500 || answer.first == 408) t.noAnswer(at) else t.answered(b, answer.first, answer.second, at)
            saveToken(t)
        }
    }

    /** At most [max] characters of a short text answer. */
    private fun readSmall(c: HttpURLConnection, max: Int): String = c.inputStream.reader(Charsets.US_ASCII).use { r ->
        val out = StringBuilder()
        val buf = CharArray(64)
        while (out.length < max) {
            val n = r.read(buf)
            if (n < 0) break
            out.append(buf, 0, n)
        }
        out.toString()
    }

    private fun saveToken(t: InstallToken) {
        prefs?.edit()?.putString("token", t.save())?.apply()
    }

    /** A connection to [url], carrying our install token if [url] is on the relay that issued it. */
    private fun open(url: String): HttpURLConnection = (URL(url).openConnection() as HttpURLConnection).also { sign(it, url) }

    /**
     * Adds our install token to a request for [url] when it goes to our own relay, the one that
     * issued it (venue lookups and Discover ask the same relay). Never to the public relay.
     */
    fun sign(c: HttpURLConnection, url: String) {
        val b = base
        if (b.isEmpty() || !url.startsWith("$b/")) return
        tokens.tokenFor(b)?.let { c.setRequestProperty(InstallToken.HEADER, it) }
    }

    /** The answer's status. `X-Moshpoint-Token: invalid` means the relay no longer knows our token: drop it and ask again. */
    private fun HttpURLConnection.status(): Int {
        val code = responseCode
        if (getHeaderField(InstallToken.HEADER) == InstallToken.INVALID) tokenInvalid()
        // Which limit, and for how long: read by [exchange] on this same thread (docs/RELAY_API.md section 11.2).
        if (code == 429) limitSeen.set(getHeaderField(RelayHolds.LIMIT_HEADER) to getHeaderField(RelayHolds.RETRY_AFTER))
        return code
    }

    private fun tokenInvalid() {
        val t = tokens
        if (!t.invalid(base)) return
        saveToken(t)
        askToken()
    }

    // ---- Budget and "is there any network?" ----

    /**
     * Test builds: pretend there's no internet at all, to try Bluetooth backup without walking
     * into a basement (Settings > Testing). Always false in release builds.
     */
    @Volatile var debugNoInternet = false
        set(v) {
            field = BuildConfig.TEST_BUILD && v
        }

    /** No network at all (airplane mode, no service), or the test switch: don't even try. */
    val offline: Boolean get() = (BuildConfig.TEST_BUILD && debugNoInternet) || !NetState.up

    /** The free public relay's limits (see core [RelayBudget]). */
    private val publicBudget = RelayBudget()

    /**
     * Our own server has no daily limit: this one only keeps the back-off after "too many" or
     * no answer. Its limiter refills every second, so the pause is seconds, not minutes.
     */
    private val ownBudget = RelayBudget(
        messagesPerDay = 1_000_000, requestsPerMinute = 600, messageReserve = 0, safetyReserve = 0, requestReserve = 0,
        throttleBaseMs = 5_000L, throttleMaxMs = 30_000L,
    )

    /**
     * Our own relay with batches (docs/RELAY_API.md section 11.6): everything in the background
     * is one request a minute, so 30 a minute is a safety net against a runaway loop, with room
     * for the finder's poll every 4 s while it's open. Safety pings are never held by it.
     */
    private val batchBudget = RelayBudget(
        messagesPerDay = 1_000_000, requestsPerMinute = 30, messageReserve = 0, safetyReserve = 0, requestReserve = 0,
        throttleBaseMs = 5_000L, throttleMaxMs = 30_000L, safetyAlwaysHasRoom = true,
    )
    private val budget get() = if (!ownServer) publicBudget else if (batching) batchBudget else ownBudget

    /** What our relay's last "too many" answers hold back: one mailbox, one kind of traffic, or (in the budget) everything. */
    private val holds = RelayHolds()

    /** A 429's `X-Moshpoint-Limit` and `Retry-After`, from [status] to [exchange] (same thread). */
    private val limitSeen = ThreadLocal<Pair<String?, String?>?>()

    /** The phone has a network again: stop holding requests back. */
    fun networkBack() {
        publicBudget.networkBack()
        ownBudget.networkBack()
        batchBudget.networkBack()
    }

    /**
     * This minute is full (the public relay takes 8 requests a minute from us): a message waits
     * a few seconds for room rather than being told "too many", which would park the whole queue.
     */
    private suspend fun waitForRoom(use: RelayUse) {
        if (use == RelayUse.BACKGROUND || offline) return
        repeat(2) {
            val wait = budget.roomInMs(use, true, SystemClock.elapsedRealtime())
            if (wait <= 0L || wait > MAX_ROOM_WAIT_MS) return
            kotlinx.coroutines.delay(wait + 100)
        }
    }

    private const val MAX_ROOM_WAIT_MS = 20_000L

    /**
     * One HTTP exchange, inside the budget. [call] returns the HTTP status and the parsed
     * answer, and throws if the relay never answered. The budget is only charged when it did.
     */
    private inline fun <T> exchange(
        use: RelayUse,
        message: Boolean,
        traffic: RelayHolds.Traffic = RelayHolds.Traffic.READS,
        mailbox: String? = null,
        call: () -> Pair<Int, T?>,
    ): Pair<PutResult, T?> {
        if (offline) return PutResult.NO_NETWORK to null
        askToken()
        val b = budget
        val start = SystemClock.elapsedRealtime()
        // That mailbox, or that kind of traffic, is waiting out the relay's "too many" (a safety ping never waits here).
        if (holds.heldUntil(traffic, mailbox, use, start) > start) return PutResult.THROTTLED to null
        val ticket = b.take(use, message, start) ?: return (b.refusal(use, message, start) ?: PutResult.THROTTLED) to null
        return try {
            limitSeen.set(null)
            val (code, value) = call()
            when {
                code in 200..299 -> {
                    b.settle(ticket, RelayBudget.Outcome.OK, SystemClock.elapsedRealtime())
                    PutResult.SENT to value
                }
                code == 429 -> {
                    // By kind (core RelayHolds): a client or address limit pauses everything for the
                    // relay's Retry-After; a mailbox or byte budget holds only that; no header (an
                    // older relay, or the public one) pauses everything as before.
                    val seen = limitSeen.get()
                    limitSeen.set(null)
                    val now = SystemClock.elapsedRealtime()
                    when (val hold = holds.limited(seen?.first, seen?.second, traffic, mailbox, now)) {
                        is RelayHolds.Hold.All -> b.settle(ticket, RelayBudget.Outcome.THROTTLED, now, pauseMs = hold.ms)
                        RelayHolds.Hold.Some -> b.settle(ticket, RelayBudget.Outcome.REFUSED, now)
                        RelayHolds.Hold.Unknown -> b.settle(ticket, RelayBudget.Outcome.THROTTLED, now)
                    }
                    PutResult.THROTTLED to null
                }
                // The relay's host answered but the relay didn't (a gateway error, a restart, a
                // timeout upstream). That passes: it's the same as no answer, not a refusal.
                code >= 500 || code == 408 -> {
                    b.settle(ticket, RelayBudget.Outcome.NO_ANSWER, SystemClock.elapsedRealtime())
                    PutResult.NO_NETWORK to null
                }
                else -> {
                    b.settle(ticket, RelayBudget.Outcome.REFUSED, SystemClock.elapsedRealtime())
                    PutResult.REFUSED to null
                }
            }
        } catch (e: Exception) {
            b.settle(ticket, RelayBudget.Outcome.NO_ANSWER, SystemClock.elapsedRealtime())
            PutResult.NO_NETWORK to null
        }
    }
}
