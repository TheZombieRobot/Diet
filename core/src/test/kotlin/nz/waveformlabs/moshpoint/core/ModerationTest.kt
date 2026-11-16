package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ModerationTest {
    private val jo = CrewKeys.generate()
    private val sam = CrewKeys.generate()

    private fun block(s: CrewKeys.Signer, name: String, crew: String = "c1", at: Long = 100) =
        Blocked(s.tag, BlockList.hex(s.pub), name, crew, "Laneway crew", at)

    @Test fun nobodyIsBlockedAtFirst() {
        val l = BlockList.EMPTY
        assertTrue(l.isEmpty)
        assertFalse(l.blocksTag(jo.tag))
        assertFalse(l.hidesLine(jo.tag, GigGroup.Ping.CHAT, mine = false))
        assertFalse(l.hidesMoment("c1", "Jo", mine = false))
    }

    @Test fun aBlockedPersonsChatIsHiddenByTheirKeyNotTheirName() {
        val l = BlockList.EMPTY.with(block(jo, "Jo"))
        assertTrue(l.blocksKey(jo.pub))
        assertTrue(l.hidesLine(jo.tag, GigGroup.Ping.CHAT, mine = false))
        assertTrue(l.hidesLine(jo.tag, GigGroup.Ping.FLARE, mine = false))
        assertTrue(l.hidesLine(jo.tag, GigGroup.Ping.COMING, mine = false))
        // Someone else, even under the same name, isn't.
        assertFalse(l.hidesLine(sam.tag, GigGroup.Ping.CHAT, mine = false))
        assertFalse(l.blocksKey(sam.pub))
        // Unsigned (tag 0) is never "blocked by key".
        assertFalse(l.blocksTag(0L))
    }

    @Test fun needHelpFromABlockedPersonStillShows() {
        val l = BlockList.EMPTY.with(block(jo, "Jo"))
        assertFalse(l.hidesLine(jo.tag, GigGroup.Ping.NEED_HELP, mine = false))
    }

    @Test fun ourOwnContentIsNeverHidden() {
        val l = BlockList.EMPTY.with(block(jo, "Jo"))
        assertFalse(l.hidesLine(jo.tag, GigGroup.Ping.CHAT, mine = true))
        assertFalse(l.hidesMoment("c1", "Jo", mine = true))
    }

    @Test fun momentsAreHiddenByNameOnlyInTheCrewOfTheBlock() {
        val l = BlockList.EMPTY.with(block(jo, "Jo"))
        assertTrue(l.hidesMoment("c1", "Jo", mine = false))
        assertTrue(l.hidesMoment("c1", "  jo ", mine = false))
        assertFalse(l.hidesMoment("c2", "Jo", mine = false))
        assertFalse(l.hidesMoment("c1", "Joanna", mine = false))
        assertFalse(l.hidesMoment("c1", "", mine = false))
    }

    @Test fun aNameOnlyBlockCoversTheirMomentsButNoKey() {
        val l = BlockList.EMPTY.with(Blocked(0L, "", "Bevan", "c1", "Laneway crew", 5))
        assertTrue(l.hidesMoment("c1", "bevan", mine = false))
        assertTrue(l.blocksPerson(0L, "c1", "Bevan"))
        assertFalse(l.blocksTag(0L))
        assertEquals("c1/bevan", l.entries.single().id)
    }

    @Test fun blockingTwiceKeepsOneEntryAndUnblockRemovesIt() {
        val once = BlockList.EMPTY.with(block(jo, "Jo", at = 1))
        val twice = once.with(block(jo, "Jo B", at = 2))
        assertEquals(1, twice.entries.size)
        assertEquals("Jo B", twice.entries.single().name)
        val both = twice.with(block(sam, "Sam", at = 3))
        assertEquals(listOf("Sam", "Jo B"), both.newestFirst().map { it.name })
        val after = both.without(twice.entries.single().id)
        assertFalse(after.blocksTag(jo.tag))
        assertTrue(after.blocksTag(sam.tag))
    }

    @Test fun aRekeyMovesTheCrewsBlocksWithIt() {
        val l = BlockList.EMPTY.with(block(jo, "Jo", crew = "old")).with(block(sam, "Sam", crew = "other"))
        val moved = l.migrate("old", "new")
        assertTrue(moved.hidesMoment("new", "Jo", mine = false))
        assertFalse(moved.hidesMoment("old", "Jo", mine = false))
        assertTrue(moved.hidesMoment("other", "Sam", mine = false))
        // The key is the same across a rekey, so chat stays hidden.
        assertTrue(moved.blocksTag(jo.tag))
        assertTrue(l.migrate("nothing", "new") === l)
    }

    @Test fun savesAndReadsBackAndSkipsDamagedLines() {
        val l = BlockList.EMPTY
            .with(block(jo, "Jo\twith a tab", at = 7))
            .with(Blocked(0L, "", "Bevan", "c9", "Up next\ncrew", 8))
        val back = BlockList.parse(l.encode() + "\nnot a line\n\t\t\t")
        assertEquals(2, back.entries.size)
        assertEquals("Jo with a tab", back.entries[0].name)
        assertEquals(BlockList.hex(jo.pub), back.entries[0].pub)
        assertEquals("Up next crew", back.entries[1].crewName)
        assertTrue(back.blocksTag(jo.tag))
        assertTrue(back.hidesMoment("c9", "Bevan", mine = false))
        assertEquals(BlockList.EMPTY, BlockList.parse(""))
    }

    @Test fun aNegativeTagSurvivesSaving() {
        val e = Blocked(-5L, "", "Neg", "c1", "", 1)
        assertTrue(BlockList.parse(BlockList.EMPTY.with(e).encode()).blocksTag(-5L))
    }

    @Test fun longNamesAreCutAndTheListIsBounded() {
        var l = BlockList.EMPTY.with(block(jo, "J".repeat(100)))
        assertEquals(BlockList.MAX_NAME, l.entries.single().name.length)
        repeat(BlockList.MAX_ENTRIES + 5) { i -> l = l.with(Blocked(i + 1L, "", "P$i", "c", "", i.toLong())) }
        assertEquals(BlockList.MAX_ENTRIES, l.entries.size)
        assertFalse(l.blocksTag(jo.tag)) // the oldest went first
    }
}
