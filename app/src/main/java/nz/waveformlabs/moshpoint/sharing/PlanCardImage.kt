package nz.waveformlabs.moshpoint

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import androidx.core.content.FileProvider
import java.io.File

/**
 * The night's plan as a picture (4:5, Instagram/WhatsApp friendly): gig, when and where,
 * the pinned plan, the meet-up spot and who's coming. Handy for the group chat that isn't
 * on Moshpoint yet. Holds no keys or locations, only what's printed.
 */
object PlanCardImage {
    data class Card(val title: String, val whenWhere: String?, val plan: String?, val meetUp: String?, val crew: List<String>)

    fun render(card: Card, w: Int = 1080, h: Int = 1350): Bitmap {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val cv = Canvas(bmp)
        val bg = Paint().apply { shader = LinearGradient(0f, 0f, w.toFloat(), h.toFloat(), 0xFF1A0B33.toInt(), 0xFF07050F.toInt(), Shader.TileMode.CLAMP) }
        cv.drawRect(0f, 0f, w.toFloat(), h.toFloat(), bg)
        // A neon glow corner.
        val glow = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = android.graphics.RadialGradient(w * 0.9f, h * 0.08f, w * 0.7f, 0x66FF2E93, 0x00FF2E93, Shader.TileMode.CLAMP)
        }
        cv.drawRect(0f, 0f, w.toFloat(), h.toFloat(), glow)
        val pad = 84f
        var y = 120f
        val bold = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        fun text(s: String, size: Float, colour: Int, face: Typeface = Typeface.DEFAULT, spacing: Float = 0f): Float {
            val tp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textSize = size; color = colour; typeface = face; letterSpacing = spacing }
            val layout = StaticLayout.Builder.obtain(s, 0, s.length, tp, (w - pad * 2).toInt())
                .setAlignment(Layout.Alignment.ALIGN_NORMAL).setMaxLines(4).setEllipsize(android.text.TextUtils.TruncateAt.END).build()
            cv.save(); cv.translate(pad, y); layout.draw(cv); cv.restore()
            return layout.height.toFloat()
        }
        y += text(Txt.s(R.string.crew_card_eyebrow), 34f, 0xFF8E87A6.toInt(), bold, 0.12f) + 40f
        y += text(card.title, 92f, 0xFFF7F5FF.toInt(), bold) + 18f
        card.whenWhere?.let { y += text(it, 42f, 0xFF22E4FF.toInt()) + 50f } ?: run { y += 32f }
        card.plan?.let { p ->
            val box = RectF(pad - 24f, y - 20f, w - pad + 24f, y)
            val tp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 58f; typeface = bold }
            val lh = StaticLayout.Builder.obtain(p, 0, p.length, tp, (w - pad * 2).toInt()).setMaxLines(4).build().height
            box.bottom = y + 70f + lh + 30f
            cv.drawRoundRect(box, 36f, 36f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0x26B6FF3B })
            cv.drawRoundRect(box, 36f, 36f, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xAAB6FF3B.toInt(); style = Paint.Style.STROKE; strokeWidth = 4f })
            y += 10f
            y += text(Txt.s(R.string.crew_card_plan), 30f, 0xFFB6FF3B.toInt(), bold, 0.14f) + 14f
            y += text(p, 58f, 0xFFF7F5FF.toInt(), bold) + 70f
        }
        card.meetUp?.let { y += text(Txt.s(R.string.crew_card_meet_up, it), 44f, 0xFFFF2E93.toInt(), bold) + 40f }
        if (card.crew.isNotEmpty()) {
            y += text(Txt.s(R.string.crew_card_whos_coming), 30f, 0xFF8E87A6.toInt(), bold, 0.14f) + 12f
            text(card.crew.take(12).joinToString("  ·  "), 44f, 0xFFD9D4EC.toInt())
        }
        val foot = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 30f; color = 0xFF8E87A6.toInt() }
        cv.drawText(Txt.s(R.string.crew_card_footer), pad, h - 80f, foot)
        return bmp
    }

    /** Render, save to the share cache and open the share sheet. */
    fun share(c: Context, card: Card) {
        val dir = File(c.cacheDir, "clips").apply { mkdirs() }
        val f = File(dir, "plan-card.png")
        runCatching { f.outputStream().use { render(card).compress(Bitmap.CompressFormat.PNG, 100, it) } }.onFailure { return }
        val uri = FileProvider.getUriForFile(c, "${c.packageName}.media", f)
        val send = Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri)
            .putExtra(Intent.EXTRA_TEXT, listOfNotNull(card.title, card.plan, card.meetUp?.let { Txt.s(R.string.crew_card_share_meet_up, it) }).joinToString("\n"))
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        c.startActivity(Intent.createChooser(send, Txt.s(R.string.crew_card_share_title)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}
