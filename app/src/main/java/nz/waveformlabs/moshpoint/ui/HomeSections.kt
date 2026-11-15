package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.moments.Moments
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.venue.VenueMaps
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// The home screen's sections, top to bottom (docs/design/home-redesign), plus the pieces other
// screens share: the one-tap pings, the message panel, the bottom bar and the Add panel.

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

/** A day in the date tile: weekday over the day of the month, in the phone's language. A calendar when there's no date. */
@Composable
internal fun DateTile(startsAtSec: Long) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        Modifier.widthIn(min = 46.dp).heightIn(min = 50.dp)
            .background(Mosh.Violet.copy(alpha = 0.16f), shape)
            .border(1.dp, Mosh.Violet.copy(alpha = 0.35f), shape)
            .padding(horizontal = 7.dp, vertical = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        if (startsAtSec > 0) {
            val locale = Locale.getDefault()
            val d = Date(startsAtSec * 1000)
            // Plain "EEE" and "d", not the locale's best pattern: for a lone weekday that is the
            // stand-alone "ccc", which java.text.SimpleDateFormat rejects off the phone.
            val weekday = SimpleDateFormat("EEE", locale).format(d).uppercase(locale)
            val day = SimpleDateFormat("d", locale).format(d)
            Text(
                weekday, maxLines = 1, softWrap = false,
                style = HomeType.Label.copy(fontSize = 10.sp, letterSpacing = tracked(weekday, 1.sp), color = Mosh.Lilac),
            )
            Text(day, style = HomeType.Hero.copy(fontSize = 17.sp, letterSpacing = 0.sp), maxLines = 1, softWrap = false)
        } else {
            HomeIcon(HomeIcons.Calendar, Mosh.Lilac, 20.dp)
        }
    }
}

/** A crew that's coming up, for the "Up next" rows. */
data class UpNextCard(
    val id: String,
    val name: String,
    /** "Sat 6 Dec, 8:00 pm" */
    val whenText: String?,
    /** "in 3 weeks", "tomorrow" */
    val countdown: String?,
    val venue: String,
    val mates: Int,
    val unread: Int,
    val plan: String?,
    val following: Boolean,
    /** When the gig starts (for the date tile), or 0 if it has no date. */
    val startsAtSec: Long = 0L,
)

