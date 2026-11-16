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

/**
 * Crew moments over mobile data (performance P1-8): a crew clip is up to 12 MB, and the crew sync
 * used to download every one in the background, over whatever network the phone had.
 *
 * A moment is one sealed file (docs/RELAY_API.md section 5): its listing says only when it was
 * posted, and nothing in it can be opened, not even a clip's first frame, until the whole file is
 * here. So what the board needs to show a moment exists is the whole file for a photo (a few
 * hundred KB) and nothing smaller for a clip. Hence:
 * - **In the background on a metered network** (mobile data): photos, and anything else up to
 *   [SMALL_BYTES]. A bigger one (a clip) is left for later: its size is read from the answer's
 *   `Content-Length` before any of it is (or, without one, the download stops at [SMALL_BYTES]),
 *   and it isn't asked for again in the background until the phone is on an unmetered network.
 * - **When someone opens the moments** (the Story: tapped to watch) **or on an unmetered network**
 *   (Wi-Fi): everything, as before.
 *
 * Data saver (Settings) keeps its meaning: how big the photos and clips we **share** are. It
 * doesn't change what we download.
 */
object MomentFetch {
    /** A photo is at most 2048 px at JPEG 90%, well under this; most clips are well over. */
    const val SMALL_BYTES = 2_000_000L

    /** The most to download of one moment now: [opened] = the Story is open; [unmetered] = Wi-Fi or another unmetered network. */
    fun limit(opened: Boolean, unmetered: Boolean, maxFile: Long): Long = if (opened || unmetered) maxFile else minOf(SMALL_BYTES, maxFile)

    /** Download a moment of [bytes] (its `Content-Length`; -1 if not given) now, or leave it for later? */
    fun now(bytes: Long, opened: Boolean, unmetered: Boolean, maxFile: Long): Boolean = bytes <= limit(opened, unmetered, maxFile)

    /** A moment left for later (too big for the background on mobile data): ask for it again now? */
    fun retryLeftOver(opened: Boolean, unmetered: Boolean): Boolean = opened || unmetered
}
