package nz.waveformlabs.moshpoint.wear

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material.Text
import nz.waveformlabs.moshpoint.core.ArrowStyle
import nz.waveformlabs.moshpoint.core.Geo
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.core.watch.NoArrow
import nz.waveformlabs.moshpoint.core.watch.WristView

/** Where a find stands, beyond "here's the arrow". */
enum class FinderStatus {
    /** Readings are coming in: draw [FinderUi.view]. */
    LIVE,
    CONNECTING,
    RECONNECTING,
    PHONE_LOST,
    NEEDS_PHONE,
    BLUETOOTH_OFF,
    NO_PERMISSION,
    MATE_GONE,
    LOCKED,
    FOUND,
    TIMED_OUT,
    STOPPED_ON_PHONE,
    UPDATE_PHONE,
    UPDATE_WATCH,
}

/** Everything the finder screen draws. Plain data, so screenshot tests can show any state. */
data class FinderUi(
    val mateName: String,
    val mateColour: Int,
    val status: FinderStatus = FinderStatus.CONNECTING,
    val view: WristView = WristView.Searching,
    /** The arrow is within a few degrees of straight ahead. */
    val facing: Boolean = false,
    /** The compass says it needs a figure-8. */
    val compassRough: Boolean = false,
    /** The watch's own settings are silencing the buzzes: say so, so the quiet isn't a mystery. */
    val buzzOff: Boolean = false,
    /** Wrist down: black, still, minimal. */
    val ambient: Boolean = false,
    /** The find is over (found, timed out, stopped): offer to go again. */
    val canRestart: Boolean = false,
)

/**
 * The finder: an arrow round the mate's face while the wrist is flat, otherwise their distance
 * and one short line saying what to do. Swipe away to stop.
 */
@Composable
fun FinderScreen(ui: FinderUi, face: ImageBitmap?, onAgain: () -> Unit = {}) {
    val colour = Color(ui.mateColour)
    if (ui.ambient) {
        AmbientFinder(ui)
        return
    }
    BoxWithConstraints(Modifier.fillMaxSize().background(Wrist.Ground), contentAlignment = Alignment.Center) {
        val s = if (maxWidth < maxHeight) maxWidth else maxHeight
        val view = ui.view
        when {
            ui.status == FinderStatus.LIVE && view is WristView.Arrow -> {
                // Name on top, arrow ring with the face inside, distance underneath.
                val tint = Color(ArrowStyle.arrowColor(ui.mateColour, view.distanceM))
                Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                    Spacer(Modifier.height(s * 0.07f))
                    Text(
                        ui.mateName, style = Wrist.Name.copy(fontSize = 13.sp), maxLines = 1, overflow = TextOverflow.Ellipsis,
                        textAlign = TextAlign.Center, modifier = Modifier.width(s * 0.5f),
                    )
                    Box(Modifier.size(s * 0.6f), contentAlignment = Alignment.Center) {
                        ArrowRing(view.angleDeg.toFloat(), if (ui.facing) Wrist.Lime else tint, rough = view.rough, facing = ui.facing)
                        Face(face, ui.mateName, colour, s * 0.27f)
                    }
                    DistanceLine(view.distanceM, big = false)
                    if (ui.compassRough) Hint(stringResource(R.string.find_calibrate), s * 0.56f, lines = 1)
                }
            }
            ui.status == FinderStatus.LIVE -> {
                // No arrow: who, how far, and one line on what to do about it.
                val (distance, hint) = when (view) {
                    is WristView.DistanceOnly -> view.distanceM to when (view.why) {
                        NoArrow.HOLD_FLAT -> stringResource(R.string.find_hold_flat)
                        NoArrow.NO_COMPASS -> stringResource(R.string.find_no_compass)
                        NoArrow.NO_DIRECTION -> when (view.trend) {
                            Trend.WARMER -> stringResource(R.string.find_warmer)
                            Trend.COLDER -> stringResource(R.string.find_colder)
                            Trend.STEADY -> stringResource(R.string.find_follow_buzz)
                        }
                    }
                    else -> null to stringResource(R.string.find_searching, ui.mateName)
                }
                val trend = (view as? WristView.DistanceOnly)?.takeIf { it.why == NoArrow.NO_DIRECTION }?.trend
                Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                    Row(Modifier.width(s * 0.62f), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        Face(face, ui.mateName, colour, s * 0.17f)
                        Spacer(Modifier.width(6.dp))
                        Text(ui.mateName, style = Wrist.Name.copy(fontSize = 13.sp), maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(s * 0.05f))
                    if (distance != null) {
                        DistanceLine(distance, big = true, tint = when (trend) {
                            Trend.WARMER -> Wrist.Lime
                            Trend.COLDER -> Wrist.Pink
                            else -> Wrist.Text
                        })
                    }
                    Spacer(Modifier.height(s * 0.03f))
                    Hint(hint, s * (if (distance != null) 0.66f else 0.74f), lines = if (distance != null) 2 else 3)
                    if (ui.buzzOff) Hint(stringResource(R.string.find_buzz_off), s * 0.5f, lines = 2, faint = true)
                }
            }
            else -> StatusMessage(ui, face, s, onAgain)
        }
    }
}

