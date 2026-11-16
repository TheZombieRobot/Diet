package nz.waveformlabs.moshpoint.moderation

import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.moments.Moments

/**
 * The block (and report) dialogs on screen (docs/REPORT_BLOCK.md). Any screen asks by setting
 * one of these; main/ModerationOverlays draws them over everything.
 */
object Moderation {
    /** Who, and what of theirs (null = the person, from their face). */
    class Subject(val person: Person, val content: Content? = null)

    /** Something someone posted, as this phone shows it. */
    sealed interface Content

    /** A crew chat line ([private] = false) or a private message. */
    class Message(val text: String, val timeSec: Long, val private: Boolean) : Content

    /** A photo or clip. */
    class Moment(val item: Moments.Item) : Content

    /** The menu for someone's message, photo, clip, or them (Block, and later Report). */
    val menu = mutableStateOf<Subject?>(null)

    /** "Block Jo?" */
    val confirmBlock = mutableStateOf<Subject?>(null)

    /** The crew's usual "Remove Jo from the crew?", reached from the block confirmation. */
    val confirmRemove = mutableStateOf<Friend?>(null)

    fun ask(s: Subject) {
        menu.value = s
    }
}
