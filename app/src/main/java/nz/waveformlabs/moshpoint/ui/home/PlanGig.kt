package nz.waveformlabs.moshpoint.ui.home

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.DateFormat
import java.util.Calendar
import java.util.Date
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.DiscoverShow
import nz.waveformlabs.moshpoint.core.SuggestAnswer
import nz.waveformlabs.moshpoint.core.Suggestion
import nz.waveformlabs.moshpoint.core.TicketLink
import nz.waveformlabs.moshpoint.core.TypedMatch
import nz.waveformlabs.moshpoint.discover.DiscoverClient
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.glow
import nz.waveformlabs.moshpoint.ui.pressScale
import nz.waveformlabs.moshpoint.ui.rememberPress

/** The paid tier's name, never translated (like the wordmark). */
internal const val PLUS_NAME = "Moshpoint+"

/** How the last smart-search ask went. */
enum class SearchState {
    IDLE, LOOKING,
    /** The relay is still building this country's list ("Getting the list…"); asked again in 30 s. */
    NOT_READY,
    /** No internet or a bad answer: say so, keep typing it in by hand. */
    FAILED,
    /** 403 or 503: not for this phone after all. The search goes away quietly: hand entry only. */
    CLOSED,
}

/** Smart search for Moshpoint+ members (SmartSearch.png): the relay's suggestions for this phone's country. */
class PlanSearch(
    /** ISO country code the relay is asked about. */
    val country: String,
    /** The name of the region "Near you" means ("North Island"), when known. */
    val regionName: String?,
    val suggest: suspend (String) -> DiscoverClient.Answer<SuggestAnswer>,
    /** When a picked show starts, for its crew (core ShowStart). */
    val startOf: (DiscoverShow) -> Long,
)

/** A gig picked or typed in: everything a planned crew starts with (docs/DISCOVER_APP.md). */
class PlannedGig(
    val name: String,
    val startsAtSec: Long,
    val venue: String,
    val lat: Double? = null,
    val lon: Double? = null,
    /** The official ticket page, from Discover; blank when typed in by hand. */
    val tickets: String = "",
    /** The Discover show it came from (so Coming up can say "Planned ✓"); blank when typed in by hand. */
    val showId: String = "",
)

/** What's typed into Plan a gig, kept while the sheet shows "What's in Moshpoint+" and back. */
@Stable
class PlanForm(startsAtSec: Long) {
    var name by mutableStateOf("")
    var venue by mutableStateOf("")
    var at by mutableLongStateOf(startsAtSec)
    /** A picked show's venue position and ticket link (blank when typed in by hand). */
    var lat by mutableStateOf<Double?>(null)
    var lon by mutableStateOf<Double?>(null)
    var tickets by mutableStateOf("")
    var showId by mutableStateOf("")

    // Smart search (members): what's typed, the latest answer, and how the last ask went.
    var query by mutableStateOf("")
    var answer by mutableStateOf<SuggestAnswer?>(null)
    var state by mutableStateOf(SearchState.IDLE)

    /** A show picked from the suggestions fills the plan: name, date, venue, ticket link. */
    fun fill(show: DiscoverShow, artist: String, startsAtSec: Long) {
        name = artist.ifBlank { show.name }.take(40)
        at = startsAtSec
        venue = listOf(show.venue, show.city).filter { it.isNotBlank() }.distinct().joinToString(", ").take(60)
        lat = show.lat
        lon = show.lon
        tickets = TicketLink.clean(show.tickets).orEmpty()
        showId = show.id
        query = ""
    }

    companion object {
        /** 8 pm today, or tomorrow if that's gone. */
        fun defaultStart(nowMs: Long = System.currentTimeMillis()): Long = Calendar.getInstance().apply {
            timeInMillis = nowMs
            set(Calendar.HOUR_OF_DAY, 20); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            if (timeInMillis < nowMs) add(Calendar.DAY_OF_MONTH, 1)
        }.timeInMillis / 1000
    }
}

