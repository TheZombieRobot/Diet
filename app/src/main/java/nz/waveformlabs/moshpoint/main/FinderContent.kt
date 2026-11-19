package nz.waveformlabs.moshpoint.main

import androidx.compose.runtime.Composable
import androidx.compose.runtime.NonRestartableComposable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.BeaconColour
import nz.waveformlabs.moshpoint.core.HereRule
import nz.waveformlabs.moshpoint.core.LatLon
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.debug.FieldRecorder
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.gigs.NightStats
import nz.waveformlabs.moshpoint.locate.FinderPlace
import nz.waveformlabs.moshpoint.map.HerePins
import nz.waveformlabs.moshpoint.privatemsg.PrivateMessages
import nz.waveformlabs.moshpoint.profile.Identity
import nz.waveformlabs.moshpoint.ui.beaconColourName
import nz.waveformlabs.moshpoint.ui.finder.DebugPanel
import nz.waveformlabs.moshpoint.ui.finder.FinderScreen
import nz.waveformlabs.moshpoint.ui.finder.PlaceFinderScreen
import nz.waveformlabs.moshpoint.ui.map.PinNote
import nz.waveformlabs.moshpoint.venue.Floors

/** The finder screen, wired to the finder engine. @NonRestartableComposable: see [MainScreen]. */
@Composable
@NonRestartableComposable
internal fun FinderContent(a: MainActivity) {
    // A place instead of mates (a spot a mate texted): its own screen, GPS and compass only.
    val place = a.finder.place
    if (place != null) {
        PlaceContent(a, place)
        return
    }
    val engine = a.finder.engine
    val arrows by engine.arrows.collectAsState()
    val scan by engine.scan.collectAsState()
    val tracking by engine.tracking.collectAsState()
    val beaconing by engine.beaconing.collectAsState()
    val names = tracking.mapNotNull { FriendsRepository.byId(it)?.name }
    val group = GroupSync.group.value
    val batteryIssue = stringResource(R.string.main_setup_battery)
    // The screen stays on only while it helps: after a touch, a mate close by, never in a pocket.
    FinderScreenOn(a, arrows)
    FinderScreen(
        title = when {
            names.size == 1 -> names[0]
            group != null && tracking.size > 1 -> group.name
            else -> pluralStringResource(R.plurals.main_n_mates, names.size, names.size)
        },
        visible = a.home.visibleToMates,
        arrows = arrows,
        friendOf = FriendsRepository::byId,
        scan = scan,
        onScan = engine::startSpinScan,
        onCancelScan = engine::cancelSpinScan,
        onDismissScan = engine::dismissScanResult,
        onNudge = { a.finder.nudge(names) },
        onOpenMap = { a.map.openMap() },
        onAskLight = { engine.askLight() },
        // "Message Sam" for the one mate the finder is showing (docs/PRIVATE_MESSAGES.md).
        onMessage = if (GroupSync.group.value != null && !GroupSync.following) ({ id -> a.chat.messageMate(id) }) else null,
        canMessage = a.chat::canMessageMate,
        messageUnread = PrivateMessages.unreadByFriend(a),
        onFound = { NightStats.found(a) },
        beaconOn = a.finder.beaconOn,
        onBeacon = a.finder::setBeacon,
        beaconing = beaconing.mapNotNull { id ->
            FriendsRepository.byId(id)?.let { Txt.s(R.string.main_beacon_colour_name, beaconColourName(BeaconColour.forSecret(it.secret)), it.name) }
        },
        myBeacon = BeaconColour.forSecret(Identity.current(a)),
        onBack = {
            a.finder.setBeacon(false)
            a.finder.finding = false
            a.finder.stopEngineSoon()
        },
        warning = a.permissions.setupIssues.firstOrNull { it.text != batteryIssue },
        floors = Floors.tags,
        // Mates' "I'm here" pins: where the arrow points at one, its floor and how long ago (docs/IM_HERE.md).
        // Tapped one mate in the crew view: their UWB place comes first.
        onFocus = { id -> engine.focus(id) },
        pinned = HerePins.pins.mapValues { (id, h) ->
            PinNote(HereRule.ageSec(h, System.currentTimeMillis() / 1000), HerePins.floors[id])
        },
        debug = if (DebugStatus.enabled) {
            { mod ->
                val rows by engine.debugRows.collectAsState()
                val methods by engine.enabledMethods.collectAsState()
                val tech by DebugStatus.tech.collectAsState()
                val log by DebugStatus.log.collectAsState()
                val recording by FieldRecorder.recording.collectAsState()
                val recordedRows by FieldRecorder.rows.collectAsState()
                val sim by engine.simSettings.collectAsState()
                val simPin by engine.simPin.collectAsState()
                DebugPanel(
                    rows = rows,
                    friendOf = FriendsRepository::byId,
                    enabled = methods,
                    onToggle = engine::setMethodEnabled,
                    onSolo = engine::enableOnly,
                    tech = tech,
                    log = log,
                    onClearLog = DebugStatus::clearLog,
                    recording = recording,
                    recordedRows = recordedRows,
                    onRecord = { on -> if (on) FieldRecorder.start(a) else FieldRecorder.stop() },
                    onMark = FieldRecorder::mark,
                    onShare = a.finder::shareRecording,
                    sim = sim,
                    onSim = engine::setSim,
                    onSimRestart = engine::restartSims,
                    onSimPin = { m -> if (m == null) engine.unpinSims() else if (!engine.pinSimsAhead(m)) a.toast("No GPS fix yet: step outside for a moment") },
                    simPinned = simPin != null,
                    modifier = mod,
                )
            }
        } else {
            null
        },
    )
}

/**
 * The finder on a place (docs/SPOT_LINKS.md): the arrow from this phone's GPS and compass, with
 * no data or signal. Back lets the place go; "Show on map" shows it there.
 */
@Composable
private fun PlaceContent(a: MainActivity, place: FinderPlace) {
    val arrows by a.finder.placeArrows.collectAsState()
    val texted = stringResource(R.string.spot_link_texted)
    // Only "Location is off" matters here: no other radio finds a place.
    val locationOff = stringResource(R.string.main_setup_location_off)
    FinderScreenOn(a, arrows)
    PlaceFinderScreen(
        id = place.id,
        title = place.name,
        caption = texted.takeIf { it != place.name },
        visible = a.home.visibleToMates,
        arrows = arrows,
        onOpenMap = { a.map.openMapOn(LatLon(place.lat, place.lon)) },
        onBack = {
            a.finder.endPlace()
            a.finder.finding = false
        },
        warning = a.permissions.setupIssues.firstOrNull { it.text == locationOff },
    )
}
