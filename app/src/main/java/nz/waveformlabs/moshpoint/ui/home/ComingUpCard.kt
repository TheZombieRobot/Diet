package nz.waveformlabs.moshpoint.ui.home

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.DiscoverShow
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.pressScale
import nz.waveformlabs.moshpoint.ui.rememberPress

/** How the Coming up card's answer stands. */
enum class ComingStatus { LOADING, READY, NOT_READY, FAILED, CLOSED }

/** What the "Coming up near you" card shows (ComingUp.png, docs/DISCOVER_APP.md). */
class ComingUpView(
    /** `near`, `country` or `travel`: the chip that's on. */
    val scope: String,
    /** The region "Near me" means ("North Island"), when known. */
    val regionName: String?,
    val shows: List<DiscoverShow>,
    val status: ComingStatus,
    /** Show id → crew id for the shows that already have a crew on this phone ("Planned ✓"). */
    val planned: Map<String, String> = emptyMap(),
)

/**
 * "Coming up near you": the next 12 months near you, the whole country, or worth travelling for,
 * as a strip of shows. Plan it starts a planned crew with the show filled in; a planned one says
 * "Planned ✓" and opens its crew. The search button opens Plan a gig (it replaces that row).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun ComingUpCard(
    view: ComingUpView,
    onScope: (String) -> Unit,
    onSearch: () -> Unit,
    onPlan: (DiscoverShow) -> Unit,
    onOpenPlanned: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val shape = RoundedCornerShape(28.dp)
    Column(
        modifier.fillMaxWidth().clip(shape)
            .background(Brush.verticalGradient(listOf(Mosh.Violet.copy(alpha = 0.10f), Mosh.GlassFill)))
            .border(1.dp, Mosh.GlassLine, shape)
            .padding(top = 18.dp, bottom = 20.dp),
    ) {
        Row(Modifier.padding(start = 20.dp, end = 14.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.coming_title), style = HomeType.Section.copy(fontSize = 22.sp),
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            Spacer(Modifier.width(10.dp))
            RoundIconButton(HomeIcons.Search, stringResource(R.string.coming_search), onSearch)
        }
        Spacer(Modifier.height(14.dp))
        FlowRow(Modifier.padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            ScopeChip(
                view.regionName?.let { stringResource(R.string.coming_near_region, it) } ?: stringResource(R.string.coming_near),
                view.scope == "near",
            ) { onScope("near") }
            ScopeChip(stringResource(R.string.coming_country), view.scope == "country") { onScope("country") }
            ScopeChip(stringResource(R.string.coming_travel), view.scope == "travel") { onScope("travel") }
        }
        Spacer(Modifier.height(16.dp))
        val note = when {
            view.status == ComingStatus.READY && view.shows.isEmpty() -> stringResource(R.string.coming_empty)
            view.status == ComingStatus.FAILED -> stringResource(R.string.coming_failed)
            view.shows.isEmpty() -> stringResource(R.string.search_getting_list)
            else -> null
        }
        if (note != null) {
            Text(note, style = HomeType.Body.copy(fontSize = 14.5.sp, color = Mosh.TextFaint), modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        } else {
            val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
            LazyRow(
                // The far edge fades: there's more to scroll to.
                Modifier.fillMaxWidth().graphicsLayer(compositingStrategy = CompositingStrategy.Offscreen).drawWithContent {
                    drawContent()
                    val w = 36.dp.toPx()
                    val from = if (rtl) 0f else size.width - w
                    drawRect(
                        Brush.horizontalGradient(
                            if (rtl) listOf(Color.Transparent, Color.Black) else listOf(Color.Black, Color.Transparent),
                            startX = from, endX = from + w,
                        ),
                        topLeft = androidx.compose.ui.geometry.Offset(from, 0f),
                        size = androidx.compose.ui.geometry.Size(w, size.height),
                        blendMode = BlendMode.DstIn,
                    )
                },
                contentPadding = PaddingValues(horizontal = 20.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(view.shows.distinctBy { it.id.ifBlank { it.artist + it.date } }, key = { it.id.ifBlank { it.artist + it.date } }) { show ->
                    val crew = view.planned[show.id]
                    ShowTile(show, travel = view.scope == "travel", planned = crew != null) {
                        if (crew != null) onOpenPlanned(crew) else onPlan(show)
                    }
                }
            }
        }
    }
}

/** A filter chip that wraps rather than scrolls: lime when it's on. */
@Composable
private fun ScopeChip(text: String, on: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(22.dp)
    Box(
        Modifier.clip(shape)
            .background(if (on) Mosh.Lime.copy(alpha = 0.08f) else Mosh.GlassFill)
            .border(1.dp, if (on) Mosh.Lime.copy(alpha = 0.55f) else Mosh.GlassLineStrong, shape)
            .clickable(role = Role.Tab, onClick = onClick)
            .heightIn(min = 40.dp).padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(text, style = HomeType.Label.copy(fontSize = 15.sp, color = if (on) Mosh.Lime else Mosh.Text), maxLines = 2, textAlign = TextAlign.Center)
    }
}