/**
 * Plan a gig: type it in (who's playing, the date and time, the venue if you like) and start
 * that gig's crew. A crew for a later day sleeps until then: mates can join now and nothing runs
 * (no Bluetooth, no location, no battery) until gig day.
 *
 * Free users get the complete free path, then a quiet Moshpoint+ card (FreeView.png), whose
 * "What's in Moshpoint+" swaps the sheet to [PlusInfoContent] and back, with what was typed kept.
 */
@Composable
internal fun PlanGigSheet(
    /** Moshpoint+ (Entitlements.plus): smart search when [search] is set, and no Moshpoint+ card. */
    member: Boolean,
    search: PlanSearch?,
    onPick: (PlannedGig) -> Unit,
    onClose: () -> Unit,
    /**
     * Finds where a venue typed by hand is (lat, lon), or null. Asked once, when "Start the crew"
     * is tapped (never while typing), so the crew and its invite carry the venue's position.
     */
    lookupVenue: (suspend (String) -> Pair<Double, Double>?)? = null,
) {
    val form = remember { PlanForm(PlanForm.defaultStart()) }
    var plusOpen by remember { mutableStateOf(false) }
    MoshSheet(onClose = onClose) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding()) {
            if (plusOpen) {
                PlusInfoContent(onBack = { plusOpen = false })
            } else {
                PlanGigContent(form, member, search, onPick, lookupVenue, onWhatsPlus = { plusOpen = true })
            }
        }
    }
}

/**
 * The sheet's contents (drawn on their own in the screenshot tests). They scroll by themselves
 * in whatever height the sheet gives them; while suggestions show, "Type your own gig" stays
 * pinned under them, reachable above the keyboard however long the list is.
 */
@Composable
internal fun ColumnScope.PlanGigContent(
    form: PlanForm,
    member: Boolean,
    search: PlanSearch?,
    onPick: (PlannedGig) -> Unit,
    lookupVenue: (suspend (String) -> Pair<Double, Double>?)?,
    onWhatsPlus: () -> Unit,
) {
    val canSearch = search != null && form.state != SearchState.CLOSED
    val listing = canSearch && form.query.isNotBlank()
    if (search != null) SearchEffect(form, search)
    Column(Modifier.weight(1f, fill = false).fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = HomeSide, end = HomeSide, bottom = if (listing) 8.dp else 24.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(top = 6.dp)) {
            Text(stringResource(R.string.setup_plan_title), style = HomeType.Hero.copy(fontSize = 32.sp), modifier = Modifier.weight(1f).semantics { heading() })
            if (member) {
                Spacer(Modifier.width(12.dp))
                PlusChip()
            }
        }
        if (!listing) {
            Spacer(Modifier.height(10.dp))
            Text(stringResource(R.string.setup_plan_desc), style = HomeType.Body.copy(fontSize = 16.sp, lineHeight = 23.sp))
        }
        if (canSearch) {
            Spacer(Modifier.height(if (listing) 14.dp else 18.dp))
            SearchField(form.query, { form.query = it.take(60) }, onClear = { form.query = "" })
        }
        if (listing && search != null) {
            SuggestList(form, search)
        } else {
            if (search != null && form.state == SearchState.FAILED) {
                Text(stringResource(R.string.setup_plan_search_failed), style = HomeType.Body.copy(fontSize = 14.sp, color = Mosh.TextFaint), modifier = Modifier.padding(top = 8.dp))
            }
            Spacer(Modifier.height(24.dp))
            Kicker(stringResource(R.string.plan_type_it_in))
            Spacer(Modifier.height(12.dp))
            HandEntry(form, onPick, lookupVenue)
            if (!member) {
                Spacer(Modifier.height(22.dp))
                PlusCard(onWhatsPlus)
            }
        }
    }
    if (listing) TypeOwnRow { form.query = "" }
}

