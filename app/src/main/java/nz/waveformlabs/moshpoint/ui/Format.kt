package nz.waveformlabs.moshpoint.ui

import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import java.text.DateFormat
import java.text.NumberFormat
import java.util.Date
import java.util.Locale

/*
 * Times, distances and dates, in the user's language and country's style:
 * "5 min ago" / "vor 5 Min." / "5分前", "1.2 km" / "1,2 km" / "0.7 mi", local date order.
 * Words come from res/values-xx/strings_format.xml; numbers and dates from the locale.
 */

/** Countries that measure distance in feet and miles. The UK uses miles for longer distances. */
private val IMPERIAL = setOf("US", "LR", "MM")

internal fun usesMiles(locale: Locale = Locale.getDefault()) = locale.country in IMPERIAL || locale.country == "GB"
private fun usesFeet(locale: Locale = Locale.getDefault()) = locale.country in IMPERIAL

private fun number(v: Double, decimals: Int): String =
    NumberFormat.getNumberInstance(Locale.getDefault()).apply {
        maximumFractionDigits = decimals
        minimumFractionDigits = decimals
    }.format(v)

/** "just now", "4 min ago", "2 h ago", "3 days ago". */
internal fun ago(seconds: Long): String = when {
    seconds < 60 -> Txt.s(R.string.time_just_now)
    seconds < 3600 -> (seconds / 60).toInt().let { Txt.p(R.plurals.time_min_ago, it) }
    seconds < 48 * 3600 -> (seconds / 3600).toInt().let { Txt.p(R.plurals.time_hours_ago, it) }
    else -> (seconds / 86400).toInt().let { Txt.p(R.plurals.time_days_ago, it) }
}

/** "live · 64%", "battery died here · 5 min ago", "12 min ago". */
internal fun statusLine(s: LocationBook.Seen, ageSec: Long, liveWord: Boolean = false): String {
    val time = if (liveWord && ageSec < 120) Txt.s(R.string.time_live) else ago(ageSec)
    val pct = s.batteryPct
    return when {
        s.lastGasp -> Txt.s(R.string.status_battery_died, time)
        pct != null -> Txt.s(R.string.status_time_battery, time, pct)
        else -> time
    }
}

/**
 * A distance for map pins and lists: "40 m", "1.2 km", "31 km"; in the US "130 ft", "0.8 mi";
 * in the UK metres up close and miles further out.
 */
internal fun distanceLabel(m: Double): String {
    if (usesMiles()) {
        val miles = m / 1609.344
        return when {
            usesFeet() && miles < 0.2 -> Txt.s(R.string.dist_ft, number(((m * 3.28084) / 10).toInt() * 10.0, 0))
            !usesFeet() && m < 1000 -> Txt.s(R.string.dist_m, number(((m / 10).toInt() * 10).toDouble(), 0))
            miles < 10 -> Txt.s(R.string.dist_mi, number(miles, 1))
            else -> Txt.s(R.string.dist_mi, number(miles.toInt().toDouble(), 0))
        }
    }
    return when {
        m < 1000 -> Txt.s(R.string.dist_m, number(((m / 10).toInt() * 10).toDouble(), 0))
        m < 10_000 -> Txt.s(R.string.dist_km, number(m / 1000, 1))
        else -> Txt.s(R.string.dist_km, number((m / 1000).toInt().toDouble(), 0))
    }
}

/** "Sat 14 Dec, 8:00 pm" in the local style (day/month order, 24 h clocks, local words). */
internal fun gigWhen(startsAtSec: Long): String {
    val d = Date(startsAtSec * 1000)
    val skeleton = android.text.format.DateFormat.getBestDateTimePattern(Locale.getDefault(), "EEEdMMM")
    val day = java.text.SimpleDateFormat(skeleton, Locale.getDefault()).format(d)
    return "$day, " + DateFormat.getTimeInstance(DateFormat.SHORT, Locale.getDefault()).format(d)
}

/** "tonight", "tomorrow", "in 5 days", "in 3 weeks", "in 2 months". */
internal fun countdown(startsAtSec: Long, nowSec: Long): String? {
    if (startsAtSec <= 0) return null
    val zone = java.util.TimeZone.getDefault()
    fun day(t: Long) = Math.floorDiv(t * 1000 + zone.getOffset(t * 1000), 86_400_000L)
    val days = (day(startsAtSec) - day(nowSec)).toInt()
    return when {
        days < 0 -> null
        days == 0 -> Txt.s(R.string.countdown_tonight)
        days == 1 -> Txt.s(R.string.countdown_tomorrow)
        days < 14 -> Txt.p(R.plurals.countdown_days, days)
        days < 60 -> Txt.p(R.plurals.countdown_weeks, days / 7)
        else -> Txt.p(R.plurals.countdown_months, days / 30)
    }
}

/**
 * The finder's big distance, more precise up close: number and unit apart, so the number can
 * roll. Metric: "4.5" "m", "35" "m", "1.2" "km". US: "15" "ft", "0.8" "mi". UK: metres up
 * close, miles further out. Null number = no reading; "<1" when right on top of them.
 */
internal data class FinderDistance(val number: String, val unit: String)

internal fun finderDistance(m: Double?): FinderDistance? {
    m ?: return null
    if (usesFeet()) {
        val ft = m * 3.28084
        return when {
            ft < 3 -> FinderDistance("<3", Txt.s(R.string.unit_ft))
            ft < 1000 -> FinderDistance(number(if (ft < 30) Math.round(ft).toDouble() else (Math.round(ft / 5) * 5).toDouble(), 0), Txt.s(R.string.unit_ft))
            else -> FinderDistance(number(m / 1609.344, 1), Txt.s(R.string.unit_mi))
        }
    }
    return when {
        m < 1 -> FinderDistance("<1", Txt.s(R.string.unit_m))
        m < 10 -> FinderDistance(number(Math.round(m * 10) / 10.0, if (Math.round(m * 10) % 10 == 0L) 0 else 1), Txt.s(R.string.unit_m))
        m < 1000 -> FinderDistance(number((Math.round(m / 5) * 5).toDouble(), 0), Txt.s(R.string.unit_m))
        usesMiles() -> FinderDistance(number(m / 1609.344, 1), Txt.s(R.string.unit_mi))
        else -> FinderDistance(number(m / 1000, 1), Txt.s(R.string.unit_km))
    }
}

/** The same as one piece of text ("4.5 m", "15 ft"), for small labels. */
internal fun finderDistanceLabel(m: Double?): String =
    finderDistance(m)?.let { Txt.s(R.string.dist_number_unit, it.number, it.unit) } ?: "?"
