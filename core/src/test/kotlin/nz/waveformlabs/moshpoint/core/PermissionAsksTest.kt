package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PermissionAsksTest {
    @Test fun androidAsksUntilTwoDenials() {
        assertTrue(PermissionAsks.androidWillAsk(missing = true, askedBefore = false, rationale = false)) // never asked
        assertTrue(PermissionAsks.androidWillAsk(missing = true, askedBefore = true, rationale = true)) // denied once
        assertFalse(PermissionAsks.androidWillAsk(missing = true, askedBefore = true, rationale = false)) // denied for good
        assertFalse(PermissionAsks.androidWillAsk(missing = false, askedBefore = false, rationale = false))
    }

    private fun launch(
        onboarded: Boolean = true,
        missing: Boolean = true,
        needsDisclosure: Boolean = true,
        saidNotNow: Boolean = false,
        androidWillAsk: Boolean = true,
    ) = PermissionAsks.askAtLaunch(onboarded, missing, needsDisclosure, saidNotNow, androidWillAsk)

    @Test fun asksAtLaunchWhenLocationIsMissingAndAndroidWouldAsk() = assertTrue(launch())

    @Test fun neverAfterNotNow() = assertFalse(launch(saidNotNow = true))

    @Test fun neverWhenAndroidWontAskAnyMore() = assertFalse(launch(androidWillAsk = false))

    @Test fun notBeforeTheWelcomeIsDoneNorWithNothingMissing() {
        assertFalse(launch(onboarded = false))
        assertFalse(launch(missing = false))
    }

    @Test fun otherPermissionsNeedNoDisclosure() {
        // Location and Bluetooth allowed, notifications not: Android's prompt straight away, as
        // before ("Not now" was about the disclosure, which isn't shown for these).
        assertTrue(launch(needsDisclosure = false, saidNotNow = true, androidWillAsk = false))
    }
}