/**
 * Asks the relay as the member types: a short pause first, and a new letter cancels the ask
 * before it (LaunchedEffect restarts). A list still being built is asked again every 30 s.
 */
@Composable
private fun SearchEffect(form: PlanForm, search: PlanSearch) {
    LaunchedEffect(form.query) {
        val q = form.query.trim()
        if (q.isEmpty() || form.state == SearchState.CLOSED) return@LaunchedEffect
        kotlinx.coroutines.delay(250)
        while (true) {
            form.state = SearchState.LOOKING
            when (val a = search.suggest(q)) {
                is DiscoverClient.Answer.Ok -> {
                    form.answer = a.value
                    form.state = if (a.value.ready) SearchState.IDLE else SearchState.NOT_READY
                    if (a.value.ready) return@LaunchedEffect
                }
                DiscoverClient.Answer.Closed -> {
                    form.state = SearchState.CLOSED
                    form.query = ""
                    return@LaunchedEffect
                }
                DiscoverClient.Answer.Failed -> {
                    form.state = SearchState.FAILED
                    return@LaunchedEffect
                }
            }
            kotlinx.coroutines.delay(30_000)
        }
    }
}

/** The search box: cyan while it's the thing you're using, a magnifier, and ✕ to clear. */
@Composable
private fun SearchField(value: String, onValue: (String) -> Unit, onClear: () -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    BasicTextField(
        value, onValue, singleLine = true,
        textStyle = HomeType.Body.copy(fontSize = 19.sp, lineHeight = 24.sp, color = Mosh.Text),
        cursorBrush = SolidColor(Mosh.Cyan),
        modifier = Modifier.fillMaxWidth(),
        decorationBox = { inner ->
            Row(
                Modifier.fillMaxWidth()
                    .border(5.dp, Mosh.Cyan.copy(alpha = 0.10f), RoundedCornerShape(26.dp))
                    .padding(4.dp)
                    .clip(shape).background(Mosh.Cyan.copy(alpha = 0.06f)).border(1.5.dp, Mosh.Cyan, shape)
                    .heightIn(min = 56.dp).padding(start = 16.dp, end = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                HomeIcon(HomeIcons.Search, Mosh.Cyan, 22.dp)
                Spacer(Modifier.width(12.dp))
                Box(Modifier.weight(1f)) {
                    if (value.isEmpty()) Text(stringResource(R.string.search_hint), style = HomeType.Body.copy(fontSize = 19.sp, color = Mosh.TextFaint), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    inner()
                }
                if (value.isNotEmpty()) {
                    val clear = stringResource(R.string.search_clear)
                    Box(
                        Modifier.clip(CircleShape).clickable(role = Role.Button, onClick = onClear).semantics { contentDescription = clear }.padding(10.dp),
                    ) { HomeIcon(HomeIcons.Close, Mosh.TextDim, 20.dp) }
                }
            }
        },
    )
}

/** Near you, elsewhere in the country, worldwide: acts with upcoming shows, biggest first in each. */
@Composable
private fun SuggestList(form: PlanForm, search: PlanSearch) {
    val answer = form.answer
    val typed = form.query.trim()
    val faint = HomeType.Body.copy(fontSize = 14.5.sp, color = Mosh.TextFaint)
    when {
        form.state == SearchState.NOT_READY && (answer == null || answer.empty) ->
            Text(stringResource(R.string.search_getting_list), style = faint, modifier = Modifier.padding(top = 18.dp))
        form.state == SearchState.FAILED ->
            Text(stringResource(R.string.setup_plan_search_failed), style = faint, modifier = Modifier.padding(top = 18.dp))
        answer == null -> Spacer(Modifier.height(18.dp))
        answer.empty && form.state != SearchState.LOOKING ->
            Text(stringResource(R.string.setup_plan_no_results), style = faint, modifier = Modifier.padding(top = 18.dp))
    }
    answer ?: return
    val country = java.util.Locale("", search.country).getDisplayCountry(java.util.Locale.getDefault()).ifBlank { search.country }
    val upper = { t: String -> t.uppercase(java.util.Locale.getDefault()) }
    val sections = listOf(
        (search.regionName?.let { stringResource(R.string.search_near_region, upper(it)) } ?: stringResource(R.string.search_near)) to answer.near,
        stringResource(R.string.search_elsewhere, upper(country)) to answer.elsewhere,
        stringResource(R.string.search_worldwide) to answer.worldwide,
    )
    sections.filter { it.second.isNotEmpty() }.forEach { (title, acts) ->
        Spacer(Modifier.height(20.dp))
        Kicker(title)
        Spacer(Modifier.height(4.dp))
        acts.forEach { s ->
            val next = s.next ?: return@forEach
            SuggestRow(s, next, typed, country, worldwide = acts === answer.worldwide) { form.fill(next, s.artist, search.startOf(next)) }
        }
    }
}

/** "Sat 13 Mar" for a show's own (venue-local) date. */
private fun showDay(date: String): String = runCatching {
    val d = java.time.LocalDate.parse(date)
    val pattern = android.text.format.DateFormat.getBestDateTimePattern(java.util.Locale.getDefault(), "EEEdMMM")
    d.format(java.time.format.DateTimeFormatter.ofPattern(pattern, java.util.Locale.getDefault()))
}.getOrDefault(date)

/** One act: its colours, the name with what was typed in cyan, how many shows and the next one. */
@Composable
private fun SuggestRow(s: Suggestion, next: DiscoverShow, typed: String, country: String, worldwide: Boolean, onClick: () -> Unit) {
    val at = listOf(showDay(next.date), next.city).filter { it.isNotBlank() }.joinToString(", ")
    val count = if (worldwide) pluralStringResource(R.plurals.search_shows_worldwide, s.shows, s.shows)
    else pluralStringResource(R.plurals.search_shows_in, s.countryShows, s.countryShows, country)
    val many = if (worldwide) s.shows > 1 else s.countryShows > 1
    val sub = dotLine(listOf(count, if (many) stringResource(R.string.search_next, at) else at), keep = 40)
    val name = buildAnnotatedString {
        append(s.artist)
        TypedMatch.range(s.artist, typed)?.let { r -> addStyle(SpanStyle(color = Mosh.Cyan), r.first, r.last + 1) }
    }
    Row(
        Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)).clickable(role = Role.Button, onClick = onClick).padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ShowArt(s.artist, Modifier.size(48.dp), corner = 24)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(name, style = HomeType.RowTitle.copy(fontSize = 17.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(sub, style = HomeType.Body.copy(fontSize = 14.5.sp, lineHeight = 19.sp, color = Mosh.TextDim))
        }
        Spacer(Modifier.width(8.dp))
        HomeIcon(HomeIcons.Chevron, Mosh.TextFaint, 18.dp)
    }
}

/** "Type your own gig": pinned under the suggestions, back to today's name, date and venue form. */
@Composable
private fun ColumnScope.TypeOwnRow(onClick: () -> Unit) {
    Box(Modifier.fillMaxWidth().height(1.dp).background(Mosh.Hairline))
    val shape = RoundedCornerShape(20.dp)
    Row(
        Modifier.padding(start = HomeSide, end = HomeSide, top = 12.dp, bottom = 16.dp).fillMaxWidth()
            .clip(shape).background(Mosh.GlassFill).border(1.dp, Mosh.GlassLine, shape)
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 60.dp).padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HomeIcon(HomeIcons.Pencil, Mosh.Violet, 22.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(stringResource(R.string.search_type_own), style = HomeType.RowTitle.copy(fontSize = 16.sp))
            Text(stringResource(R.string.search_type_own_sub), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.TextDim))
        }
        Spacer(Modifier.width(8.dp))
        HomeIcon(HomeIcons.Chevron, Mosh.TextFaint, 18.dp)
    }
}

