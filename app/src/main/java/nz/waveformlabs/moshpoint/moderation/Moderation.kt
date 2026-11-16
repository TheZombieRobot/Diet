package nz.waveformlabs.moshpoint.moderation

import android.content.Context
import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.core.CommunityRules
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

    /** The report sheet: a reason, a note, what is sent. */
    val report = mutableStateOf<Subject?>(null)

    /** The crew's usual "Remove Jo from the crew?", reached from the block confirmation. */
    val confirmRemove = mutableStateOf<Friend?>(null)

    fun ask(s: Subject) {
        menu.value = s
    }

    // ---- Community rules ("Before you post"), once ----

    /** The post waiting for the rules to be agreed to (the dialog shows while this is set). */
    val rules = mutableStateOf<(() -> Unit)?>(null)

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("moderation", Context.MODE_PRIVATE)

    /** Has this phone agreed to the current rules? */
    fun agreed(c: Context): Boolean = !CommunityRules.mustAsk(prefs(c).getInt("rules_agreed", 0))

    /**
     * Before a crew chat message, plan, photo, clip or private message: [post] now if the rules
     * were agreed to, otherwise once they are ("Not now" drops it).
     */
    fun beforePosting(c: Context, post: () -> Unit) {
        if (agreed(c)) post() else rules.value = post
    }

    /** "I agree": remembered, and the waiting post goes. */
    fun agree(c: Context) {
        prefs(c).edit().putInt("rules_agreed", CommunityRules.VERSION).apply()
        val post = rules.value
        rules.value = null
        post?.invoke()
    }
}
