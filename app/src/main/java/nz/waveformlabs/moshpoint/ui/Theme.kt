package nz.waveformlabs.moshpoint.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R

/**
 * Moshpoint's look (see the design canvas): neon party, premium finish. Inky
 * black-violet ground with soft neon glows; hot pink means "far / unknown"; each friend
 * glows their own colour as you close in. Unbounded for headings and numbers, Inter for text. Fonts are bundled (SIL OFL; licence
 * texts in assets/licenses).
 */
object Mosh {
    // Ground and glass.
    val Ground = Color(0xFF07050F)
    val Deep = Color(0xFF0F0B1C)
    val Avatar = Color(0xFF120E22)
    val Surface = Color(0x0FFFFFFF) // glass panel: white at 6%
    val SurfaceLow = Color(0x0AFFFFFF)
    val Line = Color(0x24FFFFFF) // hairline border: white at 14%
    val Ring = Color(0x12FFFFFF)
    val Text = Color(0xFFF7F5FF)
    val TextDim = Color(0xFFD9D4EC)
    val TextFaint = Color(0xFF8E87A6)

    // Neon.
    val Pink = Color(0xFFFF2E93)   // far / unknown
    val Cyan = Color(0xFF22E4FF)
    val Lime = Color(0xFFB6FF3B)   // live / found
    val Violet = Color(0xFF9D5CFF)
    val Amber = Color(0xFFFFB020)
    val Red = Pink // older name: "far" colour
    val Green = Lime
    val VisibleBg = Deep
    val VisibleLine = Lime
    val VisibleText = Color(0xFFCFE9B0)
    val Danger = Color(0xFFFF6FB3)

    /** The live/neon spectrum used for running borders and confetti. */
    val Spectrum = listOf(Lime, Cyan, Violet, Pink, Lime)

    /** Friend colours, in the order new friends get them (pink is kept for "far"). */
    val FriendColours = intArrayOf(
        0xFF22E4FF.toInt(), 0xFFB6FF3B.toInt(), 0xFFC86BFF.toInt(), 0xFFFFB020.toInt(),
        0xFF5EF2C2.toInt(), 0xFFFF8A5C.toInt(), 0xFF7AA2FF.toInt(), 0xFFF5F749.toInt(),
    )

    /** Unbounded: big, wide, playful. Headings and numbers. */
    val Display = FontFamily(
        Font(R.font.unbounded_bold, FontWeight.Bold),
        Font(R.font.unbounded_extrabold, FontWeight.ExtraBold),
    )
    val Grotesk = Display // older name
    val Inter = FontFamily(
        Font(R.font.inter_regular, FontWeight.Normal),
        Font(R.font.inter_medium, FontWeight.Medium),
        Font(R.font.inter_semibold, FontWeight.SemiBold),
    )

    /** Permanent Marker: handwriting on the Polaroids. */
    val Marker = FontFamily(Font(R.font.permanent_marker, FontWeight.Normal))

    // Named text styles used across screens.
    val Eyebrow = TextStyle(fontFamily = Inter, fontSize = 12.sp, letterSpacing = 2.sp, color = TextFaint)
    val Title = TextStyle(fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontSize = 32.sp, color = Text)
    val Heading = TextStyle(fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = Text)
    val Distance = TextStyle(fontFamily = Display, fontWeight = FontWeight.ExtraBold, fontSize = 64.sp, lineHeight = 64.sp, letterSpacing = (-1.5).sp, color = Text)
    val Body = TextStyle(fontFamily = Inter, fontSize = 15.sp, lineHeight = 22.sp, color = TextDim)
    val Label = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Text)
    val Button = TextStyle(fontFamily = Display, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Text)
}

/**
 * Calm motion: true when the phone is in battery saver or the user turned animations off.
 * Ambient effects (drifting glows, sweeps, breathing, spinning rings) then hold still;
 * motion that carries meaning (arrow swivel, rolling distance) still runs.
 */
val LocalCalmMotion = androidx.compose.runtime.staticCompositionLocalOf { false }

@Composable
fun MoshTheme(calm: Boolean = false, content: @Composable () -> Unit) {
    // Text outside Compose (Txt) needs a Context; in screenshot tests there's no app start-up.
    nz.waveformlabs.moshpoint.Txt.init(androidx.compose.ui.platform.LocalContext.current)
    DefaultAvatars.init(androidx.compose.ui.platform.LocalContext.current)
    androidx.compose.runtime.CompositionLocalProvider(LocalCalmMotion provides calm) { MoshThemeInner(content) }
}

@Composable
private fun MoshThemeInner(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Mosh.Pink,
            onPrimary = Color.White,
            secondary = Mosh.Lime,
            tertiary = Mosh.Cyan,
            background = Mosh.Ground,
            onBackground = Mosh.Text,
            surface = Mosh.Deep,
            onSurface = Mosh.Text,
            surfaceVariant = Color(0xFF17122A),
            // Dialogs, sheets and menus: deep violet glass, not Material grey.
            surfaceContainerLowest = Color(0xFF0A0715),
            surfaceContainerLow = Color(0xFF110C20),
            surfaceContainer = Color(0xFF140F26),
            surfaceContainerHigh = Color(0xFF181230),
            surfaceContainerHighest = Color(0xFF1E1738),
            surfaceTint = Mosh.Violet,
            onSurfaceVariant = Mosh.TextDim,
            outline = Color(0xFF3A3352),
            error = Mosh.Danger,
        ),
        typography = Typography().let { t ->
            t.copy(
                displayLarge = t.displayLarge.copy(fontFamily = Mosh.Grotesk),
                headlineMedium = t.headlineMedium.copy(fontFamily = Mosh.Grotesk, fontWeight = FontWeight.Bold),
                titleLarge = t.titleLarge.copy(fontFamily = Mosh.Grotesk, fontWeight = FontWeight.Bold),
                bodyLarge = t.bodyLarge.copy(fontFamily = Mosh.Inter),
                bodyMedium = t.bodyMedium.copy(fontFamily = Mosh.Inter),
                bodySmall = t.bodySmall.copy(fontFamily = Mosh.Inter),
                labelLarge = t.labelLarge.copy(fontFamily = Mosh.Inter, fontWeight = FontWeight.SemiBold),
                labelMedium = t.labelMedium.copy(fontFamily = Mosh.Inter),
                titleMedium = t.titleMedium.copy(fontFamily = Mosh.Inter, fontWeight = FontWeight.SemiBold),
            )
        },
        content = content,
    )
}
