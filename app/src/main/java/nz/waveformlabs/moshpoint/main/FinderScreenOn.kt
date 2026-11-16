package nz.waveformlabs.moshpoint.main

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.FinderAwake

/**
 * Whether the open finder holds the screen on (core [FinderAwake], docs/WAVE2C_BATTERY.md): for
 * 90 s after the last touch, or while a mate being found is within 30 m, and never in a pocket
 * (the proximity sensor). Checked once a second, only while the activity is started; the sensor
 * is let go as soon as it stops. Leaving the finder lets the screen go, as before.
 */
@Composable
internal fun FinderScreenOn(a: MainActivity, arrows: List<ArrowState>) {
    val view = LocalView.current
    val nearest = rememberUpdatedState(FinderAwake.nearestM(arrows))
    LaunchedEffect(Unit) {
        a.finder.touched() // opening the finder (a tap, or a notification) counts as a touch
        try {
            a.repeatOnLifecycle(Lifecycle.State.STARTED) {
                val pocket = Pocket(a)
                pocket.start()
                try {
                    while (true) {
                        val on = FinderAwake.keepOn(SystemClock.elapsedRealtime(), a.finder.lastTouchMs, nearest.value, pocket.nearSinceMs)
                        if (view.keepScreenOn != on) view.keepScreenOn = on
                        delay(1_000)
                    }
                } finally {
                    pocket.stop()
                }
            }
        } finally {
            view.keepScreenOn = false
        }
    }
}

/** The proximity sensor as "in a pocket or not". A phone without one is never in a pocket. */
private class Pocket(c: Context) : SensorEventListener {
    private val sm = c.getSystemService(SensorManager::class.java)
    private val sensor = sm?.getDefaultSensor(Sensor.TYPE_PROXIMITY)

    /** Since when (elapsed real time) it has read "near"; null while it doesn't. */
    var nearSinceMs: Long? = null
        private set

    fun start() {
        if (sensor != null) runCatching { sm?.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL) }
    }

    fun stop() {
        runCatching { sm?.unregisterListener(this) }
        nearSinceMs = null
    }

    override fun onSensorChanged(e: SensorEvent) {
        val near = FinderAwake.isNear(e.values[0], e.sensor.maximumRange)
        nearSinceMs = if (near) nearSinceMs ?: SystemClock.elapsedRealtime() else null
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
