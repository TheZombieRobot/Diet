package nz.waveformlabs.moshpoint.main

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.moderation.Blocks
import nz.waveformlabs.moshpoint.moderation.Moderation
import nz.waveformlabs.moshpoint.moderation.Person
import nz.waveformlabs.moshpoint.moments.Moments
import nz.waveformlabs.moshpoint.profile.PhotoStore
import nz.waveformlabs.moshpoint.ui.moments.StoryScreen

/**
 * Tonight's Story (rising from the bottom) and a past gig's.
 * @NonRestartableComposable: see [MainScreen].
 */
@Composable
@NonRestartableComposable
internal fun StoryOverlays(a: MainActivity) {
    // The Story rises up from the bottom, like a card stack.
    AnimatedVisibility(
        visible = a.story.showStory,
        enter = slideInVertically(tween(340)) { it / 4 } +
            fadeIn(tween(260)),
        exit = slideOutVertically(tween(240)) { it / 4 } +
            fadeOut(tween(200)),
    ) {
        StoryScreen(
            // Photos and clips from someone blocked on this phone are hidden (docs/REPORT_BLOCK.md).
            items = Blocks.visibleMoments(Moments.items),
            nowSec = a.home.homeNow / 1000,
            colourOf = { name -> FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.color },
            onShare = if (GroupSync.following) null else a.momentFlow::start,
            onMap = { a.story.showStory = false; a.map.openMap() },
            onBack = { a.story.showStory = false },
            following = GroupSync.following,
            photoOf = { name, mine ->
                if (mine) PhotoStore.photos[PhotoStore.ME]
                else FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.let { PhotoStore.photos[it.id] }
            },
            myName = a.home.myName,
            onRefresh = { GroupSync.group.value?.let { g -> Moments.refreshNow(a, g) } },
            onSaveOne = { m -> a.story.saveToPhone(listOf(m), GroupSync.group.value?.name ?: Txt.s(R.string.main_gig_fallback)) },
            onSaveAll = { a.story.saveToPhone(Blocks.visibleMoments(Moments.items).toList(), GroupSync.group.value?.name ?: Txt.s(R.string.main_gig_fallback)) },
            onBlock = { m -> Person.ofMoment(a, m)?.let { Moderation.confirmBlock.value = Moderation.Subject(it, Moderation.Moment(m)) } },
            onAddFromPhone = GroupSync.group.value?.let { g -> { a.story.startRoll(GigArchive.idFor(g), g.name) } },
            live = GroupSync.group.value != null && !GroupSync.sleeping,
        )
    }
    a.story.archiveGig?.let { g ->
        StoryScreen(
            items = Blocks.visibleMoments(a.story.archiveItems, g.id),
            nowSec = a.home.homeNow / 1000,
            colourOf = { name -> FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.color },
            onShare = null,
            onMap = { a.story.archiveGig = null; a.map.openMap() },
            onBack = { a.story.archiveGig = null },
            photoOf = { name, mine ->
                if (mine) PhotoStore.photos[PhotoStore.ME]
                else FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.let { PhotoStore.photos[it.id] }
            },
            myName = a.home.myName,
            live = false,
            title = g.name,
            onSaveOne = { m -> a.story.saveToPhone(listOf(m), g.name) },
            onSaveAll = { a.story.saveToPhone(a.story.archiveItems, g.name) },
            onAddFromPhone = { a.story.startRoll(g.id, g.name) },
            onDelete = {
                a.story.archiveGig = null
                a.lifecycleScope.launch {
                    GigArchive.delete(a, g.id)
                    a.toast(Txt.s(R.string.main_deleted_gig, g.name))
                }
            },
        )
    }
}
