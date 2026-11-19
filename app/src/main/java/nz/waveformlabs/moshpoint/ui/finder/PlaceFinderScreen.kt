package nz.waveformlabs.moshpoint.ui.finder

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.ui.GlassButton
import nz.waveformlabs.moshpoint.ui.GlowBackground
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.RadarPulse
import nz.waveformlabs.moshpoint.ui.home.SetupIssue

/**
 * The finder pointed at a place instead of a mate (docs/SPOT_LINKS.md): a spot a mate texted.
 *
 * A screen of its own, made of the finder's pieces, so the mate finder stays exactly as it was:
 * the arrow (the map's meet-up pin at its tip), the distance and how sure it is, all from this
 * phone's GPS and compass, so it works with no data or signal. Nothing here is for a person: no
 * message, no Light me up, no scan. Until the phone has a fix, it says it's waiting for one.
 */
@Composable
fun PlaceFinderScreen(
    /** The place's id: its arrow is keyed by it. */
    id: String,
    /** What it's called on the map: the sender's name, or "Texted spot". */
    title: String,
    /** A line under the title saying what it is, when [title] is a name ("Texted spot"); null: none. */
    caption: String?,
    visible: Boolean,
    arrows: List<ArrowState>,
    onOpenMap: () -> Unit,
    onBack: () -> Unit,
    /** Location is off: shown at the top with its fix button. */
    warning: SetupIssue? = null,
) {
    val hasBack = androidx.activity.compose.LocalOnBackPressedDispatcherOwner.current != null // false in screenshot tests
    if (hasBack) androidx.activity.compose.BackHandler(onBack = onBack)
    val arrow = arrows.firstOrNull { it.friendId == id } as? ArrowState.Pointing
    if (arrow != null) FindHaptics(listOf(arrow))
    // The meet-up pin's pink while pointing (a place has no colour of its own), ultraviolet while waiting.
    val mood by animateColorAsState(if (arrow != null) Mosh.Pink else Mosh.Violet, tween(900), label = "mood")

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
        GlowBackground { listOf(Mosh.Violet, mood, Mosh.Pink) }
        Column(Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = 12.dp, bottom = 24.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                TextButton(onClick = onBack) {
                    Text(stringResource(R.string.find_back_friends), style = Mosh.Label.copy(fontWeight = FontWeight.Medium, fontSize = 15.sp))
                }
                Spacer(Modifier.weight(1f))
                LivePill(visible)
            }
            if (warning != null) {
                Row(
                    Modifier.fillMaxWidth().padding(top = 8.dp).background(Color(0xFF3A2A12), RoundedCornerShape(14.dp))
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(warning.text, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.Amber), modifier = Modifier.weight(1f))
                    TextButton(onClick = warning.onFix) { Text(warning.button, style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber)) }
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(stringResource(R.string.find_eyebrow_finding), style = Mosh.Eyebrow)
            Spacer(Modifier.height(6.dp))
            Text(
                title,
                style = if (title.length > 12) Mosh.Title.copy(fontSize = 26.sp) else Mosh.Title,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
            )
            if (caption != null) {
                Text(caption, style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.TextFaint), modifier = Modifier.padding(vertical = 6.dp))
            }

            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                if (arrow == null) {
                    Searching(title, heading = stringResource(R.string.spot_finder_waiting), help = stringResource(R.string.spot_finder_waiting_help))
                } else {
                    // Radar rings around the arrow, as for a mate.
                    Box(Modifier.fillMaxSize(0.92f)) { RadarPulse({ mood.copy(alpha = 0.7f) }) }
                    Arrows(listOf(arrow), friendOf = { null }, group = false, places = mapOf(id to title))
                }
            }

            if (arrow != null) {
                Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                    DistanceReadout(arrow.distanceM)
                    Spacer(Modifier.height(8.dp))
                    // Sure: head this way. Rough (our GPS as vague as the gap, or a while since the
                    // last fix): it firms up as you walk, as it does for a mate's GPS.
                    Chip(
                        if (arrow.unsure) stringResource(R.string.find_chip_rough) else stringResource(R.string.find_chip_locked),
                        if (arrow.unsure) Mosh.Amber else Mosh.Lime,
                        if (arrow.unsure) stringResource(R.string.find_from_gps) else stringResource(R.string.find_head_this_way),
                    )
                }
                Spacer(Modifier.height(20.dp))
            }
            GlassButton(stringResource(R.string.find_show_on_map), onClick = onOpenMap)
        }
    }
}
