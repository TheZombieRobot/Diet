package nz.waveformlabs.moshpoint.ui.home

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.IntrinsicMeasurable
import androidx.compose.ui.layout.IntrinsicMeasureScope
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.MeasurePolicy
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.glow
import nz.waveformlabs.moshpoint.ui.pressScale
import nz.waveformlabs.moshpoint.ui.rememberPress
import nz.waveformlabs.moshpoint.ui.rememberShimmer
import nz.waveformlabs.moshpoint.ui.shimmer

// The home's buttons (docs/design/home-redesign): the wordmark and Need help, the big gradient
// button, glass buttons and the pair they sit in, counts, the Live switch and section titles.

/** "moshpoint": a logo, so the same size whatever the font size setting, and always left to right. */
@Composable
internal fun Wordmark(modifier: Modifier = Modifier) {
    val d = LocalDensity.current
    val glowPx = with(d) { 18.dp.toPx() }
    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Text(
            buildAnnotatedString {
                append("mosh")
                withStyle(SpanStyle(color = Mosh.Pink, shadow = Shadow(Mosh.Pink.copy(alpha = 0.55f), blurRadius = glowPx))) { append("point") }
            },
            style = TextStyle(
                fontFamily = Mosh.Display, fontWeight = FontWeight.ExtraBold, fontSize = (26f / d.fontScale).sp,
                letterSpacing = (-0.5f / d.fontScale).sp, color = Mosh.Text,
            ),
            maxLines = 1,
            softWrap = false,
            modifier = modifier.semantics { heading() },
        )
    }
}

/** Need help's padding, icon and gap: what the pill needs besides its words. */
internal val HelpPillChrome = 14.dp * 2 + 18.dp + 6.dp + 6.dp

/**
 * "Need help" in the header: opens the help dialog (nothing is sent on this tap). It gets a
 * little smaller to stay on one line, and wraps before it would ever push the wordmark (the
 * header moves it to its own row when even its longest word wouldn't fit beside it).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HelpPill(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.home_ping_need_help)
    val (source, scale) = rememberPress()
    BoxWithConstraints(modifier) {
        val measurer = rememberTextMeasurer()
        val density = LocalDensity.current
        val room = with(density) { (maxWidth - HelpPillChrome).roundToPx() }
        val base = HomeType.Label.copy(fontSize = 14.sp, color = Mosh.Danger)
        val fits = remember(label, room, density) {
            listOf(14f, 13f, 12f).firstOrNull { s ->
                measurer.measure(label, base.copy(fontSize = s.sp), maxLines = 1, softWrap = false).size.width <= room
            }
        }
        val shape = RoundedCornerShape(22.dp)
        Row(
            Modifier.minimumInteractiveComponentSize()
                .pressScale(scale)
                .heightIn(min = 44.dp)
                .clip(shape)
                .background(Mosh.Pink.copy(alpha = 0.08f))
                .border(1.dp, Mosh.Danger.copy(alpha = 0.45f), shape)
                .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            HomeIcon(HomeIcons.Help, Mosh.Danger, 18.dp)
            Spacer(Modifier.width(6.dp))
            Text(
                label,
                style = base.copy(fontSize = (fits ?: 12f).sp),
                maxLines = if (fits != null) 1 else 3,
                softWrap = fits == null,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/**
 * The big action on the home: pink → violet → cyan, with a soft pink glow under it. A long
 * label first shrinks a little (up to 3 sp) to stay on one line, then wraps.
 */
