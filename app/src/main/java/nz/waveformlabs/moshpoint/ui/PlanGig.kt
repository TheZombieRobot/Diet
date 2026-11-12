package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.GigSearch
import nz.waveformlabs.moshpoint.R
import androidx.compose.ui.res.stringResource
import kotlinx.coroutines.launch
import java.text.DateFormat
import java.util.Calendar
import java.util.Date

/** "Sat 14 Dec, 8:00 pm" in the phone's own format. */

/**
 * Plan a gig: search ("iron" -> Iron Maiden, Spark Arena, Sat) or type it in, then start
 * that gig's crew. A crew for a later day sleeps until then: mates can join now and nothing
 * runs (no Bluetooth, no location, no battery) until gig day.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun PlanGigSheet(
    search: (suspend (String) -> List<GigSearch.Gig>?)?,
    onPick: (name: String, startsAtSec: Long, venue: String, lat: Double?, lon: Double?) -> Unit,
    onClose: () -> Unit,
    /**
     * Finds where a venue typed by hand is (lat, lon), or null. Asked once, when "Start crew"
     * is tapped (never while typing), so the crew and its invite carry the venue's position.
     */
    lookupVenue: (suspend (String) -> Pair<Double, Double>?)? = null,
) {
    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onClose, containerColor = Mosh.Deep) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.setup_plan_title), style = Mosh.Heading)
            Text(stringResource(R.string.setup_plan_desc), style = Mosh.Body)

            if (search != null) {
                var query by remember { mutableStateOf("") }
                var results by remember { mutableStateOf<List<GigSearch.Gig>?>(emptyList()) }
                var busy by remember { mutableStateOf(false) }
                OutlinedTextField(
                    query, { query = it }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text(stringResource(R.string.setup_plan_search_hint)) },
                )
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
                when {
                    busy -> Text(stringResource(R.string.setup_plan_searching), style = Mosh.Body.copy(color = Mosh.TextFaint))
                    results == null -> Text(stringResource(R.string.setup_plan_search_failed), style = Mosh.Body.copy(color = Mosh.TextFaint))
                    results!!.isEmpty() && query.trim().length >= 2 -> Text(stringResource(R.string.setup_plan_no_results), style = Mosh.Body.copy(color = Mosh.TextFaint))
                }
                results.orEmpty().take(12).forEach { g ->
                    Column(
                        Modifier.fillMaxWidth().background(Mosh.SurfaceLow, RoundedCornerShape(14.dp))
                            .clickable { onPick(g.name.take(40), g.startsAtSec, listOf(g.venue, g.city).filter { it.isNotBlank() }.joinToString(", "), g.lat, g.lon) }
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    ) {
                        Text(g.name, style = Mosh.Label.copy(fontSize = 15.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        val where = listOf(g.venue, g.city).filter { it.isNotBlank() }.joinToString(", ")
                        Text(
                            if (where.isBlank()) gigWhen(g.startsAtSec) else stringResource(R.string.setup_plan_when_where, gigWhen(g.startsAtSec), where),
                            style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim),
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.setup_plan_or_type), style = Mosh.Eyebrow)
            }

            // By hand: works anywhere, no key or internet needed.
            val context = LocalContext.current
            var name by remember { mutableStateOf("") }
            var venue by remember { mutableStateOf("") }
            var at by remember {
                mutableLongStateOf(
                    Calendar.getInstance().apply {
                        set(Calendar.HOUR_OF_DAY, 20); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0)
                        if (timeInMillis < System.currentTimeMillis()) add(Calendar.DAY_OF_MONTH, 1)
                    }.timeInMillis / 1000,
                )
            }
            OutlinedTextField(name, { name = it.take(40) }, singleLine = true, modifier = Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.setup_plan_whos_playing)) })
            OutlinedTextField(venue, { venue = it.take(60) }, singleLine = true, modifier = Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.setup_plan_where)) })
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlassButton(java.text.SimpleDateFormat(android.text.format.DateFormat.getBestDateTimePattern(java.util.Locale.getDefault(), "EEEdMMM"), java.util.Locale.getDefault()).format(Date(at * 1000)), Modifier.weight(1f)) {
                    val cal = Calendar.getInstance().apply { timeInMillis = at * 1000 }
                    android.app.DatePickerDialog(context, { _, y, m, d ->
                        cal.set(y, m, d)
                        at = cal.timeInMillis / 1000
                    }, cal.get(Calendar.YEAR), cal.get(Calendar.MONTH), cal.get(Calendar.DAY_OF_MONTH)).show()
                }
                GlassButton(DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(at * 1000)), Modifier.weight(1f)) {
                    val cal = Calendar.getInstance().apply { timeInMillis = at * 1000 }
                    android.app.TimePickerDialog(context, { _, h, min ->
                        cal.set(Calendar.HOUR_OF_DAY, h)
                        cal.set(Calendar.MINUTE, min)
                        at = cal.timeInMillis / 1000
                    }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), android.text.format.DateFormat.is24HourFormat(context)).show()
                }
            }
            val defaultGigName = stringResource(R.string.setup_plan_default_name)
            val scope = androidx.compose.runtime.rememberCoroutineScope()
            var finding by remember { mutableStateOf(false) }
            NeonButton(if (finding) stringResource(R.string.venue_finding) else stringResource(R.string.setup_plan_start_crew)) {
                if (finding) return@NeonButton
                val where = venue.trim()
                if (lookupVenue == null || where.isBlank()) {
                    onPick(name.ifBlank { defaultGigName }, at, where, null, null)
                } else {
                    // A few seconds at most: not found or no internet just means no position.
                    finding = true
                    scope.launch {
                        val found = kotlinx.coroutines.withTimeoutOrNull(4_000) { runCatching { lookupVenue(where) }.getOrNull() }
                        finding = false
                        onPick(name.ifBlank { defaultGigName }, at, where, found?.first, found?.second)
                    }
                }
            }
            Spacer(Modifier.heightIn(min = 4.dp))
        }
    }
}
