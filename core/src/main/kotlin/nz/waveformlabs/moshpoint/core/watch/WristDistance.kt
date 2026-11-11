package nz.waveformlabs.moshpoint.core.watch

/**
 * A distance split into number and unit, with the phone finder's own rounding, so the wrist
 * and the phone always show the same figure: "4.5 m", "35 m", "1.2 km"; in the US "15 ft",
 * "0.8 mi"; in the UK metres up close and miles further out. The watch supplies the words for
 * the unit and formats the number for its language.
 */
object WristDistance {
    enum class Unit { M, KM, FT, MI }

    /** @param lessThan show as "<[value]" (right on top of them). */
    data class Parts(val value: Double, val decimals: Int, val unit: Unit, val lessThan: Boolean = false)

    /** Countries that measure in feet and miles. The UK uses miles for longer distances. */
    private val IMPERIAL = setOf("US", "LR", "MM")

    fun usesFeet(country: String): Boolean = country.uppercase() in IMPERIAL
    fun usesMiles(country: String): Boolean = usesFeet(country) || country.uppercase() == "GB"

    fun parts(metres: Double, country: String): Parts = parts(metres, usesFeet(country), usesMiles(country))

    fun parts(metres: Double, feet: Boolean, miles: Boolean): Parts {
        val m = metres.coerceAtLeast(0.0)
        if (feet) {
            val ft = m * 3.28084
            return when {
                ft < 3 -> Parts(3.0, 0, Unit.FT, lessThan = true)
                ft < 30 -> Parts(Math.round(ft).toDouble(), 0, Unit.FT)
                ft < 1000 -> Parts((Math.round(ft / 5) * 5).toDouble(), 0, Unit.FT)
                else -> Parts(m / 1609.344, 1, Unit.MI)
            }
        }
        return when {
            m < 1 -> Parts(1.0, 0, Unit.M, lessThan = true)
            m < 10 -> (Math.round(m * 10) / 10.0).let { Parts(it, if (Math.round(m * 10) % 10 == 0L) 0 else 1, Unit.M) }
            m < 1000 -> Parts((Math.round(m / 5) * 5).toDouble(), 0, Unit.M)
            miles -> Parts(m / 1609.344, 1, Unit.MI)
            else -> Parts(m / 1000, 1, Unit.KM)
        }
    }
}
