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
        val listener = object : SensorEventListener {
            override fun onSensorChanged(e: SensorEvent) {
                SensorManager.getRotationMatrixFromVector(rot, e.values)
                // Which way the person holding the phone is facing. SensorManager.getOrientation
                // only uses the top edge of the phone, which goes haywire once the phone is held
                // upright (looking at the screen, or against your chest): the arrow and the scan
                // then point anywhere. Instead add the top edge (right when the phone is flat)
                // to the back of the phone (right when it's upright) and take the horizontal part.
                // rot maps phone axes to world (east, north, up): column 1 = top, column 2 = screen.
                val east = rot[1] - rot[2]
                val north = rot[4] - rot[5]
                if (east * east + north * north < 1e-4f) return // pointing straight up/down: no heading
                val deg = Math.toDegrees(kotlin.math.atan2(east.toDouble(), north.toDouble()))
                trySend((deg + 360) % 360)
            }
            override fun onAccuracyChanged(s: Sensor?, accuracy: Int) = Unit
        }
        sensors.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_GAME)
        awaitClose { sensors.unregisterListener(listener) }
    }
}
