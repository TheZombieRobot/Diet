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
 * Plaintext (14 bytes):
 * `lat int32 (1e-7 deg) | lon int32 (1e-7 deg) | time uint32 (unix seconds) | accuracy uint8 (m, capped)
 *  | status uint8 (bits 0-6 battery %, 127 = unknown; bit 7 = "battery dying, last update")`
 * Older 13-byte boxes (no status) still open.
 *
 * Sealed with AES-128-GCM (96-bit tag). The key comes from the owner's secret, and the
 * nonce from the rotating id and timestamp, so nothing extra has to be sent:
 * sealed = `[time:4][ciphertext+tag:26]` = 30 bytes.
 */
data class SharedLocation(
    val lat: Double,
    val lon: Double,
    val timeSec: Long,
    val accuracyM: Int,
    /** 0..100, or null if unknown / an older app. */
    val batteryPct: Int? = null,
    /** Sent as the phone's battery runs out: probably their last known spot for a while. */
    val lastGasp: Boolean = false,
) {
    val latLon get() = LatLon(lat, lon)
}

object LocationBox {
    const val SEALED_BYTES = 4 + 14 + 12
    private const val OLD_SEALED_BYTES = 4 + 13 + 12
    private const val TAG_BITS = 96

    fun seal(ownerSecret: ByteArray, rotatingId: ByteArray, loc: SharedLocation): ByteArray {
        val status = (loc.batteryPct?.coerceIn(0, 100) ?: 127) or (if (loc.lastGasp) 0x80 else 0)
        val plain = ByteBuffer.allocate(14)
            .putInt((loc.lat * 1e7).roundToInt())
            .putInt((loc.lon * 1e7).roundToInt())
            .putInt(loc.timeSec.toInt())
            .put(loc.accuracyM.coerceIn(0, 255).toByte())
            .put(status.toByte())
            .array()
        val time = ByteBuffer.allocate(4).putInt(loc.timeSec.toInt()).array()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key(ownerSecret), GCMParameterSpec(TAG_BITS, nonce(rotatingId, time)))
        cipher.updateAAD(rotatingId)
        return time + cipher.doFinal(plain)
    }

    /** Returns null if it wasn't sealed with this secret / id, or was tampered with. */
    fun open(ownerSecret: ByteArray, rotatingId: ByteArray, sealed: ByteArray): SharedLocation? {
        if (sealed.size != SEALED_BYTES && sealed.size != OLD_SEALED_BYTES) return null
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
            val status = if (b.hasRemaining()) b.get().toInt() and 0xFF else 127
            require(t == (ByteBuffer.wrap(time).int.toLong() and 0xFFFFFFFFL))
            val battery = (status and 0x7F).takeIf { it <= 100 }
            SharedLocation(lat, lon, t, acc, battery, lastGasp = status and 0x80 != 0)
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
