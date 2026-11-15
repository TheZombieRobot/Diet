package nz.waveformlabs.moshpoint.server

import io.ktor.server.application.ApplicationCall
import io.ktor.server.plugins.origin
import io.ktor.util.AttributeKey
import java.io.File
import java.net.Inet6Address
import java.net.InetAddress
import java.nio.ByteBuffer
import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermissions
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Which proxy, if any, says who the client is.
 *
 * - [FLY]: Fly's proxy sets `Fly-Client-IP` itself, and from the internet the app's port can only
 *   be reached through it. (Fly's private network can reach it too, but only the owner's own
 *   Machines and WireGuard peers are on it.) The default whenever the server runs on Fly
 *   (`FLY_APP_NAME` is set).
 * - [LAST_FORWARDED]: one trusted proxy that appends the client's address to `X-Forwarded-For`
 *   (the last entry is the one it added; anything before it came from the client).
 * - [NONE]: the address the connection came from. Headers are ignored. The default elsewhere.
 *
 * The first `X-Forwarded-For` entry, which the old server used, is whatever the client wrote.
 */
enum class ProxyTrust {
    FLY, LAST_FORWARDED, NONE;

    companion object {
        fun from(env: (String) -> String?): ProxyTrust = when (env("TRUST_PROXY")?.trim()?.lowercase()) {
            "fly" -> FLY
            "last-forwarded", "x-forwarded-for" -> LAST_FORWARDED
            "none" -> NONE
            else -> if (!env("FLY_APP_NAME").isNullOrBlank()) FLY else NONE
        }
    }
}

/**
 * Who is asking, for rate limits only: an address (IPv6 by its /64, which is what one phone or
 * one home gets) and, when the request carries a valid install token, the install. Never logged
 * or stored; the limiter's buckets are in memory and forgotten when idle.
 */
class Client(val address: String, val install: String?, val badToken: Boolean = false)

object Addresses {
    private val V4 = Regex("^\\d{1,3}(\\.\\d{1,3}){3}$")
    private val V6 = Regex("^[0-9a-fA-F:.]+$")

    /** A literal IP address as a rate-limit key (IPv6 cut to its /64), or null if [s] isn't one. Never looks a name up. */
    fun key(s: String?): String? {
        val t = s?.trim()?.removePrefix("[")?.removeSuffix("]")?.substringBefore('%') ?: return null
        if (!V4.matches(t) && !(t.contains(':') && V6.matches(t))) return null
        val a = runCatching { InetAddress.getByName(t) }.getOrNull() ?: return null
        if (a is Inet6Address) {
            val b = a.address
            return "v6:" + (0 until 8).joinToString("") { "%02x".format(b[it]) }
        }
        return a.hostAddress
    }

    fun of(call: ApplicationCall, trust: ProxyTrust): String {
        val peer = call.request.local.remoteAddress
        val fromProxy = when (trust) {
            ProxyTrust.FLY -> call.request.headers["Fly-Client-IP"]
            ProxyTrust.LAST_FORWARDED -> call.request.headers.getAll("X-Forwarded-For")?.lastOrNull()?.split(',')?.lastOrNull()
            ProxyTrust.NONE -> null
        }
        return key(fromProxy) ?: key(peer) ?: peer.ifBlank { call.request.origin.remoteHost }
    }
}

/**
 * Optional per-install tokens. A phone asks for one once (`POST /v1/install`); afterwards it sends
 * it as `X-Moshpoint-Token` and gets its own limits, instead of sharing its address's limits
 * with everyone behind the same carrier address. Requests without a token work as before.
 *
 * A token is `base64url(version 1 | install id, 12 random bytes | issued, unix minutes, 4 bytes |
 * HMAC-SHA256 over those, first 16 bytes)`, so checking one needs no storage. It names no person
 * and no phone: the install id is random and only used as a rate-limit key. Changing the secret
 * (`MOSHPOINT_TOKEN_SECRET`) invalidates every token; apps then get a new one.
 */
class InstallTokens(secret: ByteArray, private val clock: () -> Long = System::currentTimeMillis) {
    private val key = SecretKeySpec(secret, "HmacSHA256")
    private val rnd = SecureRandom()

    fun issue(): String {
        val id = ByteArray(12).also { rnd.nextBytes(it) }
        val body = ByteBuffer.allocate(17).put(1).put(id).putInt((clock() / 60_000).toInt()).array()
        return Base64.getUrlEncoder().withoutPadding().encodeToString(body + mac(body))
    }

    /** The install id (hex) if [token] is one of ours, else null. */
    fun verify(token: String?): String? {
        if (token == null || token.length != 44) return null
        val raw = runCatching { Base64.getUrlDecoder().decode(token) }.getOrNull() ?: return null
        if (raw.size != 33 || raw[0] != 1.toByte()) return null
        val body = raw.copyOfRange(0, 17)
        if (!MessageDigest.isEqual(mac(body), raw.copyOfRange(17, 33))) return null
        return raw.copyOfRange(1, 13).joinToString("") { "%02x".format(it) }
    }

    private fun mac(body: ByteArray): ByteArray =
        Mac.getInstance("HmacSHA256").apply { init(key) }.doFinal(body).copyOf(16)

    companion object {
        /** The secret from `MOSHPOINT_TOKEN_SECRET`, else one made once and kept on the volume. */
        fun secret(env: (String) -> String?, dataDir: File): ByteArray {
            env("MOSHPOINT_TOKEN_SECRET")?.trim()?.takeIf { it.length >= 32 }?.let {
                return MessageDigest.getInstance("SHA-256").digest(it.toByteArray())
            }
            val f = File(dataDir, "install-token.key")
            if (f.isFile && f.length() == 32L) return f.readBytes()
            val s = ByteArray(32).also { SecureRandom().nextBytes(it) }
            val temp = Disk.writeTemp(dataDir, s)
            runCatching { Files.setPosixFilePermissions(temp.toPath(), PosixFilePermissions.fromString("rw-------")) }
            Disk.move(temp, f)
            return s
        }
    }
}

private val CLIENT_KEY = AttributeKey<Client>("moshpoint-client")

/** The client of this call (worked out once per call). */
fun ApplicationCall.client(trust: ProxyTrust, tokens: InstallTokens): Client {
    attributes.getOrNull(CLIENT_KEY)?.let { return it }
    val sent = request.headers["X-Moshpoint-Token"]
    val install = tokens.verify(sent)
    return Client(Addresses.of(this, trust), install, badToken = sent != null && install == null).also { attributes.put(CLIENT_KEY, it) }
}
