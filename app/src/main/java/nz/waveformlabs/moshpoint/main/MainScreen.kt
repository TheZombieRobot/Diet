package nz.waveformlabs.moshpoint.main

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
import androidx.compose.ui.Modifier
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.profile.FacebookLogin
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.MoshTheme
import nz.waveformlabs.moshpoint.ui.moments.CameraRollPicker
import nz.waveformlabs.moshpoint.ui.settings.LocationDisclosureDialog
import nz.waveformlabs.moshpoint.ui.settings.OnboardingScreen
import nz.waveformlabs.moshpoint.ui.settings.rememberOpenPrivacyPolicy

/**
 * Everything MainActivity shows, in drawing order (later = on top): the crew dialogs; then the
 * welcome, or the home / finder with the night's dialogs and the overlays over it (chat, private
 * messages, the Story, a past gig, the map, the camera).
 *
 * This and every piece it calls are @NonRestartableComposable: no recomposition scope of their
 * own and never skipped, so each recomposes exactly when, and together with, the code around
 * it, as when all of it was written inline in MainActivity's setContent.
 */
@Composable
@NonRestartableComposable
internal fun MainScreen(a: MainActivity) {
    MoshTheme(calm = a.home.calmMotion) {
        // Play's prominent disclosure, before Android asks for location: over the welcome too.
        if (a.permissions.disclosure) {
            LocationDisclosureDialog(onContinue = { a.permissions.onDisclosure(true) }, onNotNow = { a.permissions.onDisclosure(false) })
        }
        CrewDialogs(a)
        AppNotices(a)
        if (!a.home.onboarded) {
            Box(Modifier.fillMaxSize().background(Mosh.Ground).safeDrawingPadding()) {
                OnboardingScreen(
                    name = a.home.myName,
                    onName = {
                        a.home.myName = it
                        VisibilityPrefs.setMyName(a, it)
                    },
                    onAskPermissions = { a.permissions.askWithDisclosure() },
                    onPrivacy = rememberOpenPrivacyPolicy(),
                    onFacebook = if (FacebookLogin.available) a.home.facebook::login else null,
                    onDone = {
                        VisibilityPrefs.setOnboarded(a)
                        a.home.onboarded = true
                    },
                )
            }
            return@MoshTheme
        }
        Box(Modifier.fillMaxSize().background(Mosh.Ground).safeDrawingPadding()) {
            // Home <-> finder: a quick zoom-and-fade, like stepping into the crowd.
            AnimatedContent(
                targetState = a.finder.finding,
                transitionSpec = {
                    (fadeIn(tween(320)) +
                        scaleIn(tween(320), initialScale = if (targetState) 1.06f else 0.94f))
                        .togetherWith(fadeOut(tween(220)))
                },
                label = "screen",
            ) { showFinder ->
                if (showFinder) {
                    FinderContent(a)
                } else {
                    HomeContent(a)
                }
            }
            a.momentFlow.Dialogs()
            NightDialogs(a)
            ChatOverlays(a)
            StoryOverlays(a)
            MapOverlay(a)
            ModerationOverlays(a)
            a.momentFlow.CameraOverlay()
            a.story.rollGig?.let { (_, name) ->
                CameraRollPicker(name, a.story.rollAdding, onChoose = a.story::chooseFromPhone, onClose = { a.story.rollGig = null })
            }
        }
    }
}
