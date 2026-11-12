package nz.waveformlabs.moshpoint.core

import java.nio.ByteBuffer
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * A phone's air pressure, sealed so only its owner's friends can read it: the small separate
 * record that carries "which floor" over the relay server, next to (never inside) the
 * [LocationBox]. Older versions never ask for it, and the location box and the crowd-relay
 * packet are unchanged.
 *
 * It lives in its own mailbox: [idFor] is worked out from the owner's secret like the
 * rotating id, but from different input, so it can't be linked to their location's mailbox
 * and rotates with it.
 *
 * Plaintext (3 bytes): `pressure uint16 ([Baro] units) | reserved uint8 (0)`.
 * Sealed with AES-128-GCM (96-bit tag), bound to the mailbox id:
 * `[time:4][ciphertext+tag:15]` = 19 bytes.
 */
object FloorBox {
    const val SEALED_BYTES = 4 + 3 + 12
    private const val TAG_BITS = 96

    /** A pressure reading and when it was taken (unix seconds). */
    data class Reading(val pressure: Int, val timeSec: Long) {
        val hPa: Double get() = Baro.toHpa(pressure)
    }

    /** The mailbox for [secret]'s pressure during [epoch] (see [EphemeralId.epochAt]). 16 bytes. */
    fun idFor(secret: ByteArray, epoch: Long): ByteArray =
        hmac(secret, "moshpoint-floor-id".toByteArray() + ByteBuffer.allocate(8).putLong(epoch).array()).copyOf(EphemeralId.ID_BYTES)

    fun seal(ownerSecret: ByteArray, id: ByteArray, reading: Reading): ByteArray {
        require(id.size == EphemeralId.ID_BYTES)
        val plain = ByteBuffer.allocate(3).putShort(reading.pressure.coerceIn(0, Baro.MAX_UNITS).toShort()).put(0).array()
        val time = ByteBuffer.allocate(4).putInt(reading.timeSec.toInt()).array()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key(ownerSecret), GCMParameterSpec(TAG_BITS, nonce(id, time)))
        cipher.updateAAD(id)
        return time + cipher.doFinal(plain)
    }

    /** Returns null if it wasn't sealed with this secret for this mailbox, or was tampered with. */
    fun open(ownerSecret: ByteArray, id: ByteArray, sealed: ByteArray): Reading? {
        if (sealed.size != SEALED_BYTES || id.size != EphemeralId.ID_BYTES) return null
        val time = sealed.copyOfRange(0, 4)
        return runCatching {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(ownerSecret), GCMParameterSpec(TAG_BITS, nonce(id, time)))
            cipher.updateAAD(id)
            val b = ByteBuffer.wrap(cipher.doFinal(sealed, 4, sealed.size - 4))
            Reading(b.short.toInt() and 0xFFFF, ByteBuffer.wrap(time).int.toLong() and 0xFFFFFFFFL)
        }.getOrNull()
    }

    private fun key(secret: ByteArray) = SecretKeySpec(hmac(secret, "moshpoint-floor-box".toByteArray()).copyOf(16), "AES")

    /** 12-byte nonce: unique per (mailbox, second); a phone seals at most once a second. */
    private fun nonce(id: ByteArray, time: ByteArray) = id.copyOf(8) + time

    private fun hmac(key: ByteArray, msg: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(msg)
    }
}
