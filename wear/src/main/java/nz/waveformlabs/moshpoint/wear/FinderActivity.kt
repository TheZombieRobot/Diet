package nz.waveformlabs.moshpoint.wear

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.wear.ambient.AmbientLifecycleObserver

/**
 * The arrow. Starts the find for the mate it was opened with, shows it while the wrist is up,
 * goes to a still black screen when the wrist drops (the buzzes carry on), and ends the find
 * when the wearer swipes it away.
 */
class FinderActivity : ComponentActivity() {
    private var resumed = false
    private var ambient = false

    private val ambientCallback = object : AmbientLifecycleObserver.AmbientLifecycleCallback {
        override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
            ambient = true
            applyScreen()
        }

        override fun onExitAmbient() {
            ambient = false
            applyScreen()
        }
    }

    private val askNotifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        CrewStore.init(this)
        lifecycle.addObserver(AmbientLifecycleObserver(this, ambientCallback))
        if (!startFor(intent)) {
            finish()
            return
        }
        setContent {
            WristTheme {
                val ui by FindSession.ui.collectAsState()
                ui?.let { FinderScreen(it, CrewStore.faces[FindSession.mate?.faceKey.orEmpty()], onAgain = { FindSession.again(this) }) }
            }
        }
        // The ongoing "Finding Sam" chip is a notification: Wear OS 4+ asks once.
        val prefs = getSharedPreferences("finder", MODE_PRIVATE)
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED &&
            !prefs.getBoolean("asked_notifications", false)
        ) {
            prefs.edit().putBoolean("asked_notifications", true).apply()
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        startFor(intent)
    }

    /** Starts (or carries on with) the find this screen was opened for. False = nothing to show. */
    private fun startFor(intent: Intent?): Boolean {
        val id = intent?.getStringExtra(EXTRA_MATE)
        val current = FindSession.mate
        if (id == null || (current?.id == id && FindSession.ui.value != null)) return current != null && FindSession.ui.value != null
        val mate = CrewStore.state.value?.mates?.firstOrNull { it.id == id } ?: return false
        FindSession.start(this, mate)
        return true
    }

    override fun onResume() {
        super.onResume()
        resumed = true
        applyScreen()
    }

    override fun onPause() {
        resumed = false
        applyScreen()
        super.onPause()
    }

    private fun applyScreen() = FindSession.setScreen(visible = resumed || ambient, ambient = ambient)

    override fun onDestroy() {
        // Swiped away = stop. (Closed by the system while the wrist is down = keep going.)
        if (isFinishing) FindSession.stop()
        super.onDestroy()
    }

    companion object {
        const val EXTRA_MATE = "mate"
    }
}