/** "Up next": a date tile, the crew, who's in and how long to go, its plan. Tap = its chat (hype it up, invite, plan). */
@Composable
internal fun UpNextRow(card: UpNextCard, onClick: () -> Unit) {
    val (src, sc) = rememberPress()
    val who = when {
        card.following -> stringResource(R.string.home_following_from_home)
        card.mates == 0 -> stringResource(R.string.home_upnext_no_mates)
        else -> pluralStringResource(R.plurals.home_mates, card.mates, card.mates)
    }
    Row(
        Modifier.fillMaxWidth()
            .pressScale(sc)
            .clickable(interactionSource = src, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .heightIn(min = 72.dp)
            .padding(horizontal = HomeSide, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        DateTile(card.startsAtSec)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(card.name, style = HomeType.RowTitle, maxLines = 2, overflow = TextOverflow.Ellipsis)
            DotLineText(
                listOfNotNull(who, card.countdown, card.venue.takeIf { it.isNotBlank() }),
                HomeType.Small, maxLines = 3, overflow = TextOverflow.Ellipsis,
            )
            if (card.plan != null) {
                Text(stringResource(R.string.home_pinned_plan, card.plan), style = HomeType.Small.copy(color = Mosh.TextDim), maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
        if (card.unread > 0) {
            Spacer(Modifier.width(10.dp))
            CountBadge(card.unread)
        }
        Spacer(Modifier.width(8.dp))
        HomeIcon(HomeIcons.Chevron, Mosh.TextFaint, 18.dp)
    }
}

/** "Remember last year?": a gig on this day in an earlier year. Tap = relive it. */
@Composable
internal fun MemoryCard(g: GigArchive.Summary, years: Int, onOpen: () -> Unit) {
    val shape = RoundedCornerShape(18.dp)
    val cover = remember(g.cover) { g.cover?.let { GigArchive.thumbnail(it) }?.asImageBitmap() }
    val n = g.photos + g.clips
    Row(
        Modifier.padding(horizontal = HomeSide).fillMaxWidth().clip(shape)
            .background(Mosh.Amber.copy(alpha = 0.10f))
            .border(1.dp, Mosh.Amber.copy(alpha = 0.45f), shape)
            .clickable(role = Role.Button, onClick = onOpen)
            .padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MiniPolaroid(g.id, cover)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Kicker(stringResource(R.string.home_memories), colour = Mosh.Amber)
            Spacer(Modifier.height(4.dp))
            Text(nz.waveformlabs.moshpoint.gigs.Memories.headline(g, years, LocalContext.current.resources), style = HomeType.RowTitle.copy(lineBreak = HomeBreakEven))
            Spacer(Modifier.height(2.dp))
            // The text's own "›" becomes the chevron after the card, which mirrors right to left.
            Text(pluralStringResource(R.plurals.home_memories_count, n, n).trimEnd().removeSuffix("›").trimEnd(), style = HomeType.Small.copy(color = Mosh.TextDim, lineBreak = HomeBreakEven))
        }
        Spacer(Modifier.width(8.dp))
        HomeIcon(HomeIcons.Chevron, Mosh.TextFaint, 18.dp)
    }
}

/** A small tilted Polaroid of a gig's cover. */
@Composable
private fun MiniPolaroid(id: String, cover: ImageBitmap?) {
    Box(
        Modifier.size(56.dp).rotate(-4f)
            .background(Mosh.Paper, RoundedCornerShape(3.dp))
            .padding(start = 4.dp, end = 4.dp, top = 4.dp, bottom = 11.dp),
    ) { CoverArt(id, cover, Modifier.fillMaxWidth().height(41.dp)) }
}

/** A gig's cover photo, or neon stage lights when it has none (picked from the gig, so it stays the same). */
@Composable
private fun CoverArt(id: String, cover: ImageBitmap?, modifier: Modifier) {
    Box(modifier.drawBehind { stageLights(id) }) {
        if (cover != null) Image(cover, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.matchParentSize())
    }
}

private fun DrawScope.stageLights(id: String) {
    val w = size.width
    val h = size.height
    fun spot(x: Float, y: Float, r: Float, colour: Color, alpha: Float) = drawCircle(
        Brush.radialGradient(listOf(colour.copy(alpha = alpha), colour.copy(alpha = 0f)), center = Offset(x, y), radius = r),
        radius = r, center = Offset(x, y),
    )
    when (Math.floorMod(id.hashCode(), 3)) {
        0 -> {
            drawRect(Brush.verticalGradient(listOf(Mosh.Avatar, Mosh.Ground)))
            spot(w * 0.28f, h * 0.18f, w * 0.42f, Mosh.Pink, 0.95f)
            spot(w * 0.76f, h * 0.12f, w * 0.36f, Mosh.Cyan, 0.85f)
        }
        1 -> drawRect(Brush.verticalGradient(0f to Mosh.Amber, 0.52f to Mosh.Pink, 1f to Mosh.Deep))
        else -> {
            drawRect(Brush.verticalGradient(listOf(Mosh.Deep, Mosh.Ground)))
            spot(w * 0.5f, h * 0.08f, w * 0.48f, Color(Mosh.FriendColours[6]), 0.95f)
        }
    }
}

/** "Sat 7 Nov" in the phone's language and order. */
internal fun shortDay(sec: Long, year: Boolean = false): String {
    val l = Locale.getDefault()
    return SimpleDateFormat(android.text.format.DateFormat.getBestDateTimePattern(l, if (year) "EEEdMMMyyyy" else "EEEdMMM"), l).format(Date(sec * 1000))
}

private val PolaroidTilts = floatArrayOf(-2f, 1.5f, -1f)

/** One past gig as a Polaroid: the cover, its name in marker, the day and how many photos. */
@Composable
private fun GigPolaroid(g: GigArchive.Summary, tilt: Float, onClick: () -> Unit) {
    val cover = remember(g.cover) { g.cover?.let { GigArchive.thumbnail(it) }?.asImageBitmap() }
    val photos = pluralStringResource(R.plurals.home_gig_photos, g.photos, g.photos)
    val clips = pluralStringResource(R.plurals.home_gig_clips, g.clips, g.clips)
    val subStyle = TextStyle(fontFamily = Mosh.Inter, fontSize = 11.sp, lineHeight = 15.sp, color = Mosh.InkSoft, lineBreak = HomeBreak)
    // Measured against the caption's fixed width (150 dp less the padding), not with
    // BoxWithConstraints: the strip sizes the Polaroids by their intrinsic height.
    val sub = rememberDotLine(
        listOfNotNull(shortDay(g.whenSec), photos.takeIf { g.photos > 0 }, clips.takeIf { g.clips > 0 }),
        subStyle, with(LocalDensity.current) { 132.dp.roundToPx() },
    )
    Column(
        Modifier.width(150.dp)
            .fillMaxHeight()
            .rotate(tilt)
            .shadow(10.dp, RoundedCornerShape(3.dp), clip = false)
            .background(Mosh.Paper, RoundedCornerShape(3.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(start = 9.dp, end = 9.dp, top = 9.dp, bottom = 10.dp),
    ) {
        CoverArt(g.id, cover, Modifier.fillMaxWidth().height(118.dp))
        Spacer(Modifier.height(8.dp))
        Text(g.name, style = TextStyle(fontFamily = Mosh.Marker, fontSize = 16.sp, color = Mosh.Ink, lineBreak = HomeBreak), maxLines = 2, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(2.dp))
        Text(sub, style = subStyle, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/**
 * Past gigs as a strip of Polaroids that runs off the screen's edge: the latest eight (See all
 * has every one), all as tall as the tallest, so a two-line caption doesn't make one stick out.
 */
@Composable
internal fun PastGigsStrip(gigs: List<GigArchive.Summary>, onOpen: (GigArchive.Summary) -> Unit) {
    Row(
        Modifier.fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            // Room for the tilt and the drop shadow.
            .padding(start = HomeSide, end = HomeSide, top = 6.dp, bottom = 24.dp)
            .height(IntrinsicSize.Max),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        gigs.take(8).forEachIndexed { i, g ->
            key(g.id) { GigPolaroid(g, PolaroidTilts[i % PolaroidTilts.size]) { onOpen(g) } }
        }
    }
}

/** "See all" past gigs: every one as a row, to relive and save. */
@Composable
internal fun PastGigsContent(gigs: List<GigArchive.Summary>, onOpen: (GigArchive.Summary) -> Unit) {
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 24.dp)) {
        PanelTitle(stringResource(R.string.home_section_past_gigs))
        gigs.forEach { g -> PastGigRow(g) { onOpen(g) } }
    }
}

@Composable
private fun PastGigRow(g: GigArchive.Summary, onClick: () -> Unit) {
    val cover = remember(g.cover) { g.cover?.let { GigArchive.thumbnail(it) }?.asImageBitmap() }
    val names = g.people.take(3).joinToString(", ")
    val counts = listOfNotNull(
        pluralStringResource(R.plurals.home_gig_photos, g.photos, g.photos).takeIf { g.photos > 0 },
        pluralStringResource(R.plurals.home_gig_clips, g.clips, g.clips).takeIf { g.clips > 0 },
        if (g.people.size > 3) stringResource(R.string.home_people_more, names, g.people.size - 3) else names.takeIf { it.isNotBlank() },
    )
    Row(
        Modifier.fillMaxWidth()
            .heightIn(min = 72.dp)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = HomeSide, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MiniPolaroid(g.id, cover)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(g.name, style = HomeType.RowTitle, maxLines = 2, overflow = TextOverflow.Ellipsis)
            DotLineText(listOf(shortDay(g.whenSec, year = true), g.venue).filter { it.isNotBlank() }, HomeType.Small.copy(color = Mosh.TextDim), maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (counts.isNotEmpty()) DotLineText(counts, HomeType.Small, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.width(8.dp))
        HomeIcon(HomeIcons.Chevron, Mosh.TextFaint, 18.dp)
    }
}

/** A panel's title. */
@Composable
private fun PanelTitle(text: String) {
    Text(
        text, style = HomeType.Heading.copy(fontSize = 22.sp),
        modifier = Modifier.padding(start = HomeSide, end = HomeSide, top = 4.dp, bottom = 8.dp).semantics { heading() },
    )
}

/**
 * "See all" friends: everyone kept for every gig, each with a ⋯ that's always there (photo,
 * remove…), as asked: removing a friend shouldn't depend on knowing about long-press.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun FriendsListContent(
    friends: List<Friend>,
    seen: Map<String, LocationBook.Seen>,
    nowSec: Long,
    onFind: (String) -> Unit,
    onOptions: (Friend) -> Unit,
) {
    val optionsLabel = stringResource(R.string.home_face_options)
    Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(bottom = 24.dp)) {
        PanelTitle(stringResource(R.string.home_section_friends))
        friends.forEach { f ->
            val status = faceStatus(seen[f.id], nowSec, null)
            val optionsFor = stringResource(R.string.home_friend_options, f.name)
            Row(
                Modifier.fillMaxWidth()
                    .heightIn(min = 72.dp)
                    .combinedClickable(
                        onClickLabel = stringResource(R.string.home_find_name, f.name),
                        role = Role.Button,
                        onLongClickLabel = optionsLabel,
                        onLongClick = { onOptions(f) },
                        onClick = { onFind(f.id) },
                    )
                    .padding(start = HomeSide, end = 12.dp, top = 8.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                FaceImage(f, 46.dp, status.live, dim = false, glow = 10.dp)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(f.name, style = HomeType.RowTitle.copy(fontSize = 16.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
                    Text(status.text, style = HomeType.Small.copy(color = status.colour), maxLines = 2)
                }
                Spacer(Modifier.width(4.dp))
                Box(
                    Modifier.size(48.dp).clip(CircleShape)
                        .clickable(role = Role.Button, onClick = { onOptions(f) })
                        .semantics { contentDescription = optionsFor },
                    contentAlignment = Alignment.Center,
                ) { HomeIcon(HomeIcons.More, Mosh.TextDim, 20.dp) }
            }
        }
    }
}

/**
 * The crew menu (⋯): once-a-night crew actions. Invite more mates (the crew QR, or a link),
 * share the night with family, reset the invite (owner only), then end the night, cancel a
 * crew that's coming up, or stop following.
 */
@Composable
internal fun CrewMenuContent(
    name: String,
    subtitle: String,
    onInvite: (() -> Unit)?,
    onFamily: (() -> Unit)?,
    onReset: (() -> Unit)?,
    endTitle: String,
    endSub: String,
    onEnd: () -> Unit,
) {
    var confirmReset by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding()
            .padding(start = HomeSide, end = HomeSide, top = 4.dp, bottom = 28.dp),
    ) {
        Text(name, style = HomeType.Heading.copy(fontSize = 22.sp), maxLines = 3, overflow = TextOverflow.Ellipsis, modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(4.dp))
        Text(subtitle, style = HomeType.Small)
        Spacer(Modifier.height(12.dp))
        if (onInvite != null) {
            MenuRow(
                HomeIcons.UserPlus, Mosh.Cyan.copy(alpha = 0.13f), Mosh.Cyan,
                stringResource(R.string.home_menu_invite), stringResource(R.string.home_menu_invite_sub), onInvite,
            )
        }
        if (onFamily != null) {
            MenuRow(
                HomeIcons.House, Mosh.Violet.copy(alpha = 0.16f), Mosh.Lilac,
                stringResource(R.string.home_menu_family), stringResource(R.string.home_menu_family_sub), onFamily,
            )
        }
        if (onReset != null) {
            MenuRow(
                HomeIcons.Reset, Mosh.GlassFill, Mosh.TextDim,
                stringResource(R.string.setup_qr_reset_invite), stringResource(R.string.home_menu_reset_sub), { confirmReset = true },
            )
        }
        if (onInvite != null || onFamily != null || onReset != null) {
            Box(Modifier.padding(vertical = 8.dp).fillMaxWidth().height(1.dp).background(Mosh.Hairline))
        }
        MenuRow(HomeIcons.Power, Mosh.Pink.copy(alpha = 0.12f), Mosh.Danger, endTitle, endSub, onEnd, danger = true)
    }
    if (confirmReset && onReset != null) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            containerColor = Mosh.Deep,
            title = { Text(stringResource(R.string.setup_qr_reset_title), style = HomeType.Heading) },
            text = { Text(stringResource(R.string.setup_qr_reset_text), style = HomeType.Body) },
            confirmButton = { TextButton(onClick = { confirmReset = false; onReset() }) { Text(stringResource(R.string.setup_qr_reset), style = HomeType.Label.copy(color = Mosh.Cyan)) } },
            dismissButton = { TextButton(onClick = { confirmReset = false }) { Text(stringResource(R.string.setup_cancel), style = HomeType.Label) } },
        )
    }
}

/** Scan a QR / Paste invite: the two ways to join a crew. */
@Composable
internal fun JoinButtons(onScan: () -> Unit, onPaste: () -> Unit, modifier: Modifier = Modifier) = ButtonPair(
    modifier,
    first = { GlassAction(stringResource(R.string.home_scan_qr), HomeIcons.Scan, accent = Mosh.Cyan, onClick = onScan) },
    second = { GlassAction(stringResource(R.string.home_paste_invite), HomeIcons.Link, accent = Mosh.Cyan, onClick = onPaste) },
)

/** Plan a gig for another night: find it now and invite your mates. */
@Composable
private fun PlanGigRow(onClick: () -> Unit) {
    val (src, sc) = rememberPress()
    val shape = RoundedCornerShape(18.dp)
    Row(
        Modifier.fillMaxWidth()
            .pressScale(sc)
            .clip(shape)
            .background(Mosh.GlassFill)
            .border(1.dp, Mosh.GlassLine, shape)
            .clickable(interactionSource = src, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .heightIn(min = 64.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HomeIcon(HomeIcons.Calendar, Mosh.Lilac, 22.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(stringResource(R.string.home_plan_title), style = HomeType.RowTitle)
            Text(stringResource(R.string.home_plan_sub), style = HomeType.Small)
        }
        Spacer(Modifier.width(8.dp))
        HomeIcon(HomeIcons.Chevron, Mosh.TextFaint, 18.dp)
    }
}

/** No crew tonight (a returning user): start one, plan a gig, or join one. */
@Composable
internal fun NoCrewHero(onStart: () -> Unit, onPlan: () -> Unit, onScan: () -> Unit, onPaste: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = HomeSide)) {
        Text(stringResource(R.string.home_no_crew_title), style = HomeType.Hero.copy(fontSize = 30.sp), modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.home_no_crew_text), style = HomeType.Body.copy(lineHeight = 23.sp))
        Spacer(Modifier.height(24.dp))
        HeroButton(stringResource(R.string.home_start_crew), HomeIcons.UserPlus, textSize = 17.sp, onClick = onStart)
        Spacer(Modifier.height(12.dp))
        PlanGigRow(onPlan)
        Spacer(Modifier.height(28.dp))
        Kicker(stringResource(R.string.home_join_crew))
        Spacer(Modifier.height(10.dp))
        JoinButtons(onScan, onPaste)
    }
}

/** A brand-new user: what Moshpoint does, in one picture and two lines, and one thing to do. */
@Composable
internal fun FirstTimeHero(onStart: () -> Unit, onScan: () -> Unit, onPaste: () -> Unit, onPlan: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = HomeSide), horizontalAlignment = Alignment.CenterHorizontally) {
        // A picture, not a layout: drawn the same way round in right-to-left languages.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) { RadarArt() }
        Spacer(Modifier.height(14.dp))
        Text(
            stringResource(R.string.home_first_title), style = HomeType.Hero.copy(fontSize = 27.sp), textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.home_first_text), style = HomeType.Body.copy(lineHeight = 23.sp), textAlign = TextAlign.Center)
        Spacer(Modifier.height(22.dp))
        HeroButton(stringResource(R.string.home_start_crew), HomeIcons.UserPlus, textSize = 17.sp, onClick = onStart)
        Spacer(Modifier.height(12.dp))
        JoinButtons(onScan, onPaste)
        Spacer(Modifier.height(6.dp))
        Box(
            Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClick = onPlan).padding(horizontal = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(stringResource(R.string.home_plan_another_night), style = HomeType.Label.copy(fontSize = 14.sp, color = Mosh.Lilac), textAlign = TextAlign.Center)
        }
    }
}

