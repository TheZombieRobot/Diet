package nz.waveformlabs.moshpoint.ui.home

import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.countdown
import nz.waveformlabs.moshpoint.ui.pressScale
import nz.waveformlabs.moshpoint.ui.rememberPress
import nz.waveformlabs.moshpoint.ui.PushPin
import nz.waveformlabs.moshpoint.ui.pushPin

// Other nights on the home (docs/design/home-redesign): Up next, "Remember last year?" and
// past gigs as Polaroids, with the panel that lists them all.

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
        Modifier.size(56.dp).rotate(-4f).pushPin(PushPin.colourFor(id), 9.dp)
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
            .pushPin(PushPin.colourFor(g.id), 16.dp)
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
            // Room for the tilt, the pin poking above each frame, and the drop shadow.
            .padding(start = HomeSide, end = HomeSide, top = 12.dp, bottom = 24.dp)
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
