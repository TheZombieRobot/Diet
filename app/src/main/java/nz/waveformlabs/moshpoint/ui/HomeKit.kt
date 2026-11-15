package nz.waveformlabs.moshpoint.ui

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.layout.ContentScale
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
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.LocationBook
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt

/*
 * The home's building blocks (docs/design/home-redesign): line icons, the big gradient
 * button, glass buttons and the pair they sit in, the Live switch, faces, rows and the
 * pop-up panel. Sizes are the design's (CSS px = dp); everything that holds text has a
 * minimum height, not a fixed one, so a large font size grows it instead of clipping.
 */

/** The home's side margin. */
internal val HomeSide = 24.dp

/**
 * Line breaks for the home's text in every script: Korean wraps at spaces and Japanese between
 * phrases (Android 13 and later), a line never starts with a small kana or a closing mark, and
 * the high-quality breaker avoids leaving one word or character alone on the last line.
 */
internal val HomeBreak = LineBreak(LineBreak.Strategy.HighQuality, LineBreak.Strictness.Strict, LineBreak.WordBreak.Phrase)

/** The same with lines of even length, for short captions and centred text. */
internal val HomeBreakEven = LineBreak(LineBreak.Strategy.Balanced, LineBreak.Strictness.Strict, LineBreak.WordBreak.Phrase)

/** Mosh's text styles with [HomeBreak]: everything on the home uses these. */
internal object HomeType {
    val Body = Mosh.Body.copy(lineBreak = HomeBreak)
    val Label = Mosh.Label.copy(lineBreak = HomeBreak)
    val Small = Mosh.Small.copy(lineBreak = HomeBreak)
    val RowTitle = Mosh.RowTitle.copy(lineBreak = HomeBreak)
    val Heading = Mosh.Heading.copy(lineBreak = HomeBreak)
    val Hero = Mosh.Hero.copy(lineBreak = HomeBreak)
    val Button = Mosh.Button.copy(lineBreak = HomeBreak)
    val Section = Mosh.Section.copy(lineBreak = HomeBreak)
    val Kicker = Mosh.Kicker.copy(lineBreak = HomeBreak)
}

/**
 * Parts joined with " · ", the dot kept at the end of a line and each short part kept whole
 * (no-break spaces inside): "in 7 days · Dock 4" never breaks as "Dock / 4" or "· Dock 4".
 */
internal fun dotLine(parts: List<String>): String =
    parts.joinToString("\u00A0· ") { p -> if (p.length <= 24) p.replace(' ', '\u00A0') else p }

/** [dotLine] for text already joined with " · ". */
internal fun dotLine(text: String): String = dotLine(text.split(" · "))

/** Line icons from the design, on a 24-unit grid with round caps and joins (tinted when drawn). */
internal object HomeIcons {
    private fun build(name: String, width: Float, fill: Boolean, mirror: Boolean, paths: Array<out String>): ImageVector {
        val b = ImageVector.Builder(
            name = name, defaultWidth = 24.dp, defaultHeight = 24.dp,
            viewportWidth = 24f, viewportHeight = 24f, autoMirror = mirror,
        )
        for (d in paths) {
            b.addPath(
                pathData = PathParser().parsePathString(d).toNodes(),
                fill = if (fill) SolidColor(Color.Black) else null,
                stroke = if (fill) null else SolidColor(Color.Black),
                strokeLineWidth = width,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round,
            )
        }
        return b.build()
    }

    private fun line(name: String, width: Float, vararg d: String, mirror: Boolean = false) = build(name, width, false, mirror, d)
    private fun solid(name: String, vararg d: String) = build(name, 0f, true, false, d)
    private fun circle(cx: Float, cy: Float, r: Float) = "M${cx - r} ${cy}a$r $r 0 1 0 ${2 * r} 0a$r $r 0 1 0 ${-2 * r} 0"

