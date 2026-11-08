package nz.waveformlabs.moshpoint

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * "Share → Moshpoint crew" from the camera or gallery: passes the photo to the app, which
 * asks for an optional caption and sends it to your crew as a moment. No UI of its own.
 */
class ShareMomentActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        @Suppress("DEPRECATION")
        val uri = intent?.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)
        if (uri != null) {
            startActivity(
                Intent(this, MainActivity::class.java)
                    .setDataAndType(uri, intent.type ?: "image/*")
                    .putExtra(MainActivity.EXTRA_MOMENT, true)
                    .addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP or
                            Intent.FLAG_GRANT_READ_URI_PERMISSION,
                    ),
            )
        }
        finish()
    }
}
