package nz.waveformlabs.moshpoint.locate

/**
 * A place to find instead of a person (the phone app: a spot a mate texted, docs/SPOT_LINKS.md).
 * No radio can hear a place, so the finder points at it from this phone's own GPS position and
 * its compass alone (core `PlaceRule`): no data or signal needed.
 */
data class FinderPlace(
    /** Its arrow is keyed by this, like a mate's by theirs. Must not be a mate's id. */
    val id: String,
    /** Only for status lines and recordings. */
    val name: String,
    val lat: Double,
    val lon: Double,
)
