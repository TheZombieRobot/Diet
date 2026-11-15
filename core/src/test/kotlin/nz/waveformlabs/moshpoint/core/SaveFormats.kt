package nz.waveformlabs.moshpoint.core

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream

/**
 * Test helpers for the saved outbox and private threads: the same state as version 1 wrote it
 * (no blocks), or as a later version might (version 3: extra fields at the end of every block,
 * and a section added at the end of the file). Made from a version 2 save.
 */
internal object SaveFormats {
    fun courierAs(v2: ByteArray, version: Int, extra: Boolean): ByteArray = convert(v2, version, extra) { d, o, copy ->
        repeat(d.readInt().also { o.writeInt(it) }) { copy() }
    }

    fun privateAs(v2: ByteArray, version: Int, extra: Boolean): ByteArray = convert(v2, version, extra) { d, o, copy ->
        repeat(d.readInt().also { o.writeInt(it) }) {
            copy()
            repeat(d.readInt().also { o.writeInt(it) }) { copy() }
        }
        repeat(d.readInt().also { o.writeInt(it) }) { copy() }
    }

    private fun convert(
        v2: ByteArray,
        version: Int,
        extra: Boolean,
        walk: (DataInputStream, DataOutputStream, () -> Unit) -> Unit,
    ): ByteArray {
        val d = DataInputStream(ByteArrayInputStream(v2))
        val out = ByteArrayOutputStream()
        val o = DataOutputStream(out)
        check(d.readUnsignedByte() == 2) { "expected a version 2 save" }
        o.writeByte(version)
        walk(d, o) {
            val block = ByteArray(d.readInt()).also { d.readFully(it) }
            if (version == 1) {
                o.write(block)
            } else {
                val more = if (extra) byteArrayOf(9, 9, 9, 9, 9) else ByteArray(0)
                o.writeInt(block.size + more.size)
                o.write(block)
                o.write(more)
            }
        }
        o.write(d.readBytes()) // the rest was never in blocks
        if (extra) {
            o.writeInt(3)
            o.write(byteArrayOf(1, 2, 3))
        }
        o.flush()
        return out.toByteArray()
    }
}
