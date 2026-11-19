package nz.waveformlabs.moshpoint.core

/**
 * Who has Moshpoint+: the rule behind the app's one check (`Entitlements.plus`, docs/WATCH.md
 * problem 9; ROADMAP.md, Moshpoint+).
 *
 * Until Play Billing is in ([BILLING] false) everyone has it, in test and store builds alike:
 * there's nothing to buy, so nothing is held back and nothing says "Unlock" (the owner's v1 scope,
 * 19 November 2026; docs/LAUNCH_PREP.md item 6). Keyed services aren't affected: the relay refuses
 * Discover to everyone until it can check membership (server EntitlementCheck).
 *
 * Billing plugs in here: set [BILLING] true, and record each purchase's answer ([plus]'s `stored`).
 */
object Membership {
    /** Moshpoint+ can be bought (Play Billing is in). */
    const val BILLING = false

    /**
     * Is this person a member? [stored] is what billing recorded (null: nothing yet; a test build's
     * debug panel can record a "no" to show the free screens). A store build without [billing]:
     * always yes, whatever is stored. Otherwise what's stored, else yes in test builds and no in
     * store builds.
     */
    fun plus(stored: Boolean?, testBuild: Boolean, billing: Boolean = BILLING): Boolean =
        if (!billing && !testBuild) true else stored ?: testBuild
}
