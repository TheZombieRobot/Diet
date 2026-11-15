package nz.waveformlabs.moshpoint.server

import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.application.ApplicationStopped
import io.ktor.server.application.install
import io.ktor.server.engine.connector
import io.ktor.server.engine.embeddedServer
import io.ktor.server.netty.Netty
import io.ktor.server.plugins.statuspages.StatusPages
import io.ktor.server.request.contentLength
import io.ktor.server.request.receiveChannel
import io.ktor.server.response.respond
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondBytesWriter
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.put
import io.ktor.server.routing.routing
import io.ktor.utils.io.readRemaining
import io.ktor.utils.io.writeFully
import kotlinx.coroutines.CancellationException
import kotlinx.io.readByteArray
import org.slf4j.LoggerFactory
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.Path
import kotlin.system.exitProcess

/**
 * HTTP API (all binary, no accounts). Full reference with every format and limit:
 * docs/RELAY_API.md. Every endpoint the current test builds use is unchanged.
 *
 * - `PUT  /v1/box/{id}`   body = one sealed record (16..255 bytes). id = 32 hex chars. Kept 15 min, 64 per id.
 * - `GET  /v1/box/{id}`   -> records newest first, each as `[len:1][bytes]`. 404 if none.
 * - `POST /v1/lookup`     body = up to 64 ids (16 bytes each, raw) ->
 *                         for each id in order: `[count:1]` then `[len:1][bytes]` x count.
 * - `PUT  /v1/held/{id}`  crew chat: one record (16..4000 bytes), kept 72 h, 200 per id.
 * - `POST /v1/heldlookup` like /v1/lookup for chat, with 2-byte lengths, newest first.
 * - `PUT  /v1/avatar/{id}`, `GET /v1/avatar/{id}`: encrypted profile photos (28..49216 bytes), 8 days.
 * - `PUT  /v1/file/{id}`  body = one sealed file (crew photo/clip), up to 12 MB -> its name. 24 h.
 * - `GET  /v1/files/{id}?since=<unix s>` -> lines "<time> <name>", newest first.
 * - `GET  /v1/file/{id}/{name}` -> the sealed file.
 * - `GET  /v1/gigs/search?q=&country=`, `GET /v1/gigs/sources`, `GET /v1/venue?q=&box=`.
 * - `GET  /healthz`
 *
 * New (for the app's next version; old clients never call them):
 * - `POST /v1/install`    -> an install token, sent back as `X-Moshpoint-Token` for limits of its own.
 * - `POST /v1/batch`      several puts and gets (with cursors) in one request (see [Batch]).
 * - `POST /v1/heldsince`  chat lookups that return only what's new since a cursor.
 */
