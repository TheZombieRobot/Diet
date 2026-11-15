package nz.waveformlabs.moshpoint.service

import android.content.Context
import nz.waveformlabs.moshpoint.core.LiveRules
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.safety.Notices

/**
 * Keeps Live honest (launch blocker 3; reliability P0-1, performance P0-1). Two facts used to
 * drift apart: "Live is on" ([VisibilityPrefs.isVisible]) and the service actually running
 * ([VisibilityService.isRunning]). After an update, a force-stop or a Samsung background kill
 * the app showed you live with nothing running; and nothing ever switched Live off after the
 * gig. Here:
 *
 *  - [reconcile] when the app comes to the front: Live on but not running → start it again;
 *    if it can't start, Live goes off in the app and you're told.
 *  - [restore] after a reboot (with "Stay live after a restart") or an update.
 *  - [couldNotStart] when Android refuses the service: off in the app with a notice when it's
 *    on screen; otherwise "You're no longer live" (tap to open), and it's tried again when the
 *    app is next opened.
 *  - [check] (the service, every minute, and whenever the main crew changes): switched off
 *    when the crew's night is over, or after about 12 hours (core [LiveRules]).
 */
object LiveControl {
    /** The main crew if it's on now: on the night, not asleep until a later date, not followed from home. Its id. */
    fun crewOnNow(nowMs: Long = System.currentTimeMillis()): String? {
        val g = GroupSync.group.value ?: return null
        if (GroupSync.following || g.dormant(nowMs) || nowMs >= g.expiresAtMs) return null
        return GigArchive.idFor(g)
    }

    /** Live was just switched on (by you, the tile, or being in a crew tonight): a new session. */
    fun started(c: Context) {
        val now = System.currentTimeMillis()
        VisibilityPrefs.setSession(c, LiveRules.start(crewOnNow(now), now))
        VisibilityPrefs.setCappedCrew(c, null)
    }

    /** Should Live go off now? Saves the session as the rules update it; null = carry on. */
    fun check(c: Context): LiveRules.Off? {
        val now = System.currentTimeMillis()
        val r = LiveRules.check(VisibilityPrefs.session(c), crewOnNow(now), now)
        VisibilityPrefs.setSession(c, r.session)
        return r.off
    }

    /**
     * Live goes off because of [off]. Not your choice, so the next crew still goes live by
     * itself. The night being over is quiet; after 12 hours you're asked "Still at the gig?".
     */
    fun switchOff(c: Context, off: LiveRules.Off) {
        DebugStatus.log("Live off by itself: $off")
        if (off == LiveRules.Off.TOO_LONG) VisibilityPrefs.setCappedCrew(c, VisibilityPrefs.session(c)?.crewId)
        VisibilityService.stopByApp(c)
        if (off == LiveRules.Off.TOO_LONG) Notices.show(c, Notices.Kind.LIVE_TOO_LONG)
    }

    /** The main crew changed (ended, left, expired): Live may have to go off now. */
    fun crewChanged(c: Context) {
        if (!VisibilityPrefs.isVisible(c)) return
        check(c)?.let { switchOff(c, it) }
    }

    /**
     * The app came to the front. Returns whether Live is on once that's settled: started again
     * if it should be on and isn't running; off (and said why) if it can't be or mustn't be.
     */
    fun reconcile(c: Context): Boolean {
        if (!VisibilityPrefs.isVisible(c)) return false
        check(c)?.let {
            switchOff(c, it)
            return false
        }
        if (!VisibilityService.isRunning && !VisibilityService.restore(c)) {
            VisibilityPrefs.markStopped(c)
            Notices.show(c, Notices.Kind.LIVE_CANT_START)
            return false
        }
        Notices.liveBack(c)
        return true
    }

    /** After a reboot or an update: Live comes back if it was on and still should be. */
    fun restore(c: Context) {
        val app = c.applicationContext
        if (!VisibilityPrefs.isVisible(app) || VisibilityService.isRunning) return
        // The rules need the crew; the live service loads it the same way.
        FriendsRepository.init(app)
        if (GroupSync.group.value == null) GroupSync.load(app)
        check(app)?.let {
            switchOff(app, it)
            return
        }
        if (!VisibilityService.restore(app)) couldNotStart(app)
    }

    /** Android didn't let the service start (Android 12+ background start limits, a permission taken away). */
    fun couldNotStart(c: Context) {
        DebugStatus.log("Live: Android refused the service")
        if (Notices.onScreen()) {
            // You're looking at the app: Live goes off there and you're told why.
            VisibilityPrefs.markStopped(c)
            Notices.show(c, Notices.Kind.LIVE_CANT_START)
        } else {
            // Still meant to be on: opening the app starts it again (see reconcile).
            Notices.show(c, Notices.Kind.LIVE_STOPPED)
        }
    }
}
