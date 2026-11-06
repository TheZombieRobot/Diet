package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.MethodDebug

/**
 * Debug builds only (FinderScreen only shows it when BuildConfig.DEBUG).
 *
 * Shows, live:
 *  - every method for every tracked friend: last reading, age, trust score, and which one
 *    is driving the arrow (green dot);
 *  - on/off and "solo" per method, to test each technology on its own;
 *  - the status of each technology (UWB session, Wi-Fi Aware, Bluetooth, GPS, server...);
 *  - a log of every hand-over between methods.
 */
@Composable
fun DebugPanel(
    rows: Map<String, List<MethodDebug>>,
    friendOf: (String) -> Friend?,
    enabled: Set<Method>,
    onToggle: (Method, Boolean) -> Unit,
    onSolo: (Method?) -> Unit,
    tech: Map<String, String>,
    log: List<String>,
    onClearLog: () -> Unit,
    recording: Boolean,
    recordedRows: Int,
    onRecord: (Boolean) -> Unit,
    onMark: (String) -> Unit,
    onShare: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var marking by remember { mutableStateOf(false) }
    var markText by remember { mutableStateOf("") }
    if (marking) {
        AlertDialog(
            onDismissRequest = { marking = false },
            title = { Text("Mark ground truth") },
            text = {
                Column {
                    Text("What's actually true right now? e.g. \"Sam 20 m, due north\", \"Sam behind a wall\", \"in the mosh pit\".")
                    OutlinedTextField(markText, { markText = it }, singleLine = true)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    onMark(markText)
                    markText = ""
                    marking = false
                }) { Text("Mark") }
            },
            dismissButton = { TextButton(onClick = { marking = false }) { Text("Cancel") } },
        )
    }
    Column(
        modifier
            .background(Color(0xEE101418))
            .verticalScroll(rememberScrollState())
            .padding(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Mono("DEBUG", 14.sp, Color(0xFFFFD54F), bold = true)
            Spacer(Modifier.width(12.dp))
            Chip("all on", Color(0xFF90CAF9)) { onSolo(null) }
        }

        Heading("Field recording")
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (recording) {
                Chip("■ stop", Color(0xFFEF9A9A)) { onRecord(false) }
                Spacer(Modifier.width(6.dp))
                Chip("mark…", Color(0xFFFFD54F)) { marking = true }
                Spacer(Modifier.width(8.dp))
                Mono("● REC  $recordedRows rows", 11.sp, Color(0xFFEF9A9A))
            } else {
                Chip("● record", Color(0xFFEF9A9A)) { onRecord(true) }
                Spacer(Modifier.width(6.dp))
                Chip("share last", Color(0xFF90CAF9), onShare)
                if (recordedRows > 0) {
                    Spacer(Modifier.width(8.dp))
                    Mono("$recordedRows rows saved", 11.sp, Color.Gray)
                }
            }
        }

        Heading("Methods  (tap = on/off, solo = only this one)")
        Method.entries.forEach { m ->
            val on = m in enabled
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 1.dp)) {
                Chip(if (on) "ON " else "off", if (on) Color(0xFF81C784) else Color(0xFF757575)) { onToggle(m, !on) }
                Spacer(Modifier.width(6.dp))
                Chip("solo", Color(0xFF90CAF9)) { onSolo(m) }
                Spacer(Modifier.width(8.dp))
                Mono(label(m), 12.sp, if (on) Color.White else Color.Gray)
            }
        }

        rows.forEach { (friendId, list) ->
            Heading("${friendOf(friendId)?.name ?: friendId}: method  dist  bearing  age  score")
            list.forEach { r ->
                val f = r.fix
                val colour = when {
                    r.drivingDirection -> Color(0xFF81C784)
                    !r.enabled -> Color(0xFF616161)
                    r.score > 0 -> Color.White
                    else -> Color(0xFF9E9E9E)
                }
                val line = buildString {
                    append(if (r.drivingDirection) "● " else "  ")
                    append(label(r.method).padEnd(7))
                    append((f?.distanceM?.let { "%.1fm".format(it) } ?: "-").padStart(8))
                    append((f?.bearingDeg?.let { "%.0f°".format(it) } ?: "-").padStart(7))
                    append((r.ageMs?.let { ageText(it) } ?: "-").padStart(7))
                    append((if (f == null) "-" else "%.2f".format(r.score)).padStart(6))
                    if (!r.enabled) append("  (off)")
                }
                Mono(line, 11.sp, colour)
            }
        }
        if (rows.isEmpty()) Mono("No friends tracked.", 11.sp, Color.Gray)

        Heading("Technology status")
        tech.forEach { (k, v) ->
            val bad = v.contains("FAIL") || v.contains("UNAVAILABLE") || v.contains("NO PERMISSION")
            Mono("$k: $v", 11.sp, if (bad) Color(0xFFEF9A9A) else Color(0xFFB0BEC5))
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Heading("Switch log")
            Spacer(Modifier.width(8.dp))
            Chip("clear", Color(0xFF90CAF9), onClearLog)
        }
        log.take(25).forEach { Mono(it, 11.sp, Color(0xFFCFD8DC)) }
        Spacer(Modifier.height(24.dp))
    }
}

private fun label(m: Method) = when (m) {
    Method.UWB -> "UWB"
    Method.WIFI_AWARE -> "Wi-Fi"
    Method.SPIN_SCAN -> "Scan"
    Method.GPS_SERVER -> "GPS"
    Method.CROWD_RELAY -> "Crowd"
    Method.BLE_RSSI -> "BT"
}

private fun ageText(ms: Long) = when {
    ms < 1_000 -> "${ms}ms"
    ms < 60_000 -> "${ms / 1000}s"
    else -> "${ms / 60_000}m"
}

@Composable
private fun Heading(text: String) {
    Spacer(Modifier.height(8.dp))
    Mono(text, 12.sp, Color(0xFFFFD54F), bold = true)
}

@Composable
private fun Mono(text: String, size: TextUnit, colour: Color, bold: Boolean = false) {
    Text(
        text,
        color = colour,
        fontSize = size,
        fontFamily = FontFamily.Monospace,
        fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal,
    )
}

@Composable
private fun Chip(text: String, colour: Color, onClick: () -> Unit) {
    Text(
        text,
        color = Color.Black,
        fontSize = 11.sp,
        fontFamily = FontFamily.Monospace,
        modifier = Modifier
            .background(colour)
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    )
}

