package nz.waveformlabs.moshpoint.locate

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import nz.waveformlabs.moshpoint.core.WalkingTest

/**
 * "Is the person walking?" from the accelerometer: footsteps make the phone bounce, so the
 * spread of acceleration over the last second or so jumps up (core [WalkingTest]). No
 * permission needed (unlike the step counter). Used by walk-and-watch finding.
 */
class MotionDetector(context: Context) : SensorEventListener {
    private val sm = context.getSystemService(SensorManager::class.java)
    private val walking = WalkingTest()

    @Volatile var moving = false
        private set

    fun start() {
        val s = sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
        sm.registerListener(this, s, SensorManager.SENSOR_DELAY_UI)
    }

    fun stop() {
        sm?.unregisterListener(this)
        walking.clear()
        moving = false
    }

    override fun onSensorChanged(e: SensorEvent) {
        // Standing (even dancing on the spot gives bursts) vs a steady walking bounce. Too few
        // readings yet: keep the last answer.
        walking.add(SystemClock.elapsedRealtime(), e.values[0], e.values[1], e.values[2])?.let { moving = it }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
