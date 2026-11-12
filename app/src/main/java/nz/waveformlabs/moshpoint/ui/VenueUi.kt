package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.Floor
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.venue.VenueMaps

// The venue map's bits of screen (docs/VENUE_MAP.md): the crew card's one line about the
// offline map, and the upstairs/downstairs tag.

/**
 * The crew card's one line about the venue's offline map: saving, saved, waiting for a
 * connection, or "saves when you get there". Nothing to tap: it looks after itself.
 */
@Composable
internal fun VenueMapLine(status: VenueMaps.Status, modifier: Modifier = Modifier) {
    val (text, colour) = when (status.line) {
        VenueMaps.Line.NONE -> return
        VenueMaps.Line.SAVED -> stringResource(R.string.venue_map_saved) to Mosh.Lime
        VenueMaps.Line.SAVING -> stringResource(R.string.venue_map_saving, status.percent.coerceIn(0, 100)) to Mosh.TextDim
        VenueMaps.Line.WAITING -> stringResource(R.string.venue_map_waiting) to Mosh.TextFaint
        VenueMaps.Line.ON_ARRIVAL -> stringResource(R.string.venue_map_on_arrival) to Mosh.TextFaint
    }
    Row(modifier.padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(text, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = colour), maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/** The map was opened at the gig: [venue] is where it opens, [me] where the phone was just then. */
class VenueView(val venue: LatLon, val me: LatLon?)

/** "↑ Upstairs" / "↓ Downstairs", in the user's language. */
@Composable
internal fun floorLabel(floor: Floor): String = stringResource(if (floor == Floor.UP) R.string.venue_floor_up else R.string.venue_floor_down)

/** The same for screen readers: "upstairs" / "downstairs". */
@Composable
internal fun floorSpoken(floor: Floor): String = stringResource(if (floor == Floor.UP) R.string.venue_floor_up_spoken else R.string.venue_floor_down_spoken)

/** The tag as a small pill, to sit on a mate's face or beside their name. */
@Composable
internal fun FloorTag(floor: Floor, modifier: Modifier = Modifier) {
    Text(
        floorLabel(floor),
        style = Mosh.Label.copy(fontSize = 11.sp, lineHeight = 13.sp, color = Mosh.Ground),
        maxLines = 1,
        softWrap = false,
        modifier = modifier.background(Mosh.Cyan, RoundedCornerShape(9.dp)).padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

/** The tag drawn straight onto a canvas (the finder's arrows and radar), centred on [centre]. */
internal fun DrawScope.drawFloorPill(text: String, centre: Offset, paint: android.graphics.Paint, textPx: Float) {
    paint.textSize = textPx
    val w = paint.measureText(text) + 12.dp.toPx()
    val h = textPx + 7.dp.toPx()
    drawRoundRect(Mosh.Ground, Offset(centre.x - w / 2 - 1.5f.dp.toPx(), centre.y - h / 2 - 1.5f.dp.toPx()), Size(w + 3.dp.toPx(), h + 3.dp.toPx()), CornerRadius(h / 2 + 1.5f.dp.toPx()))
    drawRoundRect(Mosh.Cyan, Offset(centre.x - w / 2, centre.y - h / 2), Size(w, h), CornerRadius(h / 2))
    drawCentred(text, centre, textPx, Mosh.Ground, paint)
}
