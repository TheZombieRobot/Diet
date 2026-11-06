package nz.waveformlabs.moshpoint.locate

import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager

/** What this phone can do. Exchanged with friends so both sides pick a method they share. */
data class Capabilities(
    val ble: Boolean,
    val uwb: Boolean,
    val wifiAware: Boolean,
    val compass: Boolean,
    val gps: Boolean,
) {
    companion object {
        fun detect(context: Context): Capabilities {
            val pm = context.packageManager
            val sensors = context.getSystemService(SensorManager::class.java)
            return Capabilities(
                ble = pm.hasSystemFeature(PackageManager.FEATURE_BLUETOOTH_LE),
                uwb = pm.hasSystemFeature("android.hardware.uwb"),
                wifiAware = pm.hasSystemFeature(PackageManager.FEATURE_WIFI_AWARE),
                compass = sensors?.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) != null,
                gps = pm.hasSystemFeature(PackageManager.FEATURE_LOCATION_GPS),
            )
        }
    }
}
