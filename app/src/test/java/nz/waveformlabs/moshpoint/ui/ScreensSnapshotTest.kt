package nz.waveformlabs.moshpoint.ui

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import nz.waveformlabs.moshpoint.friends.Friend
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import nz.waveformlabs.moshpoint.ui.chat.CrewChatScreen
import nz.waveformlabs.moshpoint.ui.finder.FinderScreen
import nz.waveformlabs.moshpoint.ui.home.AddSheetContent
import nz.waveformlabs.moshpoint.ui.home.CrewMenuContent
import nz.waveformlabs.moshpoint.ui.home.FriendsListContent
import nz.waveformlabs.moshpoint.ui.home.HomeDivider
import nz.waveformlabs.moshpoint.ui.home.PlanGigContent
import nz.waveformlabs.moshpoint.ui.home.PlusInfoContent
import nz.waveformlabs.moshpoint.ui.home.SectionTitle
import nz.waveformlabs.moshpoint.ui.home.UpNextCard
import nz.waveformlabs.moshpoint.ui.home.UpNextRow
import nz.waveformlabs.moshpoint.ui.home.dotLine
import nz.waveformlabs.moshpoint.ui.map.MapPlace
import nz.waveformlabs.moshpoint.ui.map.MapScreen
import nz.waveformlabs.moshpoint.ui.moments.StoryScreen
import nz.waveformlabs.moshpoint.ui.moderation.BlockConfirmContent
import nz.waveformlabs.moshpoint.ui.moderation.BlockedPeopleContent
import nz.waveformlabs.moshpoint.ui.moderation.CommunityRulesContent
import nz.waveformlabs.moshpoint.ui.moderation.PersonMenuContent
import nz.waveformlabs.moshpoint.ui.moderation.ReportContent
import nz.waveformlabs.moshpoint.ui.settings.AcknowledgementsContent
import nz.waveformlabs.moshpoint.ui.settings.OnboardingScreen
import nz.waveformlabs.moshpoint.ui.settings.SettingsContent
import nz.waveformlabs.moshpoint.ui.moments.CameraRollContent
import nz.waveformlabs.moshpoint.ui.settings.PlayDialogCard
import nz.waveformlabs.moshpoint.ui.settings.AboutSection
import nz.waveformlabs.moshpoint.ui.settings.InviteConfirmContent
import nz.waveformlabs.moshpoint.ui.settings.LocationDisclosureContent
import org.junit.Rule
import org.junit.Test

/**
 * Renders every main screen to a PNG on the JVM (no phone needed), so the neon UI can be
 * reviewed visually. CI uploads them as the `screenshots` artifact.
 *
 *   ./gradlew :app:recordPaparazziDebug   -> app/src/test/snapshots/images/
 */
open class ScreensSnapshotTest {
    /** Resource qualifier for the language ("de", "ar", "en-rUS"), or null for metric English. */
    protected open val lang: String? get() = null
    protected open val rtl: Boolean get() = false

