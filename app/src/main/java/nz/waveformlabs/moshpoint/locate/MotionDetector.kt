package nz.waveformlabs.moshpoint.locate

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import kotlin.math.sqrt

/**
 * "Is the person walking?" from the accelerometer: footsteps make the phone bounce, so the
 * spread of acceleration over the last second or so jumps up. No permission needed
 * (unlike the step counter). Used by walk-and-watch finding.
 */
class MotionDetector(context: Context) : SensorEventListener {
    private val sm = context.getSystemService(SensorManager::class.java)
    private val samples = ArrayDeque<Pair<Long, Double>>()

    @Volatile var moving = false
        private set

    fun start() {
        val s = sm?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
        sm.registerListener(this, s, SensorManager.SENSOR_DELAY_UI)
    }

    fun stop() {
        sm?.unregisterListener(this)
        samples.clear()
        moving = false
    }

    override fun onSensorChanged(e: SensorEvent) {
        val now = SystemClock.elapsedRealtime()
        val m = sqrt(e.values[0] * e.values[0] + e.values[1] * e.values[1] + e.values[2] * e.values[2].toDouble())
        samples.addLast(now to m)
        while (samples.isNotEmpty() && now - samples.first().first > 1_500) samples.removeFirst()
        if (samples.size < 10) return
        val mean = samples.sumOf { it.second } / samples.size
        val sd = sqrt(samples.sumOf { (it.second - mean) * (it.second - mean) } / samples.size)
        // Standing (even dancing on the spot gives bursts) vs a steady walking bounce.
        moving = sd > 0.9
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
}