fun Application.moshpoint(
    relay: Relay,
    gigs: GigSearch = GigSearch(),
    venues: VenueLookup = VenueLookup(),
) {
    val log = LoggerFactory.getLogger("nz.waveformlabs.moshpoint.server")
    install(StatusPages) {
        exception<Throwable> { call, cause ->
            // Only the kind of failure is logged: never the URL (it holds a mailbox id) or the client.
            when (cause) {
                is CancellationException, is IOException -> {} // the phone went away mid-request
                is Db.ClosedException -> {}
                else -> log.warn("Request failed: {}", cause::class.java.simpleName)
            }
            runCatching { call.respondText("try later", status = HttpStatusCode.ServiceUnavailable) }
        }
    }
    val sweeps = relay.startSweeps(this)
    monitor.subscribe(ApplicationStopped) {
        sweeps.cancel()
        relay.close()
    }
    val limits = relay.limits

    fun ApplicationCall.client(): Client = client(relay.config.proxyTrust, relay.tokens)

    /** 429 with which limit and when to come back. The app only looks at the status. */
    suspend fun ApplicationCall.limited(limit: Limit) {
        response.headers.append("Retry-After", limit.retryAfterSec.toString())
        response.headers.append("X-Moshpoint-Limit", limit.header)
        respondText("slow down", status = HttpStatusCode.TooManyRequests)
    }

    /** Charge [cost] to the client's request limit. False (and answered 429) if it's used up. */
    suspend fun ApplicationCall.charge(write: Boolean, cost: Double = 1.0): Boolean {
        val c = client()
        if (c.badToken) response.headers.append("X-Moshpoint-Token", "invalid")
        val hit = limits.request(c, write, cost) ?: return true
        limited(hit)
        return false
    }

    suspend fun ApplicationCall.answer(o: Outcome) = when (o) {
        Outcome.OK -> respondText("", status = HttpStatusCode.NoContent)
        Outcome.MAILBOX -> limited(Limit.MAILBOX)
        Outcome.BYTES -> limited(Limit.BYTES)
        Outcome.FULL -> respondText("full", status = HttpStatusCode.ServiceUnavailable)
    }

    suspend fun ApplicationCall.small(max: Int): ByteArray = receiveChannel().readRemaining(max + 1L).readByteArray()

    routing {
        get("/healthz") { call.respondText("ok") }

        put("/v1/box/{id}") {
            if (!call.charge(write = true)) return@put
            val id = idBytes(call.parameters["id"]) ?: return@put call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val body = call.small(MAX_RECORD)
            if (body.size < MIN_RECORD || body.size > MAX_RECORD) return@put call.respondText("bad size", status = HttpStatusCode.BadRequest)
            call.answer(relay.putRecord(call.client(), Kind.BOX, id, body))
        }

        get("/v1/box/{id}") {
            if (!call.charge(write = false)) return@get
            val id = idBytes(call.parameters["id"]) ?: return@get call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val records = relay.box.get(id)
            if (records.isEmpty()) return@get call.respondText("", status = HttpStatusCode.NotFound)
            call.respondBytes(encode(records, wide = false), ContentType.Application.OctetStream)
        }

        post("/v1/lookup") {
            if (!call.charge(write = false)) return@post
            val ids = parseIds(call.small(MAX_LOOKUP * 16)) ?: return@post call.respondText("bad body", status = HttpStatusCode.BadRequest)
            val out = ByteArrayOutputStream()
            relay.box.getMany(ids).forEach {
                out.write(it.size)
                out.write(encode(it, wide = false))
            }
            call.respondBytes(out.toByteArray(), ContentType.Application.OctetStream)
        }

        put("/v1/held/{id}") {
            if (!call.charge(write = true)) return@put
            val id = idBytes(call.parameters["id"]) ?: return@put call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val body = call.small(MAX_HELD)
            if (body.size < MIN_RECORD || body.size > MAX_HELD) return@put call.respondText("bad size", status = HttpStatusCode.BadRequest)
            call.answer(relay.putRecord(call.client(), Kind.HELD, id, body))
        }

        post("/v1/heldlookup") {
            if (!call.charge(write = false)) return@post
            val ids = parseIds(call.small(MAX_LOOKUP * 16)) ?: return@post call.respondText("bad body", status = HttpStatusCode.BadRequest)
            // Newest first, 2-byte lengths. Built one id at a time, so a big answer never sits in memory all at once.
            call.respondBytesWriter(ContentType.Application.OctetStream) {
                ids.forEach { id ->
                    val records = relay.held.get(id, 255)
                    val out = ByteArrayOutputStream()
                    out.write(records.size)
                    out.write(encode(records, wide = true))
                    writeFully(out.toByteArray())
                }
            }
        }

        // Profile photos, encrypted on the phone (core AvatarBox). Same id format as boxes.
        put("/v1/avatar/{id}") {
            if (!call.charge(write = true)) return@put
            val id = idBytes(call.parameters["id"])?.hex() ?: return@put call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val body = call.small(MAX_AVATAR)
            if (body.size < MIN_FILE || body.size > MAX_AVATAR || PlainFile.looksPlain(body, minOf(body.size, PlainFile.HEAD))) {
                return@put call.respondText("bad size", status = HttpStatusCode.BadRequest)
            }
            val c = call.client()
            if (!limits.mailbox(Kind.AVATAR, id)) return@put call.limited(Limit.MAILBOX)
            if (!limits.uploadBytes(c, body.size.toLong())) return@put call.limited(Limit.BYTES)
            if (relay.lowOnDisk() || !relay.avatars.put(id, body)) return@put call.respondText("full", status = HttpStatusCode.ServiceUnavailable)
            call.respondText("", status = HttpStatusCode.NoContent)
        }

        get("/v1/avatar/{id}") {
            if (!call.charge(write = false)) return@get
            val id = idBytes(call.parameters["id"])?.hex() ?: return@get call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val f = relay.avatars.open(id) ?: return@get call.respondText("", status = HttpStatusCode.NotFound)
            if (!limits.downloadBytes(call.client(), f.size)) {
                f.input.close()
                return@get call.limited(Limit.BYTES)
            }
            call.respond(Disk.Body(f.input, f.size))
        }

        // Sealed files: crew photos and clips (the app's Moments). Streamed to and from the volume.
        put("/v1/file/{id}") {
            if (!call.charge(write = true)) return@put
            val id = idBytes(call.parameters["id"])?.hex() ?: return@put call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val declared = call.request.contentLength()
            if (declared != null && (declared < MIN_FILE || declared > MAX_FILE)) return@put call.respondText("bad size", status = HttpStatusCode.BadRequest)
            val c = call.client()
            if (!limits.mailbox(Kind.FILE, id)) return@put call.limited(Limit.MAILBOX)
            when (relay.files.roomFor(id, declared ?: 0L)) {
                FileStore.Room.MAILBOX_FULL -> return@put call.limited(Limit.MAILBOX)
                FileStore.Room.STORE_FULL -> return@put call.respondText("full", status = HttpStatusCode.ServiceUnavailable)
                FileStore.Room.OK -> {}
            }
            if (relay.lowOnDisk()) return@put call.respondText("full", status = HttpStatusCode.ServiceUnavailable)
            if (declared != null && !limits.uploadBytes(c, declared)) return@put call.limited(Limit.BYTES)
            if (!relay.uploads.tryAcquire()) return@put call.respondText("busy", status = HttpStatusCode.ServiceUnavailable)
            val temp = relay.files.tempFile()
            try {
                val head = ByteArray(PlainFile.HEAD)
                val size = Disk.receive(call.receiveChannel(), temp, MAX_FILE.toLong(), head)
                if (size < MIN_FILE || PlainFile.looksPlain(head, minOf(size, PlainFile.HEAD.toLong()).toInt())) {
                    return@put call.respondText("bad size", status = HttpStatusCode.BadRequest)
                }
                if (declared == null && !limits.uploadBytes(c, size)) return@put call.limited(Limit.BYTES)
                call.respondText(relay.files.commit(id, temp, size))
            } finally {
                relay.uploads.release()
                temp.delete()
            }
        }

        get("/v1/files/{id}") {
            if (!call.charge(write = false)) return@get
            val id = idBytes(call.parameters["id"])?.hex() ?: return@get call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val since = call.request.queryParameters["since"]?.toLongOrNull() ?: 0L
            call.respondText(relay.files.list(id, since).joinToString("\n") { "${it.first} ${it.second}" })
        }

        get("/v1/file/{id}/{name}") {
            if (!call.charge(write = false)) return@get
            val id = idBytes(call.parameters["id"])?.hex() ?: return@get call.respondText("bad id", status = HttpStatusCode.BadRequest)
            val f = relay.files.open(id, call.parameters["name"].orEmpty()) ?: return@get call.respondText("", status = HttpStatusCode.NotFound)
            if (!limits.downloadBytes(call.client(), f.size)) {
                f.input.close()
                return@get call.limited(Limit.BYTES)
            }
            call.respond(Disk.Body(f.input, f.size))
        }

        // "Find a gig" in any country (see GigSearch). Keys stay on the server.
        get("/v1/gigs/search") {
            if (!call.charge(write = false)) return@get
            val q = call.request.queryParameters["q"].orEmpty()
            val country = call.request.queryParameters["country"]
            call.respondText(gigs.toJson(gigs.search(q, country)), ContentType.Application.Json)
        }

        // Where a venue typed in by hand is (see VenueLookup: one question a second, cached).
        get("/v1/venue") {
            if (!call.charge(write = false)) return@get
            when (val r = venues.find(call.request.queryParameters["q"].orEmpty(), call.request.queryParameters["box"])) {
                is VenueLookup.Result.Found -> call.respondText(r.place.toJson().toString(), ContentType.Application.Json)
                VenueLookup.Result.NotFound -> call.respondText("", status = HttpStatusCode.NotFound)
                VenueLookup.Result.Unavailable -> call.respondText("try later", status = HttpStatusCode.ServiceUnavailable)
            }
        }

        get("/v1/gigs/sources") {
            call.respondText(org.json.JSONArray(gigs.sources).toString(), ContentType.Application.Json)
        }

        // ---- New: install tokens, batches and cursors (docs/RELAY_API.md) ----

        post("/v1/install") {
            val c = call.client()
            if (!limits.registration(c)) return@post call.limited(Limit.CLIENT)
            call.respondText(relay.tokens.issue())
        }

        post("/v1/batch") {
            val declared = call.request.contentLength()
            if (declared != null && declared > Batch.MAX_BODY) return@post call.respondText("too big", status = HttpStatusCode.PayloadTooLarge)
            val body = call.small(Batch.MAX_BODY)
            if (body.size > Batch.MAX_BODY) return@post call.respondText("too big", status = HttpStatusCode.PayloadTooLarge)
            val ops = Batch.parse(body) ?: return@post call.respondText("bad body", status = HttpStatusCode.BadRequest)
            val (writeCost, readCost) = Batch.costs(ops)
            if (writeCost > 0 && !call.charge(write = true, writeCost)) return@post
            if (readCost > 0 && !call.charge(write = false, readCost)) {
                if (writeCost > 0) limits.refund(call.client(), true, writeCost)
                return@post
            }
            call.respondBytes(Batch.run(relay, call.client(), ops), ContentType.Application.OctetStream)
        }

        post("/v1/heldsince") {
            if (!call.charge(write = false)) return@post
            val ops = Batch.parseHeldSince(call.small(MAX_LOOKUP * 24)) ?: return@post call.respondText("bad body", status = HttpStatusCode.BadRequest)
            call.respondBytes(Batch.heldSince(relay, ops), ContentType.Application.OctetStream)
        }
    }
}