/**
 * Typed in by hand: works anywhere, no key or internet needed. Who's playing, then the date and
 * time, then the venue (optional), as the owner asked (answer 6).
 */
@Composable
internal fun HandEntry(form: PlanForm, onPick: (PlannedGig) -> Unit, lookupVenue: (suspend (String) -> Pair<Double, Double>?)?) {
    val context = LocalContext.current
    PlanField(stringResource(R.string.setup_plan_whos_playing), form.name, { form.name = it.take(40) }, "")
    Spacer(Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        val day = java.text.SimpleDateFormat(android.text.format.DateFormat.getBestDateTimePattern(java.util.Locale.getDefault(), "EEEdMMM"), java.util.Locale.getDefault()).format(Date(form.at * 1000))
        PickerButton(day, HomeIcons.Calendar, Modifier.weight(1f)) {
            val cal = Calendar.getInstance().apply { timeInMillis = form.at * 1000 }
            android.app.DatePickerDialog(context, { _, y, m, d ->
                cal.set(y, m, d)
                form.at = cal.timeInMillis / 1000
            }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
        }
        PickerButton(DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(form.at * 1000)), HomeIcons.Clock, Modifier.weight(1f)) {
            val cal = Calendar.getInstance().apply { timeInMillis = form.at * 1000 }
            android.app.TimePickerDialog(context, { _, h, min ->
                cal.set(Calendar.HOUR_OF_DAY, h)
                cal.set(Calendar.MINUTE, min)
                form.at = cal.timeInMillis / 1000
            }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), android.text.format.DateFormat.is24HourFormat(context)).show()
        }
    }
    Spacer(Modifier.height(12.dp))
    PlanField(stringResource(R.string.setup_plan_where), form.venue, { form.venue = it.take(60); form.lat = null; form.lon = null }, stringResource(R.string.plan_venue_hint))
    if (form.tickets.isNotBlank()) TicketLinkLine(form.tickets) { form.tickets = "" }
    Spacer(Modifier.height(18.dp))
    val defaultGigName = stringResource(R.string.setup_plan_default_name)
    val scope = rememberCoroutineScope()
    var finding by remember { mutableStateOf(false) }
    StartButton(if (finding) stringResource(R.string.venue_finding) else stringResource(R.string.setup_plan_start_crew)) {
        if (finding) return@StartButton
        val where = form.venue.trim()
        val name = form.name.trim().ifBlank { defaultGigName }
        val picked = form.lat != null && form.lon != null
        if (lookupVenue == null || where.isBlank() || picked) {
            onPick(PlannedGig(name, form.at, where, form.lat, form.lon, form.tickets, form.showId))
        } else {
            // A few seconds at most: not found or no internet just means no position.
            finding = true
            scope.launch {
                val found = kotlinx.coroutines.withTimeoutOrNull(4_000) { runCatching { lookupVenue(where) }.getOrNull() }
                finding = false
                onPick(PlannedGig(name, form.at, where, found?.first, found?.second, form.tickets, form.showId))
            }
        }
    }
}

