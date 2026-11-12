package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.draw.clip
import nz.waveformlabs.moshpoint.PhotoStore
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import nz.waveformlabs.moshpoint.BuildConfig
import nz.waveformlabs.moshpoint.DebugStatus
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt

/**
 * Friends list (permanent) and gig group (one night), plus the visibility switch.
 * Tap a friend to go straight to their arrow; long-press for photo / remove.
 *
 * Adding people is a stopgap: share your code, paste theirs. Enough to test with two
 * phones. TODO: accounts, usernames, QR codes, gig group create/join via the server.
 */
@OptIn(ExperimentalFoundationApi::class)
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
    /** Unread private messages per friend id, shown on their face. */
    privateUnread: Map<String, Int> = emptyMap(),
    /** Snap Map style view of where everyone is. */
    onOpenMap: () -> Unit = {},
    /** The crew's meet-up pin, if someone dropped one ("Sound desk"). */
    meetUp: String? = null,
    /** Last shared spot per friend (for live / battery under each crew tile). */
    seen: Map<String, nz.waveformlabs.moshpoint.LocationBook.Seen> = emptyMap(),
    nowSec: Long = 0L,
    pings: List<nz.waveformlabs.moshpoint.core.GigGroup.Ping> = emptyList(),
    onPing: (Int) -> Unit = {},
    describePing: (Int) -> String = { Txt.s(R.string.home_ping_default) },
    ghost: Boolean = false,
    /** "Show crew QR" from the Add sheet: starts a crew first if needed. */
    onShowCrewQr: (() -> Unit)? = null,
    moments: List<nz.waveformlabs.moshpoint.Moments.Item> = emptyList(),
    onShareMoment: () -> Unit = {},
    onOpenMoment: (nz.waveformlabs.moshpoint.Moments.Item) -> Unit = {},
    onCheckIn: (Int) -> Unit = {},
    /** "2:15 am" while we're checking in, else null. */
    checkInBy: String? = null,
    onHomeSafe: () -> Unit = {},
    /** Metres to each crew member, worked out in the background. */
    distances: Map<String, Double> = emptyMap(),
    /** The crew QR's contents, shown right on the card while no one has joined. */
    crewQrPayload: String? = null,
    /** "Invite mates": start a crew named after you, no questions. Null = ask for a name. */
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
    /** Tonight's gig (shown in the crew card, not in the list). */
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
    /** The crew's pinned plan, shown on the card. */
    pinnedPlan: String? = null,
    /** "🔥 Bar time 🍺" under a mate's tile while their flare is up. */
    flareNotes: Map<String, String> = emptyMap(),
    /** Other crews you're in, soonest first. */
    upNext: List<UpNextCard> = emptyList(),
    onOpenUpNext: (String) -> Unit = {},
    /** The crew card's line about the venue's offline map (see VenueMaps); null = no line. */
    venueMap: nz.waveformlabs.moshpoint.venue.VenueMaps.Status? = null,
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
    if (settingsOpen) {
        SettingsSheet(
            myName = myName, onMyName = onMyName,
            onSelfie = onSelfie, onPickMyPhoto = onPickMyPhoto, onRemoveMyPhoto = onRemoveMyPhoto, onFacebook = onFacebook,
            alwaysOn = alwaysOn, onAlwaysOn = onAlwaysOn,
            phoneSummary = phoneSummary,
            onClose = { settingsOpen = false },
        )
    }
    var naming by remember { mutableStateOf(false) }
    var groupNameText by remember { mutableStateOf("") }
    if (naming) {
        AlertDialog(
            onDismissRequest = { naming = false },
            title = { Text(stringResource(R.string.home_start_gig_group)) },
            text = {
                androidx.compose.foundation.layout.Column {
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
                androidx.compose.foundation.layout.Column {
                    // First: write to them privately (crew mates only).
                    if (onMessage != null && (f.gigGroupOnly || f.key in crewKeys)) {
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
                        TextButton(onClick = { confirmRemove = f; options = null }) { Text(stringResource(R.string.home_remove_name, f.name), color = Color(0xFFE53935)) }
                    } else {
                        Text(
                            stringResource(R.string.crew_only_owner_removes),
                            style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint),
                            modifier = androidx.compose.ui.Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
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

    fun add(gig: Boolean) {
        error = onAdd(name, code, gig)
        if (error == null) {
            name = ""
            code = ""
        }
    }

    @Composable
    fun row(f: Friend) {
        val (source, scale) = rememberPress()
        Row(
            Modifier.fillMaxWidth()
                .pressScale(scale)
                .heightIn(min = 66.dp)
                .clip(RoundedCornerShape(18.dp))
                .background(Mosh.SurfaceLow)
                .border(1.dp, Color(0x12FFFFFF), RoundedCornerShape(18.dp))
                .combinedClickable(interactionSource = source, indication = androidx.compose.foundation.LocalIndication.current, onClick = { onFind(setOf(f.id)) }, onLongClick = { options = f })
                .padding(horizontal = 12.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Avatar(f, 44.dp)
            Spacer(Modifier.width(14.dp))
            Text(f.name, style = Mosh.Label, modifier = Modifier.weight(1f))
            Text(
                stringResource(R.string.home_find), style = Mosh.Label.copy(fontSize = 12.sp, color = Color(f.color)),
                modifier = Modifier.background(Color(f.color).copy(alpha = 0.12f), CircleShape).padding(horizontal = 10.dp, vertical = 4.dp),
            )
            // Options (remove, photo, keep) without having to know about long-press.
            TextButton(onClick = { options = f }) { Text("⋯", style = Mosh.Heading.copy(fontSize = 20.sp, color = Mosh.TextDim)) }
        }
    }

    val gig = friends.filter { it.gigGroupOnly || it.key in crewKeys }
    val permanent = friends.filterNot { it.gigGroupOnly }
    var addOpen by remember { mutableStateOf(false) }
    var messageOpen by remember { mutableStateOf(false) }
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
            title = { Text(stringResource(R.string.home_add_with_code), style = Mosh.Heading) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(name, { name = it }, label = { Text(stringResource(R.string.home_their_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(code, { code = it }, label = { Text(stringResource(R.string.home_their_code)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    error?.let { Text(it, style = Mosh.Body.copy(color = Mosh.Danger)) }
                }
            },
            confirmButton = { TextButton(onClick = { add(false); if (error == null) manualCode = false }) { Text(stringResource(R.string.home_add_friend), style = Mosh.Label.copy(color = Mosh.Cyan)) } },
            dismissButton = { TextButton(onClick = { add(true); if (error == null) manualCode = false }) { Text(stringResource(R.string.home_tonight_only), style = Mosh.Label) } },
        )
    }

    Box(Modifier.fillMaxSize().background(Mosh.Ground)) {
    GlowBackground(colours = listOf(Mosh.Pink, Mosh.Violet, Mosh.Cyan))
    Column(Modifier.fillMaxSize()) {
    LazyColumn(
        Modifier.weight(1f).fillMaxWidth(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 20.dp, end = 20.dp, top = 16.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                // The wordmark never shrinks or wraps; the live pill gives way instead (see LivePill).
                Row(verticalAlignment = Alignment.Bottom) {
                    // The wordmark reads "moshpoint" in every language, right-to-left ones too.
                    androidx.compose.runtime.CompositionLocalProvider(androidx.compose.ui.platform.LocalLayoutDirection provides androidx.compose.ui.unit.LayoutDirection.Ltr) {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text("mosh", style = Mosh.Title.copy(fontSize = 28.sp))
                            Text(
                                "point",
                                style = Mosh.Title.copy(fontSize = 28.sp, color = Mosh.Pink, shadow = androidx.compose.ui.graphics.Shadow(Mosh.Pink.copy(alpha = 0.8f), blurRadius = 28f)),
                            )
                        }
                    }
                }
                Spacer(Modifier.weight(1f))
                if (!following) LivePill(visible, ghost, Modifier.padding(start = 12.dp)) { onVisible(!visible) }
            }
            if (!visible && groupName != null && !crewSleeping && !following) {
                Spacer(Modifier.height(8.dp))
                Text(stringResource(R.string.home_hidden_hint), style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextFaint))
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
        if (todo != null) {
            item {
                val more = missingPermissions.size.coerceAtMost(1) + setupIssues.size - 1
                Row(
                    Modifier.fillMaxWidth().background(Color(0xFF2A2140), RoundedCornerShape(18.dp))
                        .border(1.dp, Mosh.Amber.copy(alpha = 0.45f), RoundedCornerShape(18.dp)).padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(if (more > 0) pluralStringResource(R.plurals.home_one_thing_first_more, more, more) else stringResource(R.string.home_one_thing_first), style = Mosh.Eyebrow.copy(color = Mosh.Amber))
                        Spacer(Modifier.height(4.dp))
                        Text(todo.first, style = Mosh.Body.copy(fontSize = 14.sp, lineHeight = 19.sp, color = Mosh.Text))
                    }
                    Spacer(Modifier.width(12.dp))
                    Button(
                        onClick = todo.third, shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Mosh.Amber, contentColor = Color(0xFF1A1000)),
                    ) { Text(todo.second, style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF1A1000))) }
                }
            }
        }

        // Tonight's crew: the heart of the app.
        item {
            NeonFrame(RoundedCornerShape(24.dp), Modifier.fillMaxWidth(), lit = groupName != null && visible) {
                Column(
                    Modifier.fillMaxWidth().background(Mosh.Deep, RoundedCornerShape(22.dp)).padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (groupName == null && gig.isEmpty()) {
                        Text(stringResource(R.string.home_eyebrow_tonight), style = Mosh.Eyebrow)
                        Text(stringResource(R.string.home_find_mates_tonight), style = Mosh.Heading)
                        Text(stringResource(R.string.home_find_mates_text), style = Mosh.Body)
                        NeonButton(stringResource(R.string.home_invite_mates_tonight)) { (onQuickCrew ?: { naming = true })() }
                        GlassButton(stringResource(R.string.home_plan_gig), onClick = onPlanGig)
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            TextButton(onClick = onScanQr) { Text(stringResource(R.string.home_scan_invite), style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                            TextButton(onClick = onPasteInvite) { Text(stringResource(R.string.home_paste_invite), style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(if (following) stringResource(R.string.home_eyebrow_following) else if (crewSleeping) stringResource(R.string.home_eyebrow_coming_up) else stringResource(R.string.home_eyebrow_tonight), style = Mosh.Eyebrow)
                                Text(groupName ?: stringResource(R.string.home_your_crew), style = Mosh.Heading, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                                if (crewWhen != null) Text(crewWhen, style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim), maxLines = 2)
                                if (venueMap != null && groupName != null && !following) VenueMapLine(venueMap)
                            }
                            if (!following) TextButton(onClick = onShowGroupQr) { Text(stringResource(R.string.home_invite), style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Cyan)) }
                        }
                        if (onOpenChat != null && groupName != null) ChatPill(chatUnread, pinnedPlan, onOpenChat)
                        if (!following) {
                            // Who can see the crew from home, so nobody is followed without knowing.
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    if (followers.isEmpty()) stringResource(R.string.home_family_can_follow) else stringResource(R.string.home_following_from_home_names, followers.joinToString(", ")),
                                    style = Mosh.Body.copy(fontSize = 13.sp, lineHeight = 17.sp, color = Mosh.TextDim), modifier = Modifier.weight(1f),
                                )
                                TextButton(onClick = onLetFamilyFollow) { Text(stringResource(R.string.home_share), style = Mosh.Label.copy(fontSize = 14.sp, color = Color(0xFF9DB8FF))) }
                            }
                        }
                        if (meetUp != null) {
                            Row(
                                Modifier.fillMaxWidth().background(Mosh.Pink.copy(alpha = 0.14f), RoundedCornerShape(14.dp))
                                    .border(1.dp, Mosh.Pink.copy(alpha = 0.5f), RoundedCornerShape(14.dp)).clickable(onClick = onOpenMap)
                                    .padding(horizontal = 14.dp, vertical = 10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(stringResource(R.string.home_meet_up, meetUp), style = Mosh.Label.copy(fontSize = 15.sp, color = Mosh.Pink), modifier = Modifier.weight(1f))
                                Text(stringResource(R.string.home_map_link), style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Pink))
                            }
                        }
                        if (crewSleeping) {
                            Text(
                                stringResource(R.string.home_asleep_text),
                                style = Mosh.Body.copy(fontSize = 14.sp, color = Mosh.Violet),
                            )
                        }
                        if (following && !crewSleeping) {
                            Text(stringResource(R.string.home_follower_text), style = Mosh.Body.copy(fontSize = 14.sp))
                            CrewTiles(gig, seen, nowSec, onFind = {}, onOptions = {}, distances = emptyMap(), notes = tileNotes)
                            if (checkInBy != null) CheckInBanner(checkInBy, onHomeSafe)
                            PingFeed(pings.take(3), nowSec, describePing)
                            NeonButton(stringResource(R.string.home_see_story)) { onOpenStory() }
                            if (onOpenChat != null) GlassButton(if (chatUnread > 0) stringResource(R.string.home_crew_chat_unread, chatUnread) else stringResource(R.string.home_crew_chat), onClick = onOpenChat)
                            GlassButton(stringResource(R.string.home_where_are_they), onClick = onOpenMap)
                        } else if (gig.isEmpty() || crewSleeping) {
                            if (gig.isNotEmpty()) CrewTiles(gig, seen, nowSec, onFind = {}, onOptions = { options = it }, distances = emptyMap(), badges = privateUnread)
                            if (following) Text(stringResource(R.string.home_see_them_once_starts), style = Mosh.Body.copy(fontSize = 14.sp))
                            else if (crewQrPayload != null) InlineCrewQr(crewQrPayload, onShareCode)
                            else NeonButton(stringResource(R.string.home_show_crew_qr), onClick = onShowGroupQr)
                        } else {
                            CrewTiles(gig, seen, nowSec, onFind = { onFind(setOf(it)) }, onOptions = { options = it }, distances = distances, notes = flareNotes, badges = privateUnread)
                            Text(stringResource(R.string.home_tap_mate_hint), style = Mosh.Body.copy(fontSize = 12.sp, color = Mosh.TextFaint))
                            NeonButton(if (gig.size == 1) stringResource(R.string.home_find_name, gig[0].name) else stringResource(R.string.home_find_everyone)) { onFind(gig.map { it.id }.toSet()) }
                            if (checkInBy != null) CheckInBanner(checkInBy, onHomeSafe)
                            CrewActions(onMessage = { if (onOpenChat != null) onOpenChat() else messageOpen = true }, onMoment = onShareMoment, unread = chatUnread)
                            PingFeed(pings.take(1), nowSec, describePing)
                            if (moments.isNotEmpty()) MomentStrip(moments, nowSec, { onOpenStory() }, onShareMoment)
                        }
                        TextButton(onClick = onClearGigGroup) {
                            Text(
                                when {
                                    following -> stringResource(R.string.home_stop_following)
                                    crewSleeping -> stringResource(R.string.home_cancel_crew)
                                    else -> stringResource(R.string.home_end_night)
                                },
                                style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Danger),
                            )
                        }
                    }
                }
            }
        }

        if (upNext.isNotEmpty()) {
            item { Text(stringResource(R.string.home_up_next), style = Mosh.Eyebrow, modifier = Modifier.padding(top = 4.dp, start = 4.dp)) }
            items(upNext, key = { "next-" + it.id }) { card -> Box(Modifier.animateItem()) { UpNextRow(card) { onOpenUpNext(card.id) } } }
        }

        // "Remember last year?": a gig on this day in an earlier year.
        nz.waveformlabs.moshpoint.Memories.today(pastGigs, if (nowSec > 0) nowSec * 1000 else System.currentTimeMillis()).firstOrNull()?.let { (g, years) ->
            item {
                Column(
                    Modifier.fillMaxWidth().background(Mosh.Amber.copy(alpha = 0.12f), RoundedCornerShape(18.dp))
                        .border(1.dp, Mosh.Amber.copy(alpha = 0.5f), RoundedCornerShape(18.dp))
                        .clickable { onOpenGig(g) }.padding(16.dp),
                ) {
                    Text(stringResource(R.string.home_memories), style = Mosh.Eyebrow.copy(color = Mosh.Amber))
                    Spacer(Modifier.height(4.dp))
                    Text(nz.waveformlabs.moshpoint.Memories.headline(g, years), style = Mosh.Label)
                    Text(pluralStringResource(R.plurals.home_memories_count, g.photos + g.clips, g.photos + g.clips), style = Mosh.Body.copy(fontSize = 13.sp, color = Mosh.TextDim))
                }
            }
        }

        // Past nights, to relive and save.
        val past = pastGigs.filter { it.id != currentGigId }
        if (past.isNotEmpty()) {
            item {
                Spacer(Modifier.height(4.dp))
                Text(stringResource(R.string.home_your_gigs), style = Mosh.Eyebrow)
                Spacer(Modifier.height(10.dp))
                PastGigs(past, onOpenGig)
            }
        }

        // Permanent friends.
        item {
            Spacer(Modifier.height(4.dp))
            Text(stringResource(R.string.home_friends), style = Mosh.Eyebrow)
        }
        if (permanent.isEmpty()) item { Text(stringResource(R.string.home_friends_empty), style = Mosh.Body) }
        items(permanent, key = { it.id }) { row(it) }
        // Always false in release builds (BuildConfig.TEST_BUILD is a compile-time constant).
        if ((BuildConfig.TEST_BUILD && DebugStatus.showUi) && onAddSimulated != null) {
            item { TextButton(onClick = onAddSimulated) { Text("Debug: add simulated friend", style = Mosh.Label.copy(fontSize = 14.sp, color = Mosh.Amber)) } }
        }
    }
    HomeBar(onMap = onOpenMap, onAdd = { addOpen = true }, onMe = { settingsOpen = true }, myName = myName, onStory = onOpenStory)
    }
    }
}

/** Something switched off on this phone that stops mates finding each other, with a one-tap fix. */
class SetupIssue(val text: String, val button: String, val onFix: () -> Unit)
