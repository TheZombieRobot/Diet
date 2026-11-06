package nz.waveformlabs.moshpoint.locate

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import nz.waveformlabs.moshpoint.BuildConfig
import java.net.HttpURLConnection
import java.net.URL

/**
 * Talks to the Moshpoint relay server (see `server/`). Only ever sends rotating ids and
 * sealed boxes: the server can't tell who anyone is or where they are.
 *
 * The server address is set at build time: `-Pmoshpoint.server=https://...` or in
 * `gradle.properties`. When it's empty, GPS sharing is simply off.
 */
object RelayClient {
    val enabled get() = BuildConfig.MOSHPOINT_SERVER.isNotBlank()
    private val base get() = BuildConfig.MOSHPOINT_SERVER.trimEnd('/')

    suspend fun put(id: ByteArray, sealed: ByteArray): Boolean = withContext(Dispatchers.IO) {
        if (!enabled) return@withContext false
        runCatching {
            val c = URL("$base/v1/box/${id.hex()}").openConnection() as HttpURLConnection
            c.requestMethod = "PUT"
            c.doOutput = true
            c.connectTimeout = 5_000
            c.readTimeout = 5_000
            c.setRequestProperty("Content-Type", "application/octet-stream")
            c.outputStream.use { it.write(sealed) }
            val ok = c.responseCode in 200..299
            c.disconnect()
            ok
        }.getOrDefault(false)
    }

    /** For each id, the sealed records posted under it (newest first). Null on network failure. */
    suspend fun lookup(ids: List<ByteArray>): List<List<ByteArray>>? = withContext(Dispatchers.IO) {
        if (!enabled || ids.isEmpty()) return@withContext null
        runCatching {
            val c = URL("$base/v1/lookup").openConnection() as HttpURLConnection
            c.requestMethod = "POST"
            c.doOutput = true
            c.connectTimeout = 5_000
            c.readTimeout = 5_000
            c.setRequestProperty("Content-Type", "application/octet-stream")
            c.outputStream.use { out -> ids.forEach { out.write(it) } }
            if (c.responseCode != 200) return@runCatching null
            val body = c.inputStream.use { it.readBytes() }
            c.disconnect()
            parseLookup(body, ids.size)
        }.getOrNull()
    }

    private fun parseLookup(b: ByteArray, n: Int): List<List<ByteArray>> {
        var i = 0
        return List(n) {
            val count = b[i++].toInt() and 0xFF
            List(count) {
                val len = b[i++].toInt() and 0xFF
                b.copyOfRange(i, i + len).also { i += len }
            }
        }
    }

}
