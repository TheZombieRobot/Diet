package nz.waveformlabs.moshpoint

import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The phone side of "Light me up": full brightness, screen kept on, torch flashing.
 * (The strobing screen itself is drawn by the finder.)
 */
class TorchStrobe(private val activity: ComponentActivity) {
    private var job: Job? = null

    fun set(on: Boolean) {
        val w = activity.window
        w.attributes = w.attributes.apply {
            screenBrightness = if (on) 1f else WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
        }
        if (on) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        job?.cancel()
        job = null
        val cm = activity.getSystemService(CameraManager::class.java) ?: return
        val torch = runCatching {
            cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
        }.getOrNull() ?: return
        if (!on) {
            runCatching { cm.setTorchMode(torch, false) }
            return
        }
        job = activity.lifecycleScope.launch {
            var lit = false
            try {
                while (true) {
                    lit = !lit
                    runCatching { cm.setTorchMode(torch, lit) }
                    delay(if (lit) 120 else 380)
                }
            } finally {
                runCatching { cm.setTorchMode(torch, false) }
            }
        }
    }
}
