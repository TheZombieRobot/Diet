package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Friend

/**
 * Friends list (permanent) and gig group (one night), plus the visibility switch.
 * Tap a friend to go straight to their arrow; "Find whole group" tracks everyone.
 *
 * Adding people is a placeholder for now: share your code, paste theirs. That's enough to
 * test with two phones. TODO: accounts, usernames, QR codes, gig group create/join.
 */
@Composable
fun FriendsScreen(
    friends: List<Friend>,
    visible: Boolean,
    alwaysOn: Boolean,
    myCode: String,
    onVisible: (Boolean) -> Unit,
    onAlwaysOn: (Boolean) -> Unit,
    onFind: (Set<String>) -> Unit,
    onAdd: (name: String, code: String, gigGroup: Boolean) -> Unit,
) {
    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }

    LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text("Moshpoint", color = Color.White, fontSize = 32.sp)
            Spacer(Modifier.height(8.dp))
            SwitchRow("Visible to my mates", visible, onVisible)
            SwitchRow("Leave visibility always on", alwaysOn, onAlwaysOn)
        }

        val gig = friends.filter { it.gigGroupOnly }
        val permanent = friends.filterNot { it.gigGroupOnly }

        item { Header("Gig group") }
        if (gig.isEmpty()) item { Text("No group tonight.", color = Color.Gray) }
        else item { Button(onClick = { onFind(gig.map { it.id }.toSet()) }) { Text("Find whole group") } }
        items(gig, key = { it.id }) { FriendRow(it) { onFind(setOf(it.id)) } }

        item { Header("Friends") }
        if (permanent.isEmpty()) item { Text("No friends added yet.", color = Color.Gray) }
        items(permanent, key = { it.id }) { FriendRow(it) { onFind(setOf(it.id)) } }

        item {
            Header("Add someone")
            Text("Your code:", color = Color.Gray)
            Text(myCode, color = Color.White, fontFamily = FontFamily.Monospace, fontSize = 12.sp)
            OutlinedTextField(name, { name = it }, label = { Text("Their name") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(code, { code = it }, label = { Text("Their code") }, modifier = Modifier.fillMaxWidth())
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = { onAdd(name, code, false); name = ""; code = "" }) { Text("Add friend") }
                Button(onClick = { onAdd(name, code, true); name = ""; code = "" }) { Text("Add to gig group") }
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

@Composable
private fun FriendRow(friend: Friend, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(40.dp).background(Color(friend.color), CircleShape), contentAlignment = Alignment.Center) {
            Text(friend.name.take(1), color = Color.Black)
        }
        Spacer(Modifier.width(12.dp))
        Text(friend.name, color = Color.White, fontSize = 18.sp)
    }
}
