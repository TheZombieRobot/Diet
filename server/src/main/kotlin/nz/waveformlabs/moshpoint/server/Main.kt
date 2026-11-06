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
 * - `GET  /healthz`
 */
fun Application.moshpoint(
    store: MailboxStore = MailboxStore(),
    // Crowd-relay phones upload what they hear, so PUTs get more room than lookups.
    putLimit: RateLimiter = RateLimiter(capacity = 120.0, refillPerSec = 2.0),
    getLimit: RateLimiter = RateLimiter(capacity = 60.0, refillPerSec = 1.0),
) {
    launch {
        while (true) {
            delay(60_000)
            store.sweep()
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
private const val MAX_LOOKUP = 64

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
