package nz.waveformlabs.moshpoint.ui.home

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.ui.InitialsAvatar
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.pressScale
import nz.waveformlabs.moshpoint.ui.rememberPress

/**
 * What the hype group shows (docs/DISCOVER_APP.md, HypeGroup.png): a planned crew, asleep until
 * gig day. The countdown is the headline; the show card holds the ticket link; the faces say who
 * has a ticket; your own toggle, the chat and Invite mates follow. On the night it's the normal
 * crew screen again.
 */
class HypeView(
    /** Calendar days to the gig (core Countdown): 0 on the day, 1 the day before. */
    val days: Int,
    /** The gig ("Ivory Tide"). */
    val name: String,
    /** "Tidewater Arena, Auckland"; may be blank. */
    val venue: String,
    /** "Sat 13 Mar · 7:30 pm". */
    val whenText: String,
    /** The maker's signed ticket link, or null (no Get tickets). */
    val ticketLink: String?,
    /** Who has a ticket, by crew mate's friend id. */
    val ticks: Map<String, Boolean>,
    /** Our own "I've got my ticket". */
    val mine: Boolean,
    /** The newest chat line: who said it and what, and their face if they're in the crew. */
    val chatFrom: String? = null,
    val chatText: String? = null,
    val chatFace: Friend? = null,
)

/** "in 117 days" (or "tomorrow", "tonight"), and where the number is in it. */
@Composable
private fun countdownText(days: Int): Pair<String, IntRange?> {
    val text = when (days) {
        0 -> stringResource(R.string.countdown_tonight)
        1 -> stringResource(R.string.countdown_tomorrow)
        else -> pluralStringResource(R.plurals.countdown_days, days, days)
    }
    return text to Regex("\\p{Nd}+").find(text)?.range
}

/**
 * The countdown headline, its number in the brand gradient from pink to cyan across the digits
 * themselves (measured first, so it's the same in every language and at every width).
 */
@OptIn(androidx.compose.ui.text.ExperimentalTextApi::class)
@Composable
private fun CountdownHeadline(days: Int, modifier: Modifier = Modifier) {
    val (text, digits) = countdownText(days)
    val style = HomeType.Hero.copy(fontSize = 42.sp.capScale(1.3f), lineHeight = 48.sp.capScale(1.3f), letterSpacing = (-1).sp)
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(modifier) {
        val width = constraints.maxWidth
        val shown = remember(text, digits, style, width) {
            buildAnnotatedString {
                append(text)
                if (digits != null) {
                    val layout = measurer.measure(text, style, constraints = Constraints(maxWidth = width))
                    val a = layout.getHorizontalPosition(digits.first, usePrimaryDirection = true)
                    val b = layout.getHorizontalPosition(digits.last + 1, usePrimaryDirection = true)
                    val from = minOf(a, b)
                    val to = maxOf(a, b).coerceAtLeast(from + 1f)
                    val top = layout.getLineTop(layout.getLineForOffset(digits.first))
                    addStyle(
                        SpanStyle(brush = Brush.linearGradient(listOf(Mosh.Pink, Mosh.Violet, Mosh.Cyan), start = Offset(from, top), end = Offset(to, top))),
                        digits.first, digits.last + 1,
                    )
                }
            }
        }
        Text(shown, style = style, modifier = Modifier.semantics { heading() })
    }
}

/** The hype group: everything under the Live row while a planned crew sleeps. */
@Composable
internal fun HypeGroupBody(
    hype: HypeView,
    crewCount: String?,
    crew: List<Friend>,
    chatUnread: Int,
    onMenu: () -> Unit,
    onTickets: (String) -> Unit,
    onMyTicket: (Boolean) -> Unit,
    onOpenChat: (() -> Unit)?,
    onInvite: () -> Unit,
    onOptions: ((Friend) -> Unit)?,
) {
    Column(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(horizontal = HomeSide)) {
            Kicker(stringResource(R.string.home_eyebrow_coming_up))
            Row(verticalAlignment = Alignment.Top) {
                CountdownHeadline(hype.days, Modifier.weight(1f).padding(top = 4.dp))
                Spacer(Modifier.width(12.dp))
                RoundIconButton(HomeIcons.More, stringResource(R.string.home_crew_options), onMenu)
            }
            DotLineText(listOfNotNull(crewCount, stringResource(R.string.hype_wakes_up)), HomeType.Small.copy(fontSize = 15.sp, color = Mosh.TextDim))
        }
        Spacer(Modifier.height(18.dp))
        ShowCard(hype, onTickets, Modifier.padding(horizontal = HomeSide))
        if (crew.isNotEmpty()) {
            CrewTiles(crew, emptyMap(), 0L, onFind = null, onOptions = onOptions, tickets = hype.ticks)
        } else {
            Spacer(Modifier.height(16.dp))
        }
        Spacer(Modifier.height(12.dp))
        TicketToggleRow(hype.mine, onMyTicket, Modifier.padding(horizontal = HomeSide))
        if (onOpenChat != null) {
            Spacer(Modifier.height(12.dp))
            ChatRow(hype, chatUnread, onOpenChat, Modifier.padding(horizontal = HomeSide))
        }
        Spacer(Modifier.height(14.dp))
        GlassAction(
            stringResource(R.string.hype_invite_mates), HomeIcons.UserPlus,
            Modifier.padding(horizontal = HomeSide).fillMaxWidth().heightIn(min = 56.dp), accent = Mosh.Cyan, onClick = onInvite,
        )
    }
}

