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
 * Moshpoint's look (see the design canvas): near-black for dark venues, one red that
 * means "far / unknown", each friend's own colour as you close in. Space Grotesk for
 * numbers and headings, Inter for everything else. Fonts are bundled (SIL OFL; licence
 * texts in assets/licenses).
 */
object Mosh {
    val Ground = Color(0xFF0B0B0F)
    val Surface = Color(0xFF17171D)
    val SurfaceLow = Color(0xFF141419)
    val Line = Color(0xFF2A2A33)
    val Ring = Color(0xFF1F1F27)
    val Text = Color(0xFFF2F2F5)
    val TextDim = Color(0xFFB9B9C4)
    val TextFaint = Color(0xFF9A9AA6)
    val Red = Color(0xFFFF3B30)
    val Green = Color(0xFF3DDC97)
    val VisibleBg = Color(0xFF12301F)
    val VisibleLine = Color(0xFF1E5A39)
    val VisibleText = Color(0xFFA8D9BF)
    val Danger = Color(0xFFFF8A80)

    /** Friend colours, in the order new friends get them. */
    val FriendColours = intArrayOf(
        0xFF4DA3FF.toInt(), 0xFF3DDC97.toInt(), 0xFFFFD23F.toInt(), 0xFFB98CFF.toInt(),
        0xFFFF8FB1.toInt(), 0xFF5EE0E6.toInt(), 0xFFFFA24D.toInt(), 0xFFA3E635.toInt(),
    )

    val Grotesk = FontFamily(
        Font(R.font.space_grotesk_medium, FontWeight.Medium),
        Font(R.font.space_grotesk_bold, FontWeight.Bold),
    )
    val Inter = FontFamily(
        Font(R.font.inter_regular, FontWeight.Normal),
        Font(R.font.inter_medium, FontWeight.Medium),
        Font(R.font.inter_semibold, FontWeight.SemiBold),
    )

    // Named text styles used across screens.
    val Eyebrow = TextStyle(fontFamily = Inter, fontSize = 13.sp, letterSpacing = 1.sp, color = TextFaint)
    val Title = TextStyle(fontFamily = Grotesk, fontWeight = FontWeight.Bold, fontSize = 34.sp, color = Text)
    val Heading = TextStyle(fontFamily = Grotesk, fontWeight = FontWeight.Bold, fontSize = 24.sp, color = Text)
    val Distance = TextStyle(fontFamily = Grotesk, fontWeight = FontWeight.Bold, fontSize = 56.sp, lineHeight = 56.sp, color = Text)
    val Body = TextStyle(fontFamily = Inter, fontSize = 15.sp, lineHeight = 22.sp, color = TextDim)
    val Label = TextStyle(fontFamily = Inter, fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Text)
}

@Composable
fun MoshTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Mosh.Red,
            onPrimary = Color.White,
            secondary = Mosh.Green,
            background = Mosh.Ground,
            onBackground = Mosh.Text,
            surface = Mosh.Surface,
            onSurface = Mosh.Text,
            surfaceVariant = Mosh.SurfaceLow,
            onSurfaceVariant = Mosh.TextDim,
            outline = Mosh.Line,
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
