package nz.waveformlabs.moshpoint.wear

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import nz.waveformlabs.moshpoint.core.watch.CrewGlance
import nz.waveformlabs.moshpoint.core.watch.PingKind
import nz.waveformlabs.moshpoint.core.watch.WatchMate
import nz.waveformlabs.moshpoint.core.watch.WatchState

/**
 * The first screen: tonight's crew (tap a mate to find them), two quick pings, and Need help.
 * Need help is on it in every state, locked or not: asking for help is never paywalled.
 */
@Composable
fun CrewScreen(
    state: WatchState?,
    nowSec: Long,
    faces: Map<String, ImageBitmap>,
    /** A quick ping in flight or just answered: shown big over the list for a moment. */
    flash: PingFate? = null,
    onMate: (WatchMate) -> Unit = {},
    onPing: (PingKind) -> Unit = {},
    onHelp: () -> Unit = {},
) {
    val glance = CrewGlance.of(state, nowSec)
    val listState = rememberScalingLazyListState()
    val res = LocalContext.current.resources
    Scaffold(
        modifier = Modifier.background(Wrist.Ground),
        positionIndicator = { PositionIndicator(scalingLazyListState = listState) },
    ) {
        ScalingLazyColumn(
            modifier = Modifier.fillMaxSize(),
            state = listState,
            horizontalAlignment = Alignment.CenterHorizontally,
            contentPadding = PaddingValues(horizontal = 10.dp),
        ) {
            item {
                FitText(
                    when (glance) {
                        CrewGlance.Locked -> stringResource(R.string.plus_title)
                        else -> state?.crewName?.takeIf { it.isNotBlank() } ?: stringResource(R.string.crew_title)
                    },
                    Wrist.Name.copy(color = if (glance == CrewGlance.Locked) Wrist.Pink else Wrist.Text),
                    Modifier.fillMaxWidth(0.72f), maxLines = 1,
                )
            }
            when (glance) {
                CrewGlance.NoPhone -> item { Note(stringResource(R.string.crew_no_phone)) }
                CrewGlance.Locked -> item { Note(stringResource(R.string.plus_text)) }
                CrewGlance.NoCrew -> item { Note(stringResource(R.string.crew_empty)) }
                else -> {
                    if (glance is CrewGlance.Stale) item { Note(stringResource(R.string.crew_stale), Wrist.Amber) }
                    items(state?.mates.orEmpty(), key = { it.id }) { mate ->
                        MateChip(
                            mate, faces[mate.faceKey],
                            sub = when {
                                glance is CrewGlance.Stale -> agoText(res, mate.lastSeenSec, nowSec)
                                mate.live(nowSec) -> mate.distanceM?.let {
                                    stringResource(R.string.mate_live_distance, stringResource(R.string.mate_live), distanceText(res, it))
                                } ?: stringResource(R.string.mate_live)
                                else -> agoText(res, mate.lastSeenSec, nowSec)
                            },
                            live = glance !is CrewGlance.Stale && mate.live(nowSec),
                            onClick = { onMate(mate) },
                        )
                    }
                    item { PingChip(stringResource(R.string.ping_on_my_way)) { onPing(PingKind.ON_MY_WAY) } }
                    item { PingChip(stringResource(R.string.ping_all_good)) { onPing(PingKind.ALL_GOOD) } }
                }
            }
            item {
                Chip(
                    label = { ChipLabel(stringResource(R.string.need_help), Color.White) },
                    onClick = onHelp,
                    colors = ChipDefaults.chipColors(backgroundColor = Wrist.Help, contentColor = Color.White),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (flash != null) PingFlashOverlay(flash)
    }
}

@Composable
private fun Note(text: String, colour: Color = Wrist.TextDim) {
    FitText(text, Wrist.Body.copy(color = colour), Modifier.fillMaxWidth(0.82f).padding(vertical = 4.dp), maxLines = 3)
}

@Composable
private fun ChipLabel(text: String, colour: Color) {
    Text(
        text, style = Wrist.Label.copy(color = colour), maxLines = 2, overflow = TextOverflow.Ellipsis,
        textAlign = TextAlign.Start, modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun MateChip(mate: WatchMate, face: ImageBitmap?, sub: String, live: Boolean, onClick: () -> Unit) {
    Chip(
        label = { Text(mate.name, style = Wrist.Label, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        secondaryLabel = if (sub.isBlank()) null else ({
            Text(sub, style = Wrist.Body.copy(fontSize = 12.sp, color = if (live) Wrist.Lime else Wrist.TextFaint), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }),
        icon = { Face(face, mate.name, Color(mate.colour), ChipDefaults.LargeIconSize) },
        onClick = onClick,
        colors = ChipDefaults.chipColors(backgroundColor = Wrist.Deep, contentColor = Wrist.Text),
        modifier = Modifier.fillMaxWidth(),
    )
}

@Composable
private fun PingChip(text: String, onClick: () -> Unit) {
    Chip(
        label = { ChipLabel(text, Wrist.Text) },
        onClick = onClick,
        colors = ChipDefaults.chipColors(backgroundColor = Wrist.Deep, contentColor = Wrist.Text),
        modifier = Modifier.fillMaxWidth(),
    )
}

/** "Sent" / "Not sent", big and brief, so a ping's fate is clear without reading the list. */
@Composable
private fun PingFlashOverlay(fate: PingFate) {
    BoxWithConstraints(Modifier.fillMaxSize().background(Wrist.Ground.copy(alpha = 0.94f)), contentAlignment = Alignment.Center) {
        val w = maxWidth
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            FitText(
                stringResource(
                    when (fate) {
                        PingFate.SENDING -> R.string.sos_sending
                        PingFate.SENT -> R.string.ping_sent
                        PingFate.NEARBY -> R.string.ping_nearby
                        PingFate.WAITING -> R.string.ping_not_yet
                        PingFate.UNCONFIRMED -> R.string.sos_unconfirmed
                        PingFate.LOCKED -> R.string.plus_title
                        PingFate.OUT_OF_REACH, PingFate.NO_CREW -> R.string.ping_not_sent
                    },
                ),
                Wrist.Name.copy(
                    fontSize = 18.sp,
                    color = when (fate) {
                        PingFate.SENDING -> Wrist.TextDim
                        PingFate.SENT, PingFate.NEARBY -> Wrist.Lime
                        PingFate.WAITING, PingFate.UNCONFIRMED -> Wrist.Amber
                        PingFate.LOCKED -> Wrist.Pink
                        PingFate.OUT_OF_REACH, PingFate.NO_CREW -> Wrist.Help
                    },
                ),
                Modifier.width(w * 0.76f), maxLines = 2,
            )
            val detail = when (fate) {
                PingFate.OUT_OF_REACH -> R.string.sos_out_of_reach
                PingFate.NEARBY -> R.string.sos_nearby_detail
                PingFate.WAITING -> R.string.ping_waiting
                PingFate.UNCONFIRMED -> R.string.sos_no_answer
                PingFate.NO_CREW -> R.string.sos_no_crew
                PingFate.LOCKED -> R.string.plus_text
                PingFate.SENDING, PingFate.SENT -> null
            }
            if (detail != null) {
                Spacer(Modifier.height(4.dp))
                FitText(stringResource(detail), Wrist.Body, Modifier.width(w * 0.72f), maxLines = 3)
            }
        }
    }
}
