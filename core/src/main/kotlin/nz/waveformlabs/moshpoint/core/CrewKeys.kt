package nz.waveformlabs.moshpoint.core

import java.math.BigInteger
import java.nio.ByteBuffer
import java.security.AlgorithmParameters
import java.security.KeyFactory
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature
import java.security.interfaces.ECPrivateKey
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECParameterSpec
import java.security.spec.ECPoint
import java.security.spec.ECPublicKeySpec
import java.security.spec.PKCS8EncodedKeySpec
import javax.crypto.KeyAgreement

/**
 * Each person's signing key for one crew (P-256, standard on every Android phone).
 *
 * - Every crew message is signed, so nobody (not even another crew member) can post as you.
 * - Two members can agree a private key between just them (ECDH), used for "keep as friend",
 *   so your long-term identity only goes to the person you chose, never the whole crew.
 *
 * Public keys travel compressed (33 bytes). A person's [tag] is the first 8 bytes of the
 * public key's hash: short enough for every message, and it can't be faked without the key.
 */
object CrewKeys {
    const val PUB_BYTES = 33
    const val SIG_BYTES = 64

    class Signer(val private: PrivateKey, val pub: ByteArray) {
        val tag: Long get() = tagOf(pub)
        fun encodedPrivate(): ByteArray = private.encoded
    }

    private val params: ECParameterSpec by lazy {
        AlgorithmParameters.getInstance("EC").apply { init(ECGenParameterSpec("secp256r1")) }
            .getParameterSpec(ECParameterSpec::class.java)
    }

    fun generate(): Signer {
        val kp = KeyPairGenerator.getInstance("EC").apply { initialize(ECGenParameterSpec("secp256r1")) }.generateKeyPair()
        return Signer(kp.private, compress((kp.public as ECPublicKey).w))
    }

    /** From [Signer.encodedPrivate] and its public key, as saved on the phone. */
    fun restore(privateEncoded: ByteArray, pub: ByteArray): Signer? = runCatching {
        Signer(KeyFactory.getInstance("EC").generatePrivate(PKCS8EncodedKeySpec(privateEncoded)), pub)
    }.getOrNull()

    fun tagOf(pub: ByteArray): Long {
        val t = ByteBuffer.wrap(MessageDigest.getInstance("SHA-256").digest(pub)).long
        return if (t == 0L) 1L else t
    }

    /** 64-byte r‖s signature over [data]. */
    fun sign(s: Signer, data: ByteArray): ByteArray {
        val der = Signature.getInstance("SHA256withECDSA").apply { initSign(s.private); update(data) }.sign()
        return derToRaw(der)
    }

    fun verify(pub: ByteArray, data: ByteArray, sig: ByteArray): Boolean = runCatching {
        if (sig.size != SIG_BYTES) return false
        val key = publicKey(pub) ?: return false
        Signature.getInstance("SHA256withECDSA").apply { initVerify(key); update(data) }.verify(rawToDer(sig))
    }.getOrDefault(false)

    /** A secret only we and the owner of [theirPub] can work out (32 bytes, hashed). */
    fun agree(mine: Signer, theirPub: ByteArray): ByteArray? = runCatching {
        val ka = KeyAgreement.getInstance("ECDH")
        ka.init(mine.private)
        ka.doPhase(publicKey(theirPub) ?: return null, true)
        MessageDigest.getInstance("SHA-256").digest(ka.generateSecret() + "moshpoint-direct".toByteArray())
    }.getOrNull()

    // ---- Encoding ----

    private val p = BigInteger("ffffffff00000001000000000000000000000000ffffffffffffffffffffffff", 16)
    private val b = BigInteger("5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b", 16)

    fun compress(w: ECPoint): ByteArray {
        val x = fixed(w.affineX)
        return byteArrayOf(if (w.affineY.testBit(0)) 3 else 2) + x
    }

    fun publicKey(pub: ByteArray): PublicKey? = runCatching {
        if (pub.size != PUB_BYTES || (pub[0].toInt() != 2 && pub[0].toInt() != 3)) return null
        val x = BigInteger(1, pub.copyOfRange(1, 33))
        if (x >= p) return null
        // y² = x³ - 3x + b; p ≡ 3 (mod 4), so √a = a^((p+1)/4).
        val rhs = x.modPow(BigInteger.valueOf(3), p).subtract(x.multiply(BigInteger.valueOf(3))).add(b).mod(p)
        var y = rhs.modPow(p.add(BigInteger.ONE).shiftRight(2), p)
        if (y.modPow(BigInteger.TWO, p) != rhs) return null // not on the curve
        if (y.testBit(0) != (pub[0].toInt() == 3)) y = p.subtract(y)
        KeyFactory.getInstance("EC").generatePublic(ECPublicKeySpec(ECPoint(x, y), params))
    }.getOrNull()

    private fun fixed(v: BigInteger): ByteArray {
        val raw = v.toByteArray()
        return when {
            raw.size == 32 -> raw
            raw.size > 32 -> raw.copyOfRange(raw.size - 32, raw.size)
            else -> ByteArray(32 - raw.size) + raw
        }
    }

    private fun derToRaw(der: ByteArray): ByteArray {
        // SEQUENCE { INTEGER r, INTEGER s }
        var i = 2
        if (der[1].toInt() and 0x80 != 0) i = 2 + (der[1].toInt() and 0x7F)
        fun readInt(): BigInteger {
            require(der[i].toInt() == 0x02)
            val len = der[i + 1].toInt() and 0xFF
            val v = BigInteger(1, der.copyOfRange(i + 2, i + 2 + len))
            i += 2 + len
            return v
        }
        val r = readInt()
        val s = readInt()
        return fixed(r) + fixed(s)
    }

    private fun rawToDer(raw: ByteArray): ByteArray {
        fun int(b: ByteArray): ByteArray {
            var v = b.dropWhile { it.toInt() == 0 }.toByteArray()
            if (v.isEmpty()) v = byteArrayOf(0)
            if (v[0].toInt() and 0x80 != 0) v = byteArrayOf(0) + v
            return byteArrayOf(0x02, v.size.toByte()) + v
        }
        val body = int(raw.copyOfRange(0, 32)) + int(raw.copyOfRange(32, 64))
        return byteArrayOf(0x30, body.size.toByte()) + body
    }

    @Suppress("unused")
    private fun privateScalar(k: PrivateKey) = (k as ECPrivateKey).s
}
