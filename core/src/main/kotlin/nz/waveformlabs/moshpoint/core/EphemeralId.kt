package nz.waveformlabs.moshpoint.core

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * Rotating broadcast IDs, the privacy base for visibility and the crowd network.
 *
 * A visible phone never broadcasts anything fixed. It broadcasts
 * `HMAC-SHA256(secret, epoch)` cut down to [ID_BYTES], where `epoch` changes every
 * [rotationMs]. The secret is only shared with friends / the gig group, so:
 *
 * - Strangers (and phones that relay for us) see a meaningless code that changes every
 *   few minutes and can't be linked over time.
 * - A friend who holds the secret can work out the current code and recognise it.
 *
 * Relayed locations are additionally encrypted to the owner's public key (see
 * docs/ARCHITECTURE.md), so the helping phone never learns who or where.
 */
class EphemeralId(private val secret: ByteArray, private val rotationMs: Long = DEFAULT_ROTATION_MS) {
    init {
        require(secret.size >= 16) { "secret must be at least 128 bits" }
    }

    fun epochAt(nowMs: Long): Long = Math.floorDiv(nowMs, rotationMs)

    fun idForEpoch(epoch: Long): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(secret, "HmacSHA256"))
        val msg = ByteArray(8) { i -> (epoch ushr (56 - 8 * i)).toByte() }
        return mac.doFinal(msg).copyOf(ID_BYTES)
    }

    fun currentId(nowMs: Long): ByteArray = idForEpoch(epochAt(nowMs))

    /**
     * True if [heard] belongs to this secret around [nowMs]. Checks the neighbouring
     * epochs too, to tolerate clock drift between phones.
     */
    fun matches(heard: ByteArray, nowMs: Long, toleranceEpochs: Int = 1): Boolean {
        val e = epochAt(nowMs)
        return (-toleranceEpochs..toleranceEpochs).any { idForEpoch(e + it).contentEquals(heard) }
    }

    companion object {
        const val ID_BYTES = 16
        const val DEFAULT_ROTATION_MS = 5 * 60 * 1000L
    }
}
