package nz.waveformlabs.moshpoint

import android.app.Activity
import android.content.Intent
import android.os.PowerManager
import android.provider.Settings
import nz.waveformlabs.moshpoint.ui.SetupIssue

/**
 * Phone switches that are off but needed to find each other (Bluetooth, Location, Wi-Fi,
 * battery saving), each with a one-tap fix. The usual answer to "why can't we find each other?".
 */
object SetupChecks {
    fun issues(a: Activity, wifiAware: Boolean, live: Boolean, onFixBattery: () -> Unit): List<SetupIssue> {
        val out = mutableListOf<SetupIssue>()
        val bt = a.getSystemService(android.bluetooth.BluetoothManager::class.java)?.adapter
        if (bt != null && !bt.isEnabled) {
            out += SetupIssue(Txt.s(R.string.main_setup_bluetooth_off), Txt.s(R.string.main_setup_turn_on)) {
                runCatching { a.startActivity(Intent(android.bluetooth.BluetoothAdapter.ACTION_REQUEST_ENABLE)) }
                    .onFailure { runCatching { a.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) } }
            }
        }
        val loc = a.getSystemService(android.location.LocationManager::class.java)
        if (loc != null && !loc.isLocationEnabled) {
            out += SetupIssue(Txt.s(R.string.main_setup_location_off), Txt.s(R.string.main_setup_turn_on)) {
                runCatching { a.startActivity(Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS)) }
            }
        }
        if (wifiAware) {
            val wifi = a.applicationContext.getSystemService(android.net.wifi.WifiManager::class.java)
            if (wifi != null && !wifi.isWifiEnabled) {
                out += SetupIssue(Txt.s(R.string.main_setup_wifi_off), Txt.s(R.string.main_setup_turn_on)) {
                    runCatching { a.startActivity(Intent(Settings.Panel.ACTION_WIFI)) }
                }
            }
        }
        val power = a.getSystemService(PowerManager::class.java)
        if (live && power != null && !power.isIgnoringBatteryOptimizations(a.packageName)) {
            out += SetupIssue(Txt.s(R.string.main_setup_battery), Txt.s(R.string.main_setup_fix), onFixBattery)
        }
        return out
    }
}
