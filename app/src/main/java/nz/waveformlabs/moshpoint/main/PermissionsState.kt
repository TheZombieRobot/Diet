package nz.waveformlabs.moshpoint.main

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.setup.SetupChecks
import nz.waveformlabs.moshpoint.ui.SetupIssue

/**
 * Permissions and the phone's own switches: what's still not allowed, what's switched off that
 * finding needs, and asking about battery saving. Owned by [MainActivity].
 */
internal class PermissionsState(private val a: MainActivity) {
    var askBattery by mutableStateOf(false)

    /** Phone switches that are off but needed (Bluetooth, Location, ...). Refreshed on resume and when they change. */
    var setupIssues by mutableStateOf<List<SetupIssue>>(emptyList())

    fun refreshSetupIssues() {
        setupIssues = SetupChecks.issues(a, a.finder.engine.capabilities.wifiAware, a.home.visibleToMates) { askBattery = true }
    }

    val radioReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: android.content.Context, i: Intent) = refreshSetupIssues()
    }
    var missing by mutableStateOf<List<String>>(emptyList())

    /** Everything the app asks for, in one prompt. */
    val requested = buildList {
        // Android 12+ ignores a fine-location request unless coarse is asked for too.
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            add(Manifest.permission.BLUETOOTH_SCAN)
            add(Manifest.permission.BLUETOOTH_ADVERTISE)
            add(Manifest.permission.BLUETOOTH_CONNECT)
            add(Manifest.permission.UWB_RANGING)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
            add(Manifest.permission.NEARBY_WIFI_DEVICES)
        }
    }.toTypedArray()

    /** The permission prompt was answered. */
    fun onAnswered() {
        missing = missingPermissions()
        refreshSetupIssues()
    }

    /** Plain-English reasons for whatever's still not allowed. */
    fun missingPermissions(): List<String> {
        fun denied(p: String) = a.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED
        val out = mutableListOf<String>()
        if (denied(Manifest.permission.ACCESS_FINE_LOCATION)) out += a.getString(R.string.main_perm_location)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (denied(Manifest.permission.BLUETOOTH_SCAN) || denied(Manifest.permission.BLUETOOTH_ADVERTISE)) {
                out += a.getString(R.string.main_perm_nearby)
            }
            if (a.finder.engine.capabilities.uwb && denied(Manifest.permission.UWB_RANGING)) out += a.getString(R.string.main_perm_uwb)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && denied(Manifest.permission.POST_NOTIFICATIONS)) {
            out += a.getString(R.string.main_perm_notifications)
        }
        return out
    }

    fun fixPermissions() {
        // After a second "deny", Android stops showing the prompt, so go to app settings.
        val canAsk = requested.any { a.shouldShowRequestPermissionRationale(it) }
        if (canAsk || missing.isEmpty()) {
            a.launchers.askPermissions.launch(requested)
        } else {
            a.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", a.packageName, null)))
        }
    }
}