/** The show: artwork, name, venue, when, and the one gradient button on the screen, Get tickets. */
@Composable
private fun ShowCard(hype: HypeView, onTickets: (String) -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(24.dp)
    Row(
        modifier.fillMaxWidth().clip(shape).background(Mosh.GlassFill).border(1.dp, Mosh.GlassLine, shape).padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ShowArt(hype.name, Modifier.size(76.dp, 108.dp))
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(hype.name, style = HomeType.Section.copy(fontSize = 21.sp.capScale(1.3f)), maxLines = 2, overflow = TextOverflow.Ellipsis)
            if (hype.venue.isNotBlank()) {
                Spacer(Modifier.height(2.dp))
                Text(hype.venue, style = HomeType.Body.copy(fontSize = 15.sp, lineHeight = 20.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            Spacer(Modifier.height(2.dp))
            DotLineText(hype.whenText, HomeType.Body.copy(fontSize = 14.5.sp, lineHeight = 19.sp, color = Mosh.Lilac))
            val link = hype.ticketLink
            if (link != null) {
                Spacer(Modifier.height(10.dp))
                TicketsButton { onTickets(link) }
            }
        }
    }
}

/** The show's picture: the brand colours, mixed by its name, so each show has its own (no artwork is fetched). */
@Composable
internal fun ShowArt(name: String, modifier: Modifier = Modifier, corner: Int = 14) {
    val palette = listOf(Mosh.Pink, Mosh.Violet, Mosh.Cyan, Mosh.Lime, Mosh.Amber)
    val h = name.fold(7) { acc, ch -> acc * 31 + ch.code }
    val a = palette[Math.floorMod(h, palette.size)]
    val b = palette[Math.floorMod(h / 7 + 2, palette.size)].takeIf { it != a } ?: Mosh.Cyan
    Box(
        modifier.clip(RoundedCornerShape(corner.dp))
            .background(Brush.linearGradient(listOf(a, Mosh.Deep), start = Offset(0f, 0f), end = Offset(200f, 320f)))
            .background(Brush.radialGradient(listOf(b.copy(alpha = 0.85f), Color.Transparent), center = Offset(150f, 170f), radius = 140f)),
    )
}

/** "Get tickets ↗": pink → violet → cyan, opens the ticket page in the browser. */
@Composable
private fun TicketsButton(onClick: () -> Unit) {
    val (source, scale) = rememberPress()
    val shape = RoundedCornerShape(20.dp)
    Row(
        Modifier.pressScale(scale).clip(shape)
            .background(Brush.horizontalGradient(listOf(Mosh.Pink, Mosh.Violet, Mosh.Cyan)))
            .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .heightIn(min = 40.dp)
            .padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(R.string.hype_get_tickets), style = HomeType.Button.copy(fontSize = 16.sp, color = Color.White), maxLines = 2)
        Spacer(Modifier.width(8.dp))
        HomeIcon(HomeIcons.External, Color.White, 17.dp)
    }
}

/** "I've got my ticket": one switch for the whole row, read as one by a screen reader. */
@Composable
private fun TicketToggleRow(on: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(20.dp)
    Row(
        modifier.fillMaxWidth().clip(shape).background(Mosh.GlassFill).border(1.dp, Mosh.GlassLine, shape)
            .toggleable(value = on, role = Role.Switch, onValueChange = onChange)
            .heightIn(min = 64.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HomeIcon(HomeIcons.Ticket, Mosh.Lime, 24.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.hype_my_ticket), style = HomeType.RowTitle)
            Text(stringResource(R.string.hype_my_ticket_sub), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.TextDim))
        }
        Spacer(Modifier.width(12.dp))
        SwitchTrack(on, Mosh.Lime)
    }
}

/** Crew chat, with its newest line and who said it. */
@Composable
private fun ChatRow(hype: HypeView, unread: Int, onOpen: () -> Unit, modifier: Modifier = Modifier) {
    val (source, scale) = rememberPress()
    val shape = RoundedCornerShape(20.dp)
    Row(
        modifier.fillMaxWidth().pressScale(scale).clip(shape).background(Mosh.GlassFill).border(1.dp, Mosh.GlassLine, shape)
            .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onOpen)
            .heightIn(min = 64.dp)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val face = hype.chatFace
        val from = hype.chatFrom
        when {
            face != null -> FaceImage(face, 38.dp, live = false, dim = false)
            from != null -> Box(Modifier.size(44.dp), contentAlignment = Alignment.Center) { InitialsAvatar(from, 38.dp, Mosh.Violet) }
            else -> Box(Modifier.size(44.dp).background(Mosh.GlassFill, CircleShape), contentAlignment = Alignment.Center) { HomeIcon(HomeIcons.Chat, Mosh.Text, 20.dp) }
        }
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.home_crew_chat), style = HomeType.RowTitle, modifier = Modifier.weight(1f, fill = false))
                if (unread > 0) {
                    Spacer(Modifier.width(8.dp))
                    CountBadge(unread)
                }
            }
            val text = hype.chatText
            if (from != null && text != null) {
                // Each part keeps its own direction: an English line in an Arabic chat row reads "Sam: Barrier or balcony?", not "?Sam: …".
                val bidi = android.text.BidiFormatter.getInstance()
                Text(
                    stringResource(R.string.hype_chat_line, bidi.unicodeWrap(from), bidi.unicodeWrap(text)),
                    style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.TextDim),
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        HomeIcon(HomeIcons.Chevron, Mosh.TextFaint, 18.dp)
    }
}
