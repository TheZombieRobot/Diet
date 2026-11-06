package nz.waveformlabs.moshpoint.core

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * The bytes inside every Moshpoint Bluetooth advert (the service data).
 *
 * ```
 * [flags:1][rotating id:16][encrypted UWB block: 0, 2 or 4 bytes]
 * ```
 *
 * - `rotating id` is from [EphemeralId]: only friends can recognise it.
 * - The UWB block carries what a friend needs to start UWB ranging with us, so we never
 *   need a Bluetooth connection or a server round-trip to set UWB up:
 *   - [UwbRole.CONTROLEE] (a visible phone waiting to be found): our 2-byte UWB address.
 *   - [UwbRole.CONTROLLER] (a phone that is looking for friends): 2-byte address,
 *     UWB channel and preamble index.
 *   It is XOR-encrypted with a keystream derived from our secret and rotating id, so
 *   strangers can't read it or link it across rotations.
 *
 * Max size is 21 bytes, which keeps the whole advert under the 31-byte legacy limit.
 */
data class Advert(
    val id: ByteArray,
    val uwb: UwbInfo?,
    /**
     * Set by a phone that is looking for friends. A visible phone that hears a friend
     * looking speeds up its own advert so they get a fast, steady signal; otherwise it
     * advertises slowly to save battery.
     */
    val looking: Boolean = false,
) {

    enum class UwbRole { CONTROLEE, CONTROLLER }

    /** UWB out-of-band parameters. [channel] / [preamble] are only set for controllers. */
    data class UwbInfo(val role: UwbRole, val address: ByteArray, val channel: Int = 0, val preamble: Int = 0) {
        init {
            require(address.size == 2) { "UWB short address is 2 bytes" }
            require(channel in 0..255 && preamble in 0..255)
        }

        override fun equals(other: Any?) = other is UwbInfo && role == other.role &&
            address.contentEquals(other.address) && channel == other.channel && preamble == other.preamble

        override fun hashCode() = role.hashCode() * 31 + address.contentHashCode()
    }

    override fun equals(other: Any?) = other is Advert && id.contentEquals(other.id) && uwb == other.uwb && looking == other.looking
    override fun hashCode() = id.contentHashCode()

    companion object {
        private const val FLAG_CONTROLEE = 0x01
        private const val FLAG_CONTROLLER = 0x02
        private const val FLAG_LOOKING = 0x04

        /** Builds the service-data bytes. [secret] is the advertiser's own secret. */
        fun encode(secret: ByteArray, id: ByteArray, uwb: UwbInfo?, looking: Boolean = false): ByteArray {
            require(id.size == EphemeralId.ID_BYTES)
            val plain = when (uwb?.role) {
                null -> ByteArray(0)
                UwbRole.CONTROLEE -> uwb.address
                UwbRole.CONTROLLER -> uwb.address + byteArrayOf(uwb.channel.toByte(), uwb.preamble.toByte())
            }
            val flags = when (uwb?.role) {
                null -> 0
                UwbRole.CONTROLEE -> FLAG_CONTROLEE
                UwbRole.CONTROLLER -> FLAG_CONTROLLER
            }
            val allFlags = flags or (if (looking) FLAG_LOOKING else 0)
            return byteArrayOf(allFlags.toByte()) + id + xor(plain, keystream(secret, id, plain.size))
        }

        /** Just the rotating id, so a scanner can match it against friends before decrypting. */
        fun idOf(data: ByteArray): ByteArray? =
            if (data.size >= 1 + EphemeralId.ID_BYTES) data.copyOfRange(1, 1 + EphemeralId.ID_BYTES) else null

        /** Decodes an advert once we know whose it is ([secret] = that friend's secret). */
        fun decode(secret: ByteArray, data: ByteArray): Advert? {
            val id = idOf(data) ?: return null
            val flags = data[0].toInt() and 0xFF
            val body = data.copyOfRange(1 + EphemeralId.ID_BYTES, data.size)
            val plain = xor(body, keystream(secret, id, body.size))
            val uwb = when {
                flags and FLAG_CONTROLLER != 0 && plain.size >= 4 ->
                    UwbInfo(UwbRole.CONTROLLER, plain.copyOfRange(0, 2), plain[2].toInt() and 0xFF, plain[3].toInt() and 0xFF)
                flags and FLAG_CONTROLEE != 0 && plain.size >= 2 ->
                    UwbInfo(UwbRole.CONTROLEE, plain.copyOfRange(0, 2))
                else -> null
            }
            return Advert(id, uwb, looking = flags and FLAG_LOOKING != 0)
        }

        private fun keystream(secret: ByteArray, id: ByteArray, n: Int): ByteArray {
            if (n == 0) return ByteArray(0)
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(secret, "HmacSHA256"))
            mac.update("moshpoint-advert-uwb".toByteArray())
            return mac.doFinal(id).copyOf(n)
        }

        private fun xor(a: ByteArray, b: ByteArray) = ByteArray(a.size) { (a[it].toInt() xor b[it].toInt()).toByte() }
    }
}

/**
 * UWB session parameters both sides derive on their own, from the controller's secret
 * (every friend of the controller knows it) and the controller's UWB address (in its advert).
 * Nothing secret goes over the air.
 */
object UwbSessionKeys {
    /** Positive 31-bit session id. */
    fun sessionId(controllerSecret: ByteArray, controllerAddress: ByteArray): Int {
        val h = hmac(controllerSecret, "uwb-session".toByteArray() + controllerAddress)
        return ((h[0].toInt() and 0x7F) shl 24) or ((h[1].toInt() and 0xFF) shl 16) or
            ((h[2].toInt() and 0xFF) shl 8) or (h[3].toInt() and 0xFF)
    }

    /** 8-byte static-STS session key info (vendor id + STS IV) used by DS-TWR configs. */
    fun sessionKey(controllerSecret: ByteArray, controllerAddress: ByteArray): ByteArray =
        hmac(controllerSecret, "uwb-key".toByteArray() + controllerAddress).copyOf(8)

    private fun hmac(key: ByteArray, msg: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(msg)
    }
}
