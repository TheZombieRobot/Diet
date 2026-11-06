package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Friend

/**
 * Friends list (permanent) and gig group (one night), plus the visibility switch.
 * Tap a friend to go straight to their arrow; long-press to remove them.
 *
 * Adding people is a stopgap: share your code, paste theirs. Enough to test with two
 * phones. TODO: accounts, usernames, QR codes, gig group create/join via the server.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun FriendsScreen(
    friends: List<Friend>,
    visible: Boolean,
    alwaysOn: Boolean,
    phoneSummary: String,
    myName: String,
    onMyName: (String) -> Unit,
    missingPermissions: List<String>,
    onFixPermissions: () -> Unit,
    onVisible: (Boolean) -> Unit,
    onAlwaysOn: (Boolean) -> Unit,
    onFind: (Set<String>) -> Unit,
    onShareCode: () -> Unit,
    onShowQr: () -> Unit,
    onScanQr: () -> Unit,
    /** Filled in after a QR scan so the user only has to confirm. */
    scanned: Pair<String, String>?,
    onScannedUsed: () -> Unit,
    /** Returns an error message to show, or null if added. */
    onAdd: (name: String, code: String, gigGroup: Boolean) -> String?,
    onRemove: (String) -> Unit,
    onClearGigGroup: () -> Unit,
    /** Debug builds only; null in release. */
    onAddSimulated: (() -> Unit)? = null,
) {
    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(scanned) {
        if (scanned != null) {
            code = scanned.first
            if (name.isBlank()) name = scanned.second
            error = null
            onScannedUsed()
        }
    }
    var confirmRemove by remember { mutableStateOf<Friend?>(null) }

    confirmRemove?.let { f ->
        AlertDialog(
            onDismissRequest = { confirmRemove = null },
            title = { Text("Remove ${f.name}?") },
            text = { Text("You won't be able to find them until you add them again.") },
            confirmButton = { TextButton(onClick = { onRemove(f.id); confirmRemove = null }) { Text("Remove") } },
            dismissButton = { TextButton(onClick = { confirmRemove = null }) { Text("Cancel") } },
        )
    }

    fun add(gig: Boolean) {
        error = onAdd(name, code, gig)
        if (error == null) {
            name = ""
            code = ""
        }
    }

    @Composable
    fun row(f: Friend) {
        Row(
            Modifier.fillMaxWidth()
                .combinedClickable(onClick = { onFind(setOf(f.id)) }, onLongClick = { confirmRemove = f })
                .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.size(40.dp).background(Color(f.color), CircleShape), contentAlignment = Alignment.Center) {
                Text(f.name.take(1).uppercase(), color = Color.Black)
            }
            Spacer(Modifier.width(12.dp))
            Text(f.name, color = Color.White, fontSize = 18.sp)
        }
    }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text("Moshpoint", color = Color.White, fontSize = 32.sp)
            Text(phoneSummary, color = Color.Gray, fontSize = 12.sp)
            if (missingPermissions.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                Box(Modifier.fillMaxWidth().background(Color(0xFF3A1F1F)).padding(12.dp)) {
                    androidx.compose.foundation.layout.Column {
                        Text("Moshpoint still needs:", color = Color.White)
                        missingPermissions.forEach { Text("• $it", color = Color(0xFFFFCDD2), fontSize = 13.sp) }
                        Spacer(Modifier.height(6.dp))
                        Button(onClick = onFixPermissions) { Text("Allow") }
                    }
                }
            }
            Spacer(Modifier.height(8.dp))
            OutlinedTextField(myName, onMyName, label = { Text("Your name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            SwitchRow("Visible to my mates", visible, onVisible)
            SwitchRow("Leave visibility always on", alwaysOn, onAlwaysOn)
        }

        val gig = friends.filter { it.gigGroupOnly }
        val permanent = friends.filterNot { it.gigGroupOnly }

        item { Header("Gig group") }
        if (gig.isEmpty()) {
            item { Text("No group tonight.", color = Color.Gray) }
        } else {
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(onClick = { onFind(gig.map { it.id }.toSet()) }) { Text("Find whole group") }
                    OutlinedButton(onClick = onClearGigGroup) { Text("End night") }
                }
            }
        }
        items(gig, key = { it.id }) { row(it) }

        item { Header("Friends") }
        if (permanent.isEmpty()) item { Text("No friends added yet.", color = Color.Gray) }
        if (onAddSimulated != null) {
            item {
                OutlinedButton(onClick = onAddSimulated) { Text("Debug: add simulated friend") }
            }
        }
        items(permanent, key = { it.id }) { row(it) }

        item {
            Header("Add someone")
            Text("Scan each other's QR, or send your code and paste theirs.", color = Color.Gray)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onShowQr) { Text("Show my QR") }
                Button(onClick = onScanQr) { Text("Scan their QR") }
            }
            OutlinedButton(onClick = onShareCode) { Text("Share my code") }
            OutlinedTextField(name, { name = it }, label = { Text("Their name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(code, { code = it }, label = { Text("Their code") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            error?.let { Text(it, color = Color(0xFFE53935)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { add(false) }) { Text("Add friend") }
                Button(onClick = { add(true) }) { Text("Add to gig group") }
            }
        }
    }
}

@Composable
private fun Header(text: String) {
    Spacer(Modifier.height(12.dp))
    Text(text, color = Color.White, fontSize = 20.sp)
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, color = Color.White, modifier = Modifier.weight(1f))
        Switch(checked, onChange)
    }
}