/** The first-time picture: radar rings, the glowing arrow, and a mate 12 m away where it points. Decorative. */
@Composable
private fun RadarArt(modifier: Modifier = Modifier) {
    val distance = finderDistanceLabel(12.0)
    Box(modifier.size(200.dp).clearAndSetSemantics { }) {
        androidx.compose.foundation.Canvas(Modifier.size(200.dp)) {
            val s = size.minDimension / 240f // the design's drawing is 240 units across
            val c = Offset(size.width / 2, size.height / 2)
            drawCircle(Mosh.Cyan.copy(alpha = 0.12f), radius = 112f * s, center = c, style = Stroke(1.5f * s))
            drawCircle(Mosh.Cyan.copy(alpha = 0.22f), radius = 78f * s, center = c, style = Stroke(1.5f * s))
            drawCircle(Mosh.Cyan.copy(alpha = 0.38f), radius = 44f * s, center = c, style = Stroke(1.5f * s))
            drawCircle(Mosh.Text, radius = 7f * s, center = c)
            val arrow = Path().apply {
                moveTo(120f * s, 52f * s); lineTo(140f * s, 80f * s); lineTo(126f * s, 80f * s); lineTo(126f * s, 120f * s)
                lineTo(114f * s, 120f * s); lineTo(114f * s, 80f * s); lineTo(100f * s, 80f * s); close()
            }
            rotate(40f, pivot = c) {
                drawPath(arrow, Brush.verticalGradient(0f to Color.White, 0.22f to Mosh.Cyan, 1f to Mosh.Violet, startY = 52f * s, endY = 120f * s))
            }
        }
        // Where the arrow points (not mirrored right to left: the arrow isn't either).
        Box(
            Modifier.absoluteOffset(x = 127.dp, y = 3.dp).size(52.dp).drawBehind {
                val r = size.minDimension / 2
                ringGlow(r, 16.dp.toPx(), Mosh.Lime)
                drawCircle(Mosh.Lime, radius = r)
            },
            contentAlignment = Alignment.Center,
        ) { DefaultAvatar("Sam", 46.dp) }
        Text(
            distance, maxLines = 1, softWrap = false,
            style = HomeType.Button.copy(fontSize = 11.sp, color = Mosh.Lime),
            modifier = Modifier.absoluteOffset(x = 132.dp, y = 60.dp)
                .background(Mosh.Lime.copy(alpha = 0.14f), RoundedCornerShape(10.dp))
                .padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}

/** One-tap messages to the whole crew. "Need help" asks first. */
@Composable
internal fun PingBar(onPing: (Int) -> Unit, onCheckIn: (Int) -> Unit = {}) {
    var confirmHelp by remember { mutableStateOf(false) }
    var goingHome by remember { mutableStateOf(false) }
    var sent by remember { mutableStateOf<Int?>(null) }
    val items = listOf(
        GigGroup.Ping.COMING to stringResource(R.string.home_ping_on_my_way),
        GigGroup.Ping.WHERE_ARE_YOU to stringResource(R.string.home_ping_where_are_you),
        GigGroup.Ping.STAY_PUT to stringResource(R.string.home_ping_stay_put),
        GigGroup.Ping.MEET_AT_PIN to stringResource(R.string.home_ping_meet_at_pin),
        GigGroup.Ping.ALL_GOOD to stringResource(R.string.home_ping_all_good),
    )
    val sentLabel = stringResource(R.string.home_ping_sent)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items.forEach { (kind, label) ->
            PingChip(if (sent == kind) sentLabel else label, if (sent == kind) Mosh.Lime else Mosh.Cyan) {
                onPing(kind)
                sent = kind
            }
        }
        PingChip(stringResource(R.string.home_ping_heading_home), Mosh.Violet) { goingHome = true }
        PingChip(stringResource(R.string.home_ping_need_help), Mosh.Danger) { confirmHelp = true }
    }
    if (goingHome) {
        AlertDialog(
            onDismissRequest = { goingHome = false },
            containerColor = Mosh.Deep,
            title = { Text(stringResource(R.string.home_heading_home_title), style = HomeType.Heading) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(stringResource(R.string.home_heading_home_text), style = HomeType.Body)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(30, 45, 60, 90).forEach { m ->
                            PingChip(pluralStringResource(R.plurals.home_checkin_minutes, m, m), Mosh.Violet) { onCheckIn(m); sent = GigGroup.Ping.CHECK_IN; goingHome = false }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { onPing(GigGroup.Ping.GOING_HOME); sent = GigGroup.Ping.GOING_HOME; goingHome = false }) {
                    Text(stringResource(R.string.home_just_tell_them), style = HomeType.Label.copy(color = Mosh.Cyan))
                }
            },
            dismissButton = { TextButton(onClick = { goingHome = false }) { Text(stringResource(R.string.home_cancel), style = HomeType.Label) } },
        )
    }
    if (confirmHelp) {
        HelpDialog(onAlertCrew = { onPing(GigGroup.Ping.NEED_HELP); sent = GigGroup.Ping.NEED_HELP }, onClose = { confirmHelp = false })
    }
}

@Composable
private fun PingChip(text: String, colour: Color, onClick: () -> Unit) {
    val (src, sc) = rememberPress()
    Box(
        Modifier.pressScale(sc).heightIn(min = 40.dp)
            .background(colour.copy(alpha = 0.12f), RoundedCornerShape(20.dp))
            .border(1.dp, colour.copy(alpha = 0.5f), RoundedCornerShape(20.dp))
            .clickable(interactionSource = src, indication = LocalIndication.current, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 9.dp),
        contentAlignment = Alignment.Center,
    ) { Text(text, style = HomeType.Label.copy(fontSize = 14.sp, color = colour)) }
}

/** Bottom bar: the places you go (Crew, Map, Add, Story, Me). Opaque: the list ends above it. */
@Composable
internal fun HomeBar(onMap: () -> Unit, onAdd: () -> Unit, onMe: () -> Unit, myName: String = "", onStory: () -> Unit = {}) {
    val crew = stringResource(R.string.home_bar_crew)
    val map = stringResource(R.string.home_bar_map)
    val story = stringResource(R.string.home_bar_story)
    val me = stringResource(R.string.home_bar_me)
    Column(Modifier.fillMaxWidth().background(Mosh.Bar)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Mosh.Hairline))
        BoxWithConstraints(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 10.dp, end = 10.dp, top = 8.dp, bottom = 8.dp)) {
            // Five equal places, each label with 2 dp either side.
            val labelSize = rememberBarLabelSize(listOf(crew, map, story, me), constraints.maxWidth / 5 - with(LocalDensity.current) { 4.dp.roundToPx() })
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                BarItem(crew, labelSize, selected = true, Modifier.weight(1f), icon = { c -> HomeIcon(HomeIcons.Crew, c, 26.dp) }) {}
                BarItem(map, labelSize, selected = false, Modifier.weight(1f), icon = { c -> HomeIcon(HomeIcons.MapPin, c, 26.dp) }, onClick = onMap)
                AddButton(onAdd, Modifier.weight(1f))
                BarItem(story, labelSize, selected = false, Modifier.weight(1f), icon = { c -> HomeIcon(HomeIcons.Story, c, 26.dp) }, onClick = onStory)
                BarItem(me, labelSize, selected = false, Modifier.weight(1f), icon = { _ ->
                    val mine = nz.waveformlabs.moshpoint.profile.PhotoStore.photos[nz.waveformlabs.moshpoint.profile.PhotoStore.ME]
                    if (mine != null) {
                        Image(mine, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(26.dp).clip(CircleShape))
                    } else {
                        DefaultAvatar(myName, 26.dp)
                    }
                }, onClick = onMe)
            }
        }
    }
}