    val Help by lazy { line("help", 2.2f, circle(12f, 12f, 9f), "M12 7.5v5.5", "M12 16.5h.01") }
    val More by lazy { solid("more", circle(5f, 12f, 2f), circle(12f, 12f, 2f), circle(19f, 12f, 2f)) }
    val Navigate by lazy { line("navigate", 2.4f, "M4 11l16-7-7 16-2-7z") }
    val Chat by lazy { line("chat", 2f, "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z") }
    val Camera by lazy { line("camera", 2f, "M4 8h3l2-3h6l2 3h3v11H4z", circle(12f, 13f, 3.5f)) }
    val Pin by lazy { line("pin", 2.2f, "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z", circle(12f, 9.5f, 2.5f)) }
    val MapPin by lazy { line("mappin", 2f, "M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z", circle(12f, 9.5f, 2.5f)) }
    val UserPlus by lazy { line("userplus", 2f, circle(10f, 8f, 3.5f), "M3.5 20a6.5 6.5 0 0 1 13 0", "M19 8v6M16 11h6") }
    val House by lazy { line("house", 2f, "M4 11l8-6 8 6v9H4z", "M10 20v-5h4v5") }
    val Power by lazy { line("power", 2f, "M12 4v8", "M6.6 7.4a7.5 7.5 0 1 0 10.8 0") }
    val Calendar by lazy {
        line("calendar", 2f, "M6 5.5h12a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2z", "M4 10h16M8.5 3.5v4M15.5 3.5v4")
    }
    val Scan by lazy { line("scan", 2f, "M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4", "M8 12h8") }
    val Link by lazy { line("link", 2f, "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1") }
    val Chevron by lazy { line("chevron", 2.2f, "M9 6l6 6-6 6", mirror = true) }
    val Crew by lazy { line("crew", 2f, circle(9f, 8f, 3.5f), "M2.5 20a6.5 6.5 0 0 1 13 0", circle(17f, 9f, 2.8f), "M15.5 14.2A5.5 5.5 0 0 1 21.5 20") }
    val Story by lazy {
        line(
            "story", 2f,
            "M6.5 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z",
            "M8 6h8a.5.5 0 0 1 .5.5v8a.5.5 0 0 1-.5.5H8a.5.5 0 0 1-.5-.5v-8A.5.5 0 0 1 8 6z",
        )
    }
    val Plus by lazy { line("plus", 2.6f, "M12 5v14M5 12h14") }
    val Reset by lazy { line("reset", 2f, "M20 12a8 8 0 1 1-2.34-5.66", "M20 4v4.5h-4.5") }
    val Plan by lazy { line("plan", 2f, "M7 4h10v16l-5-3.5L7 20z") }
    val Pulse by lazy { line("pulse", 2f, "M3 12h4l3-7 4 14 3-7h4") }
    val Qr by lazy { line("qr", 2f, "M4 4h6v6H4z", "M14 4h6v6h-6z", "M4 14h6v6H4z", "M14 14h2.5v2.5H14z", "M17.5 17.5H20V20h-2.5z") }
    val Bump by lazy {
        line(
            "bump", 2f,
            "M4.5 5h4A1.5 1.5 0 0 1 10 6.5v11A1.5 1.5 0 0 1 8.5 19h-4A1.5 1.5 0 0 1 3 17.5v-11A1.5 1.5 0 0 1 4.5 5z",
            "M15.5 5h4A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 15.5 5z",
            "M11.5 10l1 2-1 2",
        )
    }
    val Share by lazy { line("share", 2f, "M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6", "M12 3v12", "M7.5 7.5L12 3l4.5 4.5") }
    val Keypad by lazy {
        solid("keypad", circle(6f, 6f, 1.6f), circle(12f, 6f, 1.6f), circle(18f, 6f, 1.6f), circle(6f, 12f, 1.6f), circle(12f, 12f, 1.6f), circle(18f, 12f, 1.6f), circle(12f, 18f, 1.6f))
    }
}

