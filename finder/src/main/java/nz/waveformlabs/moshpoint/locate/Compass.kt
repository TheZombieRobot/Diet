package nz.waveformlabs.moshpoint.locate

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.hardware.display.DisplayManager
import android.view.Display
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import nz.waveformlabs.moshpoint.core.CompassHeading

/**
 * Which way the top of the screen is pointing, degrees clockwise from magnetic north.
 *
 * Uses the fused rotation-vector sensor. The app asks for portrait, but Android 16 ignores that
 * on screens 600 dp and wider, so the screen's rotation is read with every reading and core
 * CompassHeading uses whichever edge of the phone is at the top of the screen.
 * TODO: add magnetic declination (GeomagneticField) once we have a GPS fix, so GPS
 *  bearings (true north) and compass headings line up exactly.
 */
class Compass(context: Context) {
    private val sensors = context.getSystemService(SensorManager::class.java)
    // The display, not the context's: works with the application context too.
    private val display = runCatching {
        context.getSystemService(DisplayManager::class.java)?.getDisplay(Display.DEFAULT_DISPLAY)
    }.getOrNull()

    fun headings(): Flow<Double> = callbackFlow {
        val sensor = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        if (sensor == null) {
            close()
            return@callbackFlow
        }
        val rot = FloatArray(9)
        val listener = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) {
                SensorManager.getRotationMatrixFromVector(rot, e.values)
                // Which way the person holding the phone is facing, flat or upright (core
                // CompassHeading). Pointing straight up/down: no heading.
                val turned = runCatching { display?.rotation ?: 0 }.getOrDefault(0)
                val deg = CompassHeading.fromRotation(rot, turned) ?: return
                trySend(deg)
            }
            override fun onAccuracyChanged(s: Sensor?, accuracy: Int) = Unit
        }
        sensors.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME)
        awaitClose { sensors.unregisterListener(listener) }
    }
}
