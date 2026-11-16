package nz.waveformlabs.moshpoint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.map.LocationBook
import nz.waveformlabs.moshpoint.moments.Moments
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.ui.home.FriendsScreen
import nz.waveformlabs.moshpoint.ui.home.HomeCrew
import nz.waveformlabs.moshpoint.ui.home.HomeCrewActions
import nz.waveformlabs.moshpoint.ui.home.HomeGigActions
import nz.waveformlabs.moshpoint.ui.home.HomeGigs
import nz.waveformlabs.moshpoint.ui.home.HomeInviteActions
import nz.waveformlabs.moshpoint.ui.home.HomeMe
import nz.waveformlabs.moshpoint.ui.home.HomeMeActions
import nz.waveformlabs.moshpoint.ui.home.SetupIssue
import nz.waveformlabs.moshpoint.ui.home.SheetFrame
import nz.waveformlabs.moshpoint.ui.home.UpNextCard
import nz.waveformlabs.moshpoint.venue.VenueMaps

/**
 * Made-up crews, mates and gigs for the home screenshots (docs/HOME_REDESIGN.md). No real
 * bands. Dates, countdowns and alerts are built with the app's own wording, so every language
 * shows its own.
 */
internal object HomeFixtures {
    /** Saturday 14 November 2026, 08:30 UTC. */
    const val NOW = 1_794_645_000L
    /** Saturday 21 November 2026, a week away. */
    const val SAT_21 = 1_795_244_400L
    /** Saturday 16 January 2027. */
    const val JAN_16 = 1_800_082_800L
    /** Saturday 13 March 2027, 7:30 pm in Auckland: the hype group's gig (Discover mock-ups). */
    const val MAR_13 = 1_804_919_400L
    /** The same evening by the screenshot machine's clock (UTC), so the pictures say 7:30 pm like the mock-ups. */
    const val MAR_13_SHOWN = 1_804_966_200L

    /** A mate with their own key (tonight's crew is matched by key). */
    fun mate(id: String, name: String, colour: Long, gig: Boolean) =
        Friend(FriendRecord(id, name, colour.toInt(), ByteArray(32) { i -> (i * 31 + id.hashCode()).toByte() }, gig, 0L))

    val rae = mate("rae", "Rae", 0xFFB6FF3B, gig = false)
    val sam = mate("sam", "Sam", 0xFF22E4FF, gig = false)
    val alex = mate("alex", "Alex", 0xFFC86BFF, gig = false)
    val jo = mate("jo", "Jo", 0xFFFFB020, gig = false)
    val kai = mate("kai", "Kai", 0xFF5EF2C2, gig = true)
    val liv = mate("liv", "Liv", 0xFFFF8A5C, gig = false)
    val ben = mate("ben", "Ben", 0xFF7AA2FF, gig = false)

    /** Rae, Sam, Alex and Jo are friends in tonight's crew; Kai is in it for tonight only; Liv and Ben aren't out. */
    val friends = listOf(rae, sam, alex, jo, kai, liv, ben)
    val crewKeys = setOf(rae.key, sam.key, alex.key, jo.key)
    /** The same people with nobody out tonight. */
    val friendsOnly = friends.filterNot { it.gigGroupOnly }

    fun seen(ageSec: Long, battery: Int? = null) = LocationBook.Seen(-36.85, 174.76, NOW - ageSec, 10, batteryPct = battery)

    /** Rae, Sam and Alex are live (nearest first: 8 m, 40 m, 120 m); Jo was seen 15 min ago, Kai an hour ago. */
    val seenTonight = mapOf("rae" to seen(20), "sam" to seen(45), "alex" to seen(70), "jo" to seen(900), "kai" to seen(3600))
    val distances = mapOf("rae" to 8.0, "sam" to 40.0, "alex" to 120.0)

    fun gig(id: String, name: String, whenSec: Long, venue: String, photos: Int, clips: Int, people: List<String>) =
        GigArchive.Summary(id, name, whenSec, venue, photos, clips, people, null, 0L)

    val pastGigs = listOf(
        gig("harbour", "Harbour Nights", 1_794_038_400L, "The Boatshed", 42, 0, listOf("Rae", "Sam", "Jo")),
        gig("paddock", "Neon Paddock", 1_792_224_000L, "Kauri Fields", 27, 3, listOf("Alex")),
        gig("warehouse", "The Warehouse", 1_790_928_000L, "Dock 4", 19, 0, listOf("Kai", "Liv", "Ben", "Rae")),
    )

    /** On this day last year: the memories card. */
    val lastYear = gig("glasshouse", "Glasshouse Sessions", 1_763_107_200L, "The Glasshouse", 31, 2, listOf("Rae", "Jo"))

    /** The crews coming up, as the app builds them (call from inside MoshTheme: the words need resources). */
    fun upNext(): List<UpNextCard> = listOf(
        UpNextCard("summer", "Summer Fields crew", gigWhen(SAT_21), countdown(SAT_21, NOW), "Kauri Fields", 4, 0, null, false, SAT_21),
        UpNextCard("lantern", "Lantern Parade crew", gigWhen(JAN_16), countdown(JAN_16, NOW), "Riverside Park", 0, 2, "Pre-drinks at Jo's, 5pm", false, JAN_16),
    )

    /** The words after a mate's name in an alert ("is on their way"), from the app's own strings. */
    fun pingWords(kind: Int): String = Txt.s(
        when (kind) {
            GigGroup.Ping.COMING -> R.string.crew_ping_coming
            GigGroup.Ping.ALL_GOOD -> R.string.crew_ping_all_good
            GigGroup.Ping.NEED_HELP -> R.string.crew_ping_need_help
            else -> R.string.crew_ping_other
        },
    )

