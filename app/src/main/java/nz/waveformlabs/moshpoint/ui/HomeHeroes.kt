package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.absoluteOffset
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.R

// The home with no crew tonight: a brand-new user's welcome, a returning user's "start one",
// and the ways to join (docs/design/home-redesign).

/** Scan a QR / Paste invite: the two ways to join a crew. */
@Composable
internal fun JoinButtons(onScan: () -> Unit, onPaste: () -> Unit, modifier: Modifier = Modifier) = ButtonPair(
    modifier,
    first = { GlassAction(stringResource(R.string.home_scan_qr), HomeIcons.Scan, accent = Mosh.Cyan, onClick = onScan) },
    second = { GlassAction(stringResource(R.string.home_paste_invite), HomeIcons.Link, accent = Mosh.Cyan, onClick = onPaste) },
)

/** Plan a gig for another night: find it now and invite your mates. */
@Composable
private fun PlanGigRow(onClick: () -> Unit) {
    val (src, sc) = rememberPress()
    val shape = RoundedCornerShape(18.dp)
    Row(
        Modifier.fillMaxWidth()
            .pressScale(sc)
            .clip(shape)
            .background(Mosh.GlassFill)
            .border(1.dp, Mosh.GlassLine, shape)
            .clickable(interactionSource = src, indication = LocalIndication.current, role = Role.Button, onClick = onClick)
            .heightIn(min = 64.dp)
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        HomeIcon(HomeIcons.Calendar, Mosh.Lilac, 22.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(stringResource(R.string.home_plan_title), style = HomeType.RowTitle)
            Text(stringResource(R.string.home_plan_sub), style = HomeType.Small)
        }
        Spacer(Modifier.width(8.dp))
        HomeIcon(HomeIcons.Chevron, Mosh.TextFaint, 18.dp)
    }
}

/** No crew tonight (a returning user): start one, plan a gig, or join one. */
@Composable
internal fun NoCrewHero(onStart: () -> Unit, onPlan: () -> Unit, onScan: () -> Unit, onPaste: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = HomeSide)) {
        Text(stringResource(R.string.home_no_crew_title), style = HomeType.Hero.copy(fontSize = 30.sp), modifier = Modifier.semantics { heading() })
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.home_no_crew_text), style = HomeType.Body.copy(lineHeight = 23.sp))
        Spacer(Modifier.height(24.dp))
        HeroButton(stringResource(R.string.home_start_crew), HomeIcons.UserPlus, textSize = 17.sp, onClick = onStart)
        Spacer(Modifier.height(12.dp))
        PlanGigRow(onPlan)
        Spacer(Modifier.height(28.dp))
        Kicker(stringResource(R.string.home_join_crew))
        Spacer(Modifier.height(10.dp))
        JoinButtons(onScan, onPaste)
    }
}

/** A brand-new user: what Moshpoint does, in one picture and two lines, and one thing to do. */
@Composable
internal fun FirstTimeHero(onStart: () -> Unit, onScan: () -> Unit, onPaste: () -> Unit, onPlan: () -> Unit) {
    Column(Modifier.fillMaxWidth().padding(horizontal = HomeSide), horizontalAlignment = Alignment.CenterHorizontally) {
        // A picture, not a layout: drawn the same way round in right-to-left languages.
        CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) { RadarArt() }
        Spacer(Modifier.height(14.dp))
        Text(
            stringResource(R.string.home_first_title), style = HomeType.Hero.copy(fontSize = 27.sp), textAlign = TextAlign.Center,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(10.dp))
        Text(stringResource(R.string.home_first_text), style = HomeType.Body.copy(lineHeight = 23.sp), textAlign = TextAlign.Center)
        Spacer(Modifier.height(22.dp))
        HeroButton(stringResource(R.string.home_start_crew), HomeIcons.UserPlus, textSize = 17.sp, onClick = onStart)
        Spacer(Modifier.height(12.dp))
        JoinButtons(onScan, onPaste)
        Spacer(Modifier.height(6.dp))
        Box(
            Modifier.heightIn(min = 48.dp).clip(RoundedCornerShape(12.dp)).clickable(role = Role.Button, onClick = onPlan).padding(horizontal = 12.dp),
            contentAlignment = Alignment.Center,
        ) {
            Text(stringResource(R.string.home_plan_another_night), style = HomeType.Label.copy(fontSize = 14.sp, color = Mosh.Lilac), textAlign = TextAlign.Center)
        }
    }
}

/** The first-time picture: radar rings, the glowing arrow, and a mate 12 m away where it points. Decorative. */
@Composable
private fun RadarArt(modifier: Modifier = Modifier) {
    val distance = finderDistanceLabel(12.0)
    Box(modifier.size(200.dp).clearAndSetSemantics { }) {
        androidx.compose.foundation.Canvas(Modifier.size(200.dp)) {
            val s = size.minDimension / 240f // the design's drawing is 240 units across
            val c = Offset(size.width / 2, size.height / 2)
            drawCircle(Mosh.Cyan.copy(alpha = 0.12f), radius = 112f * s, center = c, style = Stroke(1.5f * s))
            drawCircle(Mosh.Cyan.copy(alpha = 0.22f), radius = 78f * s, center = c, style = Stroke(1.5f * s))
            drawCircle(Mosh.Cyan.copy(alpha = 0.38f), radius = 44f * s, center = c, style = Stroke(1.5f * s))
            drawCircle(Mosh.Text, radius = 7f * s, center = c)
            val arrow = Path().apply {
                moveTo(120f * s, 52f * s); lineTo(140f * s, 80f * s); lineTo(126f * s, 80f * s); lineTo(126f * s, 120f * s)
                lineTo(114f * s, 120f * s); lineTo(114f * s, 80f * s); lineTo(100f * s, 80f * s); close()
            }
            rotate(40f, pivot = c) {
                drawPath(arrow, Brush.verticalGradient(0f to Color.White, 0.22f to Mosh.Cyan, 1f to Mosh.Violet, startY = 52f * s, endY = 120f * s))
            }
        }
        // Where the arrow points (not mirrored right to left: the arrow isn't either).
        Box(
            Modifier.absoluteOffset(x = 127.dp, y = 3.dp).size(52.dp).drawBehind {
                val r = size.minDimension / 2
                ringGlow(r, 16.dp.toPx(), Mosh.Lime)
                drawCircle(Mosh.Lime, radius = r)
            },
            contentAlignment = Alignment.Center,
        ) { DefaultAvatar("Sam", 46.dp) }
        Text(
            distance, maxLines = 1, softWrap = false,
            style = HomeType.Button.copy(fontSize = 11.sp, color = Mosh.Lime),
            modifier = Modifier.absoluteOffset(x = 132.dp, y = 60.dp)
                .background(Mosh.Lime.copy(alpha = 0.14f), RoundedCornerShape(10.dp))
                .padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}
