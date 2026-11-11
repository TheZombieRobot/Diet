package nz.waveformlabs.moshpoint.service

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import nz.waveformlabs.moshpoint.R

/**
 * Quick Settings tile: one tap to go visible as you walk into the gig, without opening
 * the app. Only ever changes visibility when the user taps it.
 */
class VisibilityTile : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        refresh()
    }

    // The deprecated Intent overload is only used below Android 14 (version-checked).
    @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")
    override fun onClick() {
        super.onClick()
        val on = !VisibilityPrefs.isVisible(this)
        if (on && !canAdvertise()) {
            // Permissions are asked for in the app; open it rather than fail silently.
            val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startActivityAndCollapse(
                    android.app.PendingIntent.getActivity(this, 0, intent, android.app.PendingIntent.FLAG_IMMUTABLE),
                )
            } else {
                @Suppress("DEPRECATION")
                startActivityAndCollapse(intent)
            }
            return
        }
        if (on) VisibilityService.start(this) else VisibilityService.stop(this)
        refresh()
    }

    private fun canAdvertise() = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) == PackageManager.PERMISSION_GRANTED

    private fun refresh() {
        val tile = qsTile ?: return
        val on = VisibilityPrefs.isVisible(this)
        tile.state = if (on) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = getString(if (on) R.string.crew_tile_live else R.string.crew_tile_hidden)
        tile.updateTile()
    }
}
