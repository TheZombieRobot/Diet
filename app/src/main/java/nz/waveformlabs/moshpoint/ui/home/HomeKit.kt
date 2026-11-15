package nz.waveformlabs.moshpoint.ui.home

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.ui.map.MapPin
import nz.waveformlabs.moshpoint.ui.Mosh

/*
 * The home's building blocks (docs/design/home-redesign), in four files: here the side margin,
 * line breaks and type for every script, " · " lines and the line icons; HomeButtons (the big
 * gradient button, glass buttons and the pair they sit in, the Live switch), HomeFaces and
 * HomeSheets (rows and the pop-up panel). Sizes are the design's (CSS px = dp); everything that
 * holds text has a minimum height, not a fixed one, so a large font size grows it instead of
 * clipping.
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
 * Arabic gets a bullet: a middle dot beside Arabic digits reads as a zero ("٣ ·" as ٣٠).
 */
internal fun dotLine(parts: List<String>, keep: Int = 24, fits: (String) -> Boolean = { true }): String {
    val sep = if (java.util.Locale.getDefault().language == "ar") "\u00A0• " else "\u00A0· "
    return parts.withIndex().joinToString(sep) { (i, p) ->
        val whole = p.replace(' ', '\u00A0')
        // [fits] gets the part as it would sit on a line: with its dot, unless it's the last.
        if (p.length <= keep && fits(if (i < parts.lastIndex) whole + sep.dropLast(1) else whole)) whole else p
    }
}

/**
 * [dotLine] for text already joined with " · ". [keep]: the longest part kept whole, 24 for a
 * narrow column (a longer part, like a long venue name, may still wrap), more for a full line.
 */
internal fun dotLine(text: String, keep: Int = 24): String = dotLine(text.split(" · "), keep)

/**
 * [dotLine] for [maxWidth] pixels of [style]: a part is kept whole only while it fits on one
 * line, so at a very large font size a long part wraps between its words, never inside one
 * ("Kliknij znajomego, by szukać" at 200%, not "Kliknij znajome / go").
 */
@Composable
internal fun rememberDotLine(parts: List<String>, style: TextStyle, maxWidth: Int, keep: Int = 24): String {
    val measurer = rememberTextMeasurer()
    return remember(parts, style, maxWidth, keep, measurer) {
        dotLine(parts, keep) { measurer.measure(it, style, maxLines = 1, softWrap = false).size.width <= maxWidth }
    }
}

/** A [dotLine] text whose parts are kept whole only while they fit the width it gets ([rememberDotLine]). */
@Composable
internal fun DotLineText(
    parts: List<String>,
    style: TextStyle,
    modifier: Modifier = Modifier,
    keep: Int = 24,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) {
    BoxWithConstraints(modifier) {
        Text(rememberDotLine(parts, style, constraints.maxWidth, keep), style = style, maxLines = maxLines, overflow = overflow)
    }
}

/** [DotLineText] for text already joined with " · ". */
@Composable
internal fun DotLineText(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    keep: Int = 24,
    maxLines: Int = Int.MAX_VALUE,
    overflow: TextOverflow = TextOverflow.Clip,
) = DotLineText(text.split(" · "), style, modifier, keep, maxLines, overflow)

/**
 * A small label in a tight place (a face's caption, a bottom-bar tab) grows with the font
 * size setting up to [max] times, like Android's own non-linear scaling of large text: at
 * 200% the rest of the home is twice the size, these 1.5 times, so they never break words.
 */
@Composable
internal fun TextUnit.capScale(max: Float = 1.5f): TextUnit {
    val fs = LocalDensity.current.fontScale
    return if (fs > max && isSpecified) this * (max / fs) else this
}

/** A number keeps the word after it on its line: "15 min", not "15 / min" (Arabic "١٥ دقيقة" too). */
internal fun keepNumbers(text: String): String = text.replace(NumberThenSpace, "$1\u00A0")

// \p{Nd}, not \d: on the JVM (the screenshot tests) \d is only 0-9, on Android any digit.
private val NumberThenSpace = Regex("(\\p{Nd}) ")

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
    // Latin, Greek and Cyrillic, with their extended letters (Vietnamese "TỐI NAY" is U+1E00–1EFF).
    if (text.all { it.code < 0x0530 || it.code in 0x1E00..0x1FFF || !it.isLetter() }) spacing else 0.sp