    fun ping(kind: Int, from: String, agoSec: Long) = GigGroup.Ping(kind, from, NOW - agoSec)

    const val QR = "moshpoint:group?key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&at=1795244400&name=Summer+Fields+crew"

    /** A fake photo: a face-ish gradient, so frames and crops can be checked. */
    fun photo(top: Int, bottom: Int): ImageBitmap {
        val b = android.graphics.Bitmap.createBitmap(256, 256, android.graphics.Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(b)
        val p = android.graphics.Paint().apply {
            shader = android.graphics.LinearGradient(0f, 0f, 0f, 256f, top, bottom, android.graphics.Shader.TileMode.CLAMP)
        }
        c.drawRect(0f, 0f, 256f, 256f, p)
        p.shader = null
        p.color = 0xFFF2C9A0.toInt()
        c.drawCircle(128f, 110f, 62f, p)
        c.drawCircle(128f, 290f, 120f, p)
        return b.asImageBitmap()
    }

    fun moments() = listOf(
        Moments.Item("m1", "Rae", NOW - 900, -36.85, 174.77, "Front row!!", photo(0xFF2B1B5E.toInt(), 0xFFFF2E93.toInt()), false),
        Moments.Item("m2", "Sam", NOW - 600, -36.85, 174.77, "", photo(0xFF0B3B4E.toInt(), 0xFF22E4FF.toInt()), false),
        Moments.Item("m3", "Me", NOW - 120, -36.85, 174.77, "the crew", photo(0xFF1B3B1B.toInt(), 0xFFB6FF3B.toInt()), true),
    )
}

/** The home with every callback stubbed, defaulting to the Main artboard: crew tonight, live. */
@Composable
internal fun HomeUnderTest(
    friends: List<Friend> = HomeFixtures.friends,
    groupName: String? = "Sam's crew",
    crewKeys: Set<String> = HomeFixtures.crewKeys,
    visible: Boolean = true,
    ghost: Boolean = false,
    seen: Map<String, LocationBook.Seen> = HomeFixtures.seenTonight,
    distances: Map<String, Double> = HomeFixtures.distances,
    pings: List<GigGroup.Ping> = listOf(HomeFixtures.ping(GigGroup.Ping.COMING, "Alex", 120)),
    meetUp: String? = "sound desk",
    chatUnread: Int = 3,
    pinnedPlan: String? = null,
    upNext: List<UpNextCard> = HomeFixtures.upNext(),
    pastGigs: List<GigArchive.Summary> = HomeFixtures.pastGigs,
    following: Boolean = false,
    crewSleeping: Boolean = false,
    crewWhen: String? = null,
    tileNotes: Map<String, String> = emptyMap(),
    followers: List<String> = emptyList(),
    crewQrPayload: String? = null,
    moments: List<Moments.Item> = emptyList(),
    checkInBy: String? = null,
    missingPermissions: List<String> = emptyList(),
    setupIssues: List<SetupIssue> = emptyList(),
    flareNotes: Map<String, String> = emptyMap(),
    privateUnread: Map<String, Int> = emptyMap(),
    venueMap: VenueMaps.Status? = null,
    myName: String = "Josh",
    hype: nz.waveformlabs.moshpoint.ui.home.HypeView? = null,
) = FriendsScreen(
    me = HomeMe(
        myName = myName, visible = visible, alwaysOn = false, phoneSummary = "",
        missingPermissions = missingPermissions, setupIssues = setupIssues, ghost = ghost,
    ),
    crew = HomeCrew(
        friends = friends, groupName = groupName, crewKeys = crewKeys, privateUnread = privateUnread,
        meetUp = meetUp, seen = seen, nowSec = HomeFixtures.NOW, pings = pings,
        moments = moments, checkInBy = checkInBy, distances = distances, crewQrPayload = crewQrPayload,
        following = following, tileNotes = tileNotes, followers = followers,
        crewWhen = crewWhen, crewSleeping = crewSleeping,
        chatUnread = chatUnread, pinnedPlan = pinnedPlan, flareNotes = flareNotes, venueMap = venueMap, hype = hype,
    ),
    gigs = HomeGigs(upNext = upNext, pastGigs = pastGigs),
    scanned = null,
    meActions = HomeMeActions(onMyName = {}, onFixPermissions = {}, onVisible = {}, onAlwaysOn = {}),
    crewActions = HomeCrewActions(
        onFind = {}, onRemove = {}, onSetPhoto = {}, onRemovePhoto = {}, onClearGigGroup = {},
        onMessage = {}, describePing = { HomeFixtures.pingWords(it) }, onOpenChat = {}, onResetInvite = {},
    ),
    inviteActions = HomeInviteActions(
        onShareCode = {}, onShowQr = {}, onScanQr = {}, onScannedUsed = {}, onAdd = { _, _, _ -> null },
        onStartGroup = {}, onShowGroupQr = {}, onQuickCrew = {},
    ),
    gigActions = HomeGigActions(),
)

/** A pop-up panel's contents drawn over the home, dimmed, the way the phone shows it. */
@Composable
internal fun OverHome(home: @Composable () -> Unit, panel: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
    Box(Modifier.fillMaxSize()) {
        home()
        Box(Modifier.fillMaxSize().background(Mosh.Scrim))
        SheetFrame(Modifier.align(Alignment.BottomCenter), content = panel)
    }
}
