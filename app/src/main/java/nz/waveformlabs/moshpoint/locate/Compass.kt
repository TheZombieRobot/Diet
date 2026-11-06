package nz.waveformlabs.moshpoint.locate

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow

/**
 * Which way the top of the phone is pointing, degrees clockwise from magnetic north.
 *
 * Uses the fused rotation-vector sensor. The app is portrait-only, so no remapping needed.
 * TODO: add magnetic declination (GeomagneticField) once we have a GPS fix, so GPS
 *  bearings (true north) and compass headings line up exactly.
 */
class Compass(context: Context) {
    private val sensors = context.getSystemService(SensorManager::class.java)

    fun headings(): Flow<Double> = callbackFlow {
        val sensor = sensors.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)
        if (sensor == null) {
            close()
            return@callbackFlow
        }
        val rot = FloatArray(9)
        val orient = FloatArray(3)
        val listener = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) {
                SensorManager.getRotationMatrixFromVector(rot, e.values)
                SensorManager.getOrientation(rot, orient)
                val deg = Math.toDegrees(orient[0].toDouble())
                trySend((deg + 360) % 360)
            }
            override fun onAccuracyChanged(s: Sensor?, accuracy: Int) = Unit
        }
        sensors.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME)
        awaitClose { sensors.unregisterListener(listener) }
    }
}
