package nz.waveformlabs.moshpoint.ui.home

import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.map.LocationBook
import nz.waveformlabs.moshpoint.moments.Moments
import nz.waveformlabs.moshpoint.venue.VenueMaps

// What the home screen ([FriendsScreen]) shows and what it can do, grouped. Plain classes, not
// data classes: a new one each time the home is drawn counts as changed (as the separate
// parameters did), so the home redraws exactly when it used to. Defaults are the old ones.

/** You and this phone: your name and switches, and what still needs allowing or switching on. */
class HomeMe(
    val myName: String,
    val visible: Boolean,
    val alwaysOn: Boolean,
    val phoneSummary: String,
    val missingPermissions: List<String>,
    val setupIssues: List<SetupIssue> = emptyList(),
    val ghost: Boolean = false,
)

/** Tonight's crew and your friends: who's in, where they are, and what the crew has sent. */
class HomeCrew(
    val friends: List<Friend>,
    val groupName: String?,
    /** False in a crew with an owner that isn't us: only the owner removes people from it. */
    val canRemoveCrewMates: Boolean = true,
    /** Keys of everyone in tonight's crew, including people already on the friends list. */
    val crewKeys: Set<String> = emptySet(),
    /** Unread private messages per friend id, shown on their face. */
    val privateUnread: Map<String, Int> = emptyMap(),
    /** The crew's meet-up pin, if someone dropped one ("Sound desk"). */
    val meetUp: String? = null,
    /** Last shared spot per friend (live or last seen, under each face). */
    val seen: Map<String, LocationBook.Seen> = emptyMap(),
    val nowSec: Long = 0L,
    val pings: List<GigGroup.Ping> = emptyList(),
    val moments: List<Moments.Item> = emptyList(),
    /** "2:15 am" while we're checking in, else null. */
    val checkInBy: String? = null,
    /** Metres to each crew member, worked out in the background. */
    val distances: Map<String, Double> = emptyMap(),
    /** The crew QR's contents, shown right on the home while no one has joined. */
    val crewQrPayload: String? = null,
    /** We follow this crew from home (watch only). */
    val following: Boolean = false,
    /** "at the venue" etc. per crew member, shown to followers. */
    val tileNotes: Map<String, String> = emptyMap(),
    /** Names of people following this crew from home. */
    val followers: List<String> = emptyList(),
    /** "Sat 14 Dec, 8:00 pm · Spark Arena" for a planned gig's crew, else null. */
    val crewWhen: String? = null,
    /** The crew is for a later day and is asleep (nothing running) until then. */
    val crewSleeping: Boolean = false,
    val chatUnread: Int = 0,
    /** The crew's pinned plan, shown on the home. */
    val pinnedPlan: String? = null,
    /** "🔥 Bar time 🍺" under a mate's face while their flare is up. */
    val flareNotes: Map<String, String> = emptyMap(),
    /** The line about the venue's offline map (see VenueMaps); null = no line. */
    val venueMap: VenueMaps.Status? = null,
)

/** Other nights: crews coming up, and gigs kept on this phone. */
class HomeGigs(
    /** Other crews you're in, soonest first. */
    val upNext: List<UpNextCard> = emptyList(),
    /** Past gigs kept on this phone. */
    val pastGigs: List<GigArchive.Summary> = emptyList(),
    /** Tonight's gig (it's the crew, not a past gig). */
    val currentGigId: String? = null,
)

/** What you can change about yourself and this phone. */
class HomeMeActions(
    val onMyName: (String) -> Unit,
    val onFixPermissions: () -> Unit,
    val onVisible: (Boolean) -> Unit,
    val onAlwaysOn: (Boolean) -> Unit,
    val onSelfie: () -> Unit = {},
    val onPickMyPhoto: () -> Unit = {},
    val onRemoveMyPhoto: () -> Unit = {},
    /** Null when the build has no Meta app configured. */
    val onFacebook: (() -> Unit)? = null,
    /** Debug builds only; null in release. */
    val onAddSimulated: (() -> Unit)? = null,
)

/** What you can do with tonight's crew and your friends. */
class HomeCrewActions(
    val onFind: (Set<String>) -> Unit,
    val onRemove: (String) -> Unit,
    val onSetPhoto: (String) -> Unit,
    val onRemovePhoto: (String) -> Unit,
    val onClearGigGroup: () -> Unit,
    val onKeepFriend: (String) -> Unit = {},
    /** "Message Sam": open a private thread with this crew mate (docs/PRIVATE_MESSAGES.md). Null = not offered (following from home). */
    val onMessage: ((String) -> Unit)? = null,
    /** Can a private message reach this mate yet (their phone has checked in tonight; never a simulated mate)? Only then is "Message …" offered. */
    val canMessage: (String) -> Boolean = { true },
    /** Snap Map style view of where everyone is. */
    val onOpenMap: () -> Unit = {},
    val onPing: (Int) -> Unit = {},
    val describePing: (Int) -> String = { Txt.s(R.string.home_ping_default) },
    val onShareMoment: () -> Unit = {},
    val onOpenMoment: (Moments.Item) -> Unit = {},
    val onCheckIn: (Int) -> Unit = {},
    val onHomeSafe: () -> Unit = {},
    /** The night's photos and clips as Polaroids. */
    val onOpenStory: () -> Unit = {},
    /** Share the follow-along invite with family. */
    val onLetFamilyFollow: () -> Unit = {},
    /** Opens the crew chat (pinned plan, messages, flares). */
    val onOpenChat: (() -> Unit)? = null,
    /** "Reset the invite" in the crew menu: a new crew key, so a leaked QR stops working. Null = not offered (only the owner resets an owned crew). */
    val onResetInvite: (() -> Unit)? = null,
    /** "Block Sam" in a crew mate's options (docs/REPORT_BLOCK.md): asks first. Null = not offered (no crew). */
    val onBlock: ((String) -> Unit)? = null,
    /** Is this crew mate blocked on this phone? Then "Unblock Sam" is offered instead. */
    val isBlocked: (String) -> Boolean = { false },
    val onUnblock: (String) -> Unit = {},
)

/** Starting, planning and joining crews, and adding people. */
class HomeInviteActions(
    val onShareCode: () -> Unit,
    val onShowQr: () -> Unit,
    val onScanQr: () -> Unit,
    val onScannedUsed: () -> Unit,
    /** Returns an error message to show, or null if added. */
    val onAdd: (name: String, code: String, gigGroup: Boolean) -> String?,
    val onStartGroup: (String) -> Unit,
    val onShowGroupQr: () -> Unit,
    val onPasteInvite: () -> Unit = {},
    val onShareApp: () -> Unit = {},
    /** "Show crew QR" from the Add sheet: starts a crew first if needed. */
    val onShowCrewQr: (() -> Unit)? = null,
    /** "Start a crew for tonight": start a crew named after you, no questions. Null = ask for a name. */
    val onQuickCrew: (() -> Unit)? = null,
    /** Bump phones together to share / receive a crew invite. */
    val onBump: () -> Unit = {},
    /** "Plan a gig": find it (or type it in) and start its crew ahead of time. */
    val onPlanGig: () -> Unit = {},
)

/** Opening another night: a past gig, or a crew coming up. */
class HomeGigActions(
    val onOpenGig: (GigArchive.Summary) -> Unit = {},
    val onOpenUpNext: (String) -> Unit = {},
)
