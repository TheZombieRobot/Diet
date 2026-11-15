package nz.waveformlabs.moshpoint.main

import android.Manifest
import android.content.pm.PackageManager
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.profile.AvatarSync
import nz.waveformlabs.moshpoint.profile.PhotoStore

/**
 * Photos of people: picking a photo for a mate or yourself, and a selfie. (Crew moments are
 * [nz.waveformlabs.moshpoint.moments.MomentFlow], registered in [MainLaunchers].) Owned by [MainActivity].
 */
internal class CameraState(private val a: MainActivity) {
    /** Whose photo the picker is choosing (kept across Android closing the app while it's open). */
    var photoFor: String? = null

    /** The photo picker answered. */
    fun onPhotoPicked(uri: android.net.Uri?) {
        val id = photoFor
        if (uri != null && id != null) {
            a.lifecycleScope.launch {
                if (!PhotoStore.set(a, id, uri)) {
                    DebugStatus.log("Couldn't read that photo")
                } else if (id == PhotoStore.ME) {
                    AvatarSync.publishMine(a, force = true)
                }
            }
        }
    }

    /** The camera's quick selfie preview came back (or not). */
    fun onSelfie(bmp: android.graphics.Bitmap?) {
        if (bmp != null) {
            a.lifecycleScope.launch {
                if (PhotoStore.set(PhotoStore.ME, bmp)) AvatarSync.publishMine(a, force = true)
            }
        }
    }

    fun selfie() {
        if (a.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            runCatching { a.launchers.takeSelfie.launch(null) }
        } else {
            a.launchers.cameraForSelfie.launch(Manifest.permission.CAMERA)
        }
    }
}