private val BarLabelStyle = HomeType.Body.copy(lineBreak = HomeBreakEven)

/**
 * The tabs' label size: the font size setting's (up to 1.5 times, [capScale]), made smaller,
 * down to the normal size, while a word doesn't fit its tab, so it never breaks inside:
 * ストーリー at 130% on a small phone, not "ストー / リー". One size for all four labels.
 * Words still too wide at the normal size, and labels of several words, take two lines.
 */
@Composable
private fun rememberBarLabelSize(labels: List<String>, room: Int): TextUnit {
    val measurer = rememberTextMeasurer()
    val fontScale = LocalDensity.current.fontScale
    val largest = 11.5.sp.capScale().value
    return remember(labels, room, largest, fontScale, measurer) {
        val words = labels.flatMap { it.split(' ') }.filter { it.isNotEmpty() }
        // Measured in the selected tab's weight, the wider one.
        val style = BarLabelStyle.copy(fontWeight = FontWeight.SemiBold)
        fun widest(sp: Float) = words.maxOfOrNull { measurer.measure(it, style.copy(fontSize = sp.sp), maxLines = 1, softWrap = false).size.width } ?: 0
        // The normal size, 11.5 at 100%, in this font scale's sp.
        val smallest = minOf(largest, 11.5f / fontScale)
        var sp = largest
        while (sp - 0.25f >= smallest && widest(sp) > room) sp -= 0.25f
        sp.sp
    }
}

