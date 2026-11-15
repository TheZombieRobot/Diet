package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.PhotoStore
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.GigGroup

/**
 * The home screen (docs/design/home-redesign, docs/HOME_REDESIGN.md). Who's here and how far
 * away, and Find everyone, come first; tonight's two everyday actions (crew chat, photos) are
 * quieter; once-a-night crew actions live in the crew menu (⋯). Below: Up next, memories, past
 * gigs and friends. A brand-new user sees one thing to do. Need help is always in the header.
 *
 * Tap a face to find that mate; long-press for their options (message, photo, keep, remove).
 */
@Composable
fun FriendsScreen(
    friends: List<Friend>,
    visible: Boolean,
    alwaysOn: Boolean,
    phoneSummary: String,
    myName: String,
    onMyName: (String) -> Unit,
    missingPermissions: List<String>,
    setupIssues: List<SetupIssue> = emptyList(),
    onFixPermissions: () -> Unit,
    onVisible: (Boolean) -> Unit,
    onAlwaysOn: (Boolean) -> Unit,
    onFind: (Set<String>) -> Unit,
    onShareCode: () -> Unit,
    onPasteInvite: () -> Unit = {},
    onShareApp: () -> Unit = {},
    onShowQr: () -> Unit,
    onScanQr: () -> Unit,
    /** Filled in after a QR scan so the user only has to confirm. */
    scanned: Pair<String, String>?,
    onScannedUsed: () -> Unit,
    /** Returns an error message to show, or null if added. */
    onAdd: (name: String, code: String, gigGroup: Boolean) -> String?,
    onRemove: (String) -> Unit,
    onSetPhoto: (String) -> Unit,
    onRemovePhoto: (String) -> Unit,
    onClearGigGroup: () -> Unit,
    groupName: String?,
    /** False in a crew with an owner that isn't us: only the owner removes people from it. */
    canRemoveCrewMates: Boolean = true,
    /** Keys of everyone in tonight's crew, including people already on the friends list. */
    crewKeys: Set<String> = emptySet(),
    onStartGroup: (String) -> Unit,
    onShowGroupQr: () -> Unit,
    onKeepFriend: (String) -> Unit = {},
    /** "Message Sam": open a private thread with this crew mate (docs/PRIVATE_MESSAGES.md). Null = not offered (following from home). */
    onMessage: ((String) -> Unit)? = null,
    /** Can a private message reach this mate yet (their phone has checked in tonight; never a simulated mate)? Only then is "Message …" offered. */
    canMessage: (String) -> Boolean = { true },
    /** Unread private messages per friend id, shown on their face. */
    privateUnread: Map<String, Int> = emptyMap(),
    /** Snap Map style view of where everyone is. */
    onOpenMap: () -> Unit = {},
    /** The crew's meet-up pin, if someone dropped one ("Sound desk"). */
    meetUp: String? = null,
    /** Last shared spot per friend (live or last seen, under each face). */
    seen: Map<String, nz.waveformlabs.moshpoint.LocationBook.Seen> = emptyMap(),
    nowSec: Long = 0L,
    pings: List<GigGroup.Ping> = emptyList(),
    onPing: (Int) -> Unit = {},
    describePing: (Int) -> String = { Txt.s(R.string.home_ping_default) },
    ghost: Boolean = false,
    /** "Show crew QR" from the Add sheet: starts a crew first if needed. */
    onShowCrewQr: (() -> Unit)? = null,
    moments: List<nz.waveformlabs.moshpoint.moments.Moments.Item> = emptyList(),
    onShareMoment: () -> Unit = {},
    onOpenMoment: (nz.waveformlabs.moshpoint.moments.Moments.Item) -> Unit = {},
    onCheckIn: (Int) -> Unit = {},
    /** "2:15 am" while we're checking in, else null. */
    checkInBy: String? = null,
    onHomeSafe: () -> Unit = {},
    /** Metres to each crew member, worked out in the background. */
    distances: Map<String, Double> = emptyMap(),
    /** The crew QR's contents, shown right on the home while no one has joined. */
    crewQrPayload: String? = null,
    /** "Start a crew for tonight": start a crew named after you, no questions. Null = ask for a name. */
    onQuickCrew: (() -> Unit)? = null,
    /** Bump phones together to share / receive a crew invite. */
    onBump: () -> Unit = {},
    /** "Plan a gig": find it (or type it in) and start its crew ahead of time. */
    onPlanGig: () -> Unit = {},
    /** The night's photos and clips as Polaroids. */
    onOpenStory: () -> Unit = {},
    /** We follow this crew from home (watch only). */
    following: Boolean = false,
    /** "at the venue" etc. per crew member, shown to followers. */
    tileNotes: Map<String, String> = emptyMap(),
    /** Names of people following this crew from home. */
    followers: List<String> = emptyList(),
    /** Share the follow-along invite with family. */
    onLetFamilyFollow: () -> Unit = {},
    /** Past gigs kept on this phone. */
    pastGigs: List<nz.waveformlabs.moshpoint.GigArchive.Summary> = emptyList(),
    /** Tonight's gig (it's the crew, not a past gig). */
    currentGigId: String? = null,
    onOpenGig: (nz.waveformlabs.moshpoint.GigArchive.Summary) -> Unit = {},
    /** "Sat 14 Dec, 8:00 pm · Spark Arena" for a planned gig's crew, else null. */
    crewWhen: String? = null,
    /** The crew is for a later day and is asleep (nothing running) until then. */
    crewSleeping: Boolean = false,
    /** Debug builds only; null in release. */
    onAddSimulated: (() -> Unit)? = null,
    onSelfie: () -> Unit = {},
    onPickMyPhoto: () -> Unit = {},
    onRemoveMyPhoto: () -> Unit = {},
    /** Null when the build has no Meta app configured. */
    onFacebook: (() -> Unit)? = null,
    /** Opens the crew chat (pinned plan, messages, flares). */
    onOpenChat: (() -> Unit)? = null,
    chatUnread: Int = 0,
    /** The crew's pinned plan, shown on the home. */
    pinnedPlan: String? = null,
    /** "🔥 Bar time 🍺" under a mate's face while their flare is up. */
    flareNotes: Map<String, String> = emptyMap(),
    /** Other crews you're in, soonest first. */
    upNext: List<UpNextCard> = emptyList(),
    onOpenUpNext: (String) -> Unit = {},
    /** The line about the venue's offline map (see VenueMaps); null = no line. */
    venueMap: nz.waveformlabs.moshpoint.venue.VenueMaps.Status? = null,
    /** "Reset the invite" in the crew menu: a new crew key, so a leaked QR stops working. Null = not offered (only the owner resets an owned crew). */
    onResetInvite: (() -> Unit)? = null,
) {
    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(scanned) {
        if (scanned != null) {
            code = scanned.first
            if (name.isBlank()) name = scanned.second
            error = null
            onScannedUsed()
        }
    }
    var confirmRemove by remember { mutableStateOf<Friend?>(null) }
    var manualCode by remember { mutableStateOf(false) }
    var options by remember { mutableStateOf<Friend?>(null) }
    var settingsOpen by remember { mutableStateOf(false) }
    var naming by remember { mutableStateOf(false) }
    var groupNameText by remember { mutableStateOf("") }
    var addOpen by remember { mutableStateOf(false) }
    var messageOpen by remember { mutableStateOf(false) }
    var menuOpen by remember { mutableStateOf(false) }
    var helpOpen by remember { mutableStateOf(false) }
    var friendsOpen by remember { mutableStateOf(false) }
    var gigsOpen by remember { mutableStateOf(false) }

    val gig = friends.filter { it.gigGroupOnly || it.key in crewKeys }
    val permanent = friends.filterNot { it.gigGroupOnly }
    val past = pastGigs.filter { it.id != currentGigId }
    val inCrew = groupName != null || gig.isNotEmpty()
    // A brand-new user: nothing to show but the one thing to do.
    val firstTime = !inCrew && permanent.isEmpty() && past.isEmpty() && upNext.isEmpty()
    // Need help offers the crew alert only when there's a crew on tonight with someone in it
    // to alert: a safety feature must never say "alerted" to nobody.
    val canAlertCrew = groupName != null && !following && !crewSleeping && (gig.isNotEmpty() || followers.isNotEmpty())
    val startCrew: () -> Unit = onQuickCrew ?: { naming = true }
    val crewName = groupName ?: stringResource(R.string.home_your_crew)
    val crewCount = pluralStringResource(R.plurals.home_crew_count, gig.size, gig.size)
    val liveCount = if (following || crewSleeping) 0 else gig.count { isLive(seen[it.id], nowSec) }
    val liveText = pluralStringResource(R.plurals.home_live_count, liveCount, liveCount)

    if (settingsOpen) {
        SettingsSheet(
            myName = myName, onMyName = onMyName,
            onSelfie = onSelfie, onPickMyPhoto = onPickMyPhoto, onRemoveMyPhoto = onRemoveMyPhoto, onFacebook = onFacebook,
            alwaysOn = alwaysOn, onAlwaysOn = onAlwaysOn,
            phoneSummary = phoneSummary,
            onClose = { settingsOpen = false },
        )
    }
    if (naming) {
        AlertDialog(
            onDismissRequest = { naming = false },
            title = { Text(stringResource(R.string.home_start_gig_group)) },
            text = {
                Column {
                    Text(stringResource(R.string.home_start_gig_group_text))
                    OutlinedTextField(groupNameText, { groupNameText = it }, singleLine = true)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    onStartGroup(groupNameText)
                    groupNameText = ""
                    naming = false
                }) { Text(stringResource(R.string.home_start)) }
            },
            dismissButton = { TextButton(onClick = { naming = false }) { Text(stringResource(R.string.home_cancel)) } },
        )
    }
    options?.let { f ->
        AlertDialog(
            onDismissRequest = { options = null },
            title = { Text(f.name) },
            text = {
                Column {
                    // First: write to them privately (crew mates only).
                    if (onMessage != null && (f.gigGroupOnly || f.key in crewKeys) && canMessage(f.id)) {
                        TextButton(onClick = { onMessage(f.id); options = null }) {
                            Text(stringResource(R.string.private_message_name, f.name))
                            privateUnread[f.id]?.let { n -> Spacer(Modifier.width(8.dp)); UnreadBadge(n) }
                        }
                    }
                    if (f.gigGroupOnly) {
                        TextButton(onClick = { onKeepFriend(f.id); options = null }) { Text(stringResource(R.string.home_keep_friend, f.name)) }
                    }
                    TextButton(onClick = { onSetPhoto(f.id); options = null }) { Text(stringResource(R.string.home_set_photo)) }
                    if (PhotoStore.photos.containsKey(f.id)) {
                        TextButton(onClick = { onRemovePhoto(f.id); options = null }) { Text(stringResource(R.string.home_remove_photo)) }
                    }
                    if (!f.gigGroupOnly || canRemoveCrewMates) {
                        TextButton(onClick = { confirmRemove = f; options = null }) { Text(stringResource(R.string.home_remove_name, f.name), color = Mosh.Alarm) }
                    } else {
                        Text(
                            stringResource(R.string.crew_only_owner_removes),
                            style = HomeType.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint),
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        )
                    }
                }
            },
            confirmButton = { TextButton(onClick = { options = null }) { Text(stringResource(R.string.home_close)) } },
        )
    }
    confirmRemove?.let { f ->
        AlertDialog(
            onDismissRequest = { confirmRemove = null },
            title = { Text(if (f.gigGroupOnly) stringResource(R.string.home_remove_from_crew_title, f.name) else stringResource(R.string.home_remove_friend_title, f.name)) },
            text = {
                Text(
                    if (f.gigGroupOnly) stringResource(R.string.home_remove_from_crew_text, f.name)
                    else stringResource(R.string.home_remove_friend_text),
                )
            },
            confirmButton = { TextButton(onClick = { onRemove(f.id); confirmRemove = null }) { Text(stringResource(R.string.home_remove)) } },
            dismissButton = { TextButton(onClick = { confirmRemove = null }) { Text(stringResource(R.string.home_cancel)) } },
        )
    }

    fun add(gigGroup: Boolean) {
        error = onAdd(name, code, gigGroup)
        if (error == null) {
            name = ""
            code = ""
        }
    }

    if (messageOpen) MessageSheet(onPing = { onPing(it) }, onCheckIn = { onCheckIn(it) }, onClose = { messageOpen = false })
    if (addOpen) {
        AddSheet(
            inCrew = groupName != null,
            onShowCrewQr = onShowCrewQr ?: onShowGroupQr,
            onScanQr = onScanQr,
            onShareApp = onShareApp,
            onPasteInvite = onPasteInvite,
            onShowMyQr = onShowQr,
            onEnterCode = { manualCode = true },
            onClose = { addOpen = false },
            onBump = onBump,
            onPlanGig = if (groupName == null) onPlanGig else null,
        )
    }
    if (manualCode || code.isNotBlank()) {
        AlertDialog(
            onDismissRequest = { manualCode = false; code = ""; name = "" },
            containerColor = Mosh.Deep,
            title = { Text(stringResource(R.string.home_add_with_code), style = HomeType.Heading) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text(stringResource(R.string.home_their_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(code, { code = it }, label = { Text(stringResource(R.string.home_their_code)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    error?.let { Text(it, style = HomeType.Body.copy(color = Mosh.Danger)) }
                }
            },
            confirmButton = { TextButton(onClick = { add(false); if (error == null) manualCode = false }) { Text(stringResource(R.string.home_add_friend), style = HomeType.Label.copy(color = Mosh.Cyan)) } },
            dismissButton = { TextButton(onClick = { add(true); if (error == null) manualCode = false }) { Text(stringResource(R.string.home_tonight_only), style = HomeType.Label) } },
        )
    }
    if (helpOpen) {
        // Nothing is sent from the home: the dialog asks first, as it always has.
        HelpDialog(onAlertCrew = if (canAlertCrew) ({ onPing(GigGroup.Ping.NEED_HELP) }) else null, onClose = { helpOpen = false })
    }
    if (menuOpen && inCrew) {
        MoshSheet(onClose = { menuOpen = false }) {
            CrewMenuContent(
                name = crewName,
                subtitle = listOfNotNull(
                    when {
                        following -> stringResource(R.string.home_following_from_home)
                        crewSleeping -> stringResource(R.string.home_menu_coming_up)
                        else -> stringResource(R.string.home_menu_tonight)
                    },
                    crewCount.takeIf { gig.isNotEmpty() },
                ).let { dotLine(it) },
                onInvite = if (following) null else ({ menuOpen = false; onShowGroupQr() }),
                onFamily = if (following) null else ({ menuOpen = false; onLetFamilyFollow() }),
                onReset = if (following || groupName == null) null else onResetInvite?.let { reset -> { menuOpen = false; reset() } },
                endTitle = when {
                    following -> stringResource(R.string.home_stop_following)
                    crewSleeping -> stringResource(R.string.home_cancel_crew)
                    else -> stringResource(R.string.home_end_night)
                },
                endSub = when {
                    following -> stringResource(R.string.home_menu_stop_sub)
                    crewSleeping -> stringResource(R.string.home_menu_cancel_sub)
                    else -> stringResource(R.string.home_menu_end_sub)
                },
                onEnd = { menuOpen = false; onClearGigGroup() },
            )
        }
    }
    if (friendsOpen) {
        MoshSheet(onClose = { friendsOpen = false }) {
            FriendsListContent(permanent, seen, nowSec, onFind = { friendsOpen = false; onFind(setOf(it)) }, onOptions = { options = it })
        }
    }
    if (gigsOpen) {
        MoshSheet(onClose = { gigsOpen = false }) {
            PastGigsContent(past) { g -> gigsOpen = false; onOpenGig(g) }
        }
    }

    // One calm card with the one thing to fix next (permission, then each switch), instead
    // of a wall of warnings. It disappears once everything's ready.
    val todo: Triple<String, String, () -> Unit>? = when {
        missingPermissions.isNotEmpty() -> Triple(
            // The name before the colon (full-width in CJK); not lower-cased (German nouns are capitalised).
            Txt.s(R.string.home_allow_permission, missingPermissions.first().substringBefore(':').substringBefore('：').trim()),
            Txt.s(R.string.home_allow), onFixPermissions,
        )
        setupIssues.isNotEmpty() -> setupIssues.first().let { Triple(it.text, it.button, it.onFix) }
        else -> null
    }
    val more = missingPermissions.size.coerceAtMost(1) + setupIssues.size - 1
    val todoEyebrow = if (more > 0) pluralStringResource(R.plurals.home_one_thing_first_more, more, more) else stringResource(R.string.home_one_thing_first)

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
        HomeGlow(Modifier.fillMaxSize())
        // Below the status bar when the app draws edge to edge (Android 15); nothing otherwise.
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            val scroll = rememberScrollState()
            Column(Modifier.weight(1f).fillMaxWidth().fadeTopWhenScrolled(scroll, 16.dp).verticalScroll(scroll).padding(top = 16.dp, bottom = 28.dp)) {
                HomeHeader(onHelp = { helpOpen = true })
                // Followers at home never broadcast, so there's nothing to switch.
                if (!following) LiveRow(visible, ghost, onChange = onVisible, modifier = Modifier.padding(horizontal = HomeSide))
                if (todo != null) SetupCard(todoEyebrow, todo.first, todo.second, todo.third, Modifier.padding(top = 14.dp))

                when {
                    firstTime -> {
                        Spacer(Modifier.height(8.dp))
                        FirstTimeHero(onStart = startCrew, onScan = onScanQr, onPaste = onPasteInvite, onPlan = onPlanGig)
                    }
                    !inCrew -> {
                        Spacer(Modifier.height(24.dp))
                        NoCrewHero(onStart = startCrew, onPlan = onPlanGig, onScan = onScanQr, onPaste = onPasteInvite)
                    }
                    else -> {
                        Spacer(Modifier.height(20.dp))
                        CrewHeader(
                            eyebrow = when {
                                following -> stringResource(R.string.home_eyebrow_following)
                                crewSleeping -> stringResource(R.string.home_eyebrow_coming_up)
                                else -> stringResource(R.string.home_eyebrow_tonight)
                            },
                            name = crewName,
                            count = if (gig.isEmpty()) null else if (liveCount > 0) "$crewCount · $liveText" else crewCount,
                            followers = if (following) emptyList() else followers,
                            whenText = crewWhen,
                            venueMap = if (groupName != null && !following) venueMap else null,
                            onMenu = { menuOpen = true },
                        )
                        when {
                            following && !crewSleeping -> {
                                Spacer(Modifier.height(10.dp))
                                Text(stringResource(R.string.home_follower_text), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 21.sp), modifier = Modifier.padding(horizontal = HomeSide))
                                if (gig.isNotEmpty()) CrewTiles(gig, seen, nowSec, onFind = null, onOptions = null, notes = tileNotes)
                                if (checkInBy != null) CheckInBanner(checkInBy, onHomeSafe, Modifier.padding(start = HomeSide, end = HomeSide, top = 14.dp))
                                ActivityBlock(meetUp, pings.take(3), nowSec, describePing, pinnedPlan, onOpenMap, onOpenChat, Modifier.padding(top = 16.dp))
                                Spacer(Modifier.height(18.dp))
                                HeroButton(stringResource(R.string.home_see_story), HomeIcons.Story, Modifier.padding(horizontal = HomeSide), onClick = onOpenStory)
                                Spacer(Modifier.height(14.dp))
                                if (onOpenChat != null) {
                                    ButtonPair(
                                        Modifier.padding(horizontal = HomeSide),
                                        first = { GlassAction(stringResource(R.string.home_crew_chat), HomeIcons.Chat, badge = chatUnread, onClick = onOpenChat) },
                                        second = { GlassAction(stringResource(R.string.home_where_are_they_short), HomeIcons.MapPin, onClick = onOpenMap) },
                                    )
                                } else {
                                    GlassAction(
                                        stringResource(R.string.home_where_are_they_short), HomeIcons.MapPin,
                                        Modifier.padding(horizontal = HomeSide).fillMaxWidth(), onClick = onOpenMap,
                                    )
                                }
                            }
                            gig.isEmpty() || crewSleeping -> {
                                // Nobody in yet, or a crew asleep until gig day.
                                if (crewSleeping) {
                                    Spacer(Modifier.height(10.dp))
                                    Text(stringResource(R.string.home_asleep_text), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 21.sp, color = Mosh.Lilac), modifier = Modifier.padding(horizontal = HomeSide))
                                }
                                if (gig.isNotEmpty()) CrewTiles(gig, seen, nowSec, onFind = null, onOptions = { options = it }, badges = privateUnread)
                                Spacer(Modifier.height(20.dp))
                                when {
                                    following -> Text(stringResource(R.string.home_see_them_once_starts), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 21.sp), modifier = Modifier.padding(horizontal = HomeSide))
                                    crewQrPayload != null -> InlineCrewQr(crewQrPayload, onShareCode, Modifier.padding(horizontal = HomeSide))
                                    else -> HeroButton(stringResource(R.string.home_show_crew_qr), HomeIcons.Qr, Modifier.padding(horizontal = HomeSide), onClick = onShowGroupQr)
                                }
                                if (onOpenChat != null && groupName != null) {
                                    Spacer(Modifier.height(14.dp))
                                    GlassAction(
                                        stringResource(R.string.home_crew_chat), HomeIcons.Chat,
                                        Modifier.padding(horizontal = HomeSide).fillMaxWidth(), badge = chatUnread, onClick = onOpenChat,
                                    )
                                }
                                ActivityBlock(meetUp, emptyList(), nowSec, describePing, pinnedPlan, onOpenMap, onOpenChat, Modifier.padding(top = 18.dp))
                            }
                            else -> {
                                // Tonight, with mates in: the faces and Find everyone are the loudest things here.
                                CrewTiles(
                                    gig, seen, nowSec,
                                    onFind = { onFind(setOf(it)) }, onOptions = { options = it },
                                    distances = distances, badges = privateUnread, flares = flareNotes,
                                )
                                DotLineText(
                                    stringResource(R.string.home_tap_mate_hint),
                                    style = HomeType.Body.copy(fontSize = 12.5.sp, lineHeight = 17.sp, color = Mosh.TextFaint),
                                    modifier = Modifier.padding(start = HomeSide, end = HomeSide, top = 4.dp),
                                    keep = 40,
                                )
                                Spacer(Modifier.height(18.dp))
                                HeroButton(
                                    if (gig.size == 1) stringResource(R.string.home_find_name, gig[0].name) else stringResource(R.string.home_find_everyone),
                                    HomeIcons.Navigate, Modifier.padding(horizontal = HomeSide),
                                ) { onFind(gig.map { it.id }.toSet()) }
                                if (checkInBy != null) CheckInBanner(checkInBy, onHomeSafe, Modifier.padding(start = HomeSide, end = HomeSide, top = 14.dp))
                                Spacer(Modifier.height(14.dp))
                                ButtonPair(
                                    Modifier.padding(horizontal = HomeSide),
                                    first = {
                                        GlassAction(stringResource(R.string.home_crew_chat), HomeIcons.Chat, badge = chatUnread) {
                                            if (onOpenChat != null) onOpenChat() else messageOpen = true
                                        }
                                    },
                                    second = { GlassAction(stringResource(R.string.home_share_photos), HomeIcons.Camera, onClick = onShareMoment) },
                                )
                                ActivityBlock(meetUp, pings.take(1), nowSec, describePing, pinnedPlan, onOpenMap, onOpenChat, Modifier.padding(top = 20.dp))
                                if (moments.isNotEmpty()) {
                                    SectionTitle(stringResource(R.string.find_story_title), Modifier.padding(top = 8.dp), onSeeAll = onOpenStory)
                                    StoryStrip(moments, onOpenStory)
                                }
                            }
                        }
                    }
                }

                if (!firstTime) {
                    if (upNext.isNotEmpty()) {
                        SectionTitle(stringResource(R.string.home_section_up_next), Modifier.padding(top = 18.dp))
                        HomeDivider()
                        upNext.forEach { card ->
                            UpNextRow(card) { onOpenUpNext(card.id) }
                            HomeDivider()
                        }
                    }
                    // "Remember last year?": a gig on this day in an earlier year.
                    nz.waveformlabs.moshpoint.Memories.today(pastGigs, if (nowSec > 0) nowSec * 1000 else System.currentTimeMillis()).firstOrNull()?.let { (g, years) ->
                        Spacer(Modifier.height(28.dp))
                        MemoryCard(g, years) { onOpenGig(g) }
                    }
                    if (past.isNotEmpty()) {
                        SectionTitle(stringResource(R.string.home_section_past_gigs), Modifier.padding(top = 18.dp), onSeeAll = { gigsOpen = true })
                        PastGigsStrip(past, onOpenGig)
                    }
                    SectionTitle(
                        stringResource(R.string.home_section_friends),
                        Modifier.padding(top = if (past.isNotEmpty()) 0.dp else 18.dp),
                        onSeeAll = if (permanent.isNotEmpty()) ({ friendsOpen = true }) else null,
                    )
                    if (permanent.isEmpty()) {
                        Text(
                            stringResource(R.string.home_friends_empty),
                            style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 21.sp, color = Mosh.TextDim),
                            modifier = Modifier.padding(start = HomeSide, end = HomeSide, top = 6.dp),
                        )
                    } else {
                        FriendsStrip(permanent, seen, nowSec, onFind = { onFind(setOf(it)) }, onOptions = { options = it })
                        DotLineText(
                            stringResource(R.string.home_tap_mate_hint),
                            style = HomeType.Body.copy(fontSize = 12.5.sp, lineHeight = 17.sp, color = Mosh.TextFaint),
                            modifier = Modifier.padding(start = HomeSide, end = HomeSide, top = 8.dp),
                            keep = 40,
                        )
                    }
                }
                // Always false in release builds (BuildConfig.TEST_BUILD is a compile-time constant).
                if ((BuildConfig.TEST_BUILD && DebugStatus.showUi) && onAddSimulated != null) {
                    TextButton(onClick = onAddSimulated, modifier = Modifier.padding(start = HomeSide - 12.dp, top = 12.dp)) {
                        Text("Debug: add simulated friend", style = HomeType.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
                    }
                }
            }
            HomeBar(onMap = onOpenMap, onAdd = { addOpen = true }, onMe = { settingsOpen = true }, myName = myName, onStory = onOpenStory)
        }
    }
}

/**
 * Scrolled content fades out over the top [height] of the page instead of being cut along a
 * hard line under the clock (seen on a phone: scrolled a little, Need help lost its top edge).
 * The fade grows with the first [height] of scrolling, so the page at rest looks exactly as
 * designed. Applied before verticalScroll, so it stays at the top of the visible area.
 */
private fun Modifier.fadeTopWhenScrolled(scroll: ScrollState, height: Dp): Modifier = this
    .graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        val edge = height.toPx()
        val t = (scroll.value / edge).coerceIn(0f, 1f)
        if (t > 0f) {
            drawRect(
                brush = Brush.verticalGradient(0f to Color.Black.copy(alpha = 1f - t), 1f to Color.Black, startY = 0f, endY = edge),
                blendMode = BlendMode.DstIn,
            )
        }
    }

/** Something switched off on this phone that stops mates finding each other, with a one-tap fix. */
class SetupIssue(val text: String, val button: String, val onFix: () -> Unit)
