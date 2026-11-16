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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.text.DateFormat
import java.util.Calendar
import java.util.Date
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.gigs.GigSearch
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.gigWhen
import nz.waveformlabs.moshpoint.ui.glow
import nz.waveformlabs.moshpoint.ui.pressScale
import nz.waveformlabs.moshpoint.ui.rememberPress

/** The paid tier's name, never translated (like the wordmark). */
internal const val PLUS_NAME = "Moshpoint+"

/** A gig picked or typed in: everything a planned crew starts with (docs/DISCOVER_APP.md). */
class PlannedGig(
    val name: String,
    val startsAtSec: Long,
    val venue: String,
    val lat: Double? = null,
    val lon: Double? = null,
    /** The official ticket page, from Discover; blank when typed in by hand. */
    val tickets: String = "",
)

/** What's typed into Plan a gig, kept while the sheet shows "What's in Moshpoint+" and back. */
@Stable
class PlanForm(startsAtSec: Long) {
    var name by mutableStateOf("")
    var venue by mutableStateOf("")
    var at by mutableLongStateOf(startsAtSec)

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
    /** Moshpoint+ (Entitlements.plus): no Moshpoint+ card. */
    member: Boolean,
    search: (suspend (String) -> List<GigSearch.Gig>?)?,
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
        Column(Modifier.fillMaxWidth().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState())) {
            if (plusOpen) {
                PlusInfoContent(onBack = { plusOpen = false })
            } else {
                PlanGigContent(form, member, search, onPick, lookupVenue, onWhatsPlus = { plusOpen = true })
            }
        }
    }
}

/** The sheet's contents (drawn on its own in the screenshot tests). */
@Composable
internal fun ColumnScope.PlanGigContent(
    form: PlanForm,
    member: Boolean,
    search: (suspend (String) -> List<GigSearch.Gig>?)?,
    onPick: (PlannedGig) -> Unit,
    lookupVenue: (suspend (String) -> Pair<Double, Double>?)?,
    onWhatsPlus: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(start = HomeSide, end = HomeSide, bottom = 24.dp)) {
        Text(stringResource(R.string.setup_plan_title), style = HomeType.Hero.copy(fontSize = 32.sp), modifier = Modifier.padding(top = 6.dp).semantics { heading() })
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.setup_plan_desc), style = HomeType.Body.copy(fontSize = 16.sp, lineHeight = 23.sp))
        if (search != null) OldSearch(search, onPick)
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

/** The search members had before Discover (stage 3 replaces it with suggestions). */
@Composable
private fun OldSearch(search: suspend (String) -> List<GigSearch.Gig>?, onPick: (PlannedGig) -> Unit) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<GigSearch.Gig>?>(emptyList()) }
    var busy by remember { mutableStateOf(false) }
    Spacer(Modifier.height(16.dp))
    PlanField(stringResource(R.string.setup_plan_search_hint), query, { query = it }, "")
    LaunchedEffect(query) {
        if (query.trim().length < 2) {
            results = emptyList()
            return@LaunchedEffect
        }
        kotlinx.coroutines.delay(350) // wait for typing to pause
        busy = true
        results = search(query)
        busy = false
    }
    val faint = HomeType.Body.copy(color = Mosh.TextFaint)
    when {
        busy -> Text(stringResource(R.string.setup_plan_searching), style = faint, modifier = Modifier.padding(top = 8.dp))
        results == null -> Text(stringResource(R.string.setup_plan_search_failed), style = faint, modifier = Modifier.padding(top = 8.dp))
        results!!.isEmpty() && query.trim().length >= 2 -> Text(stringResource(R.string.setup_plan_no_results), style = faint, modifier = Modifier.padding(top = 8.dp))
    }
    results.orEmpty().take(12).forEach { g ->
        val where = listOf(g.venue, g.city).filter { it.isNotBlank() }.joinToString(", ")
        Column(
            Modifier.padding(top = 8.dp).fillMaxWidth().background(Mosh.SurfaceLow, RoundedCornerShape(14.dp))
                .clickable { onPick(PlannedGig(g.name.take(40), g.startsAtSec, where, g.lat, g.lon)) }
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            Text(g.name, style = HomeType.Label.copy(fontSize = 15.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
            Text(
                if (where.isBlank()) gigWhen(g.startsAtSec) else stringResource(R.string.setup_plan_when_where, gigWhen(g.startsAtSec), where),
                style = HomeType.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim),
            )
        }
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
    PlanField(stringResource(R.string.setup_plan_where), form.venue, { form.venue = it.take(60) }, stringResource(R.string.plan_venue_hint))
    Spacer(Modifier.height(18.dp))
    val defaultGigName = stringResource(R.string.setup_plan_default_name)
    val scope = rememberCoroutineScope()
    var finding by remember { mutableStateOf(false) }
    StartButton(if (finding) stringResource(R.string.venue_finding) else stringResource(R.string.setup_plan_start_crew)) {
        if (finding) return@StartButton
        val where = form.venue.trim()
        val name = form.name.trim().ifBlank { defaultGigName }
        if (lookupVenue == null || where.isBlank()) {
            onPick(PlannedGig(name, form.at, where))
        } else {
            // A few seconds at most: not found or no internet just means no position.
            finding = true
            scope.launch {
                val found = kotlinx.coroutines.withTimeoutOrNull(4_000) { runCatching { lookupVenue(where) }.getOrNull() }
                finding = false
                onPick(PlannedGig(name, form.at, where, found?.first, found?.second))
            }
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
    Column(Modifier.fillMaxWidth().padding(start = HomeSide, end = HomeSide, bottom = 24.dp)) {
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
