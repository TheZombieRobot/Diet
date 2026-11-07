package nz.waveformlabs.moshpoint

import android.app.Activity
import android.content.Intent
import android.os.Bundle

/**
 * "Share → Moshpoint" from Messenger, SMS etc.: hands the shared text to the app's own
 * screen (in the app's task, not the sharing app's) and closes. No UI of its own.
 */
class ShareInviteActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = intent?.getStringExtra(Intent.EXTRA_TEXT)
        if (text != null) {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .putExtra(EXTRA_TEXT, text)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
            )
        }
        finish()
    }

    companion object {
        const val EXTRA_TEXT = "nz.waveformlabs.moshpoint.INVITE_TEXT"
    }
}
