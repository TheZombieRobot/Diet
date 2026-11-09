package nz.waveformlabs.moshpoint.server

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.plugins.origin
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.request.receiveChannel
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.routing
import io.ktor.utils.io.readRemaining
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.io.readByteArray

/**
 * HTTP API (all binary, no accounts):
 *
 * - `PUT  /v1/box/{id}`   body = one sealed record (16..128 bytes). id = 32 hex chars.
 * - `GET  /v1/box/{id}`   -> records newest first, each as `[len:1][bytes]`. 404 if none.
 * - `POST /v1/lookup`     body = up to 64 ids (16 bytes each, raw) ->
 *                         for each id in order: `[count:1]` then `[len:1][bytes]` x count.
 *                         One round trip for a whole gig group, including the previous
 *                         rotation's ids.
 * - `PUT  /v1/file/{id}`  body = one sealed file (crew photo/clip, profile photo), up to 12 MB.
 * - `GET  /v1/files/{id}?since=<unix s>` -> lines "<time> <name>", newest first.
 * - `GET  /v1/file/{id}/{name}` -> the sealed file.
 * - `GET  /healthz`
 */
fun Application.moshpoint(
    store: MailboxStore = MailboxStore(),
    // Crowd-relay phones upload what they hear, so PUTs get more room than lookups.
    putLimit: RateLimiter = RateLimiter(capacity = 120.0, refillPerSec = 2.0),
    getLimit: RateLimiter = RateLimiter(capacity = 60.0, refillPerSec = 1.0),
    avatars: AvatarStore = AvatarStore(),
    files: FileStore = FileStore(),
    // Crew chat: kept for days, so a crew can hype up weeks before the gig.
    held: MailboxStore = MailboxStore(ttlMs = 72 * 3600 * 1000L, maxPerId = 200, maxIds = 200_000),
) {
    launch {
        while (true) {
            delay(60_000)
            store.sweep()
            avatars.sweep()
            files.sweep()
            held.sweep()
            putLimit.sweep()
            getLimit.sweep()
        }
    }

    // Behind a proxy (Fly, Render, ...) the real client is the first X-Forwarded-For entry.
    fun ApplicationCall.client(): String =
        request.headers["X-Forwarded-For"]?.substringBefore(',')?.trim()?.takeIf { it.isNotEmpty() }
            ?: request.origin.remoteHost

    routing {
        get("/healthz") { call.respondText("ok") }

        put("/v1/box/{id}") {
            if (!putLimit.allow(call.client())) return@put call.respondText("slow down", status = HttpStatusCode.TooManyRequests)
            val id = call.parameters["id"]?.lowercase()
            if (id == null || !ID_RE.matches(id)) return@put call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val body = call.receiveChannel().readRemaining(MAX_RECORD + 1L).readByteArray()
            if (body.size < MIN_RECORD || body.size > MAX_RECORD) {
                return@put call.respondText("bad size", status = HttpStatusCode.BadRequest)
            }
            if (!store.put(id, body)) return@put call.respondText("full", status = HttpStatusCode.ServiceUnavailable)
            call.respondText("", status = HttpStatusCode.NoContent)
        }

        get("/v1/box/{id}") {
            if (!getLimit.allow(call.client())) return@get call.respondText("slow down", status = HttpStatusCode.TooManyRequests)
            val id = call.parameters["id"]?.lowercase()
            if (id == null || !ID_RE.matches(id)) return@get call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val records = store.get(id)
            if (records.isEmpty()) return@get call.respondText("", status = HttpStatusCode.NotFound)
            call.respondBytes(encodeRecords(records), ContentType.Application.OctetStream)
        }

        // Encrypted profile photos (see core AvatarBox). Same id format as boxes.
        put("/v1/avatar/{id}") {
            if (!putLimit.allow(call.client())) return@put call.respondText("slow down", status = HttpStatusCode.TooManyRequests)
            val id = call.parameters["id"]?.lowercase()
            if (id == null || !ID_RE.matches(id)) return@put call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val body = call.receiveChannel().readRemaining(MAX_AVATAR + 1L).readByteArray()
            if (body.size < 28 || body.size > MAX_AVATAR) return@put call.respondText("bad size", status = HttpStatusCode.BadRequest)
            avatars.put(id, body)
            call.respondText("", status = HttpStatusCode.NoContent)
        }

        get("/v1/avatar/{id}") {
            if (!getLimit.allow(call.client())) return@get call.respondText("slow down", status = HttpStatusCode.TooManyRequests)
            val id = call.parameters["id"]?.lowercase()
            if (id == null || !ID_RE.matches(id)) return@get call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val data = avatars.get(id) ?: return@get call.respondText("", status = HttpStatusCode.NotFound)
            call.respondBytes(data, ContentType.Application.OctetStream)
        }

        // Sealed files: crew photos/clips and profile photos (see the app's Moments / AvatarSync).
        put("/v1/file/{id}") {
            if (!putLimit.allow(call.client())) return@put call.respondText("slow down", status = HttpStatusCode.TooManyRequests)
            val id = call.parameters["id"]?.lowercase()
            if (id == null || !ID_RE.matches(id)) return@put call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val body = call.receiveChannel().readRemaining(MAX_FILE + 1L).readByteArray()
            if (body.size < 28 || body.size > MAX_FILE) return@put call.respondText("bad size", status = HttpStatusCode.BadRequest)
            call.respondText(files.put(id, body))
        }

        get("/v1/files/{id}") {
            if (!getLimit.allow(call.client())) return@get call.respondText("slow down", status = HttpStatusCode.TooManyRequests)
            val id = call.parameters["id"]?.lowercase()
            if (id == null || !ID_RE.matches(id)) return@get call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val since = call.request.queryParameters["since"]?.toLongOrNull() ?: 0L
            call.respondText(files.list(id, since).joinToString("\n") { "${it.first} ${it.second}" })
        }

        get("/v1/file/{id}/{name}") {
            if (!getLimit.allow(call.client())) return@get call.respondText("slow down", status = HttpStatusCode.TooManyRequests)
            val id = call.parameters["id"]?.lowercase()
            val name = call.parameters["name"].orEmpty()
            if (id == null || !ID_RE.matches(id)) return@get call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val data = files.get(id, name) ?: return@get call.respondText("", status = HttpStatusCode.NotFound)
            call.respondBytes(data, ContentType.Application.OctetStream)
        }

        put("/v1/held/{id}") {
            if (!putLimit.allow(call.client())) return@put call.respondText("slow down", status = HttpStatusCode.TooManyRequests)
            val id = call.parameters["id"]?.lowercase()
            if (id == null || !ID_RE.matches(id)) return@put call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val body = call.receiveChannel().readRemaining(MAX_HELD + 1L).readByteArray()
            if (body.size < MIN_RECORD || body.size > MAX_HELD) {
                return@put call.respondText("bad size", status = HttpStatusCode.BadRequest)
            }
            if (!held.put(id, body)) return@put call.respondText("full", status = HttpStatusCode.ServiceUnavailable)
            call.respondText("", status = HttpStatusCode.NoContent)
        }

        post("/v1/heldlookup") {
            if (!getLimit.allow(call.client())) return@post call.respondText("slow down", status = HttpStatusCode.TooManyRequests)
            val body = call.receiveChannel().readRemaining(MAX_LOOKUP * 16 + 1L).readByteArray()
            if (body.isEmpty() || body.size % 16 != 0 || body.size / 16 > MAX_LOOKUP) {
                return@post call.respondText("bad body", status = HttpStatusCode.BadRequest)
            }
            val out = java.io.ByteArrayOutputStream()
            for (i in 0 until body.size / 16) {
                val id = body.copyOfRange(i * 16, i * 16 + 16).joinToString("") { "%02x".format(it) }
                val records = held.get(id).take(255)
                out.write(records.size)
                out.write(encodeRecordsBody(records))
            }
            call.respondBytes(out.toByteArray(), ContentType.Application.OctetStream)
        }

        post("/v1/lookup") {
            if (!getLimit.allow(call.client())) return@post call.respondText("slow down", status = HttpStatusCode.TooManyRequests)
            val body = call.receiveChannel().readRemaining(MAX_LOOKUP * 16 + 1L).readByteArray()
            if (body.isEmpty() || body.size % 16 != 0 || body.size / 16 > MAX_LOOKUP) {
                return@post call.respondText("bad body", status = HttpStatusCode.BadRequest)
            }
            val out = java.io.ByteArrayOutputStream()
            for (i in 0 until body.size / 16) {
                val id = body.copyOfRange(i * 16, i * 16 + 16).joinToString("") { "%02x".format(it) }
                val records = store.get(id)
                out.write(records.size)
                out.write(encodeRecordsBody(records))
            }
            call.respondBytes(out.toByteArray(), ContentType.Application.OctetStream)
        }
    }
}

private val ID_RE = Regex("^[0-9a-f]{32}$")
private const val MIN_RECORD = 16
private const val MAX_RECORD = 128
/** Chat records carry up to 160 bytes of text; lengths go as one byte, so 255 max. */
private const val MAX_HELD = 255
private const val MAX_LOOKUP = 64
private const val MAX_AVATAR = 48 * 1024 + 64
private const val MAX_FILE = 12_000_000

private fun encodeRecordsBody(records: List<ByteArray>): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    records.forEach {
        out.write(it.size)
        out.write(it)
    }
    return out.toByteArray()
}

private fun encodeRecords(records: List<ByteArray>) = encodeRecordsBody(records)

fun main() {
    val port = System.getenv("PORT")?.toIntOrNull() ?: 8080
    org.slf4j.LoggerFactory.getLogger("nz.waveformlabs.moshpoint.server").info("Moshpoint relay listening on port $port")
    embeddedServer(Netty, port = port, host = "0.0.0.0") { moshpoint() }.start(wait = true)
}
