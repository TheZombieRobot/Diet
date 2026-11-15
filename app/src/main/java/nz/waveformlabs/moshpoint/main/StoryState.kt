package nz.waveformlabs.moshpoint.main

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.moments.Moments

/**
 * The Story: tonight's, a past gig's, saving photos to the phone, and "Add your photos from that
 * night" from the camera roll. Owned by [MainActivity].
 */
internal class StoryState(private val a: MainActivity) {
    var showStory by mutableStateOf(false)
    /** A past gig open in the Story viewer. */
    var archiveGig by mutableStateOf<GigArchive.Summary?>(null)
    var archiveItems by mutableStateOf<List<Moments.Item>>(emptyList())

    // ---- "Add your photos from that night" (camera roll) ----

    var rollGig by mutableStateOf<Pair<String, String>?>(null) // (gig id, name)
    var rollFound by mutableStateOf<List<GigArchive.Found>?>(null)
    var rollAdding by mutableStateOf(false)

    /** The answer to asking for the phone's photos. */
    fun onMediaPermissions(r: Map<String, Boolean>) {
        if (r.values.any { it }) findOnPhone() else {
            rollGig = null
            a.toast(Txt.s(R.string.main_photos_permission_needed))
        }
    }

    fun startRoll(id: String, name: String) {
        rollGig = id to name
        rollFound = null
        val perms = if (Build.VERSION.SDK_INT >= 33) {
            listOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO) +
                (if (Build.VERSION.SDK_INT >= 34) listOf(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) else emptyList())
        } else {
            listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        if (perms.any { a.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) findOnPhone() else a.launchers.mediaPerms.launch(perms.toTypedArray())
    }

    private fun findOnPhone() {
        val (id, _) = rollGig ?: return
        a.lifecycleScope.launch { rollFound = GigArchive.findOnPhone(a, id) }
    }

    fun addFromPhone(picked: List<GigArchive.Found>) {
        val (id, _) = rollGig ?: return
        rollAdding = true
        a.lifecycleScope.launch {
            val n = GigArchive.addFromPhone(a, id, picked, a.home.myName.ifBlank { Txt.s(R.string.main_you) })
            rollAdding = false
            rollGig = null
            a.toast(Txt.p(R.plurals.main_added_to_gig, n))
            // Show them straight away on whichever board is open.
            if (GroupSync.group.value?.let(GigArchive::idFor) == id) Moments.loadCurrent(a)
            archiveGig?.takeIf { it.id == id }?.let { archiveItems = GigArchive.load(a, id) }
        }
    }

    /** Copy photos/clips into the phone's gallery, album "Moshpoint / <gig>". */
    fun saveToPhone(items: List<Moments.Item>, album: String) {
        if (items.isEmpty()) return
        a.lifecycleScope.launch {
            a.toast(if (items.size == 1) Txt.s(R.string.main_saving_one) else Txt.p(R.plurals.main_saving_many, items.size))
            val n = GigArchive.saveAllToPhone(a, items, album)
            a.toast(
                when {
                    n == 0 -> Txt.s(R.string.main_save_failed)
                    n == items.size -> Txt.s(R.string.main_saved_all, album)
                    else -> Txt.p(R.plurals.main_saved_some, items.size, n, items.size)
                },
            )
        }
    }
}