@Composable
internal fun HeroButton(text: String, icon: ImageVector, modifier: Modifier = Modifier, textSize: TextUnit = 18.sp, onClick: () -> Unit) {
    val (source, scale) = rememberPress()
    val shine = rememberShimmer()
    val shape = RoundedCornerShape(20.dp)
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val measurer = rememberTextMeasurer()
        val density = LocalDensity.current
        val room = with(density) { (maxWidth - 20.dp * 2 - 22.dp - 12.dp).roundToPx() }
        val base = HomeType.Button.copy(fontSize = textSize, color = Color.White, lineBreak = HomeBreakEven)
        val fits = remember(text, room, density, textSize) {
            (0..3).map { textSize.value - it }.firstOrNull { s ->
                measurer.measure(text, base.copy(fontSize = s.sp), maxLines = 1, softWrap = false).size.width <= room
            }
        }
        Box(
            Modifier
                .fillMaxWidth()
                .pressScale(scale)
                .drawBehind {
                    // The design's shadow: 0 16px 40px -14px, pink at 65%.
                    val inset = 14.dp.toPx()
                    val drop = 16.dp.toPx()
                    val r = 20.dp.toPx()
                    glow(Mosh.Pink, 18.dp.toPx(), 0.65f) { p ->
                        drawContext.canvas.drawRoundRect(inset, drop + inset, size.width - inset, size.height + drop - inset, r, r, p)
                    }
                }
                .clip(shape)
                .background(Brush.horizontalGradient(0f to Mosh.Pink, 0.55f to Mosh.Violet, 1f to Mosh.Cyan))
                .graphicsLayer()
                .shimmer { shine.value }
                .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
                .heightIn(min = 64.dp)
                .padding(horizontal = 20.dp, vertical = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
                HomeIcon(icon, Color.White, 22.dp)
                Spacer(Modifier.width(12.dp))
                Text(
                    text,
                    style = base.copy(fontSize = (fits ?: (textSize.value - 2)).sp),
                    textAlign = TextAlign.Center,
                    maxLines = if (fits != null) 1 else Int.MAX_VALUE,
                    softWrap = fits == null,
                    modifier = Modifier.weight(1f, fill = false),
                )
            }
        }
    }
}

/**
 * A calm action on glass: icon, label and an optional count. [accent] tints it (cyan for
 * joining a crew). The label wraps rather than being cut; see [ButtonPair] for two side by side.
 */
@Composable
internal fun GlassAction(
    text: String,
    icon: ImageVector,
    modifier: Modifier = Modifier,
    badge: Int = 0,
    accent: Color? = null,
    onClick: () -> Unit,
) {
    val (source, scale) = rememberPress()
    val shape = RoundedCornerShape(if (accent != null) 16.dp else 18.dp)
    val content = accent ?: Mosh.Text
    Box(
        modifier
            .pressScale(scale)
            .clip(shape)
            .background(accent?.copy(alpha = 0.07f) ?: Mosh.GlassFill)
            .border(1.dp, accent?.copy(alpha = 0.30f) ?: Mosh.GlassLine, shape)
            .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .heightIn(min = if (accent != null) 52.dp else 56.dp)
            // Little side padding, as in the design: the label gets the room ("Crew-Chat" fits beside its badge).
            .padding(horizontal = 10.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            HomeIcon(icon, content, 20.dp)
            Spacer(Modifier.width(if (accent != null) 8.dp else 10.dp))
            // Balanced: a label on two lines splits evenly ("QR kết bạn / của mình", not "… của / mình").
            WholeWordsText(text, HomeType.RowTitle.copy(color = content, lineBreak = HomeBreakEven), Modifier.weight(1f, fill = false))
            if (badge > 0) {
                Spacer(Modifier.width(8.dp))
                CountBadge(badge)
            }
        }
    }
}

/**
 * A centred label whose narrowest width is its longest run without a space, so [ButtonPair]
 * stacks the buttons rather than let a label break inside a word: a plain Text would report
 * "Crew-Cha|t" or "クルーチャ|ット" as fitting, since a hyphen or kana allows a break there.
 */
@Composable
private fun WholeWordsText(text: String, style: TextStyle, modifier: Modifier = Modifier) {
    val measurer = rememberTextMeasurer()
    val longest = remember(text, style, measurer) {
        text.split(' ', '\n').filter { it.isNotEmpty() }
            .maxOfOrNull { measurer.measure(it, style, softWrap = false, maxLines = 1).size.width + 1 } ?: 0
    }
    Layout(
        content = { Text(text, style = style, textAlign = TextAlign.Center) },
        modifier = modifier,
        measurePolicy = object : MeasurePolicy {
            override fun MeasureScope.measure(measurables: List<Measurable>, constraints: Constraints): MeasureResult {
                val p = measurables.first().measure(constraints)
                return layout(p.width, p.height) { p.placeRelative(0, 0) }
            }
            override fun IntrinsicMeasureScope.minIntrinsicWidth(measurables: List<IntrinsicMeasurable>, height: Int): Int = longest
            override fun IntrinsicMeasureScope.maxIntrinsicWidth(measurables: List<IntrinsicMeasurable>, height: Int): Int =
                maxOf(longest, measurables.first().maxIntrinsicWidth(height))
            override fun IntrinsicMeasureScope.minIntrinsicHeight(measurables: List<IntrinsicMeasurable>, width: Int): Int =
                measurables.first().minIntrinsicHeight(width)
            override fun IntrinsicMeasureScope.maxIntrinsicHeight(measurables: List<IntrinsicMeasurable>, width: Int): Int =
                measurables.first().maxIntrinsicHeight(width)
        },
    )
}