private const val MIN_RECORD = 16

/** Signed crew pings (key + signature) need room; lengths go as one byte. */
private const val MAX_RECORD = 255

/** Chat messages and history bundles (a phone's recent copy of the chat, ~3 KB). */
private const val MAX_HELD = 4_000
private const val MAX_LOOKUP = 64
private const val MIN_FILE = 28
private const val MAX_AVATAR = 48 * 1024 + 64
private const val MAX_FILE = 12_000_000

/** Up to 64 raw 16-byte ids, or null. */
private fun parseIds(body: ByteArray): List<ByteArray>? {
    if (body.isEmpty() || body.size % 16 != 0 || body.size / 16 > MAX_LOOKUP) return null
    return (0 until body.size / 16).map { body.copyOfRange(it * 16, it * 16 + 16) }
}

/** `[len][bytes]` per record: one length byte, or two ([wide], chat). */
private fun encode(records: List<ByteArray>, wide: Boolean): ByteArray {
    val out = ByteArrayOutputStream()
    records.forEach {
        if (wide) out.write(it.size shr 8)
        out.write(it.size and 0xFF)
        out.write(it)
    }
    return out.toByteArray()
}

fun main() {
    val log = LoggerFactory.getLogger("nz.waveformlabs.moshpoint.server")
    val env: (String) -> String? = System::getenv
    val config = RelayConfig.fromEnv(env)
    // On Fly the data must be on the volume: anywhere else in the Machine it's gone at the next restart.
    if (!env("FLY_APP_NAME").isNullOrBlank() && env("REQUIRE_VOLUME") != "0" && !onOwnDisk(config.dataDir)) {
        log.error("DATA_DIR is not on a mounted volume, so messages would be lost at the next restart. Mount the volume there (fly.toml [mounts]) or set REQUIRE_VOLUME=0.")
        exitProcess(2)
    }
    if (env("DATA_DIR").isNullOrBlank()) log.warn("DATA_DIR not set: keeping data in a temporary folder (fine for trying it out, not for real use)")
    val relay = Relay.open(config)
    val port = env("PORT")?.toIntOrNull() ?: 8080
    val server = embeddedServer(
        Netty,
        configure = {
            connector {
                this.port = port
                host = "0.0.0.0"
            }
            // Drop connections that stop sending or reading for a while (a phone that walked out of signal).
            requestReadTimeoutSeconds = 30
            responseWriteTimeoutSeconds = 60
        },
    ) { moshpoint(relay) }
    // A stop (deploy, scale, fly machine stop) sends SIGTERM: finish what's in flight, then flush and close.
    Runtime.getRuntime().addShutdownHook(
        Thread {
            log.info("Stopping: finishing requests in flight")
            server.stop(gracePeriodMillis = 3_000, timeoutMillis = 20_000)
            relay.close()
        },
    )
    log.info("Moshpoint relay listening on port {}. {}", port, relay.stats())
    server.start(wait = true)
}

/** Is [dir] on a different filesystem from the root one (a mounted volume)? */
private fun onOwnDisk(dir: File): Boolean = runCatching {
    Files.getFileStore(dir.toPath()) != Files.getFileStore(Path.of("/"))
}.getOrDefault(true)