    private fun device(base: DeviceConfig) = base.copy(
        locale = lang,
        layoutDirection = if (rtl) com.android.resources.LayoutDirection.RTL else com.android.resources.LayoutDirection.LTR,
    )

    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = device(DeviceConfig.PIXEL_5), theme = "android:Theme.Material.NoActionBar")

    /** Numbers, dates and units follow the same language and country (en-NZ = metric English). */
    @org.junit.Before fun locale() {
        val tag = lang?.replace("-r", "-") ?: "en-NZ"
        java.util.Locale.setDefault(java.util.Locale.forLanguageTag(tag))
    }

    private fun friend(id: String, name: String, colour: Long, gig: Boolean = false) =
        Friend(FriendRecord(id, name, colour.toInt(), ByteArray(32) { it.toByte() }, gig, 0L))

    private val sam = friend("sam", "Sam", 0xFF22E4FF)
    private val alex = friend("alex", "Alex", 0xFFC86BFF, gig = true)
    private val jo = friend("jo", "Jo", 0xFFFFB020, gig = true)
    private val mia = friend("mia", "Mia", 0xFFB6FF3B)
    // A festival-sized crew for the radar.
    private val bigCrew = listOf("Ana", "Ben", "Cleo", "Dev", "Eli", "Fin", "Gus", "Hana").mapIndexed { i, n ->
        friend("m$i", n, listOf(0xFFFF2E93, 0xFF22E4FF, 0xFFB6FF3B, 0xFFFFB020, 0xFF9D5CFF, 0xFFFF6FB3, 0xFF7CF0FF, 0xFFFFE066)[i], gig = true)
    }
    private val all = (listOf(sam, alex, jo, mia) + bigCrew).associateBy { it.id }

    private fun finder(title: String, arrows: List<ArrowState>, scan: LocatorEngine.ScanUi? = null) = snap {
        MoshTheme {
            FinderScreen(
                title = title, visible = true, arrows = arrows, friendOf = { all[it] }, scan = scan,
                onScan = {}, onCancelScan = {}, onDismissScan = {}, onBack = {},
            )
        }
    }

    // 12 mates: near ones close in, far ones out, and Ana + Ben side by side share a stacked bubble.
    @Test fun finderBigCrew() = finder(
        "Laneway crew",
        listOf(
            ArrowState.Pointing("sam", 20.0, 6.0, Method.UWB, false),
            ArrowState.Pointing("alex", 95.0, 45.0, Method.GPS_SERVER, false),
            ArrowState.Pointing("jo", 200.0, 140.0, Method.GPS_SERVER, false),
            ArrowState.Pointing("mia", 300.0, 900.0, Method.GPS_SERVER, false),
            ArrowState.Pointing("m0", 140.0, 60.0, Method.GPS_SERVER, false),
            ArrowState.Pointing("m1", 143.0, 62.0, Method.GPS_SERVER, false),
            ArrowState.Pointing("m2", 250.0, 25.0, Method.GPS_SERVER, false),
            ArrowState.Pointing("m3", 45.0, 300.0, Method.GPS_SERVER, false),
            ArrowState.Pointing("m4", 330.0, 15.0, Method.WALK, true),
            ArrowState.Pointing("m5", 170.0, 1500.0, Method.GPS_SERVER, false),
            ArrowState.NoSignal("m6"),
            ArrowState.DistanceOnly("m7", 9.0, Trend.WARMER, Method.BLE_RSSI),
        ),
    )

    /** Settings > Acknowledgements: copyright, map credit, fonts, then the build's library list. */
    @Test fun acknowledgements() = snap { AcknowledgementsContent(onClose = {}) }

    /** The drawn default avatars (the middle layer, under photos), to eyeball the variety. */
    @Test fun defaultAvatars() = snap {
        val names = listOf("Alex", "Jo", "Sam", "Mia", "Josh", "Ana", "Ben", "Cat", "Dev", "Eli", "Fin", "Gus", "Hana", "Kiri", "Leo", "Mere", "Nia", "Ola", "Priya", "Quinn")
        androidx.compose.foundation.layout.Column(
            androidx.compose.ui.Modifier.background(Mosh.Ground).padding(16.dp),
            verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp),
        ) {
            names.chunked(4).forEach { row ->
                androidx.compose.foundation.layout.Row(horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(12.dp)) {
                    row.forEach { DefaultAvatar(it, 80.dp) }
                }
            }
        }
    }

    @Test fun finderOneFriend() = finder("Sam", listOf(ArrowState.Pointing("sam", 25.0, 12.0, Method.UWB, false)))

    @Test fun finderFarAway() = finder("Sam", listOf(ArrowState.Pointing("sam", -60.0, 140.0, Method.GPS_SERVER, true)))

    @Test fun finderGroup() = finder(
        "Foo Fighters night",
        listOf(
            ArrowState.Pointing("sam", -40.0, 8.0, Method.UWB, false),
            ArrowState.Pointing("alex", 52.0, 65.0, Method.GPS_SERVER, false),
            ArrowState.Pointing("jo", 168.0, 140.0, Method.CROWD_RELAY, true),
        ),
    )

    @Test fun finderSearching() = finder("Jo", listOf(ArrowState.NoSignal("jo")))

    @Test fun finderDistanceOnly() = finder("Sam", listOf(ArrowState.DistanceOnly("sam", 12.0, Trend.WARMER, Method.BLE_RSSI)))

    // A crew nobody can be pointed at yet: a compact line each, no radar dot on top, nothing cut
    // off behind the strip (seen on a phone with three simulated mates).
    @Test fun finderCrewDistanceOnly() = finder(
        "Laneway crew",
        listOf(
            ArrowState.DistanceOnly("sam", 8.0, Trend.STEADY, Method.UWB),
            ArrowState.DistanceOnly("alex", 14.0, Trend.WARMER, Method.UWB),
            ArrowState.DistanceOnly("jo", 9.0, Trend.COLDER, Method.BLE_RSSI),
        ),
    )

    @Test fun finderScanning() = finder(
        "Jo", listOf(ArrowState.DistanceOnly("jo", 9.0, Trend.STEADY, Method.BLE_RSSI)),
        LocatorEngine.ScanUi(250.0, done = false, sectors = BooleanArray(36) { it < 25 }, headingDeg = 0.0),
    )

    @Test fun finderFound() = finder("Sam", listOf(ArrowState.Pointing("sam", 10.0, 2.0, Method.UWB, false)))

    /** A fake "photo": a face-ish gradient so clipping and rings can be checked. */
    private fun fakePhoto(top: Int, bottom: Int): androidx.compose.ui.graphics.ImageBitmap {
        val b = android.graphics.Bitmap.createBitmap(256, 256, android.graphics.Bitmap.Config.ARGB_8888)
        val c = android.graphics.Canvas(b)
        val p = android.graphics.Paint().apply {
            shader = android.graphics.LinearGradient(0f, 0f, 0f, 256f, top, bottom, android.graphics.Shader.TileMode.CLAMP)
        }
        c.drawRect(0f, 0f, 256f, 256f, p)
        p.shader = null
        p.color = 0xFFF2C9A0.toInt()
        c.drawCircle(128f, 110f, 62f, p) // head
        c.drawCircle(128f, 290f, 120f, p) // shoulders
        return b.asImageBitmap()
    }

    @Test fun finderGroupWithPhotos() {
        nz.waveformlabs.moshpoint.profile.PhotoStore.photos["sam"] = fakePhoto(0xFF1E3A8A.toInt(), 0xFF22E4FF.toInt())
        nz.waveformlabs.moshpoint.profile.PhotoStore.photos["alex"] = fakePhoto(0xFF4C1D95.toInt(), 0xFFC86BFF.toInt())
        nz.waveformlabs.moshpoint.profile.PhotoStore.photos["jo"] = fakePhoto(0xFF7C2D12.toInt(), 0xFFFFB020.toInt())
        try {
            finder(
                "Foo Fighters night",
                listOf(
                    ArrowState.Pointing("sam", -40.0, 8.0, Method.UWB, false),
                    ArrowState.Pointing("alex", 52.0, 65.0, Method.GPS_SERVER, false),
                    ArrowState.Pointing("jo", 168.0, 140.0, Method.CROWD_RELAY, true),
                ),
            )
        } finally {
            nz.waveformlabs.moshpoint.profile.PhotoStore.photos.clear()
        }
    }

    @Test fun welcome() = snap {
        MoshTheme { OnboardingScreen(name = "", onName = {}, onAskPermissions = {}, onDone = {}) }
    }

    private fun settings() = snap {
        MoshTheme {
            androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.background(Mosh.Deep)) {
                SettingsContent(
                    myName = "Josh", onMyName = {}, onSelfie = {}, onPickMyPhoto = {}, onRemoveMyPhoto = {},
                    onFacebook = {}, alwaysOn = true, onAlwaysOn = {},
                    phoneSummary = "This phone: UWB, Wi-Fi Aware, Bluetooth, compass, GPS",
                )
            }
        }
    }

    @Test fun settingsSheet() = settings()

    @Test fun smallPhoneSettings() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5))
        settings()
    }

    // ---- Play Store readiness (docs/WAVE2_PLAY.md) ----

    /**
     * A landscape tablet, 1280 x 800 dp (Nexus 10's size in dp, drawn at 1x to keep the files
     * small). Android 16 ignores the app's portrait lock on screens 600 dp and wider, so the home
     * and the finder must work this wide (docs/ANDROID_16.md).
     */
    private val tablet = DeviceConfig.NEXUS_10.copy(
        screenWidth = 1280, screenHeight = 800, xdpi = 160, ydpi = 160, density = com.android.resources.Density.MEDIUM,
    )

    @Test fun tabletHomeMain() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(tablet))
        snap { MoshTheme { HomeUnderTest() } }
    }

    @Test fun tabletFinderGroup() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(tablet))
        finder(
            "Foo Fighters night",
            listOf(
                ArrowState.Pointing("sam", -40.0, 8.0, Method.UWB, false),
                ArrowState.Pointing("alex", 52.0, 65.0, Method.GPS_SERVER, false),
                ArrowState.Pointing("jo", 168.0, 140.0, Method.CROWD_RELAY, true),
            ),
        )
    }

    /** A dialog as the app shows it, centred over the screen (Paparazzi can't draw a dialog's window). */
    private fun dialog(content: @androidx.compose.runtime.Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) = snap {
        MoshTheme {
            androidx.compose.foundation.layout.Box(
                androidx.compose.ui.Modifier.fillMaxSize().background(Mosh.Ground).padding(24.dp),
                contentAlignment = androidx.compose.ui.Alignment.Center,
            ) {
                PlayDialogCard(androidx.compose.ui.Modifier.fillMaxWidth(), content)
            }
        }
    }

    /** Before Android asks for location: what's shared, how, and that it keeps going with the app closed. */
    @Test fun locationDisclosure() = dialog { LocationDisclosureContent({}, {}, {}) }

    @Test fun smallPhoneLargeFontDisclosure() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        locationDisclosure()
    }

    @Test fun tabletDisclosure() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(tablet))
        locationDisclosure()
    }

    /** An invite shared from another app: nothing happens until Join. */
    @Test fun sharedInvite() = dialog {
        InviteConfirmContent(
            title = stringResource(nz.waveformlabs.moshpoint.R.string.main_join_name, "Bevan's crew"),
            body = stringResource(nz.waveformlabs.moshpoint.R.string.play_invite_join_text),
            note = null,
            confirm = stringResource(nz.waveformlabs.moshpoint.R.string.main_join),
            onConfirm = {}, onDismiss = {},
        )
    }

    @Test fun smallPhoneLargeFontSharedInvite() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        sharedInvite()
    }

    /** A friend's code shared from another app. */
    @Test fun sharedFriendInvite() = dialog {
        InviteConfirmContent(
            title = stringResource(nz.waveformlabs.moshpoint.R.string.play_invite_friend_title, "Sam"),
            body = stringResource(nz.waveformlabs.moshpoint.R.string.play_invite_friend_text),
            note = null,
            confirm = stringResource(nz.waveformlabs.moshpoint.R.string.play_invite_add),
            onConfirm = {}, onDismiss = {},
        )
    }

    /** The welcome's second step: why each permission, and the privacy policy link. */
    @Test fun welcomeLive() = snap {
        MoshTheme { OnboardingScreen(name = "", onName = {}, onAskPermissions = {}, onDone = {}, onPrivacy = {}, startStep = 1) }
    }

    @Test fun smallPhoneLargeFontWelcomeLive() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        welcomeLive()
    }

    /** The bottom of Settings: version, credits, licences and the privacy policy. */
    @Test fun settingsAbout() = snap {
        MoshTheme {
            androidx.compose.foundation.layout.Column(
                androidx.compose.ui.Modifier.fillMaxWidth().background(Mosh.Deep).padding(start = 24.dp, end = 24.dp, bottom = 24.dp),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(16.dp),
            ) {
                AboutSection(
                    phoneSummary = "This phone: UWB, Wi-Fi Aware, Bluetooth, compass, GPS", onLicences = {}, onPrivacy = {},
                    version = "0.1.0 (1)", // not CI's build number, which changes every run
                )
            }
        }
    }

    /** "Add your photos from that night": a note, then Android's photo picker. */
    @Test fun cameraRoll() = snap {
        MoshTheme {
            androidx.compose.foundation.layout.Box(
                androidx.compose.ui.Modifier.fillMaxSize().background(Mosh.Ground).padding(24.dp),
                contentAlignment = androidx.compose.ui.Alignment.Center,
            ) {
                CameraRollContent("Foo Fighters night", adding = false, onChoose = {}, onClose = {})
            }
        }
    }

    @Test fun smallPhoneOneFriend() {
        // 360dp-wide class phone: checks the arrow + photo stay on screen.
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5))
        finder("Sam", listOf(ArrowState.Pointing("sam", 90.0, 12.0, Method.UWB, false)))
    }

    @Test fun mapScreen() = snap {
        MoshTheme {
            MapScreen(
                people = listOf(sam, alex, jo, mia),
                seen = mapOf(
                    "sam" to nz.waveformlabs.moshpoint.map.LocationBook.Seen(-41.29, 174.78, 1_000_000L - 30, 10),
                    "alex" to nz.waveformlabs.moshpoint.map.LocationBook.Seen(-41.30, 174.80, 1_000_000L - 1_500, 20),
                ),
                me = nz.waveformlabs.moshpoint.core.LatLon(-41.285, 174.776),
                status = "Updated just now",
                nowMs = 1_000_000_000L,
                onFind = {}, onDirections = { _, _ -> }, onNudge = {}, onBack = {},
                places = listOf(MapPlace("r", "Sound desk", -41.288, 174.777, meetUp = true), MapPlace("t", "Tent", -41.29, 174.77, meetUp = false)),
                inCrew = true,
                liveMap = false,
            )
        }
    }

    private fun moment(key: String, from: String, t: Long, caption: String, top: Int, bottom: Int, mine: Boolean = false) =
        nz.waveformlabs.moshpoint.moments.Moments.Item(key, from, t, -36.85, 174.77, caption, fakePhoto(top, bottom), mine)

    @Test fun crewChat() = snap {
        MoshTheme {
            val t = 1_000_000L
            CrewChatScreen(
                crewName = "Iron Maiden",
                lines = listOf(
                    nz.waveformlabs.moshpoint.chat.CrewChat.Line("Jo", t - 900, "pinned: Sound desk after the encore", false, 12),
                    nz.waveformlabs.moshpoint.chat.CrewChat.Line("Jo", t - 610, "Anyone want a drink?", false),
                    nz.waveformlabs.moshpoint.chat.CrewChat.Line("Jo", t - 600, "Bar's quiet right now", false),
                    nz.waveformlabs.moshpoint.chat.CrewChat.Line("Me", t - 540, "Yes! Cider pls 🙏", true),
                    nz.waveformlabs.moshpoint.chat.CrewChat.Line("Alex", t - 300, "sent a flare: At the rail 🎶", false, 11),
                    nz.waveformlabs.moshpoint.chat.CrewChat.Line("Alex", t - 240, "Left side, by the big speaker", false),
                ),
                plan = nz.waveformlabs.moshpoint.chat.CrewChat.Plan("Sound desk after the encore", "Jo", t - 900),
                flares = listOf(nz.waveformlabs.moshpoint.chat.CrewChat.Flare("Alex", "At the rail 🎶", t + 1560, -36.85, 174.77)),
                myName = "Me",
                nowSec = t,
                meetUp = "Gate C",
                readOnly = false,
                onSend = {}, onSetPlan = {}, onFlare = {}, onEndFlare = {}, onPing = {}, onCheckIn = {},
                onSharePlan = {}, onOpenMap = {}, onBack = {},
                colourOf = { mapOf("Jo" to 0xFFFFB020.toInt(), "Alex" to 0xFFFF2E93.toInt())[it] },
            )
        }
    }

    @Test fun story() = snap {
        MoshTheme {
            StoryScreen(
                items = listOf(
                    moment("a", "Alex", 1_000_000L - 600, "Front row!!", 0xFF2B1B5E.toInt(), 0xFFFF2E93.toInt()),
                    moment("b", "Alex", 1_000_000L - 300, "", 0xFF0B3B4E.toInt(), 0xFF22E4FF.toInt()),
                    moment("c", "Jo", 1_000_000L - 120, "by the left speakers", 0xFF3B2A0B.toInt(), 0xFFFFB020.toInt()),
                    moment("d", "Me", 1_000_000L - 60, "the crew", 0xFF1B3B1B.toInt(), 0xFFB6FF3B.toInt(), mine = true),
                ),
                nowSec = 1_000_000L,
                colourOf = { name -> mapOf("Alex" to 0xFFC86BFF.toInt(), "Jo" to 0xFFFFB020.toInt())[name] },
                onShare = {}, onMap = {}, onBack = {},
            )
        }
    }

    // ---- The home (docs/design/home-redesign, docs/HOME_REDESIGN.md): every state, made-up gigs only. ----

    /** Main artboard: crew tonight, you're live. Faces live first and nearest first; Find everyone; crew chat (3 new). */
    @Test fun homeMain() = snap { MoshTheme { HomeUnderTest() } }

    /** Tonight, but your Live switch is off. */
    @Test fun homeNotLive() = snap { MoshTheme { HomeUnderTest(visible = false) } }

    /** Tonight, live in ghost mode: the switch and its line in violet. */
    @Test fun homeGhost() = snap { MoshTheme { HomeUnderTest(ghost = true) } }

    /** The crew menu (⋯) over the home: once-a-night actions. The panel's contents (a pop-up doesn't render here). */
    @Test fun homeCrewMenu() = snap {
        MoshTheme {
            OverHome({ HomeUnderTest() }) {
                CrewMenuContent(
                    name = "Sam's crew",
                    // Joined as the app joins it (FriendsScreen).
                    subtitle = dotLine(listOf(
                        stringResource(nz.waveformlabs.moshpoint.R.string.home_menu_tonight),
                        pluralStringResource(nz.waveformlabs.moshpoint.R.plurals.home_crew_count, 5, 5),
                    )),
                    onInvite = {}, onFamily = {}, onReset = {},
                    endTitle = stringResource(nz.waveformlabs.moshpoint.R.string.home_end_night),
                    endSub = stringResource(nz.waveformlabs.moshpoint.R.string.home_menu_end_sub),
                    onEnd = {},
                )
            }
        }
    }

    private fun snapNoCrew() = snap {
        MoshTheme {
            HomeUnderTest(
                friends = HomeFixtures.friendsOnly, groupName = null, crewKeys = emptySet(),
                seen = mapOf("rae" to HomeFixtures.seen(30), "sam" to HomeFixtures.seen(50), "alex" to HomeFixtures.seen(100)),
                pings = emptyList(), meetUp = null, chatUnread = 0,
            )
        }
    }

    /** No crew tonight, someone who has used the app before: start one, plan one, join one; Up next, Past gigs, Friends. */
    @Test fun homeNoCrew() = snapNoCrew()

    /** First time: no crew, friends or past gigs. One thing to do. */
    @Test fun homeFirstTime() = snap {
        MoshTheme {
            HomeUnderTest(
                friends = emptyList(), groupName = null, crewKeys = emptySet(), visible = false, seen = emptyMap(),
                pings = emptyList(), meetUp = null, chatUnread = 0, upNext = emptyList(), pastGigs = emptyList(),
            )
        }
    }

    /** A crew for next Saturday, asleep until then: who's in (dimmed), its QR, its chat. */
    @Test fun homeComingUp() = snap {
        MoshTheme {
            HomeUnderTest(
                groupName = "Summer Fields crew", crewKeys = setOf(HomeFixtures.rae.key, HomeFixtures.jo.key),
                friends = HomeFixtures.friendsOnly, seen = emptyMap(), distances = emptyMap(), pings = emptyList(), meetUp = null,
                chatUnread = 2, crewSleeping = true, crewQrPayload = HomeFixtures.QR,
                crewWhen = stringResource(nz.waveformlabs.moshpoint.R.string.main_when_venue, gigWhen(HomeFixtures.SAT_21), "Kauri Fields"),
                upNext = HomeFixtures.upNext().drop(1), pinnedPlan = "Meet at the gate, 6pm",
            )
        }
    }

    // ---- The hype group (docs/DISCOVER_APP.md, HypeGroup.png): a planned crew asleep until the day ----
    // Made-up act, venue and link; Rae and Sam have tickets, Jo and Kai don't yet.

    private fun hypeView(link: Boolean = true, mine: Boolean = false, days: Int = 117) = nz.waveformlabs.moshpoint.ui.home.HypeView(
        days = days, name = "Ivory Tide", venue = "Tidewater Arena, Auckland",
        whenText = nz.waveformlabs.moshpoint.discover.HypeData.whenText(HomeFixtures.MAR_13),
        ticketLink = if (link) "https://tickets.example.com/ivory-tide" else null,
        ticks = mapOf("rae" to true, "sam" to true),
        mine = mine,
        chatFrom = "Sam", chatText = "Barrier or balcony?", chatFace = HomeFixtures.sam,
    )

    private fun snapHype(link: Boolean = true, mine: Boolean = false, days: Int = 117) = snap {
        MoshTheme {
            HomeUnderTest(
                groupName = "Ivory Tide", crewKeys = setOf(HomeFixtures.rae.key, HomeFixtures.sam.key, HomeFixtures.jo.key),
                seen = emptyMap(), distances = emptyMap(), pings = emptyList(), meetUp = null, chatUnread = 3,
                crewSleeping = true, upNext = emptyList(), hype = hypeView(link, mine, days),
            )
        }
    }

    /** The hype group: countdown, the show with Get tickets, who has a ticket, your toggle, chat, Invite mates. */
    @Test fun hypeGroup() = snapHype()

    /** Ticked yourself; a show typed in by hand has no ticket link; tomorrow. */
    @Test fun hypeGroupTicked() = snapHype(link = false, mine = true, days = 1)

    @Test fun smallPhoneHypeGroup() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5))
        snapHype()
    }

    @Test fun largeFontHypeGroup() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.PIXEL_5).copy(fontScale = 1.3f))
        snapHype()
    }

    @Test fun smallPhoneLargeFontHypeGroup() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        snapHype()
    }

    // ---- Plan a gig, free (docs/DISCOVER_APP.md, FreeView.png) ----

    /** A sheet opened all the way over the no-crew home: as tall as its contents, from the top on a small phone (it scrolls there). */
    private fun snapSheet(panel: @androidx.compose.runtime.Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) = snap {
        MoshTheme {
            androidx.compose.foundation.layout.BoxWithConstraints(androidx.compose.ui.Modifier.fillMaxSize()) {
                HomeUnderTest(
                    friends = HomeFixtures.friendsOnly, groupName = null, crewKeys = emptySet(), seen = emptyMap(),
                    pings = emptyList(), meetUp = null, chatUnread = 0,
                )
                androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.fillMaxSize().background(Mosh.Scrim))
                androidx.compose.foundation.layout.Box(
                    androidx.compose.ui.Modifier.align(androidx.compose.ui.Alignment.BottomCenter)
                        .heightIn(max = maxHeight - 32.dp)
                        .verticalScroll(androidx.compose.foundation.rememberScrollState()),
                ) { nz.waveformlabs.moshpoint.ui.home.SheetFrame(content = panel) }
            }
        }
    }

    private fun planForm() = nz.waveformlabs.moshpoint.ui.home.PlanForm(HomeFixtures.MAR_13).apply { name = "Ivory Tide" }

    private fun snapPlanFree() = snapSheet {
        PlanGigContent(planForm(), member = false, search = null, onPick = {}, lookupVenue = null, onWhatsPlus = {})
    }

    /** Plan a gig for a free user: who's playing, the date and time, the venue, Start the crew, then the quiet Moshpoint+ card. */
    @Test fun planGigFree() = snapPlanFree()

    @Test fun smallPhonePlanGigFree() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5))
        snapPlanFree()
    }

    @Test fun largeFontPlanGigFree() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.PIXEL_5).copy(fontScale = 1.3f))
        snapPlanFree()
    }

    /** "What's in Moshpoint+": what it adds, and that it can't be bought yet. */
    @Test fun plusInfo() = snapSheet { PlusInfoContent(onBack = {}) }

    @Test fun smallPhoneLargeFontPlusInfo() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        snapSheet { PlusInfoContent(onBack = {}) }
    }

    /** Following from home: where they are (at the venue / how far from it), the latest alerts, the story, the map. */
    @Test fun homeFollowing() = snap {
        MoshTheme {
            HomeUnderTest(
                friends = listOf(HomeFixtures.mate("rae", "Rae", 0xFFB6FF3B, gig = true), HomeFixtures.mate("jo", "Jo", 0xFFFFB020, gig = true), HomeFixtures.mate("kai", "Kai", 0xFF5EF2C2, gig = true)),
                groupName = "Rae's crew", crewKeys = emptySet(), myName = "Mum", following = true, distances = emptyMap(),
                tileNotes = mapOf(
                    "rae" to stringResource(nz.waveformlabs.moshpoint.R.string.crew_at_venue),
                    "jo" to stringResource(nz.waveformlabs.moshpoint.R.string.crew_from_venue, distanceLabel(1200.0)),
                ),
                pings = listOf(
                    HomeFixtures.ping(nz.waveformlabs.moshpoint.core.GigGroup.Ping.ALL_GOOD, "Rae", 300),
                    HomeFixtures.ping(nz.waveformlabs.moshpoint.core.GigGroup.Ping.COMING, "Jo", 720),
                ),
                meetUp = null, chatUnread = 1, upNext = emptyList(), pastGigs = emptyList(),
                crewWhen = stringResource(nz.waveformlabs.moshpoint.R.string.main_when_venue, gigWhen(HomeFixtures.NOW), "The Boatshed"),
            )
        }
    }

    /** A crew nobody has joined yet: the QR right on the home. */
    @Test fun homeNobodyYet() = snap {
        MoshTheme {
            HomeUnderTest(
                friends = HomeFixtures.friendsOnly, groupName = "Josh's crew", crewKeys = emptySet(), seen = emptyMap(),
                pings = emptyList(), meetUp = null, chatUnread = 0, crewQrPayload = HomeFixtures.QR,
            )
        }
    }

    /** A long crew name: it wraps (up to three lines) and the ⋯ stays put. */
    @Test fun homeLongName() = snap { MoshTheme { HomeUnderTest(groupName = "The Midnight Lantern Parade After-Party Crew") } }

    /** One mate in the crew: "Find Kai". */
    @Test fun homeOneMate() = snap {
        MoshTheme {
            HomeUnderTest(
                friends = HomeFixtures.friendsOnly + HomeFixtures.kai, crewKeys = emptySet(),
                seen = mapOf("kai" to HomeFixtures.seen(30, battery = 15)), distances = mapOf("kai" to 15.0), groupName = "Kai's crew",
            )
        }
    }

    /** A crew of eight: the faces run off the edge; a flare, a private message, a dying phone, a low battery. */
    @Test fun homeBigCrew() = snap {
        val names = listOf("Ana", "Ben", "Cleo", "Dev", "Eli", "Fin", "Gus", "Hana")
        val colours = listOf(0xFFFF2E93, 0xFF22E4FF, 0xFFB6FF3B, 0xFFFFB020, 0xFF9D5CFF, 0xFFFF6FB3, 0xFF7CF0FF, 0xFFFFE066)
        val eight = names.mapIndexed { i, n -> HomeFixtures.mate("b$i", n, colours[i], gig = true) }
        MoshTheme {
            HomeUnderTest(
                friends = eight + HomeFixtures.liv + HomeFixtures.ben, crewKeys = emptySet(), groupName = "Laneway Sunset crew",
                seen = mapOf(
                    "b0" to HomeFixtures.seen(10), "b1" to HomeFixtures.seen(30, battery = 9), "b2" to HomeFixtures.seen(60),
                    "b3" to HomeFixtures.seen(90), "b4" to HomeFixtures.seen(400),
                    "b5" to nz.waveformlabs.moshpoint.map.LocationBook.Seen(-36.85, 174.76, HomeFixtures.NOW - 1200, 10, batteryPct = 4, lastGasp = true),
                ),
                distances = mapOf("b0" to 6.0, "b1" to 35.0, "b2" to 85.0, "b3" to 1450.0),
                flareNotes = mapOf("b1" to "🔥 " + stringResource(nz.waveformlabs.moshpoint.R.string.crew_vibe_bar)),
                privateUnread = mapOf("b2" to 2),
            )
        }
    }

    /** Friends → See all: every friend with a ⋯ that's always there (remove included). */
    @Test fun homeFriendsList() = snap {
        MoshTheme {
            OverHome({ HomeUnderTest(friends = HomeFixtures.friendsOnly, groupName = null, crewKeys = emptySet(), pings = emptyList(), meetUp = null) }) {
                FriendsListContent(HomeFixtures.friendsOnly, mapOf("rae" to HomeFixtures.seen(30), "sam" to HomeFixtures.seen(1500)), HomeFixtures.NOW, onFind = {}, onOptions = {})
            }
        }
    }

    /** The + (Add) panel, restyled. */
    @Test fun homeAddSheet() = snap {
        MoshTheme {
            OverHome({ HomeUnderTest() }) {
                AddSheetContent(
                    inCrew = true, onShowCrewQr = {}, onScanQr = {}, onShareApp = {}, onPasteInvite = {},
                    onShowMyQr = {}, onEnterCode = {}, onBump = {}, onPlanGig = {},
                )
            }
        }
    }

    /** Up next rows: date tiles, a long name, a pinned plan, unread messages, a crew with no date, following from home. */
    @Test fun upNext() = snap {
        MoshTheme {
            androidx.compose.foundation.layout.Column(androidx.compose.ui.Modifier.background(Mosh.Ground).padding(vertical = 16.dp)) {
                SectionTitle(stringResource(nz.waveformlabs.moshpoint.R.string.home_section_up_next))
                HomeDivider()
                (
                    HomeFixtures.upNext() + listOf(
                        UpNextCard("long", "The Midnight Lantern Parade After-Party Crew", null, null, "", 12, 12, null, false, HomeFixtures.JAN_16),
                        UpNextCard("nodate", "Backyard Session crew", null, null, "Jo's place", 1, 0, null, false, 0L),
                        UpNextCard("follow", "Rae's crew", gigWhen(HomeFixtures.SAT_21), countdown(HomeFixtures.SAT_21, HomeFixtures.NOW), "Dock 4", 5, 0, null, true, HomeFixtures.SAT_21),
                    )
                ).forEach { card ->
                    UpNextRow(card) {}
                    HomeDivider()
                }
            }
        }
    }

    /** A 360 dp phone: the side-by-side buttons and the header still fit. */
    @Test fun smallPhoneHomeMain() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5))
        snap { MoshTheme { HomeUnderTest() } }
    }

    @Test fun smallPhoneHomeNoCrew() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5))
        snapNoCrew()
    }

    /** Large text (font size 130%): everything grows instead of clipping; the wordmark stays the same size. */
    @Test fun largeFontHomeMain() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.PIXEL_5).copy(fontScale = 1.3f))
        snap { MoshTheme { HomeUnderTest() } }
    }

    @Test fun largeFontHomeNoCrew() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.PIXEL_5).copy(fontScale = 1.3f))
        snapNoCrew()
    }

    /** A small phone with a large font: Need help takes its own row when it must, bar labels wrap. */
    @Test fun smallPhoneLargeFontHomeMain() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        snap { MoshTheme { HomeUnderTest() } }
    }

    @Test fun smallPhoneLargeFontHomeNoCrew() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        snapNoCrew()
    }

    /** The largest font setting (200%), in English, German, Polish and Japanese only. */
    @Test fun hugeFontHomeMain() {
        org.junit.Assume.assumeTrue(lang == null || lang in listOf("de", "pl", "ja"))
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.PIXEL_5).copy(fontScale = 2.0f))
        snap { MoshTheme { HomeUnderTest() } }
    }

    // ---- Need help: the crew alert says what the outbox knows (docs/WAVE2_SAFETY.md) ----
    // The dialog's contents, drawn in a frame like the dialog's (a dialog window can't be drawn here).

    private val mum = nz.waveformlabs.moshpoint.safety.Safety.Contact("Mum", "+64211234567")
    private val nz111 = listOf(nz.waveformlabs.moshpoint.safety.EmergencyNumbers.Number("111", nz.waveformlabs.moshpoint.safety.EmergencyNumbers.Kind.ALL))

    private fun help(
        outcome: nz.waveformlabs.moshpoint.core.watch.PingOutcome?,
        wait: nz.waveformlabs.moshpoint.core.HelpRules.Wait? = null,
        textFailed: Boolean = false,
        callFailed: String? = null,
        withLocation: Boolean = true,
    ) = snap {
        MoshTheme {
            DialogFrame(stringResource(nz.waveformlabs.moshpoint.R.string.crew_help_title), stringResource(nz.waveformlabs.moshpoint.R.string.crew_close)) {
                nz.waveformlabs.moshpoint.ui.chat.HelpBody(
                    crewAlert = nz.waveformlabs.moshpoint.ui.chat.CrewAlertUi(outcome, wait, withLocation),
                    onAlertCrew = {}, onGoLive = {}, contact = mum, onText = {}, textFailed = textFailed,
                    onSaveContact = { _, _ -> }, numbers = nz111, onCall = {}, callFailed = callFailed,
                )
            }
        }
    }

    /** Before the tap: "Alert my crew", the contact to text, and the local emergency number. */
    @Test fun helpBeforeAlert() = help(null)

    /** First try under way (there's signal). */
    @Test fun helpSending() = help(nz.waveformlabs.moshpoint.core.watch.PingOutcome.UNCONFIRMED)

    /** No signal and not live: "Not sent yet", Go live, and texting or calling pointed at. */
    @Test fun helpNotSentYet() = help(nz.waveformlabs.moshpoint.core.watch.PingOutcome.WAITING, nz.waveformlabs.moshpoint.core.HelpRules.Wait.GO_LIVE)

    @Test fun helpSentNearby() = help(nz.waveformlabs.moshpoint.core.watch.PingOutcome.SENT_NEARBY)

    @Test fun helpSent() = help(nz.waveformlabs.moshpoint.core.watch.PingOutcome.SENT)

    /** Nobody has it (the outbox refused it), and this phone can neither text nor call: each says so where its button is. */
    @Test fun helpNotSent() = help(nz.waveformlabs.moshpoint.core.watch.PingOutcome.FAILED, textFailed = true, callFailed = "111")

    /** Sent, but this phone had no location to add: it doesn't claim "with where you are". */
    @Test fun helpSentNoLocation() = help(nz.waveformlabs.moshpoint.core.watch.PingOutcome.SENT, withLocation = false)

    /** Every reason "Not sent yet" can give, one under another. */
    @Test fun helpWaitReasons() = snap {
        MoshTheme {
            androidx.compose.foundation.layout.Column(
                androidx.compose.ui.Modifier.background(Mosh.Ground).padding(16.dp),
                verticalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(10.dp),
            ) {
                nz.waveformlabs.moshpoint.core.HelpRules.Wait.entries.forEach { w ->
                    nz.waveformlabs.moshpoint.ui.chat.CrewAlertRow(
                        nz.waveformlabs.moshpoint.ui.chat.CrewAlertUi(nz.waveformlabs.moshpoint.core.watch.PingOutcome.WAITING, w), {}, {},
                    )
                }
            }
        }
    }

    /** A small phone with a large font: the longest state still fits, nothing clipped. */
    @Test fun smallPhoneLargeFontHelpNotSentYet() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        help(nz.waveformlabs.moshpoint.core.watch.PingOutcome.WAITING, nz.waveformlabs.moshpoint.core.HelpRules.Wait.GO_LIVE)
    }

    // ---- The app's own notices: Live stopped, "Still at the gig?", storage full ----

    private fun notice(kind: nz.waveformlabs.moshpoint.safety.Notices.Kind) = snap {
        MoshTheme {
            androidx.compose.foundation.layout.Box(
                androidx.compose.ui.Modifier.fillMaxSize().background(Mosh.Ground).padding(24.dp),
                contentAlignment = androidx.compose.ui.Alignment.Center,
            ) { nz.waveformlabs.moshpoint.ui.settings.NoticeCard(kind) }
        }
    }

    @Test fun noticeNoLongerLive() = notice(nz.waveformlabs.moshpoint.safety.Notices.Kind.LIVE_CANT_START)

    @Test fun noticeStillAtTheGig() = notice(nz.waveformlabs.moshpoint.safety.Notices.Kind.LIVE_TOO_LONG)

    @Test fun noticeStorageFull() = notice(nz.waveformlabs.moshpoint.safety.Notices.Kind.STORAGE_FULL)

    /** Live went off while the main crew is still on (now for a later date, or followed from home). */
    @Test fun noticeCrewNotOn() = notice(nz.waveformlabs.moshpoint.safety.Notices.Kind.LIVE_CREW_NOT_ON)

    @Test fun smallPhoneLargeFontNoticeNoLongerLive() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        notice(nz.waveformlabs.moshpoint.safety.Notices.Kind.LIVE_CANT_START)
    }

    /** A dialog's frame (as the dialog draws it): title, contents (scrolling when they're too tall), and its Close button. */
    @androidx.compose.runtime.Composable
    private fun DialogFrame(title: String, close: String, content: @androidx.compose.runtime.Composable () -> Unit) {
        androidx.compose.foundation.layout.Box(
            androidx.compose.ui.Modifier.fillMaxSize().background(Mosh.Ground).padding(horizontal = 24.dp, vertical = 16.dp),
            contentAlignment = androidx.compose.ui.Alignment.Center,
        ) {
            androidx.compose.foundation.layout.Column(
                androidx.compose.ui.Modifier.fillMaxWidth().background(Mosh.Deep, androidx.compose.foundation.shape.RoundedCornerShape(28.dp))
                    .padding(24.dp),
            ) {
                androidx.compose.material3.Text(title, style = Mosh.Heading)
                androidx.compose.foundation.layout.Spacer(androidx.compose.ui.Modifier.height(16.dp))
                // As the dialog lays out its text: no more than the room left, so the button stays on screen.
                androidx.compose.foundation.layout.Box(androidx.compose.ui.Modifier.weight(1f, fill = false)) { content() }
                androidx.compose.foundation.layout.Spacer(androidx.compose.ui.Modifier.height(12.dp))
                androidx.compose.foundation.layout.Row(
                    androidx.compose.ui.Modifier.fillMaxWidth(),
                    horizontalArrangement = androidx.compose.foundation.layout.Arrangement.End,
                ) {
                    androidx.compose.material3.TextButton(onClick = {}) { androidx.compose.material3.Text(close, style = Mosh.Label) }
                }
            }
        }
    }

    // ---- Block (docs/REPORT_BLOCK.md) ----

    /** Holding someone's message, or their photo's "Block": the menu (Report joins it later). */
    @Test fun moderationMenu() = dialog {
        PersonMenuContent("Jo", blocked = false, onBlock = {}, onUnblock = {}, onClose = {})
    }

    /** "Block Jo?": what it does; the crew's maker is offered removal too. */
    @Test fun blockConfirm() = dialog {
        BlockConfirmContent("Jo", canRemove = true, onBlock = {}, onRemove = {}, onCancel = {})
    }

    @Test fun smallPhoneLargeFontBlockConfirm() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        blockConfirm()
    }

    private val blockedSample = listOf(
        nz.waveformlabs.moshpoint.core.Blocked(1L, "", "Jo", "c1", "Laneway crew", 2),
        nz.waveformlabs.moshpoint.core.Blocked(2L, "", "Bevan Featherstonehaugh", "c2", "The Midnight Lantern Parade After-Party Crew", 1),
    )

    /** Settings → Blocked people, with Unblock. */
    @Test fun blockedPeople() = dialog {
        BlockedPeopleContent(blockedSample, onUnblock = {}, onClose = {})
    }

    @Test fun smallPhoneLargeFontBlockedPeople() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        blockedPeople()
    }

    /** Settings → Blocked people when nobody is: how to block someone. */
    @Test fun blockedPeopleEmpty() = dialog {
        BlockedPeopleContent(emptyList(), onUnblock = {}, onClose = {})
    }

    // ---- Report (docs/REPORT_BLOCK.md) ----

    private val reportReasons: List<String> @androidx.compose.runtime.Composable get() = listOf(
        nz.waveformlabs.moshpoint.R.string.mod_reason_harassment, nz.waveformlabs.moshpoint.R.string.mod_reason_hate,
        nz.waveformlabs.moshpoint.R.string.mod_reason_sexual, nz.waveformlabs.moshpoint.R.string.mod_reason_violence,
        nz.waveformlabs.moshpoint.R.string.mod_reason_spam, nz.waveformlabs.moshpoint.R.string.mod_reason_other,
    ).map { stringResource(it) }

    /** Holding someone's message: Report, then Block. */
    @Test fun moderationMenuWithReport() = dialog {
        PersonMenuContent("Jo", blocked = false, onBlock = {}, onUnblock = {}, onClose = {}, reportLabel = stringResource(nz.waveformlabs.moshpoint.R.string.mod_report_message))
    }

    /** Reporting a message: a reason picked, what the phone sends, and "Also block". */
    @Test fun reportSheet() = dialog {
        ReportContent(
            title = stringResource(nz.waveformlabs.moshpoint.R.string.mod_report_message), name = "Jo",
            sends = stringResource(nz.waveformlabs.moshpoint.R.string.mod_report_sends_message),
            reasons = reportReasons, reason = 3, onReason = {}, note = "", onNote = {},
            blockToo = true, onBlockToo = {}, sending = false, onSend = {}, onCancel = {},
        )
    }

    @Test fun smallPhoneLargeFontReportSheet() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        reportSheet()
    }

    /** Reporting a clip: nothing picked yet, so Send waits. */
    @Test fun reportSheetClip() = dialog {
        ReportContent(
            title = stringResource(nz.waveformlabs.moshpoint.R.string.mod_report_clip), name = "Jo",
            sends = stringResource(nz.waveformlabs.moshpoint.R.string.mod_report_sends_clip),
            reasons = reportReasons, reason = null, onReason = {}, note = "", onNote = {},
            blockToo = null, onBlockToo = {}, sending = false, onSend = {}, onCancel = {},
        )
    }

    // ---- Community rules (docs/REPORT_BLOCK.md) ----

    /** "Before you post": once, before the first chat message, photo, clip or private message. */
    @Test fun communityRules() = dialog { CommunityRulesContent({}, {}, {}) }

    @Test fun smallPhoneLargeFontCommunityRules() {
        paparazzi.unsafeUpdateConfig(deviceConfig = device(DeviceConfig.NEXUS_5).copy(fontScale = 1.3f))
        communityRules()
    }

    /** Right-to-left set on Compose itself: the renderer's own setting doesn't reach every screen. */
    private fun snap(content: @androidx.compose.runtime.Composable () -> Unit) = paparazzi.snapshot {
        androidx.compose.runtime.CompositionLocalProvider(
            androidx.compose.ui.platform.LocalLayoutDirection provides
                if (rtl) androidx.compose.ui.unit.LayoutDirection.Rtl else androidx.compose.ui.unit.LayoutDirection.Ltr,
        ) { content() }
    }
}