/** The arrow: Moshpoint's chevron riding a ring, pointing at a real place (so it never mirrors for right-to-left languages). */
@Composable
private fun ArrowRing(angleDeg: Float, tint: Color, rough: Boolean, facing: Boolean) {
    // Glide between readings the short way round: 350° to 10° is a 20° turn, not 340°.
    // (A plain holder, not Compose state: it is only ever touched right here.)
    val turned = remember { floatArrayOf(angleDeg) }
    turned[0] += Geo.normalize180((angleDeg - turned[0]).toDouble()).toFloat()
    val shown by animateFloatAsState(turned[0], spring(stiffness = Spring.StiffnessMediumLow), label = "arrow")
    val alpha = if (rough) 0.45f else 1f
    Canvas(Modifier.fillMaxSize()) {
        val r = size.minDimension / 2
        val ring = r * 0.74f
        drawCircle(tint.copy(alpha = 0.28f * alpha), radius = ring, style = Stroke(width = r * (if (facing) 0.07f else 0.04f)))
        rotate(shown, pivot = center) {
            val tip = center.y - r * 0.99f
            val base = center.y - r * 0.58f
            val notch = center.y - r * 0.68f
            val half = r * 0.24f
            val head = Path().apply {
                moveTo(center.x, tip)
                lineTo(center.x + half, base)
                lineTo(center.x, notch)
                lineTo(center.x - half, base)
                close()
            }
            drawPath(head, tint.copy(alpha = 0.3f * alpha), style = Stroke(width = r * 0.12f, join = StrokeJoin.Round)) // glow
            drawPath(head, tint.copy(alpha = alpha))
        }
        if (facing) drawCircle(Wrist.Lime, radius = r * 0.035f, center = Offset(center.x, center.y - r * 1.0f + r * 0.02f))
    }
}

/** "40 m": the number in the display face, the unit small beside it. */
@Composable
private fun DistanceLine(metres: Double?, big: Boolean, tint: Color = Wrist.Text) {
    if (metres == null) return
    val (number, unit) = distanceParts(LocalContext.current.resources, metres)
    Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.Center) {
        Text(number, style = Wrist.Number.copy(fontSize = if (big) 34.sp else 22.sp, color = tint), maxLines = 1, modifier = Modifier.alignByBaseline())
        Spacer(Modifier.width(3.dp))
        Text(unit, style = Wrist.Label.copy(fontSize = if (big) 15.sp else 12.sp, color = Wrist.TextDim), maxLines = 1, modifier = Modifier.alignByBaseline())
    }
}

@Composable
private fun Hint(text: String, width: androidx.compose.ui.unit.Dp, lines: Int, faint: Boolean = false) {
    FitText(
        text, Wrist.Body.copy(fontSize = if (faint) 11.sp else 13.sp, color = if (faint) Wrist.TextFaint else Wrist.TextDim),
        Modifier.width(width).padding(top = 2.dp), maxLines = lines,
    )
}

