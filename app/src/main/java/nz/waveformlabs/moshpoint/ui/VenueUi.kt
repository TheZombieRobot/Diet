package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R
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
