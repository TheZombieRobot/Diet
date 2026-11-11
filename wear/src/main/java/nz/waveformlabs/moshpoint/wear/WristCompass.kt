package nz.waveformlabs.moshpoint.wear

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.display.DisplayManager
import android.view.Display
import nz.waveformlabs.moshpoint.core.watch.WristPose

/**
 * The watch's compass and tilt, 25 times a second, from the fused rotation-vector sensor
 * (docs/WATCH.md, problems 1 and 2). One sensor gives both, and being gyro-steadied it holds
 * up in a jumping crowd far better than the raw accelerometer.
 *
 * Only runs while the arrow can be seen: [start] on wrist-up, [stop] on wrist-down.
 */
class WristCompass(context: Context, private val onPose: (pose: WristPose, rough: Boolean) -> Unit) : SensorEventListener {
    private val sensors = context.getSystemService(SensorManager::class.java)
    private val display = context.getSystemService(DisplayManager::class.java)?.getDisplay(Display.DEFAULT_DISPLAY)

    // A rotation vector with no magnetometer behind it has no idea where north is.
    private val sensor: Sensor? = sensors?.takeIf { it.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD) != null }?.let {
        it.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) ?: it.getDefaultSensor(Sensor.TYPE_GEOMAGNETIC_ROTATION_VECTOR)
    }

    /** False on a watch with no compass: distance and buzzes only. */
    val available: Boolean get() = sensor != null

    private val matrix = FloatArray(9)
    private var accuracy = SensorManager.SENSOR_STATUS_ACCURACY_HIGH
    private var running = false

    fun start() {
        val s = sensor ?: return
        if (running) return
        running = sensors?.registerListener(this, s, SAMPLE_US) == true
    }

    fun stop() {
        if (!running) return
        sensors?.unregisterListener(this)
        running = false
    }

    override fun onSensorChanged(e: SensorEvent) {
        // Some watches append an accuracy estimate (radians); the matrix maths wants only x, y, z, w.
        val v = if (e.values.size > 4) e.values.copyOf(4) else e.values
        runCatching { SensorManager.getRotationMatrixFromVector(matrix, v) }.onFailure { return }
        val headingErrorRad = if (e.values.size > 4) e.values[4] else -1f
        val rough = accuracy <= SensorManager.SENSOR_STATUS_ACCURACY_LOW || headingErrorRad > ROUGH_ABOVE_RAD
        // A watch worn the other way round draws upside down; its sensors don't turn with it.
        onPose(WristPose.fromRotationMatrix(matrix, display?.rotation ?: 0), rough)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        this.accuracy = accuracy
    }

    private companion object {
        /** 25 a second: smooth to the eye, half the phone's rate (the watch battery is a tenth the size). */
        const val SAMPLE_US = 40_000

        /** About 35 degrees of doubt: time for a figure-8. */
        const val ROUGH_ABOVE_RAD = 0.6f
    }
}
