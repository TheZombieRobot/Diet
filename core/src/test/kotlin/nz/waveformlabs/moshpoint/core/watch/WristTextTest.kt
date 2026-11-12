package nz.waveformlabs.moshpoint.core.watch

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WristTextTest {
    private val j = WristText.WORD_JOINER

    @Test fun koreanWordsAreJoinedInsideAndLeftOpenAtSpaces() {
        // "길게 누르기" (press and hold): two words, so exactly one place a line may break.
        assertEquals("길${j}게 누${j}르${j}기", WristText.keepKoreanWords("길게 누르기"))
        val joined = WristText.keepKoreanWords("폰에서 워치 앱 잠금을 풀어요")
        assertEquals(4, joined.count { it == ' ' })
        assertFalse(joined.contains(" $j") || joined.contains("$j "), "nothing is joined across a space")
    }

    @Test fun aKoreanEndingStaysWithTheNameOrNumberBeforeIt() {
        // "Moshpoint를", "8자를", "Sam님은": the ending must not start a line by itself.
        assertEquals("폰${j}에${j}서 Moshpoint${j}를 열${j}어${j}요", WristText.keepKoreanWords("폰에서 Moshpoint를 열어요"))
        assertEquals("8${j}자${j}를", WristText.keepKoreanWords("8자를"))
        assertTrue(WristText.keepKoreanWords("Sam님은 이제 크루에 없어요").startsWith("Sam${j}님${j}은 "))
    }

    @Test fun textWithNoKoreanIsLeftAlone() {
        for (s in listOf("Hold to tell your crew", "Potrzebuję pomocy", "長押しでクルーに知らせる", "กดค้างเพื่อบอกแก๊ง", "اضغط مطولًا", "दबाए रखें", "")) {
            assertEquals(s, WristText.keepKoreanWords(s))
        }
    }

    @Test fun joiningTwiceChangesNothingMore() {
        val once = WristText.keepKoreanWords("길게 누르면 크루에 알려요")
        assertEquals(once, WristText.keepKoreanWords(once))
    }

    @Test fun scriptsWithoutSpacesMayBreakAnywhere() {
        for (c in "กค你們あア！。") assertTrue(WristText.breaksAnywhere(c), "$c")
        // Latin, Korean, Arabic, Hindi, digits and spaces do not: their words are kept whole.
        for (c in "aZé한ضद8 ·") assertFalse(WristText.breaksAnywhere(c), "$c")
    }

    @Test fun wholeWordsAreOnlyTheOnesBetweenSpaces() {
        assertEquals(listOf("Open", "Moshpoint", "on", "your", "phone"), WristText.wholeWords("Open Moshpoint on your phone"))
        // Japanese with a Latin name inside: one unbroken run, so nothing to protect.
        assertEquals(emptyList(), WristText.wholeWords("スマホでMoshpointを開いてね"))
        // Thai around a Latin name: the name is a word, the Thai runs are not.
        assertEquals(listOf("Moshpoint"), WristText.wholeWords("เปิด Moshpoint บนมือถือ"))
        // Korean words count: they are joined, and must fit a line whole.
        assertEquals(2, WristText.wholeWords(WristText.keepKoreanWords("길게 누르기")).size)
        assertEquals(listOf("Tieni", "premuto"), WristText.wholeWords("Tieni\npremuto"))
    }
}
