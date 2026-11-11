package nz.waveformlabs.moshpoint.ui

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import nz.waveformlabs.moshpoint.PhotoStore
import nz.waveformlabs.moshpoint.R
import java.util.Locale

/**
 * Whose face to show, in layers (top wins):
 *  1. Their own photo: Facebook or one they picked ([PhotoStore]).
 *  2. Their default avatar: artwork if the app ships some, else one drawn here.
 *  3. Their initials, if both of those fail (drawn by the caller when this returns null).
 */
internal object Faces {
    fun of(id: String?, name: String?): ImageBitmap? =
        id?.let { PhotoStore.photos[it] } ?: name?.let { DefaultAvatars.image(it) }
}

/**
 * Default avatars for anyone without a photo. Picked from the person's name, so everyone in
 * the crew sees the same face for them.
 *
 * Artwork: put images in res/drawable-nodpi and list them in `default_avatar_art`
 * (res/values/avatars.xml); they replace the drawn faces with no code change. Until then each
 * face is drawn here: skin, hair, eyes, mouth and a gig touch, picked from the name.
 */
internal object DefaultAvatars {
    private const val S = 256
    private var app: Context? = null
    private var art: IntArray = IntArray(0)
    private val cache = object : LinkedHashMap<String, ImageBitmap>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ImageBitmap>?) = size > 96
    }

    fun init(context: Context) {
        if (app != null) return
        app = context.applicationContext ?: context
        art = runCatching {
            val a = context.resources.obtainTypedArray(R.array.default_avatar_art)
            try { IntArray(a.length()) { a.getResourceId(it, 0) }.filter { it != 0 }.toIntArray() } finally { a.recycle() }
        }.getOrDefault(IntArray(0))
    }

    /** Their default avatar, or null if it can't be made (the caller then shows initials). */
    fun image(name: String): ImageBitmap? {
        val key = name.trim().lowercase(Locale.ROOT)
        if (key.isEmpty()) return null
        synchronized(cache) { cache[key]?.let { return it } }
        val made = runCatching { if (art.isNotEmpty()) fromArt(seed(key)) else draw(seed(key)) }.getOrNull() ?: return null
        val image = made.asImageBitmap()
        synchronized(cache) { cache[key] = image }
        return image
    }

    /** A steady number from the name: the same on every phone. */
    internal fun seed(key: String): Long {
        var h = 1125899906842597L
        key.forEach { h = 31 * h + it.code }
        // Mix, so similar names ("Jo", "Joe") still look different.
        h = h xor (h ushr 33); h *= -0xae502812aa7333L; h = h xor (h ushr 33)
        return h
    }

    private fun pick(seed: Long, slot: Int, n: Int) = Math.floorMod((seed ushr (slot * 5)) xor (seed ushr (slot * 3 + 17)), n.toLong()).toInt()

    private fun fromArt(seed: Long): Bitmap? {
        val res = app?.resources ?: return null
        val src = BitmapFactory.decodeResource(res, art[pick(seed, 0, art.size)]) ?: return null
        return Bitmap.createScaledBitmap(src, S, S, true)
    }

    private val Backdrops = longArrayOf(0xFF3A1D6E, 0xFF0E4A5C, 0xFF5C1A3E, 0xFF1C2F66, 0xFF214A2A, 0xFF4A2A12, 0xFF2A2440, 0xFF0F3D3A).map { it.toInt() }
    private val Skins = longArrayOf(0xFFFFDBC4, 0xFFF1C27D, 0xFFE0AC69, 0xFFC68642, 0xFF8D5524, 0xFF5C3A1E).map { it.toInt() }
    private val Hairs = longArrayOf(0xFF1B1B1F, 0xFF4A2C17, 0xFF8E3B1F, 0xFFE8C66A, 0xFFFF4FA3, 0xFF22E4FF, 0xFFD9D9E0, 0xFFB6FF3B).map { it.toInt() }
    private val Tees = longArrayOf(0xFF111114, 0xFF22E4FF, 0xFFFF4FA3, 0xFFB6FF3B, 0xFFFFB020, 0xFFC86BFF, 0xFFF4F4F6).map { it.toInt() }

    private fun draw(seed: Long): Bitmap {
        val bmp = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        val bg = Backdrops[pick(seed, 0, Backdrops.size)]
        val skin = Skins[pick(seed, 1, Skins.size)]
        val hairColour = Hairs[pick(seed, 2, Hairs.size)]
        val hair = pick(seed, 3, 6)
        val eyes = pick(seed, 4, 4)
        val mouth = pick(seed, 5, 4)
        val extra = pick(seed, 6, 5)
        val tee = Tees[pick(seed, 7, Tees.size)]
        val shade = darker(skin, 0.82f)

        // Backdrop: a moody stage-light gradient.
        p.shader = LinearGradient(0f, 0f, S.toFloat(), S.toFloat(), lighter(bg, 0.35f), darker(bg, 0.55f), Shader.TileMode.CLAMP)
        c.drawRect(0f, 0f, S.toFloat(), S.toFloat(), p)
        p.shader = null

        val cx = S / 2f
        val headTop = 52f
        val head = RectF(cx - 60f, headTop, cx + 60f, headTop + 136f)

        // Long hair falls behind the shoulders.
        if (hair == 1) { p.color = hairColour; c.drawRoundRect(RectF(cx - 74f, headTop + 6f, cx + 74f, 236f), 60f, 60f, p) }
        // Shoulders in a band tee, then the neck.
        p.color = tee; c.drawOval(RectF(cx - 104f, 206f, cx + 104f, 340f), p)
        p.color = shade; c.drawRoundRect(RectF(cx - 22f, 168f, cx + 22f, 222f), 14f, 14f, p)
        // Ears, head.
        p.color = skin
        c.drawCircle(cx - 60f, headTop + 74f, 14f, p); c.drawCircle(cx + 60f, headTop + 74f, 14f, p)
        c.drawOval(head, p)

        drawHair(c, p, hair, hairColour, head)
        // Cheeks.
        p.color = 0x33FF5A7A; c.drawCircle(cx - 34f, headTop + 98f, 12f, p); c.drawCircle(cx + 34f, headTop + 98f, 12f, p)
        drawEyes(c, p, eyes, headTop + 76f)
        drawMouth(c, p, mouth, headTop + 108f)
        drawExtra(c, p, extra, head, hair)
        return bmp
    }

    private fun drawHair(c: Canvas, p: Paint, style: Int, colour: Int, head: RectF) {
        p.color = colour
        val cx = head.centerX()
        when (style) {
            0 -> c.drawArc(RectF(head.left - 2f, head.top - 6f, head.right + 2f, head.top + 92f), 180f, 180f, true, p) // short crop
            1 -> c.drawArc(RectF(head.left - 6f, head.top - 8f, head.right + 6f, head.top + 100f), 180f, 180f, true, p) // long (back drawn earlier)
            2 -> { // mohawk
                val path = Path().apply {
                    moveTo(cx - 18f, head.top + 30f)
                    for (i in 0..4) { lineTo(cx - 14f + i * 7f, head.top - 34f + (i % 2) * 18f); lineTo(cx - 10f + i * 7f, head.top + 10f) }
                    lineTo(cx + 18f, head.top + 30f); close()
                }
                c.drawPath(path, p)
            }
            3 -> { p.alpha = 150; c.drawArc(RectF(head.left + 2f, head.top - 2f, head.right - 2f, head.top + 70f), 180f, 180f, true, p); p.alpha = 255 } // buzz
            4 -> for (i in 0..8) { // curls
                val a = Math.toRadians(180.0 + i * 22.5)
                c.drawCircle(cx + 58f * Math.cos(a).toFloat(), head.top + 48f + 52f * Math.sin(a).toFloat(), 24f, p)
            }
            else -> { // top knot
                c.drawArc(RectF(head.left - 2f, head.top - 4f, head.right + 2f, head.top + 84f), 180f, 180f, true, p)
                c.drawCircle(cx, head.top - 14f, 22f, p)
            }
        }
    }

    private fun drawEyes(c: Canvas, p: Paint, style: Int, y: Float) {
        val cx = S / 2f
        p.color = 0xFF1B1420.toInt()
        when (style) {
            0 -> { c.drawCircle(cx - 22f, y, 7f, p); c.drawCircle(cx + 22f, y, 7f, p) }
            1 -> { stroke(p, 6f); c.drawArc(RectF(cx - 32f, y - 8f, cx - 12f, y + 10f), 200f, 140f, false, p); c.drawArc(RectF(cx + 12f, y - 8f, cx + 32f, y + 10f), 200f, 140f, false, p); fill(p) }
            2 -> { // shades
                c.drawRoundRect(RectF(cx - 44f, y - 12f, cx - 6f, y + 12f), 10f, 10f, p)
                c.drawRoundRect(RectF(cx + 6f, y - 12f, cx + 44f, y + 12f), 10f, 10f, p)
                c.drawRect(cx - 8f, y - 6f, cx + 8f, y - 2f, p)
                p.color = 0x99B6FF3B.toInt(); c.drawRect(cx - 38f, y - 7f, cx - 28f, y - 3f, p); c.drawRect(cx + 12f, y - 7f, cx + 22f, y - 3f, p)
            }
            else -> { c.drawCircle(cx - 22f, y, 7f, p); stroke(p, 6f); c.drawLine(cx + 13f, y + 1f, cx + 31f, y + 1f, p); fill(p) } // wink
        }
    }

    private fun drawMouth(c: Canvas, p: Paint, style: Int, y: Float) {
        val cx = S / 2f
        p.color = 0xFF4A1426.toInt()
        when (style) {
            0 -> { stroke(p, 6f); c.drawArc(RectF(cx - 20f, y - 14f, cx + 20f, y + 10f), 20f, 140f, false, p); fill(p) }
            1 -> { c.drawArc(RectF(cx - 22f, y - 14f, cx + 22f, y + 20f), 0f, 180f, true, p); p.color = 0xFFF8F4F0.toInt(); c.drawRect(cx - 16f, y + 3f, cx + 16f, y + 8f, p) }
            2 -> c.drawOval(RectF(cx - 11f, y - 6f, cx + 11f, y + 18f), p) // mid-scream
            else -> { stroke(p, 6f); c.drawArc(RectF(cx - 10f, y - 12f, cx + 24f, y + 6f), 30f, 110f, false, p); fill(p) } // smirk
        }
    }

    private fun drawExtra(c: Canvas, p: Paint, style: Int, head: RectF, hair: Int) {
        val cx = head.centerX()
        when (style) {
            1 -> { // headphones
                p.color = 0xFF2A2A30.toInt(); stroke(p, 10f)
                c.drawArc(RectF(head.left - 8f, head.top - 12f, head.right + 8f, head.top + 140f), 190f, 160f, false, p); fill(p)
                p.color = 0xFF22E4FF.toInt()
                c.drawRoundRect(RectF(head.left - 18f, head.top + 56f, head.left + 6f, head.top + 96f), 10f, 10f, p)
                c.drawRoundRect(RectF(head.right - 6f, head.top + 56f, head.right + 18f, head.top + 96f), 10f, 10f, p)
            }
            2 -> if (hair != 2 && hair != 5) { // beanie
                p.color = 0xFFFF4FA3.toInt(); c.drawArc(RectF(head.left - 6f, head.top - 14f, head.right + 6f, head.top + 86f), 180f, 180f, true, p)
                p.color = darker(0xFFFF4FA3.toInt(), 0.75f); c.drawRoundRect(RectF(head.left - 8f, head.top + 26f, head.right + 8f, head.top + 44f), 8f, 8f, p)
            }
            3 -> { p.color = 0xFFB6FF3B.toInt(); c.drawRect(head.left + 2f, head.top + 34f, head.right - 2f, head.top + 46f, p) } // sweatband
            4 -> { p.color = 0xFFFFD34D.toInt(); c.drawCircle(cx - 60f, head.top + 88f, 5f, p) } // ear stud
        }
    }

    private fun stroke(p: Paint, w: Float) { p.style = Paint.Style.STROKE; p.strokeWidth = w; p.strokeCap = Paint.Cap.ROUND }
    private fun fill(p: Paint) { p.style = Paint.Style.FILL }
    private fun darker(c: Int, f: Float) = android.graphics.Color.argb(android.graphics.Color.alpha(c), (android.graphics.Color.red(c) * f).toInt(), (android.graphics.Color.green(c) * f).toInt(), (android.graphics.Color.blue(c) * f).toInt())
    private fun lighter(c: Int, t: Float) = android.graphics.Color.argb(255,
        (android.graphics.Color.red(c) + (255 - android.graphics.Color.red(c)) * t).toInt(),
        (android.graphics.Color.green(c) + (255 - android.graphics.Color.green(c)) * t).toInt(),
        (android.graphics.Color.blue(c) + (255 - android.graphics.Color.blue(c)) * t).toInt())
}
