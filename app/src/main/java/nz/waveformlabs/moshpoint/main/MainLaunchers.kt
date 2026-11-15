package nz.waveformlabs.moshpoint.main

import androidx.activity.result.contract.ActivityResultContracts
import com.journeyapps.barcodescanner.ScanContract
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.moments.MomentFlow

/**
 * Every activity result MainActivity asks for, in one place. Created while the activity is being
 * constructed (Android requires that), and registered in exactly this order, which never
 * changes: after Android has closed the app, a result comes back to the launcher registered in
 * the same position. [momentFlow] registers its own six (taking and picking moments) between
 * the selfie ones and the rest, where it always has.
 */
internal class MainLaunchers(a: MainActivity) {
    val pickPhoto = a.registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri -> a.camera.onPhotoPicked(uri) }

    // Selfie for your own photo: the camera app's quick preview (small, which is all we need).
    val takeSelfie = a.registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp -> a.camera.onSelfie(bmp) }
    val cameraForSelfie = a.registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) runCatching { takeSelfie.launch(null) }
    }

    // Crew moments (photos pinned where they were taken): see MomentFlow.
    val momentFlow = MomentFlow(
        activity = a,
        toast = a::toast,
        lastLocation = a::lastKnownLocation,
        openMap = a.map::openMap,
        findFriend = { id ->
            a.map.closeMap()
            a.finder.pendingStop?.cancel()
            a.finder.engine.track(setOf(id))
            a.finder.engine.start()
            a.finder.finding = true
        },
    )

    val mediaPerms = a.registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r -> a.story.onMediaPermissions(r) }

    val scanQr = a.registerForActivityResult(ScanContract()) { result ->
        val text = result.contents ?: return@registerForActivityResult
        // A gig group QR joins the group; a person's QR fills in "Add someone".
        a.invites.handleInvite(text, quietIfNone = true)
    }

    val askPermissions = a.registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        a.permissions.onAnswered()
    }
}
