package nz.waveformlabs.moshpoint.server

import io.ktor.http.ContentType
import io.ktor.http.content.OutgoingContent
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.ByteWriteChannel
import io.ktor.utils.io.readAvailable
import io.ktor.utils.io.writeFully
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.nio.channels.FileChannel
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.StandardOpenOption

/** Files on the volume: written to a temp file, flushed to disk, then renamed into place. */
object Disk {
    private const val CHUNK = 64 * 1024

    /** Make a rename in [dir] durable. */
    fun syncDir(dir: File) {
        runCatching { FileChannel.open(dir.toPath(), StandardOpenOption.READ).use { it.force(true) } }
    }

    /** Put [from] at [to] in one step (same filesystem), replacing what was there, and make it durable. */
    fun move(from: File, to: File) {
        Files.move(from.toPath(), to.toPath(), StandardCopyOption.ATOMIC_MOVE)
        syncDir(to.parentFile)
    }

    /** Write [bytes] to a new temp file in [tmpDir] and flush it to disk. */
    fun writeTemp(tmpDir: File, bytes: ByteArray): File {
        val f = File.createTempFile("in-", ".part", tmpDir)
        FileOutputStream(f).use {
            it.write(bytes)
            it.fd.sync()
        }
        return f
    }

    /**
     * Copy a request body to [file] as it arrives, never holding more than one 64 KB chunk.
     * The first bytes go into [head] (to check what kind of file it is). Returns the size, or
     * -1 as soon as it goes past [max]. The file is flushed to disk before returning.
     */
    suspend fun receive(body: ByteReadChannel, file: File, max: Long, head: ByteArray): Long = withContext(Dispatchers.IO) {
        FileOutputStream(file).use { out ->
            val buf = ByteArray(CHUNK)
            var total = 0L
            while (true) {
                val n = body.readAvailable(buf, 0, buf.size)
                if (n < 0) break
                if (n == 0) continue
                if (total < head.size) System.arraycopy(buf, 0, head, total.toInt(), minOf(n, head.size - total.toInt()))
                total += n
                if (total > max) return@withContext -1L
                out.write(buf, 0, n)
            }
            out.fd.sync()
            total
        }
    }

    /** A response that streams an already opened file in 64 KB chunks (opened first, so a sweep can't pull it away mid-answer). */
    class Body(private val input: FileInputStream, private val length: Long) : OutgoingContent.WriteChannelContent() {
        override val contentLength: Long get() = length
        override val contentType: ContentType get() = ContentType.Application.OctetStream

        override suspend fun writeTo(channel: ByteWriteChannel) {
            input.use { s ->
                val buf = ByteArray(CHUNK)
                while (true) {
                    val n = withContext(Dispatchers.IO) { s.read(buf) }
                    if (n < 0) break
                    channel.writeFully(buf, 0, n)
                }
            }
        }
    }
}

/**
 * Uploads must be sealed (encrypted) bytes. A sealed file starts with a random nonce (profile
 * photos) or a time and a nonce (moments), never with a known file signature or plain text, so
 * an upload that starts like a JPEG, a video, a PDF, an archive or text is refused. This keeps
 * the relay from serving as free hosting for ordinary files. A sealed profile photo is refused by
 * chance about once in two and a half million (its random nonce happens to look like a signature);
 * the app seals photos afresh each time it publishes them. A moment starts with the time, which
 * matches none of these.
 */
object PlainFile {
    const val HEAD = 16

    private val SIGNATURES: List<ByteArray> = listOf(
        byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte()), // JPEG
        byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A), // PNG
        "GIF8".toByteArray(), "RIFF".toByteArray(), "%PDF".toByteArray(), "OggS".toByteArray(), "ID3".toByteArray(),
        byteArrayOf(0x50, 0x4B, 0x03, 0x04), // zip, apk, docx
        byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte()), // Matroska / WebM
        byteArrayOf(0x37, 0x7A, 0xBC.toByte(), 0xAF.toByte(), 0x27, 0x1C), // 7z
        "Rar!".toByteArray(),
        byteArrayOf(0xEF.toByte(), 0xBB.toByte(), 0xBF.toByte()), // UTF-8 text with a byte-order mark
    )

    /** Does a file starting with [head] (its first [n] bytes) look like an ordinary, unencrypted file? */
    fun looksPlain(head: ByteArray, n: Int): Boolean {
        if (SIGNATURES.any { sig -> n >= sig.size && (sig.indices).all { head[it] == sig[it] } }) return true
        // MP4, MOV, HEIC, 3GP: "ftyp" at offset 4.
        if (n >= 8 && head[4] == 'f'.code.toByte() && head[5] == 't'.code.toByte() && head[6] == 'y'.code.toByte() && head[7] == 'p'.code.toByte()) return true
        // Text (HTML, scripts, ...): the first 16 bytes all printable.
        if (n >= HEAD && (0 until HEAD).all { val b = head[it].toInt() and 0xFF; b in 0x20..0x7E || b == 0x09 || b == 0x0A || b == 0x0D }) return true
        return false
    }
}