/** "Ticket link: tickets.example.com" under the venue, once a show was picked; ✕ drops it from the plan. */
@Composable
private fun TicketLinkLine(link: String, onRemove: () -> Unit) {
    val host = runCatching { java.net.URI(link).host }.getOrNull()?.removePrefix("www.") ?: link
    val remove = stringResource(R.string.plan_tickets_remove)
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        HomeIcon(HomeIcons.Ticket, Mosh.Lime, 18.dp)
        Spacer(Modifier.width(8.dp))
        Text(stringResource(R.string.plan_tickets_from, host), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.TextDim), modifier = Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        Box(Modifier.clip(CircleShape).clickable(role = Role.Button, onClick = onRemove).semantics { contentDescription = remove }.padding(10.dp)) {
            HomeIcon(HomeIcons.Close, Mosh.TextFaint, 16.dp)
        }
    }
}

/** A field in the design's look: a rounded box with its label inside, over what's typed. */
@Composable
internal fun PlanField(label: String, value: String, onValue: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(18.dp)
    BasicTextField(
        value, onValue, singleLine = true,
        textStyle = HomeType.Body.copy(fontSize = 18.sp, lineHeight = 24.sp, color = Mosh.Text),
        cursorBrush = SolidColor(Mosh.Cyan),
        modifier = modifier.fillMaxWidth(),
        decorationBox = { inner ->
            Column(
                Modifier.fillMaxWidth().clip(shape).background(Mosh.GlassFill).border(1.dp, Mosh.GlassLineStrong, shape)
                    .heightIn(min = 60.dp).padding(horizontal = 16.dp, vertical = 10.dp),
            ) {
                Text(label, style = HomeType.Small.copy(fontSize = 13.sp, color = Mosh.TextFaint), maxLines = 1, overflow = TextOverflow.Ellipsis)
                Box {
                    if (value.isEmpty() && placeholder.isNotEmpty()) {
                        Text(placeholder, style = HomeType.Body.copy(fontSize = 18.sp, lineHeight = 24.sp, color = Mosh.TextFaint), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    inner()
                }
            }
        },
    )
}

/** The date or the time: a glass button with its icon, the value centred. */
@Composable
private fun PickerButton(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val (source, scale) = rememberPress()
    val shape = RoundedCornerShape(18.dp)
    Row(
        modifier.pressScale(scale).clip(shape).background(Mosh.GlassFill).border(1.dp, Mosh.GlassLineStrong, shape)
            .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .heightIn(min = 52.dp).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        HomeIcon(icon, Mosh.Lilac, 22.dp)
        Spacer(Modifier.width(10.dp))
        Text(text, style = HomeType.RowTitle.copy(fontSize = 17.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
    }
}

/** "Start the crew": the sheet's one big gradient pill, with the pink glow under it. */
@Composable
private fun StartButton(text: String, onClick: () -> Unit) {
    val (source, scale) = rememberPress()
    val shape = RoundedCornerShape(30.dp)
    Box(
        Modifier.fillMaxWidth().pressScale(scale)
            .drawBehind {
                val inset = 14.dp.toPx()
                val drop = 16.dp.toPx()
                glow(Mosh.Pink, 18.dp.toPx(), 0.55f) { p ->
                    drawContext.canvas.drawRoundRect(inset, drop + inset, size.width - inset, size.height + drop - inset, 30.dp.toPx(), 30.dp.toPx(), p)
                }
            }
            .clip(shape)
            .background(Brush.horizontalGradient(0f to Mosh.Pink, 0.55f to Mosh.Violet, 1f to Mosh.Cyan))
            .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .heightIn(min = 60.dp).padding(horizontal = 20.dp, vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = HomeType.Button.copy(fontSize = 20.sp, color = Color.White), textAlign = TextAlign.Center)
    }
}

/** The small amber Moshpoint+ mark: never louder than what's next to it. */
@Composable
internal fun PlusChip(modifier: Modifier = Modifier) {
    val shape = RoundedCornerShape(18.dp)
    Row(
        modifier.clip(shape).background(Mosh.Amber.copy(alpha = 0.10f)).border(1.dp, Mosh.Amber.copy(alpha = 0.55f), shape)
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HomeIcon(HomeIcons.Sparkle, Mosh.Amber, 15.dp)
        Spacer(Modifier.width(6.dp))
        Text(PLUS_NAME, style = HomeType.Label.copy(fontSize = 14.sp, color = Mosh.Amber), maxLines = 1)
    }
}

/** The quiet Moshpoint+ card for free users (FreeView.png): no price, no Upgrade button. */
@Composable
private fun PlusCard(onMore: () -> Unit) {
    val shape = RoundedCornerShape(24.dp)
    Column(
        Modifier.fillMaxWidth().clip(shape).background(Mosh.Amber.copy(alpha = 0.03f)).border(1.dp, Mosh.Amber.copy(alpha = 0.30f), shape)
            .padding(horizontal = 18.dp, vertical = 16.dp),
    ) {
        PlusChip()
        Spacer(Modifier.height(12.dp))
        Text(stringResource(R.string.plus_card_title), style = HomeType.RowTitle.copy(fontSize = 17.sp, lineHeight = 23.sp))
        Spacer(Modifier.height(6.dp))
        Text(stringResource(R.string.plus_card_text), style = HomeType.Body.copy(fontSize = 14.5.sp, lineHeight = 20.sp, color = Mosh.TextDim))
        Spacer(Modifier.height(10.dp))
        Row(
            Modifier.clip(RoundedCornerShape(10.dp)).clickable(role = Role.Button, onClick = onMore).heightIn(min = 40.dp).padding(vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.plus_card_more), style = HomeType.Label.copy(fontSize = 16.sp, color = Mosh.Amber))
            Spacer(Modifier.width(6.dp))
            HomeIcon(HomeIcons.Chevron, Mosh.Amber, 16.dp)
        }
    }
}

/**
 * "What's in Moshpoint+": a plain list of what it adds, and that it can't be bought yet (there's
 * no billing). Back returns to the plan with everything typed still there.
 */
@Composable
internal fun ColumnScope.PlusInfoContent(onBack: () -> Unit) {
    Column(Modifier.weight(1f, fill = false).fillMaxWidth().verticalScroll(rememberScrollState()).padding(start = HomeSide, end = HomeSide, bottom = 24.dp)) {
        PlusChip(Modifier.padding(top = 6.dp))
        Spacer(Modifier.height(14.dp))
        Text(stringResource(R.string.plus_info_title), style = HomeType.Hero.copy(fontSize = 30.sp), modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(18.dp))
        PlusRow(HomeIcons.Search, R.string.plus_info_search_title, R.string.plus_info_search_text)
        PlusRow(HomeIcons.Calendar, R.string.plus_info_coming_title, R.string.plus_info_coming_text)
        PlusRow(HomeIcons.MapPin, R.string.plus_info_map_title, R.string.plus_info_map_text)
        PlusRow(HomeIcons.Navigate, R.string.plus_info_watch_title, R.string.plus_info_watch_text)
        Spacer(Modifier.height(8.dp))
        val shape = RoundedCornerShape(20.dp)
        Column(
            Modifier.fillMaxWidth().clip(shape).background(Mosh.Amber.copy(alpha = 0.06f)).border(1.dp, Mosh.Amber.copy(alpha = 0.30f), shape)
                .padding(horizontal = 16.dp, vertical = 14.dp),
        ) {
            Kicker(stringResource(R.string.plus_info_soon_title), colour = Mosh.Amber)
            Spacer(Modifier.height(6.dp))
            Text(stringResource(R.string.plus_info_soon_text), style = HomeType.Body.copy(fontSize = 15.sp, lineHeight = 21.sp))
        }
        Spacer(Modifier.height(18.dp))
        GlassAction(stringResource(R.string.plus_info_back), HomeIcons.Plan, Modifier.fillMaxWidth(), onClick = onBack)
    }
}

@Composable
private fun PlusRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: Int, text: Int) {
    Row(Modifier.fillMaxWidth().padding(bottom = 16.dp), verticalAlignment = Alignment.Top) {
        Box(Modifier.padding(top = 2.dp).clip(RoundedCornerShape(12.dp)).background(Mosh.GlassFill).padding(8.dp)) { HomeIcon(icon, Mosh.Amber, 20.dp) }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(stringResource(title), style = HomeType.RowTitle.copy(fontSize = 16.sp))
            Spacer(Modifier.height(2.dp))
            Text(stringResource(text), style = HomeType.Body.copy(fontSize = 14.5.sp, lineHeight = 20.sp, color = Mosh.TextDim))
        }
    }
}