/** A line icon in [tint]. Decorative: the text next to it says what it is. */
@Composable
internal fun HomeIcon(icon: ImageVector, tint: Color, size: Dp = 20.dp, modifier: Modifier = Modifier) =
    Icon(icon, contentDescription = null, tint = tint, modifier = modifier.size(size))

/** Letter spacing only for scripts that take it (Latin, Greek, Cyrillic); joined and stacked scripts stay as they are. */
internal fun tracked(text: String, spacing: TextUnit): TextUnit =
    if (text.all { it.code < 0x0530 || !it.isLetter() }) spacing else 0.sp

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

/**
 * "Need help" in the header: opens the help dialog (nothing is sent on this tap). It gets a
 * little smaller to stay on one line, and wraps before it would ever push the wordmark.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun HelpPill(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val label = stringResource(R.string.home_ping_need_help)
    val (source, scale) = rememberPress()
    BoxWithConstraints(modifier) {
        val measurer = rememberTextMeasurer()
        val density = LocalDensity.current
        val room = with(density) { (maxWidth - 14.dp * 2 - 18.dp - 6.dp - 6.dp).roundToPx() }
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
                maxLines = if (fits != null) 1 else 2,
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
        val base = HomeType.Button.copy(fontSize = textSize, color = Color.White)
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
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
            HomeIcon(icon, content, 20.dp)
            Spacer(Modifier.width(if (accent != null) 8.dp else 10.dp))
            WholeWordsText(text, HomeType.RowTitle.copy(color = content), Modifier.weight(1f, fill = false))
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
    Row(
        modifier.fillMaxWidth()
            .heightIn(min = 48.dp)
            .toggleable(value = live, interactionSource = source, indication = null, role = Role.Switch, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(stringResource(R.string.home_live_switch), style = HomeType.Button.copy(fontSize = 15.sp, color = colour), maxLines = 1)
        Spacer(Modifier.width(10.dp))
        SwitchTrack(live, colour)
        Spacer(Modifier.width(12.dp))
        Text(
            explain,
            style = HomeType.Body.copy(fontSize = 13.5.sp, lineHeight = 19.sp, color = if (live) Mosh.TextDim else Mosh.TextFaint),
            modifier = Modifier.weight(1f).padding(vertical = 4.dp),
        )
    }
}

/** A section's title with an optional "See all". */
@Composable
internal fun SectionTitle(title: String, modifier: Modifier = Modifier, onSeeAll: (() -> Unit)? = null) {
    Row(modifier.fillMaxWidth().padding(horizontal = HomeSide).heightIn(min = 48.dp), verticalAlignment = Alignment.CenterVertically) {
        // See all sits on the title's first line, also when a long title wraps.
        val onLine = if (onSeeAll != null) Modifier.alignByBaseline() else Modifier
        Text(title, style = HomeType.Section, modifier = Modifier.weight(1f).then(onLine).padding(vertical = 4.dp).semantics { heading() })
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

// ---- Faces ----

/** Shared a spot in the last 3 minutes (the old tile went lime at the same point), and not a dying phone's last one. */
private const val LIVE_SEC = 180L

internal fun isLive(s: LocationBook.Seen?, nowSec: Long) = s != null && !s.lastGasp && nowSec - s.timeSec < LIVE_SEC

/** What to say under a face. [distance] = [text] is a distance (big and lime). [battery] = low battery %, else null. */
internal class FaceStatus(val live: Boolean, val text: String, val colour: Color, val distance: Boolean, val battery: Int?)

internal fun faceStatus(s: LocationBook.Seen?, nowSec: Long, distanceM: Double?): FaceStatus {
    if (s == null) return FaceStatus(false, Txt.s(R.string.home_tile_not_sharing), Mosh.TextFaint, false, null)
    val age = nowSec - s.timeSec
    val battery = s.batteryPct?.takeIf { it <= 20 } // only worth saying when low
    return when {
        s.lastGasp -> FaceStatus(false, Txt.s(R.string.home_tile_phone_died), Mosh.Danger, false, null)
        // The finder's own label: "8 m", not the map's tens ("0 m"), and the same number the finder shows.
        age < LIVE_SEC && distanceM != null -> FaceStatus(true, finderDistanceLabel(distanceM), Mosh.Lime, true, battery)
        age < LIVE_SEC -> FaceStatus(true, Txt.s(R.string.home_tile_live), Mosh.Lime, false, battery)
        else -> FaceStatus(false, ago(age), Mosh.TextFaint, false, battery)
    }
}

/** Live first, nearest first; then the most recently seen; never seen last. */
internal fun liveFirst(crew: List<Friend>, seen: Map<String, LocationBook.Seen>, nowSec: Long, distances: Map<String, Double>): List<Friend> =
    crew.sortedWith(
        compareBy<Friend>(
            { if (isLive(seen[it.id], nowSec)) 0 else 1 },
            { if (isLive(seen[it.id], nowSec)) distances[it.id] ?: Double.MAX_VALUE else 0.0 },
            { seen[it.id]?.let { s -> -s.timeSec } ?: Long.MAX_VALUE },
        ),
    )

/** Saturation 50%, brightness 75%: a face that isn't live. */
private val Dimmed = ColorFilter.colorMatrix(
    ColorMatrix(
        floatArrayOf(
            0.455f, 0.268f, 0.027f, 0f, 0f,
            0.080f, 0.643f, 0.027f, 0f, 0f,
            0.080f, 0.268f, 0.402f, 0f, 0f,
            0f, 0f, 0f, 1f, 0f,
        ),
    ),
)

/** A soft halo from the edge of a circle of [r] outwards by [spread] (drawn once, no blur). */
internal fun DrawScope.ringGlow(r: Float, spread: Float, colour: Color) {
    val outer = r + spread
    drawCircle(
        Brush.radialGradient(
            0f to colour.copy(alpha = 0.45f),
            (r / outer) to colour.copy(alpha = 0.45f),
            ((r + spread * 0.35f) / outer) to colour.copy(alpha = 0.18f),
            1f to colour.copy(alpha = 0f),
            center = center, radius = outer,
        ),
        radius = outer, center = center,
    )
}

/**
 * A face in a ring: lime with a glow when [live]; otherwise a faint ring (dimmed when [dim]).
 * The glow reaches [glow] beyond the ring: whoever places this leaves that much room.
 */
@Composable
internal fun FaceImage(f: Friend, size: Dp, live: Boolean, dim: Boolean = !live, glow: Dp = 18.dp, ringColour: Color = Mosh.Lime) {
    val ring = if (live) 3.dp else 2.dp
    val radius = size / 2 + ring
    Box(
        // Always room for the thicker ring, so live and other faces (and their names) line up.
        Modifier.size(size + 3.dp * 2).drawBehind {
            val r = radius.toPx()
            if (live) ringGlow(r, glow.toPx(), ringColour)
            drawCircle(if (live) ringColour else Mosh.GlassLineStrong, radius = r)
        },
        contentAlignment = Alignment.Center,
    ) {
        val photo = Faces.of(f.id, f.name)
        if (photo != null) {
            Image(
                photo, contentDescription = null, contentScale = ContentScale.Crop,
                colorFilter = if (dim) Dimmed else null,
                modifier = Modifier.size(size).clip(CircleShape),
            )
        } else {
            Box(Modifier.size(size).drawWithContent { drawContent(); if (dim) drawCircle(Color.Black.copy(alpha = 0.35f)) }) {
                InitialsAvatar(f.name, size, Color(f.color))
            }
        }
    }
}

/** One crew face: the face, name, then distance (live) or when they were last seen. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun FaceTile(f: Friend, status: FaceStatus, note: String?, badge: Int, onFind: (() -> Unit)?, onOptions: (() -> Unit)?) {
    val findLabel = stringResource(R.string.home_find_name, f.name)
    val optionsLabel = stringResource(R.string.home_face_options)
    val battery = status.battery?.let { stringResource(R.string.home_face_battery, it) }
    Column(
        // No clip here: it would cut off the glow.
        Modifier.width(76.dp)
            .combinedClickable(
                enabled = onFind != null || onOptions != null,
                onClickLabel = if (onFind != null) findLabel else null,
                role = Role.Button,
                onLongClickLabel = if (onOptions != null) optionsLabel else null,
                onLongClick = onOptions,
                onClick = { onFind?.invoke() },
            ),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box {
            FaceImage(f, 70.dp, status.live)
            UnreadBadge(badge, Modifier.align(Alignment.TopEnd))
        }
        Spacer(Modifier.height(8.dp))
        Text(
            f.name,
            style = HomeType.Label.copy(fontSize = 14.sp, color = if (status.live) Mosh.Text else Mosh.TextDim),
            maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(2.dp))
        // Captions as wide as the face (the design's 70 dp), so neighbours never run together.
        val caption = Modifier.padding(horizontal = 3.dp)
        if (status.distance) {
            FitText(status.text, HomeType.Button.copy(fontSize = 15.sp, color = Mosh.Lime), caption)
        } else {
            Text(
                status.text,
                style = HomeType.Body.copy(fontSize = 12.5.sp, lineHeight = 16.sp, color = status.colour, lineBreak = HomeBreakEven),
                maxLines = 3, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = caption,
            )
        }
        if (battery != null) {
            Text(
                battery, style = HomeType.Body.copy(fontSize = 11.5.sp, lineHeight = 15.sp, color = Mosh.Danger, lineBreak = HomeBreakEven),
                maxLines = 2, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = caption,
            )
        }
        if (note != null) {
            // Balanced lines: "🔥 Bar / time 🍺", not a lone emoji on the second line.
            Text(
                note, style = HomeType.Body.copy(fontSize = 11.5.sp, lineHeight = 15.sp, color = Mosh.Amber, lineBreak = HomeBreakEven),
                maxLines = 3, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = caption,
            )
        }
    }
}

/**
 * The crew as a strip of faces that runs off the screen's edge: live first, nearest first.
 * Tap = find them, long-press = their options (either can be off). [notes] replace the
 * status line ("at the venue", for followers); [flares] go under it ("🔥 Bar time 🍺");
 * [badges] are unread private messages, worn on the face.
 */
@Composable
internal fun CrewTiles(
    crew: List<Friend>,
    seen: Map<String, LocationBook.Seen>,
    nowSec: Long,
    onFind: ((String) -> Unit)?,
    onOptions: ((Friend) -> Unit)?,
    distances: Map<String, Double> = emptyMap(),
    notes: Map<String, String> = emptyMap(),
    badges: Map<String, Int> = emptyMap(),
    flares: Map<String, String> = emptyMap(),
    modifier: Modifier = Modifier,
) {
    val atVenue = stringResource(R.string.crew_at_venue)
    val sorted = liveFirst(crew, seen, nowSec, distances)
    LazyRow(
        modifier.fillMaxWidth(),
        // Room above and to the side for the glow: rings and glows are never cut off.
        contentPadding = PaddingValues(start = HomeSide, end = HomeSide, top = 20.dp, bottom = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(sorted, key = { it.id }) { f ->
            val note = notes[f.id]
            val status = if (note != null) {
                FaceStatus(note == atVenue, note, if (note == atVenue) Mosh.Lime else Mosh.TextDim, false, null)
            } else {
                faceStatus(seen[f.id], nowSec, distances[f.id])
            }
            FaceTile(
                f, status, flares[f.id], badges[f.id] ?: 0,
                onFind = onFind?.let { find -> { find(f.id) } },
                onOptions = onOptions?.let { options -> { options(f) } },
            )
        }
    }
}

/** Friends kept for every gig, as a strip of faces with names. Tap = find, long-press = options. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun FriendsStrip(friends: List<Friend>, seen: Map<String, LocationBook.Seen>, nowSec: Long, onFind: (String) -> Unit, onOptions: (Friend) -> Unit) {
    val optionsLabel = stringResource(R.string.home_face_options)
    LazyRow(
        Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(start = HomeSide, end = HomeSide, top = 12.dp, bottom = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        items(friends, key = { it.id }) { f ->
            Column(
                Modifier.width(68.dp)
                    .combinedClickable(
                        onClickLabel = stringResource(R.string.home_find_name, f.name),
                        role = Role.Button,
                        onLongClickLabel = optionsLabel,
                        onLongClick = { onOptions(f) },
                        onClick = { onFind(f.id) },
                    ),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                FaceImage(f, 60.dp, isLive(seen[f.id], nowSec), dim = false, glow = 12.dp)
                Spacer(Modifier.height(8.dp))
                Text(f.name, style = HomeType.Label.copy(fontSize = 13.sp), maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
            }
        }
    }
}

// ---- Rows and panels ----

/** A row in a panel: icon tile, title, the line under it, and a chevron. [danger] = pink, no chevron. */
@Composable
internal fun MenuRow(
    icon: ImageVector,
    tile: Color,
    tint: Color,
    title: String,
    sub: String?,
    onClick: () -> Unit,
    danger: Boolean = false,
) {
    Row(
        Modifier.fillMaxWidth()
            .heightIn(min = 64.dp)
            .clip(RoundedCornerShape(14.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(44.dp).background(tile, RoundedCornerShape(14.dp)), contentAlignment = Alignment.Center) {
            HomeIcon(icon, tint, 22.dp)
        }
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(title, style = HomeType.RowTitle.copy(fontSize = 16.sp, color = if (danger) Mosh.Danger else Mosh.Text))
            if (sub != null) Text(sub, style = HomeType.Small)
        }
        if (!danger) {
            Spacer(Modifier.width(8.dp))
            HomeIcon(HomeIcons.Chevron, Mosh.TextFaint, 18.dp)
        }
    }
}

/** A pop-up panel's drag handle. */
@Composable
internal fun SheetHandle() =
    Box(Modifier.padding(top = 12.dp, bottom = 10.dp).size(40.dp, 5.dp).background(Mosh.Handle, RoundedCornerShape(3.dp)))

/** The home's pop-up panel: opens all the way, deep violet, with the design's handle and scrim. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun MoshSheet(onClose: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onClose,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        containerColor = Mosh.Sheet,
        contentColor = Mosh.Text,
        tonalElevation = 0.dp,
        scrimColor = Mosh.Scrim,
        dragHandle = { SheetHandle() },
        content = content,
    )
}

/** The panel's look without the pop-up, for screenshots (a pop-up window doesn't render in a test). */
@Composable
internal fun SheetFrame(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    val shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    Column(
        modifier.fillMaxWidth().clip(shape).background(Mosh.Sheet).border(1.dp, Mosh.GlassLine, shape),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SheetHandle()
        Column(Modifier.fillMaxWidth(), content = content)
    }
}

/** The background glows from the design: cyan top left, pink bottom right (fixed, not scrolling). */
@Composable
internal fun HomeGlow(modifier: Modifier = Modifier) = androidx.compose.foundation.Canvas(modifier) {
    val w = size.width
    val h = size.height
    glowSpot(Offset(0f, h * 0.08f), w * 0.7f, h * 0.4f, Mosh.Cyan, 0.10f)
    glowSpot(Offset(w, h), w * 0.7f, h * 0.45f, Mosh.Pink, 0.13f)
}

/** An elliptical glow at [c] with radii [rx] and [ry], gone by 70% of the way out (the design's radial-gradient). */
private fun DrawScope.glowSpot(c: Offset, rx: Float, ry: Float, colour: Color, alpha: Float) {
    if (rx <= 0f || ry <= 0f) return
    scale(1f, ry / rx, c) {
        drawCircle(
            Brush.radialGradient(0f to colour.copy(alpha = alpha), 0.7f to colour.copy(alpha = 0f), center = c, radius = rx),
            radius = rx, center = c,
        )
    }
}
