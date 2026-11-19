package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class MembershipTest {
    @Test fun everyoneHasMoshpointPlusUntilBillingExists() {
        // The first release has no payments (docs/LAUNCH_PREP.md item 6). Switching billing on is a
        // deliberate change: this test and the release checklist change with it.
        assertFalse(Membership.BILLING)
        assertTrue(Membership.plus(stored = null, testBuild = false), "a store build, nothing bought")
        assertTrue(Membership.plus(stored = false, testBuild = false), "a store build, whatever is stored")
        assertTrue(Membership.plus(stored = null, testBuild = true), "a test build")
    }

    @Test fun onceBillingExistsAPurchaseDecides() {
        assertFalse(Membership.plus(stored = null, testBuild = false, billing = true))
        assertTrue(Membership.plus(stored = true, testBuild = false, billing = true))
        assertFalse(Membership.plus(stored = false, testBuild = false, billing = true))
        // Test builds keep everything open unless their debug panel says otherwise.
        assertTrue(Membership.plus(stored = null, testBuild = true, billing = true))
        assertEquals(false, Membership.plus(stored = false, testBuild = true))
    }
}
