package nz.waveformlabs.moshpoint.core

/**
 * Sealed uploads to our own relay (docs/RELAY_API.md sections 4, 5 and 11.5). The relay refuses a
 * moment or a profile photo with `400` when its sealed bytes start like an ordinary file (a JPEG,
 * PNG, video...): by chance, about once in 2.5 million. Sealing it again (a new nonce) gives other
 * bytes, so a `400` means "seal it again and send it once more". Only once: a second `400` is a
 * real refusal (a wrong size, a body cut off), and sending it again won't help.
 */
object Reseal {
    /** Sends in all, the first included. */
    const val TRIES = 2

    /** After HTTP [code] on send number [attempt] (1 = the first), seal again and send once more? */
    fun again(code: Int, attempt: Int): Boolean = code == 400 && attempt < TRIES
}