/** One show: its colours with the date on them, the act, the venue and town, and Plan it. */
@Composable
private fun ShowTile(show: DiscoverShow, travel: Boolean, planned: Boolean, onClick: () -> Unit) {
    Column(Modifier.width(140.dp)) {
        Box {
            ShowArt(show.artist, Modifier.size(140.dp, 92.dp), corner = 16)
            DateBadge(show.date, Modifier.padding(8.dp))
        }
        Spacer(Modifier.height(10.dp))
        Text(show.artist, style = HomeType.RowTitle.copy(fontSize = 17.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (show.venue.isNotBlank()) Text(show.venue, style = HomeType.Body.copy(fontSize = 14.5.sp, lineHeight = 18.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
        val faint = HomeType.Body.copy(fontSize = 14.5.sp, lineHeight = 18.sp, color = Mosh.TextFaint)
        if (show.city.isNotBlank()) Text(show.city, style = faint, maxLines = 1, overflow = TextOverflow.Ellipsis)
        // Worth travelling for: how far, on its own line so it's never cut short.
        if (travel && show.km > 0) {
            Text(stringResource(R.string.coming_km, java.text.NumberFormat.getIntegerInstance().format(show.km)), style = faint.copy(color = Mosh.Lilac), maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(10.dp))
        PlanItButton(planned, onClick)
    }
}

/** FRI / 4 / DEC on a dark glass square, from the show's own (venue-local) date. */
@Composable
private fun DateBadge(date: String, modifier: Modifier = Modifier) {
    val d = runCatching { java.time.LocalDate.parse(date) }.getOrNull() ?: return
    val locale = java.util.Locale.getDefault()
    val shape = RoundedCornerShape(10.dp)
    Column(
        modifier.clip(shape).background(Mosh.Ground.copy(alpha = 0.72f)).border(1.dp, Mosh.GlassLineStrong, shape)
            .padding(horizontal = 9.dp, vertical = 5.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        val small = HomeType.Kicker.copy(fontSize = 10.5.sp, letterSpacing = 1.5.sp, color = Mosh.TextDim)
        Text(d.dayOfWeek.getDisplayName(java.time.format.TextStyle.SHORT, locale).uppercase(locale).trimEnd('.'), style = small, maxLines = 1)
        Text(java.text.NumberFormat.getIntegerInstance(locale).format(d.dayOfMonth), style = HomeType.Button.copy(fontSize = 19.sp, lineHeight = 21.sp, color = Mosh.Text), maxLines = 1)
        Text(d.month.getDisplayName(java.time.format.TextStyle.SHORT, locale).uppercase(locale).trimEnd('.'), style = small, maxLines = 1)
    }
}

/** "Plan it" (cyan outline), or "Planned ✓" (lime) once this phone has a crew for the show. */
@Composable
private fun PlanItButton(planned: Boolean, onClick: () -> Unit) {
    val (source, scale) = rememberPress()
    val shape = RoundedCornerShape(14.dp)
    val tint = if (planned) Mosh.Lime else Mosh.Cyan
    Row(
        Modifier.fillMaxWidth().pressScale(scale).clip(shape)
            .background(tint.copy(alpha = 0.07f)).border(1.dp, tint.copy(alpha = 0.35f), shape)
            .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .heightIn(min = 44.dp).padding(horizontal = 10.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (!planned) {
            HomeIcon(HomeIcons.CalendarPlus, tint, 18.dp)
            Spacer(Modifier.width(8.dp))
        }
        Text(
            stringResource(if (planned) R.string.coming_planned else R.string.coming_plan_it),
            style = HomeType.Label.copy(fontSize = 15.sp, color = tint), maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
    }
}
