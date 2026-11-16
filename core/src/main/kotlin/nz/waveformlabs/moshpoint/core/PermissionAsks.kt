package nz.waveformlabs.moshpoint.core

/**
 * When the app asks for its permissions, without nagging (docs/WAVE2_PLAY.md, item 8). The phone
 * side (MainActivity's PermissionsState) feeds in what Android says.
 */
object PermissionAsks {
    /**
     * Will Android show its prompt for the permissions still [missing]? Before the app has ever
     * asked, yes. After that only while Android's "show rationale" flag is set for one of them
     * ([rationale]): after two denials (or "Don't ask again") it answers no by itself without
     * showing anything, and only the app's page in Settings can allow them.
     */
    fun androidWillAsk(missing: Boolean, askedBefore: Boolean, rationale: Boolean): Boolean =
        missing && (!askedBefore || rationale)

    /**
     * Ask at a fresh start (never after a rotation)? Only once the welcome is done (it asks
     * itself) and something is [missing]. If that includes location or nearby devices
     * ([needsDisclosure]), the disclosure comes first, so not after the person said "Not now" to
     * it, and not when Android wouldn't show its prompt after it ([androidWillAskDisclosed]):
     * then the home's "allow" banner offers Settings instead.
     */
    fun askAtLaunch(
        onboarded: Boolean,
        missing: Boolean,
        needsDisclosure: Boolean,
        saidNotNow: Boolean,
        androidWillAskDisclosed: Boolean,
    ): Boolean = when {
        !onboarded || !missing -> false
        needsDisclosure -> !saidNotNow && androidWillAskDisclosed
        else -> true
    }
}
