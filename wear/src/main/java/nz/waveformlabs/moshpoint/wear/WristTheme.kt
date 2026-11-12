package nz.waveformlabs.moshpoint.wear

import android.content.res.Resources
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.Typography
import nz.waveformlabs.moshpoint.core.watch.WristDistance
import nz.waveformlabs.moshpoint.core.watch.WristText
import java.text.NumberFormat
import java.util.Locale

/**
 * Moshpoint's look, cut down for a wrist: the same inky ground and neon as the phone
 * (app/…/ui/Theme.kt), the same two typefaces (Unbounded for names and numbers, Inter for
 * words; licences in assets/licenses).
 */
object Wrist {
    val Ground = Color(0xFF07050F)
    val Deep = Color(0xFF17122A)
    val Text = Color(0xFFF7F5FF)
    val TextDim = Color(0xFFD9D4EC)
    val TextFaint = Color(0xFF8E87A6)
    val Pink = Color(0xFFFF2E93) // far / unknown
    val Cyan = Color(0xFF22E4FF)
    val Lime = Color(0xFFB6FF3B) // live / found / facing
    val Amber = Color(0xFFFFB020)

    /** "Need help": the same red as the phone's help notification. */
    val Help = Color(0xFFFF3B5C)

    val Display = FontFamily(Font(R.font.unbounded_extrabold, FontWeight.ExtraBold))
    val Inter = FontFamily(
        Font(R.font.inter_medium, FontWeight.Medium),
        Font(R.font.inter_semibold, FontWeight.SemiBold),
    )

    val Name = TextStyle(fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontSize = 15.sp, color = Text)
    val Number = TextStyle(fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontSize = 30.sp, color = Text)
    val Label = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 14.sp, color = Text)
    val Body = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = 13.sp, color = TextDim)
}

@Composable
fun WristTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colors = Colors(
            primary = Wrist.Pink,
            primaryVariant = Wrist.Pink,
            secondary = Wrist.Lime,
            secondaryVariant = Wrist.Lime,
            background = Wrist.Ground,
            surface = Wrist.Deep,
            error = Wrist.Help,
            onPrimary = Color.White,
            onSecondary = Color.Black,
            onBackground = Wrist.Text,
            onSurface = Wrist.Text,
            onSurfaceVariant = Wrist.TextDim,
            onError = Color.White,
        ),
        typography = Typography(defaultFontFamily = Wrist.Inter),
        content = content,
    )
}

/**
 * Text that always fits a small round screen: tries each size in [sizes] (largest first) and
 * uses the first that fits the width in [maxLines] lines; if even the smallest doesn't, that
 * one is shown with an ellipsis. German and Thai run long; this is what keeps them on the glass.
 * Measured up front (no draw-then-shrink), so it is right on the very first frame.
 */
@Composable
fun FitText(
    text: String,
    style: TextStyle,
    modifier: Modifier = Modifier,
    maxLines: Int = 2,
    sizes: List<TextUnit> = listOf(style.fontSize, style.fontSize * 0.88f, style.fontSize * 0.78f, style.fontSize * 0.68f),
    textAlign: TextAlign = TextAlign.Center,
) {
    BoxWithConstraints(modifier, contentAlignment = if (textAlign == TextAlign.Start) Alignment.CenterStart else Alignment.Center) {
        val measurer = rememberTextMeasurer()
        val width = constraints.maxWidth
        val shown = remember(text) { WristText.keepKoreanWords(text) }
        // Lines of about the same length, so a wrap never leaves one word (or one Japanese
        // character) alone on the last line; on Wear OS 4 and later Japanese also breaks
        // between phrases rather than inside a word.
        val balanced = style.copy(lineBreak = LineBreak.Heading)
        val chosen = remember(shown, balanced, width, maxLines, sizes) {
            sizes.firstOrNull { size ->
                val sized = balanced.copy(fontSize = size, lineHeight = size * 1.18f)
                // Fits if it wraps into the lines allowed without any single word being cut.
                // (Thai, Chinese and Japanese have no spaces and may break anywhere, so they
                // have no "word" to protect: for them only the wrapping counts.)
                val wrapped = measurer.measure(shown, sized, maxLines = maxLines, constraints = Constraints(maxWidth = width))
                val longestWord = WristText.wholeWords(shown).maxByOrNull { it.length }.orEmpty()
                val word = measurer.measure(longestWord, sized, maxLines = 1, softWrap = false)
                !wrapped.hasVisualOverflow && word.size.width <= width
            } ?: sizes.last()
        }
        Text(
            shown,
            style = balanced.copy(fontSize = chosen, lineHeight = chosen * 1.18f),
            textAlign = textAlign,
            maxLines = maxLines,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** A mate's face in a ring of their colour; their initial on that colour until the face has arrived. */
@Composable
fun Face(face: ImageBitmap?, name: String, colour: Color, size: Dp, modifier: Modifier = Modifier, ring: Dp = 2.dp) {
    if (face != null) {
        Image(
            face, contentDescription = name, contentScale = ContentScale.Crop,
            modifier = modifier.size(size).clip(CircleShape).border(ring, colour, CircleShape),
        )
    } else {
        Box(
            modifier.size(size).clip(CircleShape).background(colour.copy(alpha = 0.28f)).border(ring, colour, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            val fontSize = with(LocalDensity.current) { (size * 0.42f).toSp() }
            Text(name.trim().take(1).uppercase(), style = Wrist.Name.copy(fontSize = fontSize, color = Color.White), maxLines = 1)
        }
    }
}

/** A distance as (number, unit), in the watch's language and country's style, rounded as the phone does. */
fun distanceParts(res: Resources, metres: Double, locale: Locale = Locale.getDefault()): Pair<String, String> {
    val p = WristDistance.parts(metres, locale.country)
    val number = NumberFormat.getNumberInstance(locale).apply {
        maximumFractionDigits = p.decimals
        minimumFractionDigits = p.decimals
    }.format(p.value)
    val unit = res.getString(
        when (p.unit) {
            WristDistance.Unit.M -> R.string.unit_m
            WristDistance.Unit.KM -> R.string.unit_km
            WristDistance.Unit.FT -> R.string.unit_ft
            WristDistance.Unit.MI -> R.string.unit_mi
        },
    )
    return (if (p.lessThan) "<$number" else number) to unit
}

/** The same as one piece of text: "40 m", "1.2 km", "130 ft". */
fun distanceText(res: Resources, metres: Double, locale: Locale = Locale.getDefault()): String =
    distanceParts(res, metres, locale).let { (number, unit) -> res.getString(R.string.dist_number_unit, number, unit) }

/** "12 min ago" / "3 h ago" for a mate who isn't live. Empty when they've never been seen. */
fun agoText(res: Resources, lastSeenSec: Long, nowSec: Long): String {
    if (lastSeenSec <= 0) return ""
    val minutes = ((nowSec - lastSeenSec) / 60).coerceAtLeast(1).toInt()
    return if (minutes < 60) res.getQuantityString(R.plurals.time_min_ago, minutes, minutes)
    else (minutes / 60).let { res.getQuantityString(R.plurals.time_hours_ago, it, it) }
}
