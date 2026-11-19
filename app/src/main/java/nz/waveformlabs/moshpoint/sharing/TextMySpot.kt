package nz.waveformlabs.moshpoint.sharing

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.SpotText
import nz.waveformlabs.moshpoint.crew.CrewStatus
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.watch.Entitlements

/**
 * "Text my spot" (Moshpoint+, docs/REMOVE_SAFETY.md, stage 3): one tap in the crew area opens
 * the phone's own texting app with a message already written (core [SpotText]): a short line, a
 * link and the plain coordinates. The person picks a mate and presses Send. Moshpoint never
 * sends or reads a text itself, so it asks for no SMS permission (Play allows those only for the
 * default texting app). With no signal, a phone whose carrier texts by satellite sends it that way.
 *
 * Members only, behind a Settings switch that's off by default. Free users don't see it.
 *
 * The link: with a relay of our own built in, our own (core SpotLink), which opens straight in
 * Moshpoint on a mate's phone, with the sender's first name on the pin (docs/SPOT_LINKS.md), and
 * in Google Maps through the relay's page anywhere else; with none, a Google Maps link.
 */
object TextMySpot {
    /** The Settings switch (Compose state). Off until someone turns it on. */
    val on = mutableStateOf(false)

    private fun prefs(c: Context) = c.applicationContext.getSharedPreferences("text_my_spot", Context.MODE_PRIVATE)

    fun init(c: Context) {
        on.value = prefs(c).getBoolean("on", false)
    }

    fun set(c: Context, value: Boolean) {
        on.value = value
        prefs(c).edit().putBoolean("on", value).apply()
    }

    /** Is the switch offered in Settings? Members only (the one Moshpoint+ check). */
    fun offered(c: Context): Boolean = Entitlements.plus(c)

    /** Is the button shown in the crew area? A member who switched it on. */
    fun shown(c: Context): Boolean = on.value && offered(c)

    /** The text, from this phone's last fix (none in the last 10 minutes: it says so plainly). */
    fun message(c: Context): String {
        val here = CrewStatus.myLocation(c)
        return SpotText.message(
            Txt.s(R.string.spot_text_line), Txt.s(R.string.spot_text_no_fix), here?.latitude, here?.longitude,
            server = BuildConfig.MOSHPOINT_SERVER, name = VisibilityPrefs.myName(c),
        )
    }

    /**
     * Opens the texting app with the text ready (`ACTION_SENDTO`, `smsto:` with no number: the
     * person chooses who). When nothing on this phone can send a text (a tablet), it says so.
     */
    fun open(c: Context) {
        val i = Intent(Intent.ACTION_SENDTO, Uri.parse("smsto:"))
            .putExtra("sms_body", message(c))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (runCatching { c.startActivity(i) }.isFailure) {
            Toast.makeText(c, Txt.s(R.string.spot_text_no_app), Toast.LENGTH_LONG).show()
        }
    }
}