/**
 * Two equal buttons side by side, the same height (a label may take two lines). When a
 * word in either label can't fit in half the width, they stack instead.
 */
@Composable
internal fun ButtonPair(
    modifier: Modifier = Modifier,
    gap: Dp = 12.dp,
    first: @Composable () -> Unit,
    second: @Composable () -> Unit,
) {
    Layout(contents = listOf(first, second), modifier = modifier.fillMaxWidth()) { measurables, constraints ->
        val a = measurables[0].first()
        val b = measurables[1].first()
        val gapPx = gap.roundToPx()
        val width = constraints.maxWidth
        val half = (width - gapPx) / 2
        val sideBySide = a.minIntrinsicWidth(Constraints.Infinity) <= half && b.minIntrinsicWidth(Constraints.Infinity) <= half
        if (sideBySide) {
            val h = maxOf(a.maxIntrinsicHeight(half), b.maxIntrinsicHeight(half))
            val pa = a.measure(Constraints.fixed(half, h))
            val pb = b.measure(Constraints.fixed(half, h))
            layout(width, h) {
                pa.placeRelative(0, 0)
                pb.placeRelative(width - half, 0)
            }
        } else {
            val pa = a.measure(Constraints(minWidth = width, maxWidth = width))
            val pb = b.measure(Constraints(minWidth = width, maxWidth = width))
            layout(width, pa.height + gapPx + pb.height) {
                pa.placeRelative(0, 0)
                pb.placeRelative(0, pa.height + gapPx)
            }
        }
    }
}

/** A small count ("3", "9+") in pink, read out as "3 new". */
@Composable
internal fun CountBadge(count: Int, modifier: Modifier = Modifier, colour: Color = Mosh.Pink) {
    val spoken = pluralStringResource(R.plurals.home_unread_new, count, count)
    Box(
        modifier.heightIn(min = 22.dp).widthIn(min = 22.dp)
            .background(colour, CircleShape)
            .padding(horizontal = 6.dp, vertical = 2.dp)
            .clearAndSetSemantics { contentDescription = spoken },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            if (count > 9) stringResource(R.string.home_unread_many) else "%d".format(count),
            style = HomeType.Label.copy(fontSize = 12.sp, color = Color.White),
            maxLines = 1,
        )
    }
}

/** A round glass button with an icon (the crew's ⋯). [label] is what a screen reader says. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun RoundIconButton(icon: ImageVector, label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val (source, scale) = rememberPress()
    Box(
        modifier.minimumInteractiveComponentSize()
            .pressScale(scale)
            .size(44.dp)
            .clip(CircleShape)
            .background(Mosh.GlassFill)
            .border(1.dp, Mosh.GlassLineStrong, CircleShape)
            .clickable(interactionSource = source, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { HomeIcon(icon, Mosh.Text, 20.dp) }
}

/** The switch's look: 46 × 28, lime (violet in ghost mode) with a glow when on. Mirrors right to left. */
@Composable
internal fun SwitchTrack(on: Boolean, colour: Color, modifier: Modifier = Modifier) {
    val bias by animateFloatAsState(if (on) 1f else -1f, tween(180), label = "knob")
    Box(
        modifier.size(46.dp, 28.dp)
            .drawBehind {
                if (on) {
                    glow(colour, 10.dp.toPx(), 0.45f) { p ->
                        drawContext.canvas.drawRoundRect(0f, 0f, size.width, size.height, size.height / 2, size.height / 2, p)
                    }
                }
            }
            .background(if (on) colour else Mosh.SwitchOff, CircleShape)
            .padding(3.dp),
        contentAlignment = BiasAlignment(bias, 0f),
    ) {
        Box(Modifier.size(22.dp).background(if (on) Mosh.Ground else Mosh.TextDim, CircleShape))
    }
}

/**
 * The Live row: "Live", the switch, and what it means right now. The whole row is one
 * switch for a screen reader ("Live, switch, on, You're visible to your mates").
 */