/** Everything that isn't "finding": one clear sentence, and a way to go again where that makes sense. */
@Composable
private fun StatusMessage(ui: FinderUi, face: ImageBitmap?, s: androidx.compose.ui.unit.Dp, onAgain: () -> Unit) {
    val message = when (ui.status) {
        FinderStatus.CONNECTING -> stringResource(R.string.find_connecting)
        FinderStatus.RECONNECTING -> stringResource(R.string.find_reconnecting)
        FinderStatus.PHONE_LOST -> stringResource(R.string.find_phone_lost)
        FinderStatus.NEEDS_PHONE -> stringResource(R.string.find_needs_phone)
        FinderStatus.BLUETOOTH_OFF -> stringResource(R.string.find_bluetooth_off)
        FinderStatus.NO_PERMISSION -> stringResource(R.string.find_no_permission)
        FinderStatus.MATE_GONE -> stringResource(R.string.find_mate_gone, ui.mateName)
        FinderStatus.LOCKED -> stringResource(R.string.plus_text)
        FinderStatus.FOUND -> stringResource(R.string.find_found, ui.mateName)
        FinderStatus.TIMED_OUT -> stringResource(R.string.find_timed_out)
        FinderStatus.STOPPED_ON_PHONE -> stringResource(R.string.find_stopped_on_phone)
        FinderStatus.UPDATE_PHONE -> stringResource(R.string.update_phone)
        FinderStatus.UPDATE_WATCH -> stringResource(R.string.update_watch)
        FinderStatus.LIVE -> ""
    }
    val again = ui.canRestart
    val found = ui.status == FinderStatus.FOUND
    Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Face(face, ui.mateName, if (found) Wrist.Lime else Color(ui.mateColour), s * (if (found) 0.26f else 0.2f), ring = if (found) 3.dp else 2.dp)
        Spacer(Modifier.height(s * 0.04f))
        if (ui.status == FinderStatus.LOCKED) {
            Text(stringResource(R.string.plus_title), style = Wrist.Name.copy(color = Wrist.Pink), maxLines = 1)
        }
        FitText(
            message, if (found) Wrist.Name.copy(fontSize = 16.sp, color = Wrist.Lime) else Wrist.Label,
            Modifier.width(s * 0.74f), maxLines = 3,
        )
        if (again) {
            Spacer(Modifier.height(s * 0.04f))
            Pill(stringResource(R.string.find_again), Wrist.Deep, Wrist.Text, s * 0.6f, onAgain)
        }
    }
}

/** A small rounded button that keeps its label on one line. */
@Composable
fun Pill(label: String, background: Color, content: Color, width: androidx.compose.ui.unit.Dp, onClick: () -> Unit) {
    Box(
        Modifier.width(width).clip(RoundedCornerShape(50)).background(background).clickable(onClick = onClick).padding(horizontal = 10.dp, vertical = 7.dp),
        contentAlignment = Alignment.Center,
    ) {
        FitText(label, Wrist.Label.copy(color = content), Modifier.fillMaxWidth(), maxLines = 1)
    }
}

/**
 * Wrist down. Mostly black (saves the battery and the screen), nothing moving, no arrow: just
 * who, and how far when last heard. The buzzes are doing the guiding now.
 */
@Composable
private fun AmbientFinder(ui: FinderUi) {
    Column(
        Modifier.fillMaxSize().background(Color.Black),
        horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
    ) {
        Text(ui.mateName, style = Wrist.Label.copy(color = Color(0xFFAAAAAA)), maxLines = 1, overflow = TextOverflow.Ellipsis)
        val metres = when (val v = ui.view) {
            is WristView.Arrow -> v.distanceM
            is WristView.DistanceOnly -> v.distanceM
            else -> null
        }
        if (metres != null && ui.status == FinderStatus.LIVE) DistanceLine(metres, big = true, tint = Color(0xFFCCCCCC))
    }
}
