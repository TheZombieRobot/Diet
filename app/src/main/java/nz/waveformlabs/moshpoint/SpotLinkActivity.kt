package nz.waveformlabs.moshpoint

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import nz.waveformlabs.moshpoint.core.SpotLink

/**
 * A spot a mate texted, opened from its link (an App Link, `https://<relay host>/spot#…`,
 * docs/SPOT_LINKS.md): hands it to the app's own screen, in the app's own task, and closes. No UI
 * of its own. Declared only in builds with a relay of our own (app/src/spotLinks), so a build
 * without one has no link to open.
 *
 * The link is untrusted: only a valid spot goes on (core [SpotLink.parse]: our host, valid
 * coordinates, a short plain name), and MainActivity checks it again. All it can ever do is show
 * that spot: nothing in it changes a setting, joins a crew or goes live. Free for everyone (only
 * sending one is Moshpoint+).
 */
class SpotLinkActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val link = intent?.takeIf { it.action == Intent.ACTION_VIEW }?.dataString
        if (link != null && SpotLink.parse(link, BuildConfig.MOSHPOINT_SERVER) != null) {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .putExtra(EXTRA_LINK, link)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            )
        } else {
            // Cut short or changed on the way: say so, rather than open nothing. (The text has the
            // plain coordinates too.)
            Toast.makeText(applicationContext, getString(R.string.spot_link_broken), Toast.LENGTH_LONG).show()
        }
        finish()
    }

    companion object {
        /** The link, for MainActivity (which parses it again: any app can start it with this). */
        const val EXTRA_LINK = "nz.waveformlabs.moshpoint.SPOT_LINK"
    }
}