@Composable
private fun BarItem(label: String, labelSize: TextUnit, selected: Boolean, modifier: Modifier, icon: @Composable (Color) -> Unit, onClick: () -> Unit) {
    val (src, sc) = rememberPress()
    val colour = if (selected) Mosh.Lime else Mosh.TextDim
    Column(
        modifier.pressScale(sc)
            .heightIn(min = 56.dp)
            .selectable(selected = selected, interactionSource = src, indication = null, role = Role.Tab, onClick = onClick)
            .padding(top = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        icon(colour)
        Spacer(Modifier.height(4.dp))
        // Two lines when a large font needs them ("Berättelse" at 200%), never clipped.
        Text(
            label, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
            style = BarLabelStyle.copy(
                fontSize = labelSize, lineHeight = labelSize * (15f / 11.5f),
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium, color = colour,
            ),
            modifier = Modifier.padding(horizontal = 2.dp),
        )
    }
}

/** The bar's raised "+" (Add): a gradient circle with a pink glow under it. */
@Composable
private fun AddButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.home_bar_add)
    val (src, sc) = rememberPress()
    Box(modifier.heightIn(min = 56.dp), contentAlignment = Alignment.TopCenter) {
        Box(
            Modifier.offset(y = (-6).dp)
                .pressScale(sc)
                .size(52.dp)
                .drawBehind {
                    glow(Mosh.Pink, 12.dp.toPx(), 0.7f) { p ->
                        drawContext.canvas.drawCircle(Offset(size.width / 2, size.height / 2 + 8.dp.toPx()), size.minDimension / 2 - 6.dp.toPx(), p)
                    }
                }
                .clip(CircleShape)
                .background(Brush.linearGradient(0f to Mosh.Pink, 0.6f to Mosh.Violet, 1f to Mosh.Cyan))
                .clickable(interactionSource = src, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) { HomeIcon(HomeIcons.Plus, Color.White, 26.dp) }
    }
}

