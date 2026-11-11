package nz.waveformlabs.moshpoint.locate

import android.os.SystemClock
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.NetState
import nz.waveformlabs.moshpoint.core.PutResult
import nz.waveformlabs.moshpoint.core.RelayBudget
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

    /** Always on: our server if configured, else the public relay. */
    val enabled get() = true

    /** Our own server is configured (photos and the crowd-relay upload need it). */
    val ownServer get() = base.isNotBlank()

    /**
     * The relay server address: set in the app (Me > Relay server, or carried in a crew's
     * invite) or baked into the build. Blank = the free public relay.
     */
    @Volatile var serverUrl: String = ""
        private set

    fun init(c: android.content.Context) {
        serverUrl = c.applicationContext.getSharedPreferences("relay", android.content.Context.MODE_PRIVATE).getString("url", null).orEmpty()
    }

    /** Use [url] as the relay (blank = public relay / build default). Returns false if it isn't a valid https address. */
    fun setServer(c: android.content.Context, url: String): Boolean {
        val u = url.trim().trimEnd('/')
        if (u.isNotEmpty() && !Regex("^https://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~/-]*)?$").matches(u)) return false
        serverUrl = u
        c.applicationContext.getSharedPreferences("relay", android.content.Context.MODE_PRIVATE).edit().putString("url", u).apply()
        return true
    }

    /** Profile photos are too big for the public relay. */
    val avatarsEnabled get() = ownServer

    /** Shown in the debug panel. */
    val label get() = if (ownServer) "own server" else "ntfy.sh (public, encrypted)"

    /** How often finders should poll for locations. */
    val pollMs get() = if (ownServer) 4_000L else 15_000L

    /** Minimum gap between our own location posts. */
    val uploadGapMs get() = if (ownServer) 15_000L else 75_000L

    private val base get() = serverUrl.ifBlank { BuildConfig.MOSHPOINT_SERVER }.trimEnd('/')

    /** The address crews should share (blank = public relay). */
    val shareableServer get() = base
    private const val NTFY = "https://ntfy.sh"

    /** Location shares, intros and the like: [RelayUse.BACKGROUND] unless the caller says otherwise. */
    suspend fun put(id: ByteArray, sealed: ByteArray, use: RelayUse = RelayUse.BACKGROUND): Boolean = send(id, sealed, use).ok

    /**
     * Post one sealed record under [id] and say how it went. [held] = the crew-chat mailbox
     * (kept for days on our own server; the public relay has only one kind of mailbox).
     */
    suspend fun send(id: ByteArray, sealed: ByteArray, use: RelayUse, held: Boolean = false): PutResult = withContext(Dispatchers.IO) {
        if (ownServer) {
            return@withContext ownPut("$base/v1/${if (held) "held" else "box"}/${id.hex()}", sealed, if (held) 6_000 else 5_000, use)
        }
        exchange(use, message = true) {
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
        ownPut("$base/v1/avatar/${id.hex()}", sealed, 8_000, RelayUse.BACKGROUND).ok
    }

    /** Fetch an encrypted profile photo, or null if there isn't one (or no network). */
    suspend fun getAvatar(id: ByteArray): ByteArray? = withContext(Dispatchers.IO) {
        if (!avatarsEnabled) return@withContext null
        exchange(RelayUse.BACKGROUND, message = false) {
            val c = URL("$base/v1/avatar/${id.hex()}").openConnection() as HttpURLConnection
            c.connectTimeout = 8_000
            c.readTimeout = 8_000
            val code = c.responseCode
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
        if (ownServer) return@withContext ownLookup(ids, "$base/v1/heldlookup", wide = true)
        lookup(ids, "12h")
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
        if (ownServer) return@withContext ownPut("$base/v1/file/${id.hex()}", sealed, 20_000, RelayUse.BACKGROUND).ok
        if (!filesEnabled) return@withContext false
        exchange(RelayUse.BACKGROUND, message = true) {
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
        exchange(RelayUse.BACKGROUND, message = false) {
            val c = URL(url).openConnection() as HttpURLConnection
            c.connectTimeout = 8_000
            c.readTimeout = 20_000
            val code = c.responseCode
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

    /** Own server: (time, download URL) of files under [id] since [sinceSec]. */
    private fun ownList(id: ByteArray, sinceSec: Long): List<Pair<Long, String>>? =
        exchange(RelayUse.BACKGROUND, message = false) {
            val c = URL("$base/v1/files/${id.hex()}?since=$sinceSec").openConnection() as HttpURLConnection
            c.connectTimeout = 6_000
            c.readTimeout = 8_000
            val code = c.responseCode
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

    private fun ownPut(url: String, body: ByteArray, timeout: Int, use: RelayUse): PutResult =
        exchange(use, message = true) {
            val c = URL(url).openConnection() as HttpURLConnection
            c.requestMethod = "PUT"
            c.doOutput = true
            c.connectTimeout = timeout
            c.readTimeout = timeout
            c.setRequestProperty("Content-Type", "application/octet-stream")
            c.outputStream.use { it.write(body) }
            val code = c.responseCode
            c.disconnect()
            code to Unit
        }.first

    private fun ownLookup(ids: List<ByteArray>, url: String = "$base/v1/lookup", wide: Boolean = false): List<List<ByteArray>>? =
        exchange(RelayUse.MESSAGE, message = false) {
            val c = URL(url).openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = 5_000
            c.readTimeout = 5_000
            c.setRequestProperty("Content-Type", "application/octet-stream")
            c.outputStream.use { out -> ids.forEach { out.write(it) } }
            val code = c.responseCode
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

    /** Our own server has no daily limit: this one only keeps the back-off after "too many" or no answer. */
    private val ownBudget = RelayBudget(
        messagesPerDay = 1_000_000, requestsPerMinute = 600, messageReserve = 0, safetyReserve = 0, requestReserve = 0,
    )
    private val budget get() = if (ownServer) ownBudget else publicBudget

    /** The phone has a network again: stop holding requests back. */
    fun networkBack() {
        publicBudget.networkBack()
        ownBudget.networkBack()
    }

    /** Would a message for [use] be let through right now? (Used to say "Waiting for signal" honestly.) */
    fun wouldSend(use: RelayUse): Boolean = !offline && budget.refusal(use, true, SystemClock.elapsedRealtime()) == null

    /**
     * One HTTP exchange, inside the budget. [call] returns the HTTP status and the parsed
     * answer, and throws if the relay never answered. The budget is only charged when it did.
     */
    private inline fun <T> exchange(use: RelayUse, message: Boolean, call: () -> Pair<Int, T?>): Pair<PutResult, T?> {
        if (offline) return PutResult.NO_NETWORK to null
        val b = budget
        val start = SystemClock.elapsedRealtime()
        val ticket = b.take(use, message, start) ?: return (b.refusal(use, message, start) ?: PutResult.THROTTLED) to null
        return try {
            val (code, value) = call()
            when {
                code in 200..299 -> {
                    b.settle(ticket, RelayBudget.Outcome.OK, SystemClock.elapsedRealtime())
                    PutResult.SENT to value
                }
                code == 429 -> {
                    b.settle(ticket, RelayBudget.Outcome.THROTTLED, SystemClock.elapsedRealtime())
                    PutResult.THROTTLED to null
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
