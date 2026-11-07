package nz.waveformlabs.moshpoint.core

import java.nio.ByteBuffer
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * Your profile photo, shared with your friends only.
 *
 * You set your photo once; it's encrypted on your phone with a key derived from your
 * secret (which only your friends have) and posted to the relay server under an id that
 * changes every week. Friends work out the same id and key from your secret, fetch it and
 * show your face at the tip of their arrow. The server only ever stores encrypted bytes.
 *
 * Sealed format: `[nonce:12][AES-GCM(jpeg)+tag:16]`.
 */
object AvatarBox {
    const val WEEK_MS = 7L * 24 * 60 * 60 * 1000
    /** Photos are small squares (~256 px JPEG); refuse anything silly. */
    const val MAX_PHOTO_BYTES = 48 * 1024

    fun weekAt(nowMs: Long): Long = Math.floorDiv(nowMs, WEEK_MS)

    /** Server id for this owner's photo in [week] (16 bytes). */
    fun idFor(ownerSecret: ByteArray, week: Long): ByteArray =
        hmac(ownerSecret, "moshpoint-avatar-id".toByteArray() + ByteBuffer.allocate(8).putLong(week).array()).copyOf(16)

    fun seal(ownerSecret: ByteArray, jpeg: ByteArray, random: SecureRandom = SecureRandom()): ByteArray {
        require(jpeg.size <= MAX_PHOTO_BYTES) { "photo too big" }
        val nonce = ByteArray(12).also { random.nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key(ownerSecret), GCMParameterSpec(128, nonce))
        c.updateAAD("moshpoint-avatar-v1".toByteArray())
        return nonce + c.doFinal(jpeg)
    }

    /** The photo, or null if it isn't this owner's or was tampered with. */
    fun open(ownerSecret: ByteArray, sealed: ByteArray): ByteArray? {
        if (sealed.size < 12 + 16) return null
        return runCatching {
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key(ownerSecret), GCMParameterSpec(128, sealed.copyOfRange(0, 12)))
            c.updateAAD("moshpoint-avatar-v1".toByteArray())
            c.doFinal(sealed, 12, sealed.size - 12)
        }.getOrNull()
    }

    private fun key(secret: ByteArray) = SecretKeySpec(hmac(secret, "moshpoint-avatar-key".toByteArray()).copyOf(16), "AES")

    private fun hmac(key: ByteArray, msg: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(msg)
    }
}
