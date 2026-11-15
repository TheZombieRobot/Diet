package nz.waveformlabs.moshpoint

import android.content.Context
import android.content.Intent

/** The messages Moshpoint asks you to send (install link, crew invite, "go live" nudge). */
object Sharing {
    /** Where mates get the app: the test build's public link, or the Play Store once released. */
    fun appLink(c: Context) =
        if (BuildConfig.TEST_BUILD) "https://github.com/TheZombieRobot/Diet/releases/tag/testing" // install page with steps
        else "https://play.google.com/store/apps/details?id=${c.packageName}"

    fun getTheApp(c: Context) = Txt.s(R.string.main_get_the_app, appLink(c))

    fun nudgeText(names: List<String>) =
        Txt.s(R.string.main_nudge_text, names.joinToString(" & ").ifBlank { Txt.s(R.string.main_nudge_mate) })

    /** Open the share sheet with [text] (WhatsApp, Messenger, SMS...). */
    fun send(c: Context, text: String, title: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        c.startActivity(Intent.createChooser(send, title))
    }
}
