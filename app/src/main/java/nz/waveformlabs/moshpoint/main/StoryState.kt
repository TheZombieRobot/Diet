package nz.waveformlabs.moshpoint.main

import android.net.Uri
import android.os.Bundle
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
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

    // ---- "Add your photos from that night": the phone's own photo picker ----

    var rollGig by mutableStateOf<Pair<String, String>?>(null) // (gig id, name)
    var rollAdding by mutableStateOf(false)

    /**
     * Opens "Your photos from that night" for gig [id]: a short note, then Android's photo picker.
     * The picker hands back only what the person picks, so the app needs no photo permission
     * (Play's Photo and Video Permissions policy; docs/WAVE2_PLAY.md, item 2).
     */
    fun startRoll(id: String, name: String) {
        rollGig = id to name
        rollAdding = false
    }

    /** "Choose photos": Android's photo picker, photos and videos. */
    fun chooseFromPhone() {
        runCatching {
            a.launchers.pickRoll.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo))
        }
    }

    /** What the picker gave back (nothing if the person backed out): copied into the gig, originals kept. */
    fun onPicked(uris: List<Uri>) {
        val (id, _) = rollGig ?: return
        if (uris.isEmpty() || rollAdding) return
        rollAdding = true
        a.lifecycleScope.launch {
            val picked = GigArchive.describePicked(a, id, uris)
            val n = GigArchive.addFromPhone(a, id, picked, a.home.myName.ifBlank { Txt.s(R.string.main_you) })
            rollAdding = false
            rollGig = null
            a.toast(Txt.p(R.plurals.main_added_to_gig, n))
            // Show them straight away on whichever board is open.
            if (GroupSync.group.value?.let(GigArchive::idFor) == id) Moments.loadCurrent(a)
            archiveGig?.takeIf { it.id == id }?.let { archiveItems = GigArchive.load(a, id) }
        }
    }

    /** Keeps which gig the picker is for if Android closes the app while it's open. */
    fun save(out: Bundle) {
        rollGig?.let { (id, name) -> out.putStringArray(SAVED_ROLL, arrayOf(id, name)) }
    }

    fun restore(saved: Bundle?) {
        saved?.getStringArray(SAVED_ROLL)?.takeIf { it.size == 2 }?.let { rollGig = it[0] to it[1] }
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

    private companion object {
        const val SAVED_ROLL = "rollGig"
    }
}
