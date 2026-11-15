package nz.waveformlabs.moshpoint.ui.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.moments.Moments
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.moments.Polaroid
import nz.waveformlabs.moshpoint.ui.map.VenueMapLine
import nz.waveformlabs.moshpoint.ui.ago
import nz.waveformlabs.moshpoint.ui.qrBitmap
import nz.waveformlabs.moshpoint.venue.VenueMaps

// The home screen's crew sections, top to bottom (docs/design/home-redesign): the header, the
// one thing to fix first, the crew's header and activity, the Story strip, the check-in banner
// and the crew QR. The rest of the home: HomeHeroes, HomeGigLists, HomePanels and HomeBar.

/** The header: the wordmark, and Need help (which only opens the help dialog). */
@Composable
internal fun HomeHeader(onHelp: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.home_ping_need_help)
    val measurer = rememberTextMeasurer()
    // Need help sits beside the wordmark when its longest word fits there at its smallest size;
    // otherwise (a small phone with a large font) it gets a row of its own, at the end.
    val mark: @Composable () -> Unit = { Wordmark() }
    val pill: @Composable () -> Unit = { HelpPill(onHelp) }
    Layout(contents = listOf(mark, pill), modifier = modifier.fillMaxWidth().padding(horizontal = HomeSide)) { m, constraints ->
        val width = constraints.maxWidth
        val markP = m[0].first().measure(Constraints())
        val room = width - markP.width - 12.dp.roundToPx()
        val longest = label.split(' ').maxOf { w -> measurer.measure(w, HomeType.Label.copy(fontSize = 12.sp), softWrap = false, maxLines = 1).size.width }
        if (longest + HelpPillChrome.roundToPx() + 2 <= room) {
            val pillP = m[1].first().measure(Constraints(maxWidth = room))
            val h = maxOf(markP.height, pillP.height)
            layout(width, h) {
                markP.placeRelative(0, (h - markP.height) / 2)
                pillP.placeRelative(width - pillP.width, (h - pillP.height) / 2)
            }
        } else {
            val pillP = m[1].first().measure(Constraints(maxWidth = width))
            val gap = 4.dp.roundToPx()
            layout(width, markP.height + gap + pillP.height) {
                markP.placeRelative(0, 0)
                pillP.placeRelative(width - pillP.width, markP.height + gap)
            }
        }
    }
}

/** "One thing first": the one thing to fix next (a permission, then each switch), with its fix. */
@Composable
internal fun SetupCard(eyebrow: String, text: String, button: String, onFix: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(18.dp)
    Column(
        modifier.padding(horizontal = HomeSide).fillMaxWidth().clip(shape)
            .background(Mosh.Amber.copy(alpha = 0.10f))
            .border(1.dp, Mosh.Amber.copy(alpha = 0.45f), shape)
            .padding(16.dp),
    ) {
        Kicker(eyebrow, colour = Mosh.Amber)
        Spacer(Modifier.height(6.dp))
        Text(text, style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 20.sp, color = Mosh.Text))
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = onFix,
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Mosh.Amber, contentColor = Mosh.Ground),
            modifier = Modifier.heightIn(min = 48.dp),
        ) { Text(button, style = HomeType.Label.copy(fontSize = 14.sp, color = Mosh.Ground), textAlign = TextAlign.Center) }
    }
}

/**
 * The crew's name and the ⋯ crew menu, then what's known about it: how many are in and live,
 * who follows from home (nobody is followed without knowing), when, and the venue map.
 */
@Composable
internal fun CrewHeader(
    eyebrow: String,
    name: String,
    count: String?,
    followers: List<String>,
    whenText: String?,
    venueMap: VenueMaps.Status?,
    onMenu: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = HomeSide)) {
        Kicker(eyebrow)
        Spacer(Modifier.height(2.dp))
        Row(verticalAlignment = Alignment.Top) {
            Text(
                name, style = HomeType.Hero, maxLines = 3, overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(top = 6.dp).semantics { heading() },
            )
            Spacer(Modifier.width(12.dp))
            RoundIconButton(HomeIcons.More, stringResource(R.string.home_crew_options), onMenu)
        }
        if (count != null) DotLineText(count, HomeType.Small)
        if (followers.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                HomeIcon(HomeIcons.House, Mosh.Lilac, 16.dp)
                Spacer(Modifier.width(8.dp))
                Text(stringResource(R.string.home_following_from_home_names, followers.joinToString(", ")), style = HomeType.Small.copy(color = Mosh.Lilac))
            }
        }
        if (whenText != null) {
            Spacer(Modifier.height(4.dp))
            DotLineText(whenText, HomeType.Small.copy(color = Mosh.TextDim))
        }
        if (venueMap != null) VenueMapLine(venueMap)
    }
}

/**
 * Under the crew's buttons: the meet-up with the latest crew alert under it (tap = the map),
 * more alerts for followers, and the pinned plan (tap = the crew chat).
 */
