package nz.waveformlabs.moshpoint.wear

import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ColorBuilders.argb
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.DimensionBuilders.expand
import androidx.wear.protolayout.DimensionBuilders.sp
import androidx.wear.protolayout.DimensionBuilders.wrap
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import nz.waveformlabs.moshpoint.core.watch.CrewGlance
import nz.waveformlabs.moshpoint.core.watch.WatchState

/**
 * The crew status tile: the headline ("Sam · 40 m" or "4 of 5 live"), the next couple of
 * mates, and a Need help button that is there whatever else is (it opens the hold-to-send
 * screen). Tapping anywhere else opens the app.
 *
 * Refresh interval 0: the system never re-asks on a timer. It is redrawn when the phone pushes
 * a change ([Glance.requestRedraw]), and its timeline swaps to an "out of reach" version by
 * itself once that status is three minutes old.
 */
class CrewTileService : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        CrewStore.init(this)
        val state = CrewStore.state.value
        val nowSec = System.currentTimeMillis() / 1000
        val timeline = TimelineBuilders.Timeline.Builder()
        val current = CrewGlance.of(state, nowSec)
        if (state != null && (current is CrewGlance.Nearest || current is CrewGlance.LiveCount)) {
            // Good until the status is three minutes old...
            timeline.addTimelineEntry(
                TimelineBuilders.TimelineEntry.Builder()
                    .setLayout(LayoutElementBuilders.Layout.Builder().setRoot(layout(state, current, nowSec)).build())
                    .setValidity(
                        TimelineBuilders.TimeInterval.Builder()
                            .setStartMillis(0L)
                            .setEndMillis((state.sentAtSec + WatchState.FRESH_FOR_SEC) * 1000)
                            .build(),
                    )
                    .build(),
            )
            // ...then this, with no "live" claims, until the phone says something new.
            timeline.addTimelineEntry(TimelineBuilders.TimelineEntry.fromLayoutElement(layout(state, CrewGlance.Stale(state.mates.size), nowSec)))
        } else {
            timeline.addTimelineEntry(TimelineBuilders.TimelineEntry.fromLayoutElement(layout(state, current, nowSec)))
        }
        return Futures.immediateFuture(
            TileBuilders.Tile.Builder()
                .setResourcesVersion("1")
                .setFreshnessIntervalMillis(0)
                .setTileTimeline(timeline.build())
                .build(),
        )
    }

    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> =
        Futures.immediateFuture(ResourceBuilders.Resources.Builder().setVersion("1").build())

    private fun layout(state: WatchState?, glance: CrewGlance, nowSec: Long): LayoutElementBuilders.LayoutElement {
        val column = LayoutElementBuilders.Column.Builder()
            .setWidth(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
        val crew = state?.crewName?.takeIf { it.isNotBlank() && glance !is CrewGlance.Locked && glance != CrewGlance.NoPhone }
        if (crew != null) column.addContent(text(crew, 12f, FAINT, lines = 1))
        val wordy = glance == CrewGlance.NoPhone || glance == CrewGlance.NoCrew
        column.addContent(text(Glance.line(this, glance), if (wordy) 14f else 17f, if (glance is CrewGlance.Stale) AMBER else WHITE, lines = if (wordy) 3 else 2, bold = true))
        if (glance == CrewGlance.Locked) column.addContent(text(getString(R.string.plus_text), 13f, DIM, lines = 3))
        // The next couple of mates under the headline.
        val shownFirst = (glance as? CrewGlance.Nearest)?.name
        val live = glance is CrewGlance.Nearest || glance is CrewGlance.LiveCount
        if (live || glance is CrewGlance.Stale) {
            state?.mates.orEmpty().filter { it.name != shownFirst }.take(2).forEach { m ->
                val detail = when {
                    live && m.live(nowSec) -> m.distanceM?.let { distanceText(resources, it) } ?: getString(R.string.mate_live)
                    else -> agoText(resources, m.lastSeenSec, nowSec)
                }
                val line = if (detail.isBlank()) m.name else getString(R.string.glance_nearest, m.name, detail)
                column.addContent(text(line, 13f, DIM, lines = 1))
            }
        }
        column.addContent(LayoutElementBuilders.Spacer.Builder().setHeight(dp(6f)).build())
        column.addContent(helpButton())
        return LayoutElementBuilders.Box.Builder()
            .setWidth(expand())
            .setHeight(expand())
            .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
            .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(open("open", CrewActivity::class.java))
                    // Keep text off the curve: a round face is narrowest at the top and bottom.
                    .setPadding(ModifiersBuilders.Padding.Builder().setStart(dp(26f)).setEnd(dp(26f)).setTop(dp(20f)).setBottom(dp(14f)).build())
                    .build(),
            )
            .addContent(column.build())
            .build()
    }

    /** Need help: on the tile in every state. It opens the hold-to-send screen (a tap can't send by itself). */
    private fun helpButton(): LayoutElementBuilders.LayoutElement =
        LayoutElementBuilders.Box.Builder()
            .setWidth(wrap())
            .setHeight(wrap())
            .setModifiers(
                ModifiersBuilders.Modifiers.Builder()
                    .setClickable(open("help", SosActivity::class.java))
                    .setBackground(
                        ModifiersBuilders.Background.Builder()
                            .setColor(argb(HELP))
                            .setCorner(ModifiersBuilders.Corner.Builder().setRadius(dp(18f)).build())
                            .build(),
                    )
                    .setPadding(ModifiersBuilders.Padding.Builder().setStart(dp(14f)).setEnd(dp(14f)).setTop(dp(7f)).setBottom(dp(7f)).build())
                    .build(),
            )
            .addContent(text(getString(R.string.need_help), 14f, WHITE, lines = 1, bold = true))
            .build()

    private fun open(id: String, activity: Class<*>): ModifiersBuilders.Clickable =
        ModifiersBuilders.Clickable.Builder()
            .setId(id)
            .setOnClick(
                ActionBuilders.LaunchAction.Builder()
                    .setAndroidActivity(ActionBuilders.AndroidActivity.Builder().setPackageName(packageName).setClassName(activity.name).build())
                    .build(),
            )
            .build()

    private fun text(value: String, size: Float, colour: Int, lines: Int, bold: Boolean = false): LayoutElementBuilders.LayoutElement =
        LayoutElementBuilders.Text.Builder()
            .setText(value)
            .setMaxLines(lines)
            .setMultilineAlignment(LayoutElementBuilders.TEXT_ALIGN_CENTER)
            .setOverflow(LayoutElementBuilders.TEXT_OVERFLOW_ELLIPSIZE_END)
            .setFontStyle(
                LayoutElementBuilders.FontStyle.Builder()
                    .setSize(sp(size))
                    .setColor(argb(colour))
                    .setWeight(if (bold) LayoutElementBuilders.FONT_WEIGHT_BOLD else LayoutElementBuilders.FONT_WEIGHT_NORMAL)
                    .build(),
            )
            .build()

    private companion object {
        const val WHITE = 0xFFF7F5FF.toInt()
        const val DIM = 0xFFD9D4EC.toInt()
        const val FAINT = 0xFF8E87A6.toInt()
        const val AMBER = 0xFFFFB020.toInt()
        const val HELP = 0xFFFF3B5C.toInt()
    }
}
