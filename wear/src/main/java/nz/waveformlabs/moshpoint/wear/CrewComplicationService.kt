package nz.waveformlabs.moshpoint.wear

import android.app.PendingIntent
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.RangedValueComplicationData
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataTimeline
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingTimelineComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.TimeInterval
import androidx.wear.watchface.complications.datasource.TimelineEntry
import nz.waveformlabs.moshpoint.core.watch.CrewGlance
import java.time.Instant

/**
 * The watch-face complication: the nearest mate ("Sam", "40 m"), or "4/5" live when nobody's
 * distance is known. Never polled (update period 0 in the manifest): it is redrawn when the
 * phone pushes a change, and what it shows expires by itself.
 */
class CrewComplicationService : SuspendingTimelineComplicationDataSourceService() {
    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        data(type, CrewGlance.Nearest("Sam", 40.0, live = 4, total = 5))

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationDataTimeline? {
        CrewStore.init(this)
        val state = CrewStore.state.value
        val nowSec = System.currentTimeMillis() / 1000
        // As the phone saw it when it pushed...
        val then = CrewGlance.of(state, state?.sentAtSec ?: nowSec)
        val expires = (state?.sentAtSec ?: 0L) + Glance.COMPLICATION_KEEPS_SEC
        val living = then is CrewGlance.Nearest || then is CrewGlance.LiveCount
        if (state == null || !living || expires <= nowSec) {
            val settled = if (living) CrewGlance.Stale(state?.mates?.size ?: 0) else then
            return data(request.complicationType, settled)?.let { ComplicationDataTimeline(it, emptyList()) }
        }
        // ...shown until it's too old to stand behind, then "out of reach" with no one asked.
        val fresh = data(request.complicationType, then) ?: return null
        val stale = data(request.complicationType, CrewGlance.Stale(state.mates.size)) ?: return null
        return ComplicationDataTimeline(stale, listOf(TimelineEntry(TimeInterval(Instant.now(), Instant.ofEpochSecond(expires)), fresh)))
    }

    private fun data(type: ComplicationType, glance: CrewGlance): ComplicationData? {
        val says = plain(Glance.line(this, glance))
        val icon = MonochromaticImage.Builder(Icon.createWithResource(this, R.drawable.ic_mosh)).build()
        val tap = PendingIntent.getActivity(
            this, 0, Intent(this, CrewActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        // Short text has room for about seven characters: a distance or "4/5", with the name as its title.
        val short = when (glance) {
            is CrewGlance.Nearest -> distanceText(resources, glance.distanceM)
            is CrewGlance.LiveCount -> getString(R.string.glance_live_short, glance.live, glance.total)
            CrewGlance.Locked -> "+"
            else -> "–"
        }
        val title = when (glance) {
            is CrewGlance.Nearest -> glance.name
            is CrewGlance.LiveCount -> getString(R.string.mate_live)
            else -> null
        }
        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(plain(short), says)
                .setTitle(title?.let(::plain)).setMonochromaticImage(icon).setTapAction(tap).build()
            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(says, says)
                .setMonochromaticImage(icon).setTapAction(tap).build()
            ComplicationType.RANGED_VALUE -> {
                // The ring is how much of the crew is live.
                val (live, total) = when (glance) {
                    is CrewGlance.Nearest -> glance.live to glance.total
                    is CrewGlance.LiveCount -> glance.live to glance.total
                    else -> 0 to 1
                }
                RangedValueComplicationData.Builder(live.toFloat(), 0f, total.coerceAtLeast(1).toFloat(), says)
                    .setText(plain(short)).setTitle(title?.let(::plain)).setMonochromaticImage(icon).setTapAction(tap).build()
            }
            else -> null
        }
    }

    private fun plain(text: String) = PlainComplicationText.Builder(text).build()
}
