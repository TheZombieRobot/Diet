package nz.waveformlabs.moshpoint.core

import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import kotlin.math.roundToInt

/**
 * A location sealed so only the owner's friends can read it.
 *
 * Used for both server sharing (GPS mode) and crowd relay. The server / relaying phones
 * only ever see `(rotating id, sealed bytes)`. They can't read the location, and because
 * the id rotates every few minutes they can't follow one person through the night.
 *
 * Plaintext (13 bytes):
 * `lat int32 (1e-7 deg) | lon int32 (1e-7 deg) | time uint32 (unix seconds) | accuracy uint8 (m, capped)`
 *
 * Sealed with AES-128-GCM (96-bit tag). The key comes from the owner's secret, and the
 * nonce from the rotating id and timestamp, so nothing extra has to be sent:
 * sealed = `[time:4][ciphertext+tag:25]` = 29 bytes.
 */
data class SharedLocation(val lat: Double, val lon: Double, val timeSec: Long, val accuracyM: Int) {
    val latLon get() = LatLon(lat, lon)
}

object LocationBox {
    const val SEALED_BYTES = 4 + 13 + 12
    private const val TAG_BITS = 96

    fun seal(ownerSecret: ByteArray, rotatingId: ByteArray, loc: SharedLocation): ByteArray {
        val plain = ByteBuffer.allocate(13)
            .putInt((loc.lat * 1e7).roundToInt())
            .putInt((loc.lon * 1e7).roundToInt())
            .putInt(loc.timeSec.toInt())
            .put(loc.accuracyM.coerceIn(0, 255).toByte())
            .array()
        val time = ByteBuffer.allocate(4).putInt(loc.timeSec.toInt()).array()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key(ownerSecret), GCMParameterSpec(TAG_BITS, nonce(rotatingId, time)))
        cipher.updateAAD(rotatingId)
        return time + cipher.doFinal(plain)
    }

    /** Returns null if it wasn't sealed with this secret / id, or was tampered with. */
    fun open(ownerSecret: ByteArray, rotatingId: ByteArray, sealed: ByteArray): SharedLocation? {
        if (sealed.size != SEALED_BYTES) return null
        val time = sealed.copyOfRange(0, 4)
        return runCatching {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(ownerSecret), GCMParameterSpec(TAG_BITS, nonce(rotatingId, time)))
            cipher.updateAAD(rotatingId)
            val b = ByteBuffer.wrap(cipher.doFinal(sealed, 4, sealed.size - 4))
            val lat = b.int / 1e7
            val lon = b.int / 1e7
            val t = b.int.toLong() and 0xFFFFFFFFL
            val acc = b.get().toInt() and 0xFF
            require(t == (ByteBuffer.wrap(time).int.toLong() and 0xFFFFFFFFL))
            SharedLocation(lat, lon, t, acc)
        }.getOrNull()
    }

    private fun key(secret: ByteArray): SecretKeySpec {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret, "HmacSHA256"))
        return SecretKeySpec(mac.doFinal("moshpoint-location-box".toByteArray()).copyOf(16), "AES")
    }

    /** 12-byte nonce: unique per (id, second); a phone never seals twice in one second. */
    private fun nonce(id: ByteArray, time: ByteArray) = id.copyOf(8) + time
}
