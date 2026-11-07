package nz.waveformlabs.moshpoint.ui

import android.graphics.Bitmap
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.delay
import nz.waveformlabs.moshpoint.Friend

fun qrBitmap(text: String, sizePx: Int = 720): Bitmap {
    val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, sizePx, sizePx, mapOf(EncodeHintType.MARGIN to 1))
    val ink = 0xFF07050F.toInt()
    val pixels = IntArray(sizePx * sizePx) { i -> if (matrix[i % sizePx, i / sizePx]) ink else 0xFFFFFFFF.toInt() }
    return Bitmap.createBitmap(pixels, sizePx, sizePx, Bitmap.Config.ARGB_8888)
}

/**
 * Full-screen QR sheet (design canvas: "Crew QR"): the code in a white card inside a
 * running neon frame, members popping in as they join (for a crew).
 */
@Composable
fun MyQrDialog(
    payload: String,
    onDismiss: () -> Unit,
    title: String = "Scan to add me",
    hint: String = "Then scan theirs, so you can find each other.",
    eyebrow: String = "YOUR CODE",
    members: List<Friend> = emptyList(),
    onEndNight: (() -> Unit)? = null,
) {
    val bmp = remember(payload) { qrBitmap(payload).asImageBitmap() }
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { shown = true }
    val pop by animateFloatAsState(if (shown) 1f else 0.85f, spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessMediumLow), label = "pop")

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
            GlowBackground(colours = listOf(Mosh.Pink, Mosh.Violet, Mosh.Cyan))
            Column(Modifier.fillMaxSize().padding(start = 24.dp, end = 24.dp, top = 16.dp, bottom = 24.dp)) {
                TextButton(onClick = onDismiss) { Text("‹  Done", style = Mosh.Label.copy(fontSize = 15.sp)) }
                Spacer(Modifier.height(12.dp))
                Text(eyebrow, style = Mosh.Eyebrow)
                Spacer(Modifier.height(6.dp))
                Text(title, style = Mosh.Title.copy(fontSize = 28.sp, lineHeight = 32.sp))
                Spacer(Modifier.height(8.dp))
                Text(hint, style = Mosh.Body)
                Spacer(Modifier.height(28.dp))

                NeonFrame(
                    RoundedCornerShape(32.dp),
                    Modifier.align(Alignment.CenterHorizontally).size(290.dp).graphicsLayer { scaleX = pop; scaleY = pop }
                        .drawBehind { glow(Mosh.Pink, 40.dp.toPx(), 0.35f) { p -> drawContext.canvas.drawCircle(center, size.minDimension / 2, p) } },
                    width = 3.dp,
                ) {
                    Box(
                        Modifier.fillMaxSize().background(Color.White, RoundedCornerShape(29.dp)).padding(18.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Image(bmp, contentDescription = "QR code", modifier = Modifier.fillMaxSize().clip(RoundedCornerShape(8.dp)))
                    }
                }

                if (members.isNotEmpty()) {
                    Spacer(Modifier.height(24.dp))
                    Row(Modifier.align(Alignment.CenterHorizontally), verticalAlignment = Alignment.CenterVertically) {
                        Row {
                            members.take(6).forEachIndexed { i, f -> key(f.id) { PopInAvatar(f, i) } }
                        }
                        Spacer(Modifier.width(12.dp))
                        val n = members.size
                        Text("$n mate${if (n == 1) "" else "s"} in", style = Mosh.Body.copy(color = Mosh.Text))
                    }
                }

                Spacer(Modifier.weight(1f))
                if (onEndNight != null) {
                    TextButton(onClick = onEndNight, modifier = Modifier.align(Alignment.CenterHorizontally)) {
                        Text("End the night", style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Danger))
                    }
                }
            }
        }
    }
}

/** A member's avatar that pops in with a bounce when they join. */
@Composable
private fun PopInAvatar(f: Friend, index: Int) {
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(120L * index)
        shown = true
    }
    val s by animateFloatAsState(if (shown) 1f else 0f, spring(dampingRatio = 0.45f, stiffness = Spring.StiffnessMedium), label = "pop")
    val colour = Color(f.color)
    Box(
        Modifier.offset(x = (-10 * index).dp).size(36.dp)
            .graphicsLayer { scaleX = s; scaleY = s; alpha = s.coerceIn(0f, 1f) }
            .drawBehind { glow(colour, 8.dp.toPx(), 0.7f) { p -> drawContext.canvas.drawCircle(center, size.minDimension / 2, p) } }
            .background(colour, CircleShape)
            .border(2.dp, Mosh.Ground, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(f.name.take(1).uppercase(), style = Mosh.Button.copy(fontSize = 13.sp, color = Mosh.Ground), textAlign = TextAlign.Center)
    }
}

