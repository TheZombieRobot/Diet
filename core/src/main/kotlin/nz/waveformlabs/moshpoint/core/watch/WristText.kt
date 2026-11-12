package nz.waveformlabs.moshpoint.core.watch

/**
 * How text may wrap on a small round screen (docs/WATCH.md, problem 10), for the scripts where
 * the usual rule ("never cut a word") needs help. The watch's text fitter uses these; they are
 * here, away from Android, so they can be tested.
 */
object WristText {
    /** Invisible, and no line may break on either side of it. */
    const val WORD_JOINER = '⁠'

    /**
     * Thai, Chinese and Japanese (kana, kanji, and their full-width punctuation) are written
     * without spaces and may wrap between any two characters.
     */
    fun breaksAnywhere(c: Char): Boolean =
        c in '฀'..'๿' || c in '⺀'..'鿿' || c in '豈'..'﫿' || c in '＀'..'￯'

    /**
     * The words of [text] that must stay whole when it wraps: what stands between spaces, in
     * scripts that put spaces between words. A run of Thai, Chinese or Japanese is not a word
     * in this sense and is left out.
     */
    fun wholeWords(text: String): List<String> =
        text.split(' ', '\n').filter { word -> word.isNotEmpty() && word.none(::breaksAnywhere) }

    /**
     * Korean is written with spaces, but Android will still break a line in the middle of a
     * word, leaving one syllable on a line by itself. A [WORD_JOINER] between the characters of
     * each Korean word (and between a Korean ending and the name or number it is attached to)
     * keeps the word whole, so lines break at the spaces. Text with no Korean comes back unchanged.
     */
    fun keepKoreanWords(text: String): String {
        if (text.none(::hangul)) return text
        val out = StringBuilder(text.length * 2)
        for (i in text.indices) {
            val c = text[i]
            out.append(c)
            val next = text.getOrNull(i + 1) ?: break
            val joinable = !c.isWhitespace() && !next.isWhitespace() && c != WORD_JOINER && next != WORD_JOINER
            if (joinable && (hangul(c) || hangul(next))) out.append(WORD_JOINER)
        }
        return out.toString()
    }

    private fun hangul(c: Char): Boolean = c in '가'..'힣'
}