/** Every way to add someone, in one panel instead of always on screen. */
@Composable
internal fun AddSheet(
    inCrew: Boolean,
    onShowCrewQr: () -> Unit,
    onScanQr: () -> Unit,
    onShareApp: () -> Unit,
    onPasteInvite: () -> Unit,
    onShowMyQr: () -> Unit,
    onEnterCode: () -> Unit,
    onClose: () -> Unit,
    onBump: () -> Unit = {},
    onPlanGig: (() -> Unit)? = null,
) {
    MoshSheet(onClose = onClose) {
        AddSheetContent(
            inCrew = inCrew,
            onShowCrewQr = { onClose(); onShowCrewQr() },
            onScanQr = { onClose(); onScanQr() },
            onShareApp = { onClose(); onShareApp() },
            onPasteInvite = { onClose(); onPasteInvite() },
            onShowMyQr = { onClose(); onShowMyQr() },
            onEnterCode = { onClose(); onEnterCode() },
            onBump = { onClose(); onBump() },
            onPlanGig = onPlanGig?.let { plan -> { onClose(); plan() } },
        )
    }
}

/** The Add panel's contents (separate so it can be screenshot-tested). */
@Composable
internal fun AddSheetContent(
    inCrew: Boolean,
    onShowCrewQr: () -> Unit,
    onScanQr: () -> Unit,
    onShareApp: () -> Unit,
    onPasteInvite: () -> Unit,
    onShowMyQr: () -> Unit,
    onEnterCode: () -> Unit,
    onBump: () -> Unit,
    onPlanGig: (() -> Unit)?,
) {
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding()
            .padding(start = HomeSide, end = HomeSide, top = 4.dp, bottom = 28.dp),
    ) {
        Text(stringResource(R.string.home_add_mates), style = HomeType.Heading.copy(fontSize = 22.sp), modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(6.dp))
        Text(stringResource(R.string.home_add_mates_text), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 21.sp))
        Spacer(Modifier.height(20.dp))
        HeroButton(
            if (inCrew) stringResource(R.string.home_show_crew_qr) else stringResource(R.string.home_start_crew_show_qr),
            HomeIcons.Qr, onClick = onShowCrewQr,
        )
        Spacer(Modifier.height(12.dp))
        JoinButtons(onScanQr, onPasteInvite)
        Spacer(Modifier.height(8.dp))
        MenuRow(HomeIcons.Bump, Mosh.Cyan.copy(alpha = 0.13f), Mosh.Cyan, stringResource(R.string.home_bump_phones), null, onBump)
        if (onPlanGig != null) {
            MenuRow(HomeIcons.Calendar, Mosh.Violet.copy(alpha = 0.16f), Mosh.Lilac, stringResource(R.string.home_plan_gig), null, onPlanGig)
        }
        MenuRow(HomeIcons.Share, Mosh.Pink.copy(alpha = 0.12f), Mosh.Danger, stringResource(R.string.home_send_app_invite), null, onShareApp)
        Spacer(Modifier.height(18.dp))
        Kicker(stringResource(R.string.home_friends_every_gig))
        Spacer(Modifier.height(10.dp))
        ButtonPair(
            first = { GlassAction(stringResource(R.string.home_my_friend_qr), HomeIcons.Qr, onClick = onShowMyQr) },
            second = { GlassAction(stringResource(R.string.home_enter_code), HomeIcons.Keypad, onClick = onEnterCode) },
        )
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

/** Everything you can tell the crew, in one panel: pings, heading home, need help. */
@Composable
internal fun MessageSheet(onPing: (Int) -> Unit, onCheckIn: (Int) -> Unit, onClose: () -> Unit) {
    MoshSheet(onClose = onClose) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).navigationBarsPadding().padding(start = HomeSide, end = HomeSide, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(stringResource(R.string.home_message_crew), style = HomeType.Heading.copy(fontSize = 22.sp), modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.home_message_crew_text), style = HomeType.Body)
            PingBar(onPing = { onPing(it) }, onCheckIn = { onCheckIn(it) })
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
