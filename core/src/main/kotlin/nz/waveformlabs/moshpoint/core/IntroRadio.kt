package nz.waveformlabs.moshpoint.core

/**
 * What the crew-intro loop (the app's GroupSync, every 2.5 s) does with Bluetooth each round.
 *
 * Worked out afresh every round: while Bluetooth is off Android reports no extended adverts and
 * no room for adverts at all (a maximum length of 0), so nothing decided then may stick. The loop
 * once decided at its start, and a phone that started it with Bluetooth off never put an intro
 * on air all night, even after Bluetooth came on (the Bluetooth-on event only reaches the crew
 * sync while the finder or Live is running).
 */
class IntroRadio(private val follower: Boolean) {
    /** Bluetooth's state last round; null before the first. */
    private var wasOn: Boolean? = null

    data class Round(
        /** Bluetooth has just come (back) on: the advert set and the shared scan died with it. */
        val revive: Boolean,
        /** Listen for intros (if not already). */
        val listen: Boolean,
        /** Put an intro on air this round. */
        val advertise: Boolean,
    )

    fun round(bluetoothOn: Boolean, extendedAdverts: Boolean, maxAdvertisingDataLength: Int): Round {
        val revive = bluetoothOn && wasOn == false
        wasOn = bluetoothOn
        // Followers (at home) never use Bluetooth.
        if (follower) return QUIET
        val usable = bluetoothOn && extendedAdverts
        return Round(revive = revive, listen = usable, advertise = usable && fits(maxAdvertisingDataLength))
    }

    companion object {
        /** An extended advert's service-data header with a 128-bit UUID (18 bytes), and 4 spare. */
        const val ADVERT_HEADER = 22

        val QUIET = Round(revive = false, listen = false, advertise = false)

        /** Room for the biggest intro (the second form) in one advert of [maxAdvertisingDataLength] bytes. */
        fun fits(maxAdvertisingDataLength: Int): Boolean = maxAdvertisingDataLength >= GigGroup.MAX_INTRO2_BYTES + ADVERT_HEADER
    }
}
