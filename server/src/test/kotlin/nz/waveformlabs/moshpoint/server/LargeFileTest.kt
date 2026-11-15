package nz.waveformlabs.moshpoint.server

import java.io.File
import java.net.ServerSocket
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.security.MessageDigest
import java.time.Duration
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * The real server, in its own JVM with a 48 MB heap: five 12 MB moments uploaded at once (60 MB,
 * more than the whole heap) and downloaded again at once. Only streaming to and from the disk
 * gets through that; the old server held each file whole in memory. Then the process is killed
 * outright (kill -9) and started again: every file is still there.
 */
class LargeFileTest {
    private val http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()
    private val id = "00112233445566778899aabbccddeeff"

    private fun start(dir: File, port: Int): Process {
        val java = ProcessHandle.current().info().command().orElse("java")
        val cp = System.getProperty("relay.classpath") ?: System.getProperty("java.class.path")
        val pb = ProcessBuilder(
            java, "-Xmx48m", "-XX:MaxDirectMemorySize=32m", "-XX:+ExitOnOutOfMemoryError",
            "-cp", cp, "nz.waveformlabs.moshpoint.server.MainKt",
        )
        pb.environment().apply {
            put("PORT", port.toString())
            put("DATA_DIR", dir.path)
            put("MOSHPOINT_TOKEN_SECRET", "test-secret-test-secret-test-secret-123")
            remove("FLY_APP_NAME")
        }
        pb.redirectErrorStream(true)
        pb.redirectOutput(ProcessBuilder.Redirect.appendTo(File(dir, "server.log")))
        val p = pb.start()
        val until = System.currentTimeMillis() + 60_000
        while (System.currentTimeMillis() < until) {
            assertTrue(p.isAlive, "server exited: " + File(dir, "server.log").readText())
            val up = runCatching {
                http.send(HttpRequest.newBuilder(URI("http://127.0.0.1:$port/healthz")).build(), HttpResponse.BodyHandlers.ofString()).statusCode() == 200
            }.getOrDefault(false)
            if (up) return p
            Thread.sleep(200)
        }
        error("server didn't start: " + File(dir, "server.log").readText())
    }

    private fun sha(b: ByteArray) = MessageDigest.getInstance("SHA-256").digest(b).hex()

    private fun download(port: Int, name: String): String {
        val r = http.send(HttpRequest.newBuilder(URI("http://127.0.0.1:$port/v1/file/$id/$name")).build(), HttpResponse.BodyHandlers.ofInputStream())
        assertEquals(200, r.statusCode())
        val md = MessageDigest.getInstance("SHA-256")
        r.body().use { s ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = s.read(buf)
                if (n < 0) break
                md.update(buf, 0, n)
            }
        }
        return md.digest().hex()
    }

    @Test fun twelveMegabyteMomentsStreamThroughASmallHeapAndSurviveAKill() {
        val dir = tempDataDir()
        val port = ServerSocket(0).use { it.localPort }
        var p = start(dir, port)
        try {
            val files = (0 until 5).map { n -> ByteArray(12_000_000) { i -> ((i * 7 + n * 13) % 251 + 1).toByte() } }
            val uploads = files.map { f ->
                http.sendAsync(
                    HttpRequest.newBuilder(URI("http://127.0.0.1:$port/v1/file/$id")).timeout(Duration.ofSeconds(120))
                        .PUT(HttpRequest.BodyPublishers.ofByteArray(f)).build(),
                    HttpResponse.BodyHandlers.ofString(),
                )
            }.map { it.join() }
            uploads.forEach { assertEquals(200, it.statusCode(), it.body()) }
            val names = uploads.map { it.body() }
            assertTrue(p.isAlive)
            // All five at once, back out.
            val hashes = names.map { n -> java.util.concurrent.CompletableFuture.supplyAsync { download(port, n) } }.map { it.join() }
            assertEquals(files.map { sha(it) }, hashes)
            assertTrue(p.isAlive, File(dir, "server.log").readText())
            // Too big is refused without being stored.
            val tooBig = http.send(
                HttpRequest.newBuilder(URI("http://127.0.0.1:$port/v1/file/$id")).PUT(HttpRequest.BodyPublishers.ofByteArray(ByteArray(12_000_001) { 9 })).build(),
                HttpResponse.BodyHandlers.ofString(),
            )
            assertEquals(400, tooBig.statusCode())

            // An upload cut off part way (the phone lost signal) is not stored as if it were whole.
            java.net.Socket("127.0.0.1", port).use { sock ->
                val out = sock.getOutputStream()
                out.write("PUT /v1/file/$id HTTP/1.1\r\nHost: relay\r\nContent-Length: 100000\r\n\r\n".toByteArray())
                out.write(ByteArray(50_000) { (it % 251 + 1).toByte() })
                out.flush()
            }
            Thread.sleep(1_000)
            val afterCut = http.send(HttpRequest.newBuilder(URI("http://127.0.0.1:$port/v1/files/$id?since=0")).build(), HttpResponse.BodyHandlers.ofString()).body()
            assertEquals(names.toSet(), afterCut.lines().map { it.substringAfter(' ') }.toSet())

            // kill -9, then start again on the same volume.
            p.destroyForcibly().waitFor()
            p = start(dir, port)
            val listing = http.send(HttpRequest.newBuilder(URI("http://127.0.0.1:$port/v1/files/$id?since=0")).build(), HttpResponse.BodyHandlers.ofString()).body()
            assertEquals(names.toSet(), listing.lines().map { it.substringAfter(' ') }.toSet())
            assertEquals(sha(files[3]), download(port, names[3]))
        } finally {
            p.destroyForcibly().waitFor()
        }
    }
}
