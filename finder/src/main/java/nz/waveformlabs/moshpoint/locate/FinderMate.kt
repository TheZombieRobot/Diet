package nz.waveformlabs.moshpoint.locate

import nz.waveformlabs.moshpoint.core.EphemeralId

/**
 * Someone this phone can find, or who may be looking for it. The app's own type implements
 * this (the phone app's `Friend`), so callbacks hand back the app's own objects.
 */
interface FinderMate {
    /** Stable id: fixes, arrows and callbacks are keyed by it. */
    val id: String

    /** Only for status lines and recordings. */
    val name: String

    /**
     * The key shared with them: recognises their rotating code, opens their sealed location
     * and gives the UWB session id and key.
     */
    val secret: ByteArray

    /**
     * Their rotating code, from [secret]. Keep one instance per mate and hand back the same one
     * every time: it remembers recent codes, and matching runs for every advert heard.
     */
    val ephemeralId: EphemeralId
}
