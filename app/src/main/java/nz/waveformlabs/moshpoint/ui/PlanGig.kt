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
import java.text.DateFormat
import java.util.Calendar
import java.util.Date

/** "Sat 14 Dec, 8:00 pm" in the phone's own format. */
internal fun gigWhen(startsAtSec: Long): String {
    val d = Date(startsAtSec * 1000)
    val day = java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.getDefault()).format(d)
    return "$day, " + DateFormat.getTimeInstance(DateFormat.SHORT).format(d)
}

/**
 * Plan a gig: search ("iron" -> Iron Maiden, Spark Arena, Sat) or type it in, then start
 * that gig's crew. A crew for a later day sleeps until then: mates can join now and nothing
 * runs (no Bluetooth, no location, no battery) until gig day.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
internal fun PlanGigSheet(
    search: (suspend (String) -> List<GigSearch.Gig>?)?,
    onPick: (name: String, startsAtSec: Long, venue: String) -> Unit,
    onClose: () -> Unit,
) {
    androidx.compose.material3.ModalBottomSheet(onDismissRequest = onClose, containerColor = Mosh.Deep) {
        Column(
            Modifier.fillMaxWidth().navigationBarsPadding().imePadding().verticalScroll(rememberScrollState())
                .padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Plan a gig", style = Mosh.Heading)
            Text("Start the crew now, everyone joins when it suits. It sleeps (no battery) until the day.", style = Mosh.Body)

            if (search != null) {
                var query by remember { mutableStateOf("") }
                var results by remember { mutableStateOf<List<GigSearch.Gig>?>(emptyList()) }
                var busy by remember { mutableStateOf(false) }
                OutlinedTextField(
                    query, { query = it }, singleLine = true, modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Search: band, artist or venue") },
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
                    busy -> Text("Searching…", style = Mosh.Body.copy(color = Mosh.TextFaint))
                    results == null -> Text("Couldn't search right now. Type it in below instead.", style = Mosh.Body.copy(color = Mosh.TextFaint))
                    results!!.isEmpty() && query.trim().length >= 2 -> Text("No upcoming gigs found. Type it in below.", style = Mosh.Body.copy(color = Mosh.TextFaint))
                }
                results.orEmpty().take(12).forEach { g ->
                    Column(
                        Modifier.fillMaxWidth().background(Mosh.SurfaceLow, RoundedCornerShape(14.dp))
                            .clickable { onPick(g.name.take(40), g.startsAtSec, listOf(g.venue, g.city).filter { it.isNotBlank() }.joinToString(", ")) }
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                    ) {
                        Text(g.name, style = Mosh.Label.copy(fontSize = 15.sp), maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text(
                            gigWhen(g.startsAtSec) + listOf(g.venue, g.city).filter { it.isNotBlank() }.joinToString(", ").let { if (it.isBlank()) "" else " · $it" },
                            style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim),
                        )
                    }
                }
                Spacer(Modifier.height(4.dp))
                Text("OR TYPE IT IN", style = Mosh.Eyebrow)
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
            OutlinedTextField(name, { name = it.take(40) }, singleLine = true, modifier = Modifier.fillMaxWidth(), label = { Text("Who's playing") })
            OutlinedTextField(venue, { venue = it.take(60) }, singleLine = true, modifier = Modifier.fillMaxWidth(), label = { Text("Where (optional)") })
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                GlassButton(java.text.SimpleDateFormat("EEE d MMM", java.util.Locale.getDefault()).format(Date(at * 1000)), Modifier.weight(1f)) {
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
            NeonButton("Start the crew") { onPick(name.ifBlank { "Gig night" }, at, venue.trim()) }
            Spacer(Modifier.heightIn(min = 4.dp))
        }
    }
}
