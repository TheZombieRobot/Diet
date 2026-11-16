package nz.waveformlabs.moshpoint.service

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import nz.waveformlabs.moshpoint.R

/**
 * Quick Settings tile: one tap to go visible as you walk into the gig, without opening
 * the app. Only ever changes visibility when the user taps it. It shows whether Live is really
 * running ([VisibilityService.isRunning]), not just meant to be on: after an update or a
 * background kill it used to say Live with nothing running.
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
        val on = !VisibilityService.isRunning
        if (!on) {
            VisibilityService.stop(this)
        } else if (!canAdvertise() || !VisibilityService.start(this)) {
            // Permissions are asked for in the app, and Android may not let a tile start Live:
            // open the app rather than fail silently (it never crashes here).
            openApp()
        }
        refresh()
    }

    @android.annotation.SuppressLint("StartActivityAndCollapseDeprecated")
    private fun openApp() {
        val intent = packageManager.getLaunchIntentForPackage(packageName) ?: return
        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startActivityAndCollapse(
                    android.app.PendingIntent.getActivity(this, 0, intent, android.app.PendingIntent.FLAG_IMMUTABLE),
                )
            } else {
                @Suppress("DEPRECATION")
                startActivityAndCollapse(intent)
            }
        }
    }

    private fun canAdvertise() = Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
        checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) == PackageManager.PERMISSION_GRANTED

    private fun refresh() {
        val tile = qsTile ?: return
        val on = VisibilityService.isRunning
        tile.state = if (on) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) tile.subtitle = getString(if (on) R.string.crew_tile_live else R.string.crew_tile_hidden)
        tile.updateTile()
    }

    companion object {
        /** Live started or stopped: ask the system to redraw the tile (it calls onStartListening). */
        fun refreshAll(c: Context) {
            runCatching { TileService.requestListeningState(c.applicationContext, ComponentName(c.applicationContext, VisibilityTile::class.java)) }
        }
    }
}
