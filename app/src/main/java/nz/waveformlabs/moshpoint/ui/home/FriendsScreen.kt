package nz.waveformlabs.moshpoint.ui.home

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
import androidx.compose.runtime.rememberUpdatedState
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
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.profile.PhotoStore
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.ui.chat.HelpDialog
import nz.waveformlabs.moshpoint.ui.Mosh
import nz.waveformlabs.moshpoint.ui.settings.SettingsSheet
import nz.waveformlabs.moshpoint.ui.chat.UnreadBadge

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
    me: HomeMe,
    crew: HomeCrew,
    gigs: HomeGigs,
    /** Filled in after a QR scan so the user only has to confirm. */
    scanned: Pair<String, String>?,
    meActions: HomeMeActions,
    crewActions: HomeCrewActions,
    inviteActions: HomeInviteActions,
    gigActions: HomeGigActions,
) {
    // The action holders are made anew on every home redraw. The lambdas below that use them read
    // the latest through these, so they stay the same objects from one redraw to the next and the
    // face tiles, friends strip, Up next rows, memory card and sheets can skip redrawing
    // (PRODUCTION_AUDIT.md, "Home redraw efficiency").
    val crewNow = rememberUpdatedState(crewActions)
    val gigsNow = rememberUpdatedState(gigActions)
    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(scanned) {
        if (scanned != null) {
            code = scanned.first
            if (name.isBlank()) name = scanned.second
            error = null
            inviteActions.onScannedUsed()
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

    val gig = crew.friends.filter { it.gigGroupOnly || it.key in crew.crewKeys }
    val permanent = crew.friends.filterNot { it.gigGroupOnly }
    val past = gigs.pastGigs.filter { it.id != gigs.currentGigId }
    val inCrew = crew.groupName != null || gig.isNotEmpty()
    // A brand-new user: nothing to show but the one thing to do.
    val firstTime = !inCrew && permanent.isEmpty() && past.isEmpty() && gigs.upNext.isEmpty()
    // Need help offers the crew alert only when there's a crew on tonight with someone in it
    // to alert: a safety feature must never say "alerted" to nobody.
    val canAlertCrew = crew.groupName != null && !crew.following && !crew.crewSleeping && (gig.isNotEmpty() || crew.followers.isNotEmpty())
    val startCrew: () -> Unit = inviteActions.onQuickCrew ?: { naming = true }
    val crewName = crew.groupName ?: stringResource(R.string.home_your_crew)
    val crewCount = pluralStringResource(R.plurals.home_crew_count, gig.size, gig.size)
    val liveCount = if (crew.following || crew.crewSleeping) 0 else gig.count { isLive(crew.seen[it.id], crew.nowSec) }
    val liveText = pluralStringResource(R.plurals.home_live_count, liveCount, liveCount)

    if (settingsOpen) {
        SettingsSheet(
            myName = me.myName, onMyName = meActions.onMyName,
            onSelfie = meActions.onSelfie, onPickMyPhoto = meActions.onPickMyPhoto, onRemoveMyPhoto = meActions.onRemoveMyPhoto, onFacebook = meActions.onFacebook,
            alwaysOn = me.alwaysOn, onAlwaysOn = meActions.onAlwaysOn,
            phoneSummary = me.phoneSummary,
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
                    inviteActions.onStartGroup(groupNameText)
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
                    if (crewActions.onMessage != null && (f.gigGroupOnly || f.key in crew.crewKeys) && crewActions.canMessage(f.id)) {
                        TextButton(onClick = { crewActions.onMessage(f.id); options = null }) {
                            Text(stringResource(R.string.private_message_name, f.name))
                            crew.privateUnread[f.id]?.let { n -> Spacer(Modifier.width(8.dp)); UnreadBadge(n) }
                        }
                    }
                    if (f.gigGroupOnly) {
                        TextButton(onClick = { crewActions.onKeepFriend(f.id); options = null }) { Text(stringResource(R.string.home_keep_friend, f.name)) }
                    }
                    TextButton(onClick = { crewActions.onSetPhoto(f.id); options = null }) { Text(stringResource(R.string.home_set_photo)) }
                    if (PhotoStore.photos.containsKey(f.id)) {
                        TextButton(onClick = { crewActions.onRemovePhoto(f.id); options = null }) { Text(stringResource(R.string.home_remove_photo)) }
                    }
                    // Block: hides what they post on this phone; they stay in the crew (docs/REPORT_BLOCK.md).
                    if (crewActions.onBlock != null && (f.gigGroupOnly || f.key in crew.crewKeys)) {
                        if (crewActions.isBlocked(f.id)) {
                            TextButton(onClick = { crewActions.onUnblock(f.id); options = null }) { Text(stringResource(R.string.mod_unblock_name, f.name)) }
                        } else {
                            TextButton(onClick = { crewActions.onBlock(f.id); options = null }) { Text(stringResource(R.string.mod_block_name, f.name), color = Mosh.Danger) }
                        }
                    }
                    if (!f.gigGroupOnly || crew.canRemoveCrewMates) {
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
            confirmButton = { TextButton(onClick = { crewActions.onRemove(f.id); confirmRemove = null }) { Text(stringResource(R.string.home_remove)) } },
            dismissButton = { TextButton(onClick = { confirmRemove = null }) { Text(stringResource(R.string.home_cancel)) } },
        )
    }

    fun add(gigGroup: Boolean) {
        error = inviteActions.onAdd(name, code, gigGroup)
        if (error == null) {
            name = ""
            code = ""
        }
    }

    if (messageOpen) MessageSheet(onPing = { crewActions.onPing(it) }, onCheckIn = { crewActions.onCheckIn(it) }, onClose = { messageOpen = false }, onGoLive = { meActions.onVisible(true) })
    if (addOpen) {
        AddSheet(
            inCrew = crew.groupName != null,
            onShowCrewQr = inviteActions.onShowCrewQr ?: inviteActions.onShowGroupQr,
            onScanQr = inviteActions.onScanQr,
            onShareApp = inviteActions.onShareApp,
            onPasteInvite = inviteActions.onPasteInvite,
            onShowMyQr = inviteActions.onShowQr,
            onEnterCode = { manualCode = true },
            onClose = { addOpen = false },
            onBump = inviteActions.onBump,
            onPlanGig = if (crew.groupName == null) inviteActions.onPlanGig else null,
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
        HelpDialog(onAlertCrew = if (canAlertCrew) ({ crewActions.onPing(GigGroup.Ping.NEED_HELP) }) else null, onGoLive = { meActions.onVisible(true) }, onClose = { helpOpen = false })
    }
    if (menuOpen && inCrew) {
        MoshSheet(onClose = { menuOpen = false }) {
            CrewMenuContent(
                name = crewName,
                subtitle = listOfNotNull(
                    when {
                        crew.following -> stringResource(R.string.home_following_from_home)
                        crew.crewSleeping -> stringResource(R.string.home_menu_coming_up)
                        else -> stringResource(R.string.home_menu_tonight)
                    },
                    crewCount.takeIf { gig.isNotEmpty() },
                ).let { dotLine(it) },
                onInvite = if (crew.following) null else ({ menuOpen = false; inviteActions.onShowGroupQr() }),
                onFamily = if (crew.following) null else ({ menuOpen = false; crewActions.onLetFamilyFollow() }),
                onReset = if (crew.following || crew.groupName == null) null else crewActions.onResetInvite?.let { reset -> { menuOpen = false; reset() } },
                endTitle = when {
                    crew.following -> stringResource(R.string.home_stop_following)
                    crew.crewSleeping -> stringResource(R.string.home_cancel_crew)
                    else -> stringResource(R.string.home_end_night)
                },
                endSub = when {
                    crew.following -> stringResource(R.string.home_menu_stop_sub)
                    crew.crewSleeping -> stringResource(R.string.home_menu_cancel_sub)
                    else -> stringResource(R.string.home_menu_end_sub)
                },
                onEnd = { menuOpen = false; crewActions.onClearGigGroup() },
            )
        }
    }
    if (friendsOpen) {
        MoshSheet(onClose = { friendsOpen = false }) {
            FriendsListContent(permanent, crew.seen, crew.nowSec, onFind = { friendsOpen = false; crewNow.value.onFind(setOf(it)) }, onOptions = { options = it })
        }
    }
    if (gigsOpen) {
        MoshSheet(onClose = { gigsOpen = false }) {
            PastGigsContent(past) { g -> gigsOpen = false; gigsNow.value.onOpenGig(g) }
        }
    }

    // One calm card with the one thing to fix next (permission, then each switch), instead
    // of a wall of warnings. It disappears once everything's ready.
    val todo: Triple<String, String, () -> Unit>? = when {
        me.missingPermissions.isNotEmpty() -> Triple(
            // The name before the colon (full-width in CJK); not lower-cased (German nouns are capitalised).
            Txt.s(R.string.home_allow_permission, me.missingPermissions.first().substringBefore(':').substringBefore('：').trim()),
            Txt.s(R.string.home_allow), meActions.onFixPermissions,
        )
        me.setupIssues.isNotEmpty() -> me.setupIssues.first().let { Triple(it.text, it.button, it.onFix) }
        else -> null
    }
    val more = me.missingPermissions.size.coerceAtMost(1) + me.setupIssues.size - 1
    val todoEyebrow = if (more > 0) pluralStringResource(R.plurals.home_one_thing_first_more, more, more) else stringResource(R.string.home_one_thing_first)

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
        HomeGlow(Modifier.fillMaxSize())
        // Below the status bar when the app draws edge to edge (Android 15); nothing otherwise.
        Column(Modifier.fillMaxSize().statusBarsPadding()) {
            val scroll = rememberScrollState()
            Column(Modifier.weight(1f).fillMaxWidth().fadeTopWhenScrolled(scroll, 16.dp).verticalScroll(scroll).padding(top = 16.dp, bottom = 28.dp)) {
                HomeHeader(onHelp = { helpOpen = true })
                // Followers at home never broadcast, so there's nothing to switch.
                if (!crew.following) LiveRow(me.visible, me.ghost, onChange = meActions.onVisible, modifier = Modifier.padding(horizontal = HomeSide))
                if (todo != null) SetupCard(todoEyebrow, todo.first, todo.second, todo.third, Modifier.padding(top = 14.dp))

                when {
                    firstTime -> {
                        Spacer(Modifier.height(8.dp))
                        FirstTimeHero(onStart = startCrew, onScan = inviteActions.onScanQr, onPaste = inviteActions.onPasteInvite, onPlan = inviteActions.onPlanGig)
                    }
                    !inCrew -> {
                        Spacer(Modifier.height(24.dp))
                        NoCrewHero(onStart = startCrew, onPlan = inviteActions.onPlanGig, onScan = inviteActions.onScanQr, onPaste = inviteActions.onPasteInvite)
                    }
                    else -> {
                        Spacer(Modifier.height(20.dp))
                        CrewHeader(
                            eyebrow = when {
                                crew.following -> stringResource(R.string.home_eyebrow_following)
                                crew.crewSleeping -> stringResource(R.string.home_eyebrow_coming_up)
                                else -> stringResource(R.string.home_eyebrow_tonight)
                            },
                            name = crewName,
                            count = if (gig.isEmpty()) null else if (liveCount > 0) "$crewCount · $liveText" else crewCount,
                            followers = if (crew.following) emptyList() else crew.followers,
                            whenText = crew.crewWhen,
                            venueMap = if (crew.groupName != null && !crew.following) crew.venueMap else null,
                            onMenu = { menuOpen = true },
                        )
                        when {
                            crew.following && !crew.crewSleeping -> {
                                Spacer(Modifier.height(10.dp))
                                Text(stringResource(R.string.home_follower_text), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 21.sp), modifier = Modifier.padding(horizontal = HomeSide))
                                if (gig.isNotEmpty()) CrewTiles(gig, crew.seen, crew.nowSec, onFind = null, onOptions = null, notes = crew.tileNotes)
                                if (crew.checkInBy != null) CheckInBanner(crew.checkInBy, crewActions.onHomeSafe, Modifier.padding(start = HomeSide, end = HomeSide, top = 14.dp))
                                ActivityBlock(crew.meetUp, crew.pings.take(3), crew.nowSec, crewActions.describePing, crew.pinnedPlan, crewActions.onOpenMap, crewActions.onOpenChat, Modifier.padding(top = 16.dp))
                                Spacer(Modifier.height(18.dp))
                                HeroButton(stringResource(R.string.home_see_story), HomeIcons.Story, Modifier.padding(horizontal = HomeSide), onClick = crewActions.onOpenStory)
                                Spacer(Modifier.height(14.dp))
                                if (crewActions.onOpenChat != null) {
                                    ButtonPair(
                                        Modifier.padding(horizontal = HomeSide),
                                        first = { GlassAction(stringResource(R.string.home_crew_chat), HomeIcons.Chat, badge = crew.chatUnread, onClick = crewActions.onOpenChat) },
                                        second = { GlassAction(stringResource(R.string.home_where_are_they_short), HomeIcons.MapPin, onClick = crewActions.onOpenMap) },
                                    )
                                } else {
                                    GlassAction(
                                        stringResource(R.string.home_where_are_they_short), HomeIcons.MapPin,
                                        Modifier.padding(horizontal = HomeSide).fillMaxWidth(), onClick = crewActions.onOpenMap,
                                    )
                                }
                            }
                            gig.isEmpty() || crew.crewSleeping -> {
                                // Nobody in yet, or a crew asleep until gig day.
                                if (crew.crewSleeping) {
                                    Spacer(Modifier.height(10.dp))
                                    Text(stringResource(R.string.home_asleep_text), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 21.sp, color = Mosh.Lilac), modifier = Modifier.padding(horizontal = HomeSide))
                                }
                                if (gig.isNotEmpty()) CrewTiles(gig, crew.seen, crew.nowSec, onFind = null, onOptions = { options = it }, badges = crew.privateUnread)
                                Spacer(Modifier.height(20.dp))
                                when {
                                    crew.following -> Text(stringResource(R.string.home_see_them_once_starts), style = HomeType.Body.copy(fontSize = 14.sp, lineHeight = 21.sp), modifier = Modifier.padding(horizontal = HomeSide))
                                    crew.crewQrPayload != null -> InlineCrewQr(crew.crewQrPayload, inviteActions.onShareCode, Modifier.padding(horizontal = HomeSide))
                                    else -> HeroButton(stringResource(R.string.home_show_crew_qr), HomeIcons.Qr, Modifier.padding(horizontal = HomeSide), onClick = inviteActions.onShowGroupQr)
                                }
                                if (crewActions.onOpenChat != null && crew.groupName != null) {
                                    Spacer(Modifier.height(14.dp))
                                    GlassAction(
                                        stringResource(R.string.home_crew_chat), HomeIcons.Chat,
                                        Modifier.padding(horizontal = HomeSide).fillMaxWidth(), badge = crew.chatUnread, onClick = crewActions.onOpenChat,
                                    )
                                }
                                ActivityBlock(crew.meetUp, emptyList(), crew.nowSec, crewActions.describePing, crew.pinnedPlan, crewActions.onOpenMap, crewActions.onOpenChat, Modifier.padding(top = 18.dp))
                            }
                            else -> {
                                // Tonight, with mates in: the faces and Find everyone are the loudest things here.
                                CrewTiles(
                                    gig, crew.seen, crew.nowSec,
                                    onFind = { crewNow.value.onFind(setOf(it)) }, onOptions = { options = it },
                                    distances = crew.distances, badges = crew.privateUnread, flares = crew.flareNotes,
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
                                ) { crewActions.onFind(gig.map { it.id }.toSet()) }
                                if (crew.checkInBy != null) CheckInBanner(crew.checkInBy, crewActions.onHomeSafe, Modifier.padding(start = HomeSide, end = HomeSide, top = 14.dp))
                                Spacer(Modifier.height(14.dp))
                                ButtonPair(
                                    Modifier.padding(horizontal = HomeSide),
                                    first = {
                                        GlassAction(stringResource(R.string.home_crew_chat), HomeIcons.Chat, badge = crew.chatUnread) {
                                            if (crewActions.onOpenChat != null) crewActions.onOpenChat() else messageOpen = true
                                        }
                                    },
                                    second = { GlassAction(stringResource(R.string.home_share_photos), HomeIcons.Camera, onClick = crewActions.onShareMoment) },
                                )
                                ActivityBlock(crew.meetUp, crew.pings.take(1), crew.nowSec, crewActions.describePing, crew.pinnedPlan, crewActions.onOpenMap, crewActions.onOpenChat, Modifier.padding(top = 20.dp))
                                if (crew.moments.isNotEmpty()) {
                                    SectionTitle(stringResource(R.string.find_story_title), Modifier.padding(top = 8.dp), onSeeAll = crewActions.onOpenStory)
                                    StoryStrip(crew.moments, crewActions.onOpenStory)
                                }
                            }
                        }
                    }
                }

                if (!firstTime) {
                    if (gigs.upNext.isNotEmpty()) {
                        SectionTitle(stringResource(R.string.home_section_up_next), Modifier.padding(top = 18.dp))
                        HomeDivider()
                        gigs.upNext.forEach { card ->
                            UpNextRow(card) { gigsNow.value.onOpenUpNext(card.id) }
                            HomeDivider()
                        }
                    }
                    // "Remember last year?": a gig on this day in an earlier year.
                    nz.waveformlabs.moshpoint.gigs.Memories.today(gigs.pastGigs, if (crew.nowSec > 0) crew.nowSec * 1000 else System.currentTimeMillis()).firstOrNull()?.let { (g, years) ->
                        Spacer(Modifier.height(28.dp))
                        MemoryCard(g, years) { gigsNow.value.onOpenGig(g) }
                    }
                    if (past.isNotEmpty()) {
                        SectionTitle(stringResource(R.string.home_section_past_gigs), Modifier.padding(top = 18.dp), onSeeAll = { gigsOpen = true })
                        PastGigsStrip(past, gigActions.onOpenGig)
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
                        FriendsStrip(permanent, crew.seen, crew.nowSec, onFind = { crewNow.value.onFind(setOf(it)) }, onOptions = { options = it })
                        DotLineText(
                            stringResource(R.string.home_tap_mate_hint),
                            style = HomeType.Body.copy(fontSize = 12.5.sp, lineHeight = 17.sp, color = Mosh.TextFaint),
                            modifier = Modifier.padding(start = HomeSide, end = HomeSide, top = 8.dp),
                            keep = 40,
                        )
                    }
                }
                // Always false in release builds (BuildConfig.TEST_BUILD is a compile-time constant).
                if ((BuildConfig.TEST_BUILD && DebugStatus.showUi) && meActions.onAddSimulated != null) {
                    TextButton(onClick = meActions.onAddSimulated, modifier = Modifier.padding(start = HomeSide - 12.dp, top = 12.dp)) {
                        Text("Debug: add simulated friend", style = HomeType.Label.copy(fontSize = 14.sp, color = Mosh.Amber))
                    }
                }
            }
            HomeBar(onMap = crewActions.onOpenMap, onAdd = { addOpen = true }, onMe = { settingsOpen = true }, myName = me.myName, onStory = crewActions.onOpenStory)
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
