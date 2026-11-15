package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R

// The home's bottom bar (docs/design/home-redesign): Crew, Map, Add, Story and Me.

/** Bottom bar: the places you go (Crew, Map, Add, Story, Me). Opaque: the list ends above it. */
@Composable
internal fun HomeBar(onMap: () -> Unit, onAdd: () -> Unit, onMe: () -> Unit, myName: String = "", onStory: () -> Unit = {}) {
    val crew = stringResource(R.string.home_bar_crew)
    val map = stringResource(R.string.home_bar_map)
    val story = stringResource(R.string.home_bar_story)
    val me = stringResource(R.string.home_bar_me)
    Column(Modifier.fillMaxWidth().background(Mosh.Bar)) {
        Box(Modifier.fillMaxWidth().height(1.dp).background(Mosh.Hairline))
        BoxWithConstraints(Modifier.fillMaxWidth().navigationBarsPadding().padding(start = 10.dp, end = 10.dp, top = 8.dp, bottom = 8.dp)) {
            // Five equal places, each label with 2 dp either side.
            val labelSize = rememberBarLabelSize(listOf(crew, map, story, me), constraints.maxWidth / 5 - with(LocalDensity.current) { 4.dp.roundToPx() })
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                BarItem(crew, labelSize, selected = true, Modifier.weight(1f), icon = { c -> HomeIcon(HomeIcons.Crew, c, 26.dp) }) {}
                BarItem(map, labelSize, selected = false, Modifier.weight(1f), icon = { c -> HomeIcon(HomeIcons.MapPin, c, 26.dp) }, onClick = onMap)
                AddButton(onAdd, Modifier.weight(1f))
                BarItem(story, labelSize, selected = false, Modifier.weight(1f), icon = { c -> HomeIcon(HomeIcons.Story, c, 26.dp) }, onClick = onStory)
                BarItem(me, labelSize, selected = false, Modifier.weight(1f), icon = { _ ->
                    val mine = nz.waveformlabs.moshpoint.profile.PhotoStore.photos[nz.waveformlabs.moshpoint.profile.PhotoStore.ME]
                    if (mine != null) {
                        Image(mine, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(26.dp).clip(CircleShape))
                    } else {
                        DefaultAvatar(myName, 26.dp)
                    }
                }, onClick = onMe)
            }
        }
    }
}

private val BarLabelStyle = HomeType.Body.copy(lineBreak = HomeBreakEven)

/**
 * The tabs' label size: the font size setting's (up to 1.5 times, [capScale]), made smaller,
 * down to the normal size, while a word doesn't fit its tab, so it never breaks inside:
 * ストーリー at 130% on a small phone, not "ストー / リー". One size for all four labels.
 * Words still too wide at the normal size, and labels of several words, take two lines.
 */
@Composable
private fun rememberBarLabelSize(labels: List<String>, room: Int): TextUnit {
    val measurer = rememberTextMeasurer()
    val fontScale = LocalDensity.current.fontScale
    val largest = 11.5.sp.capScale().value
    return remember(labels, room, largest, fontScale, measurer) {
        val words = labels.flatMap { it.split(' ') }.filter { it.isNotEmpty() }
        // Measured in the selected tab's weight, the wider one.
        val style = BarLabelStyle.copy(fontWeight = FontWeight.SemiBold)
        fun widest(sp: Float) = words.maxOfOrNull { measurer.measure(it, style.copy(fontSize = sp.sp), maxLines = 1, softWrap = false).size.width } ?: 0
        // The normal size, 11.5 at 100%, in this font scale's sp.
        val smallest = minOf(largest, 11.5f / fontScale)
        var sp = largest
        while (sp - 0.25f >= smallest && widest(sp) > room) sp -= 0.25f
        sp.sp
    }
}

@Composable
private fun BarItem(label: String, labelSize: TextUnit, selected: Boolean, modifier: Modifier, icon: @Composable (Color) -> Unit, onClick: () -> Unit) {
    val (src, sc) = rememberPress()
    val colour = if (selected) Mosh.Lime else Mosh.TextDim
    Column(
        modifier.pressScale(sc)
            .heightIn(min = 56.dp)
            .selectable(selected = selected, interactionSource = src, indication = null, role = Role.Tab, onClick = onClick)
            .padding(top = 2.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        icon(colour)
        Spacer(Modifier.height(4.dp))
        // Two lines when a large font needs them ("Berättelse" at 200%), never clipped.
        Text(
            label, maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
            style = BarLabelStyle.copy(
                fontSize = labelSize, lineHeight = labelSize * (15f / 11.5f),
                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium, color = colour,
            ),
            modifier = Modifier.padding(horizontal = 2.dp),
        )
    }
}

/** The bar's raised "+" (Add): a gradient circle with a pink glow under it. */
@Composable
private fun AddButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.home_bar_add)
    val (src, sc) = rememberPress()
    Box(modifier.heightIn(min = 56.dp), contentAlignment = Alignment.TopCenter) {
        Box(
            Modifier.offset(y = (-6).dp)
                .pressScale(sc)
                .size(52.dp)
                .drawBehind {
                    glow(Mosh.Pink, 12.dp.toPx(), 0.7f) { p ->
                        drawContext.canvas.drawCircle(Offset(size.width / 2, size.height / 2 + 8.dp.toPx()), size.minDimension / 2 - 6.dp.toPx(), p)
                    }
                }
                .clip(CircleShape)
                .background(Brush.linearGradient(0f to Mosh.Pink, 0.6f to Mosh.Violet, 1f to Mosh.Cyan))
                .clickable(interactionSource = src, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
                .semantics { contentDescription = label },
            contentAlignment = Alignment.Center,
        ) { HomeIcon(HomeIcons.Plus, Color.White, 26.dp) }
    }
}