@Composable
internal fun ActivityBlock(
    meetUp: String?,
    pings: List<GigGroup.Ping>,
    nowSec: Long,
    describe: (Int) -> String,
    plan: String?,
    onMap: () -> Unit,
    onPlan: (() -> Unit)?,
    modifier: Modifier = Modifier,
) {
    val lines = pings.map { p ->
        Pair(dotLine(listOf(stringResource(R.string.home_ping_line, p.from, describe(p.kind)), ago(nowSec - p.timeSec))), p.kind == GigGroup.Ping.NEED_HELP)
    }
    if (meetUp == null && lines.isEmpty() && plan == null) return
    Column(modifier.fillMaxWidth().padding(horizontal = HomeSide)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Mosh.Hairline))
        Spacer(Modifier.height(6.dp))
        val rest = if (meetUp != null) {
            val first = lines.firstOrNull()
            ActivityRow(
                HomeIcons.Pin, Mosh.Pink, stringResource(R.string.home_meetup, meetUp), first?.first, onMap,
                subColour = if (first?.second == true) Mosh.Danger else Mosh.TextDim,
            )
            lines.drop(1)
        } else {
            lines
        }
        rest.forEach { (text, help) ->
            ActivityRow(HomeIcons.Pulse, if (help) Mosh.Danger else Mosh.Cyan, text, null, onMap, titleColour = if (help) Mosh.Danger else Mosh.Text, strong = false)
        }
        if (plan != null) ActivityRow(HomeIcons.Plan, Mosh.Lime, plan, stringResource(R.string.home_plan_pinned), onPlan)
    }
}

@Composable
private fun ActivityRow(
    icon: ImageVector,
    tint: Color,
    title: String,
    sub: String?,
    onClick: (() -> Unit)?,
    titleColour: Color = Mosh.Text,
    subColour: Color = Mosh.TextDim,
    strong: Boolean = true,
) {
    Row(
        Modifier.fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(12.dp))
            .then(if (onClick != null) Modifier.clickable(role = Role.Button, onClick = onClick) else Modifier)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        HomeIcon(icon, tint, 22.dp, Modifier.padding(top = 1.dp))
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                title,
                style = if (strong) HomeType.RowTitle.copy(color = titleColour) else HomeType.Body.copy(fontSize = 14.sp, lineHeight = 20.sp, color = titleColour),
            )
            if (sub != null) Text(sub, style = HomeType.Small.copy(color = subColour))
        }
    }
}

/** Tonight's photos as Polaroids (tap = the story). */
@Composable
internal fun StoryStrip(photos: List<Moments.Item>, onOpen: () -> Unit) {
    LazyRow(
        Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(start = HomeSide, end = HomeSide, top = 12.dp, bottom = 20.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        items(photos.take(8), key = { it.key }) { m -> Polaroid(m, 112.dp, Modifier.clickable(role = Role.Button, onClick = onOpen)) }
    }
}

/** While you're checking in: when you're due, and the "I'm home safe" button. */
@Composable
internal fun CheckInBanner(byClock: String, onHomeSafe: () -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(16.dp)
    Row(
        modifier.fillMaxWidth().clip(shape)
            .background(Mosh.Violet.copy(alpha = 0.14f))
            .border(1.dp, Mosh.Violet.copy(alpha = 0.5f), shape)
            .heightIn(min = 56.dp)
            .padding(start = 16.dp, end = 6.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // The time stays on one line ("2:15 am", "02:15 SA").
        Text(stringResource(R.string.home_check_in_by, byClock.replace(' ', '\u00A0')), style = HomeType.RowTitle.copy(color = Mosh.Lilac), modifier = Modifier.weight(1f))
        TextButton(onClick = onHomeSafe) {
            Text(stringResource(R.string.home_home_safe), style = HomeType.Label.copy(fontSize = 14.sp, color = Mosh.Lime), textAlign = TextAlign.Center)
        }
    }
}

/** No one's in the crew yet: the QR right here, no extra taps. */
@Composable
internal fun InlineCrewQr(payload: String, onShare: () -> Unit, modifier: Modifier = Modifier) {
    val bmp = remember(payload) { qrBitmap(payload, 480).asImageBitmap() }
    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = modifier.fillMaxWidth()) {
        Image(
            bmp, contentDescription = stringResource(R.string.home_crew_qr_desc),
            modifier = Modifier.size(208.dp).background(Color.White, RoundedCornerShape(20.dp)).padding(12.dp),
        )
        Spacer(Modifier.height(14.dp))
        Text(stringResource(R.string.home_inline_qr_text), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 20.sp), textAlign = TextAlign.Center)
        Spacer(Modifier.height(2.dp))
        Box(
            Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClick = onShare).padding(horizontal = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(stringResource(R.string.home_no_camera_send_invite), style = HomeType.Label.copy(fontSize = 14.sp, color = Mosh.Cyan), textAlign = TextAlign.Center)
        }
    }
}
