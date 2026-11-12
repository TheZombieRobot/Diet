package nz.waveformlabs.moshpoint.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
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
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.CrewChat
import nz.waveformlabs.moshpoint.R

/**
 * A private thread with one crew mate (docs/PRIVATE_MESSAGES.md): the crew chat's bubbles, faces
 * and "Sent / Sent nearby / Waiting for signal" lines, with none of its crew tools. Only the two
 * of you can read it. Mute is on this phone only.
 */
@Composable
internal fun PrivateChatScreen(
    name: String,
    lines: List<CrewChat.Line>,
    nowSec: Long,
    myName: String,
    muted: Boolean,
    onSend: (String) -> Unit,
    onBack: () -> Unit,
    onMute: (Boolean) -> Unit = {},
    /** "Not sent · tap to retry", "Waiting for signal" tapped. */
    onRetry: (CrewChat.Line) -> Unit = {},
    /** The crew chat's note for when messages can't go the usual way, or null. */
    offlineHint: String? = null,
    /** Their photo, and ours; null for an initials bubble. */
    face: ImageBitmap? = null,
    myFace: ImageBitmap? = null,
    /** Their colour (ARGB), so their name and ring match the map and tiles. */
    colour: Int? = null,
) {
    val hasBack = androidx.activity.compose.LocalOnBackPressedDispatcherOwner.current != null // false in screenshot tests
    if (hasBack) BackHandler(onBack = onBack)
    var draft by remember { mutableStateOf("") }
    val list = rememberLazyListState()
    LaunchedEffect(lines.size) { if (lines.isNotEmpty()) list.animateScrollToItem(lines.size - 1) }
    val ring = colour?.let { Color(it) }
    Column(Modifier.fillMaxSize().background(Mosh.Ground).statusBarsPadding().navigationBarsPadding().imePadding()) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("‹", style = Mosh.Heading.copy(fontSize = 28.sp)) }
            Column(Modifier.weight(1f)) {
                Text(name, style = Mosh.Heading.copy(fontSize = 20.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                // Wraps rather than being cut short: "only you two can read it" is the point of the line,
                // and in German, Spanish, French, Dutch, Polish... it doesn't fit beside the button.
                Text(
                    stringResource(R.string.private_subtitle),
                    style = Mosh.Body.copy(fontSize = 12.sp, lineHeight = 15.sp, color = Mosh.TextFaint), maxLines = 3, overflow = TextOverflow.Ellipsis,
                )
            }
            // A long "Unmute" ("Stummschaltung aufheben") takes two lines rather than the name's room.
            TextButton(onClick = { onMute(!muted) }, modifier = Modifier.widthIn(max = 160.dp)) {
                Text(
                    stringResource(if (muted) R.string.private_unmute else R.string.private_mute),
                    style = Mosh.Label.copy(fontSize = 15.sp, lineHeight = 18.sp, color = if (muted) Mosh.Amber else Mosh.TextDim),
                    textAlign = TextAlign.End, maxLines = 2, overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (offlineHint != null) {
                Text(
                    offlineHint,
                    style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.Text),
                    modifier = Modifier.fillMaxWidth().background(Mosh.Amber.copy(alpha = 0.12f), RoundedCornerShape(14.dp))
                        .border(1.dp, Mosh.Amber.copy(alpha = 0.5f), RoundedCornerShape(14.dp)).padding(horizontal = 14.dp, vertical = 10.dp),
                )
            }
            if (muted) {
                Text(
                    stringResource(R.string.private_muted_note, name),
                    style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim),
                    modifier = Modifier.fillMaxWidth().clickable { onMute(false) }.padding(vertical = 2.dp),
                )
            }
        }
        LazyColumn(
            Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp),
            state = list,
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            item { Spacer(Modifier.height(8.dp)) }
            if (lines.isEmpty()) {
                item {
                    // Who can read this: the two of you, and nobody else.
                    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp, horizontal = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(
                            Modifier.size(54.dp).background(Mosh.Violet.copy(alpha = 0.18f), CircleShape)
                                .border(1.dp, Mosh.Violet.copy(alpha = 0.5f), CircleShape),
                            contentAlignment = Alignment.Center,
                        ) { Text("🔒", fontSize = 22.sp) }
                        Spacer(Modifier.height(12.dp))
                        Text(
                            stringResource(R.string.private_empty, name),
                            style = Mosh.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.TextDim),
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
            itemsIndexed(lines, key = { _, it -> it.key }) { i, l ->
                Box(Modifier.animateItem()) {
                    // Runs, as in the crew chat: name on the first message, face on the last.
                    fun same(o: CrewChat.Line?) = o != null && o.mine == l.mine
                    ChatLine(
                        l, nowSec,
                        first = !same(lines.getOrNull(i - 1)),
                        last = !same(lines.getOrNull(i + 1)),
                        face = if (l.mine) myFace else face,
                        colour = if (l.mine) null else ring,
                        myName = myName,
                        onRetry = onRetry,
                    )
                }
            }
            item { Spacer(Modifier.height(8.dp)) }
        }
        Row(Modifier.background(Mosh.Deep).padding(horizontal = 12.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                draft, { if (it.length <= 140) draft = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text(stringResource(R.string.private_message_name, name), style = Mosh.Body.copy(color = Mosh.TextFaint), maxLines = 1, overflow = TextOverflow.Ellipsis) },
                textStyle = Mosh.Body.copy(color = Mosh.Text),
                maxLines = 3,
                shape = RoundedCornerShape(22.dp),
                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Mosh.Violet, unfocusedBorderColor = Mosh.Line),
            )
            Spacer(Modifier.size(8.dp))
            Box(
                Modifier.size(48.dp).background(if (draft.isBlank()) Mosh.Surface else Mosh.Lime, CircleShape)
                    .clickable(enabled = draft.isNotBlank()) { onSend(draft); draft = "" },
                contentAlignment = Alignment.Center,
            ) { Text("➤", style = Mosh.Label.copy(color = if (draft.isBlank()) Mosh.TextFaint else Color(0xFF0B1200))) }
        }
    }
}

/** A small count of unread private messages, worn on a crew mate's face. */
@Composable
internal fun UnreadBadge(count: Int, modifier: Modifier = Modifier) {
    if (count <= 0) return
    val label = androidx.compose.ui.res.pluralStringResource(R.plurals.private_unread_badge, count, count)
    Box(
        modifier.size(22.dp).background(Mosh.Violet, CircleShape).border(2.dp, Mosh.Ground, CircleShape)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Text(if (count > 9) "9+" else count.toString(), style = Mosh.Label.copy(fontSize = 11.sp, color = Color.White))
    }
}