@Composable
internal fun LiveRow(live: Boolean, ghost: Boolean, onChange: (Boolean) -> Unit, modifier: Modifier = Modifier) {
    val colour = when {
        !live -> Mosh.TextFaint
        ghost -> Mosh.Violet
        else -> Mosh.Lime
    }
    val explain = when {
        !live -> stringResource(R.string.home_live_off)
        ghost -> stringResource(R.string.home_live_ghost_on)
        else -> stringResource(R.string.home_live_on)
    }
    val source = remember { MutableInteractionSource() }
    val label = stringResource(R.string.home_live_switch)
    val labelStyle = HomeType.Button.copy(fontSize = 15.sp, color = colour)
    // Balanced, so a wrapped line never leaves one word alone (Hindi, Arabic, Chinese).
    val explainStyle = HomeType.Body.copy(fontSize = 13.5.sp, lineHeight = 19.sp, color = if (live) Mosh.TextDim else Mosh.TextFaint, lineBreak = HomeBreakEven)
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(
        modifier.fillMaxWidth()
            .heightIn(min = 48.dp)
            .toggleable(value = live, interactionSource = source, indication = null, role = Role.Switch, onValueChange = onChange),
        contentAlignment = Alignment.CenterStart,
    ) {
        // The line goes under the switch when the room beside it can't hold its longest word
        // (a long switch name at a large font: "Widoczność" at 200%).
        val density = LocalDensity.current
        val room = with(density) { maxWidth.roundToPx() - (10.dp + 46.dp + 12.dp).roundToPx() } -
            measurer.measure(label, labelStyle, maxLines = 1, softWrap = false).size.width
        // Text without spaces (Chinese, Japanese) breaks between characters, but a phrase should
        // fit on a line: six characters (word joiners aside) stand in for one ("見えています"),
        // so Japanese at 200% goes under the switch rather than split it.
        val chunks = if (explain.trim().contains(' ')) explain.split(' ') else listOf(explain.replace("\u2060", "").take(6))
        val longest = chunks.maxOf { measurer.measure(it, explainStyle, maxLines = 1, softWrap = false).size.width }
        val beside = longest <= room && room >= with(density) { 96.dp.roundToPx() }
        val switch: @Composable () -> Unit = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(label, style = labelStyle, maxLines = 1)
                Spacer(Modifier.width(10.dp))
                SwitchTrack(live, colour)
            }
        }
        if (beside) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                switch()
                Spacer(Modifier.width(12.dp))
                Text(explain, style = explainStyle, modifier = Modifier.weight(1f).padding(vertical = 4.dp))
            }
        } else {
            Column {
                switch()
                Text(explain, style = explainStyle, modifier = Modifier.padding(top = 4.dp, bottom = 4.dp))
            }
        }
    }
}

/** A section's title with an optional "See all". */
@Composable
internal fun SectionTitle(title: String, modifier: Modifier = Modifier, onSeeAll: (() -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(horizontal = HomeSide).heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        // See all sits on the title's first line, also when a long title wraps.
        val onLine = if (onSeeAll != null) Modifier.alignByBaseline() else Modifier
        // The room above and below is the title's own, so a title that wraps keeps it too.
        Text(title, style = HomeType.Section, modifier = Modifier.weight(1f).then(onLine).padding(vertical = 11.dp).semantics { heading() })
        if (onSeeAll != null) {
            Spacer(Modifier.width(12.dp))
            Box(
                // At least 48 dp both ways, however short "See all" is ("全部").
                Modifier.alignByBaseline().heightIn(min = 48.dp).widthIn(min = 48.dp).clip(RoundedCornerShape(8.dp)).clickable(role = Role.Button, onClick = onSeeAll).padding(horizontal = 4.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(stringResource(R.string.home_see_all), style = HomeType.Label.copy(fontSize = 14.sp, color = Mosh.Cyan), maxLines = 1)
            }
        }
    }
}

/** Small capitals over a group: TONIGHT, JOIN A CREW. */
@Composable
internal fun Kicker(text: String, modifier: Modifier = Modifier, colour: Color = Mosh.TextFaint) =
    Text(text, style = HomeType.Kicker.copy(letterSpacing = tracked(text, 2.5.sp), color = colour), modifier = modifier.semantics { heading() })

/** A hairline across the page, inside the side margins. */
@Composable
internal fun HomeDivider(modifier: Modifier = Modifier) =
    Box(modifier.padding(horizontal = HomeSide).fillMaxWidth().height(1.dp).background(Mosh.Hairline))
