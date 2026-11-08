package nz.waveformlabs.moshpoint.core

/**
 * Each person's "Light me up" colour, worked out from their finding key, so their phone
 * and their friends' phones agree without sending anything: "look for Bevan's flashing BLUE".
 * Two people strobing at once are easy to tell apart.
 */
object BeaconColour {
    data class Colour(val argb: Long, val name: String)

    val palette = listOf(
        Colour(0xFFFF2E93, "pink"),
        Colour(0xFF22E4FF, "blue"),
        Colour(0xFFB6FF3B, "green"),
        Colour(0xFFFFB020, "orange"),
        Colour(0xFF9D5CFF, "purple"),
        Colour(0xFFFFFFFF, "white"),
    )

    fun forSecret(secret: ByteArray): Colour {
        val h = secret.fold(17) { acc, b -> acc * 31 + (b.toInt() and 0xFF) }
        return palette[Math.floorMod(h, palette.size)]
    }
}