/*
 * Every screen again in every language the app ships, to catch clipped or crowded text:
 * long words (German, Finnish-style compounds), right-to-left (Arabic), CJK and Thai scripts,
 * and US units. CI files them as <lang>-<test>.png and publishes the full set to the
 * ui-screenshots branch.
 */
class Lang_es : ScreensSnapshotTest() {
    override val lang get() = "es"
}

// Paparazzi renders this one with values-es, not values-es-rES (as "es-rES" or "b+es+ES"),
// so these screenshots show the plain Spanish: see docs/HOME_REDESIGN.md, section 3.
class Lang_es_rES : ScreensSnapshotTest() {
    override val lang get() = "es-rES"
}

class Lang_pt : ScreensSnapshotTest() {
    override val lang get() = "pt-rBR"
}

class Lang_fr : ScreensSnapshotTest() {
    override val lang get() = "fr"
}

class Lang_de : ScreensSnapshotTest() {
    override val lang get() = "de"

    /** Guard: the translations really load (otherwise these screenshots would be English). */
    @Test fun translationsLoad() = kotlin.test.assertEquals("Alle finden", paparazzi.context.getString(nz.waveformlabs.moshpoint.R.string.home_find_everyone))
}

class Lang_it : ScreensSnapshotTest() {
    override val lang get() = "it"
}

