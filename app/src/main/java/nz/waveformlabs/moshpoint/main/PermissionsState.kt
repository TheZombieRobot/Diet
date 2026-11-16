package nz.waveformlabs.moshpoint.main

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.core.PermissionAsks
import nz.waveformlabs.moshpoint.setup.SetupChecks
import nz.waveformlabs.moshpoint.ui.home.SetupIssue

/**
 * Permissions and the phone's own switches: what's still not allowed, what's switched off that
 * finding needs, and asking about battery saving. Owned by [MainActivity].
 */
internal class PermissionsState(private val a: MainActivity) {
    var askBattery by mutableStateOf(false)

    /** Phone switches that are off but needed (Bluetooth, Location, ...). Refreshed on resume and when they change. */
    var setupIssues by mutableStateOf<List<SetupIssue>>(emptyList())

    fun refreshSetupIssues() {
        // Not before onCreate has made the finder engine (a cold start from a shared invite once
        // got here first and crashed); onResume refreshes them anyway.
        if (!a.finder.engineReady) return
        setupIssues = SetupChecks.issues(a, a.finder.engine.capabilities.wifiAware, a.home.visibleToMates) { askBattery = true }
    }

    val radioReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) = refreshSetupIssues()
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
            if (a.finder.engineReady && a.finder.engine.capabilities.uwb && denied(Manifest.permission.UWB_RANGING)) out += a.getString(R.string.main_perm_uwb)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && denied(Manifest.permission.POST_NOTIFICATIONS)) {
            out += a.getString(R.string.main_perm_notifications)
        }
        return out
    }

    // ---- Asking: Play's prominent disclosure first, never nagging (docs/WAVE2_PLAY.md, item 8) ----

    private val asks by lazy { a.getSharedPreferences("permission_asks", Context.MODE_PRIVATE) }
    private fun denied(p: String) = a.checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED

    /** What the disclosure is about: location and nearby devices (Bluetooth). */
    private val disclosed = buildList {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            add(Manifest.permission.BLUETOOTH_SCAN)
            add(Manifest.permission.BLUETOOTH_ADVERTISE)
            add(Manifest.permission.BLUETOOTH_CONNECT)
        }
    }

    /** The location disclosure is showing (MainScreen draws it, over the welcome too). */
    var disclosure by mutableStateOf(false)

    /** Location or nearby devices (Bluetooth) not allowed yet: Android's prompt would ask for them. */
    fun needsDisclosure(): Boolean = disclosed.any(::denied)

    /** Will Android still show its prompt for any of [perms] that's missing (core PermissionAsks)? */
    private fun androidWillAsk(perms: List<String>): Boolean {
        val missing = perms.filter(::denied)
        return PermissionAsks.androidWillAsk(
            missing = missing.isNotEmpty(),
            askedBefore = asks.getBoolean(ASKED, false),
            rationale = missing.any { a.shouldShowRequestPermissionRationale(it) },
        )
    }

    /** Android's prompt, or the app's page in Settings once Android won't show it any more. */
    private fun promptOrSettings() {
        if (androidWillAsk(requested.toList())) {
            asks.edit().putBoolean(ASKED, true).apply()
            a.launchers.askPermissions.launch(requested)
        } else if (requested.any(::denied)) {
            a.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", a.packageName, null)))
        }
    }

    /**
     * Every ask the person starts (the welcome's Allow, Go live, the home's "allow" banner): while
     * location or nearby devices aren't allowed, the disclosure comes first, and Android's prompt
     * (or Settings) only after they tap Continue in it.
     */
    fun askWithDisclosure() {
        if (needsDisclosure()) disclosure = true else promptOrSettings()
    }

    /** The home's "allow" banner. */
    fun fixPermissions() = askWithDisclosure()

    /** The disclosure was answered: Continue goes on to Android's prompt; "Not now" is remembered. */
    fun onDisclosure(accepted: Boolean) {
        disclosure = false
        if (accepted) promptOrSettings() else asks.edit().putBoolean(NOT_NOW, true).apply()
    }

    /**
     * In onCreate. The first time, note whether the app has asked before (versions before this
     * one asked at every start once the welcome was done). Then, at a fresh start only (not after
     * a rotation), ask for what's missing unless that would nag: not after "Not now" to the
     * disclosure, and not when Android won't show its prompt any more (core PermissionAsks).
     */
    fun atLaunch(fresh: Boolean) {
        if (!asks.contains(ASKED)) asks.edit().putBoolean(ASKED, a.home.onboarded).apply()
        if (!fresh) return
        val ask = PermissionAsks.askAtLaunch(
            onboarded = a.home.onboarded,
            missing = requested.any(::denied),
            needsDisclosure = needsDisclosure(),
            saidNotNow = asks.getBoolean(NOT_NOW, false),
            androidWillAskDisclosed = androidWillAsk(disclosed),
        )
        if (ask) askWithDisclosure()
    }

    /** A disclosure on screen survives Android re-creating the activity (rotating a tablet). */
    fun save(out: Bundle) = out.putBoolean(SAVED_DISCLOSURE, disclosure)

    fun restore(saved: Bundle) {
        disclosure = saved.getBoolean(SAVED_DISCLOSURE, false) && needsDisclosure()
    }

    private companion object {
        const val ASKED = "asked"
        const val NOT_NOW = "disclosureNotNow"
        const val SAVED_DISCLOSURE = "disclosure"
    }
}