class Lang_nl : ScreensSnapshotTest() {
    override val lang get() = "nl"
}

class Lang_sv : ScreensSnapshotTest() {
    override val lang get() = "sv"
}

class Lang_pl : ScreensSnapshotTest() {
    override val lang get() = "pl"
}

class Lang_tr : ScreensSnapshotTest() {
    override val lang get() = "tr"
}

class Lang_ar : ScreensSnapshotTest() {
    override val lang get() = "ar"
    override val rtl get() = true
}

class Lang_hi : ScreensSnapshotTest() {
    override val lang get() = "hi"
}

class Lang_th : ScreensSnapshotTest() {
    override val lang get() = "th"
}

class Lang_vi : ScreensSnapshotTest() {
    override val lang get() = "vi"
}

class Lang_in : ScreensSnapshotTest() {
    override val lang get() = "in"
}

class Lang_ja : ScreensSnapshotTest() {
    override val lang get() = "ja"
}

class Lang_ko : ScreensSnapshotTest() {
    override val lang get() = "ko"
}

class Lang_zh_rCN : ScreensSnapshotTest() {
    override val lang get() = "zh-rCN"
}

class Lang_zh_rTW : ScreensSnapshotTest() {
    override val lang get() = "zh-rTW"
}

class Lang_en_rUS : ScreensSnapshotTest() {
    override val lang get() = "en-rUS"
}
