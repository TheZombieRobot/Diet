package nz.waveformlabs.moshpoint.ui

import app.cash.paparazzi.DeviceConfig
import app.cash.paparazzi.Paparazzi
import androidx.compose.foundation.background
import androidx.compose.ui.graphics.asImageBitmap
import nz.waveformlabs.moshpoint.Friend
import nz.waveformlabs.moshpoint.core.ArrowState
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import org.junit.Rule
import org.junit.Test

/**
 * Renders every main screen to a PNG on the JVM (no phone needed), so the neon UI can be
 * reviewed visually. CI uploads them as the `screenshots` artifact.
 *
 *   ./gradlew :app:recordPaparazziDebug   -> app/src/test/snapshots/images/
 */
class ScreensSnapshotTest {
    @get:Rule
    val paparazzi = Paparazzi(deviceConfig = DeviceConfig.PIXEL_5, theme = "android:Theme.Material.NoActionBar")

    private fun friend(id: String, name: String, colour: Long, gig: Boolean = false) =
        Friend(FriendRecord(id, name, colour.toInt(), ByteArray(32) { it.toByte() }, gig, 0L))

    private val sam = friend("sam", "Sam", 0xFF22E4FF)
    private val alex = friend("alex", "Alex", 0xFFC86BFF, gig = true)
    private val jo = friend("jo", "Jo", 0xFFFFB020, gig = true)
    private val mia = friend("mia", "Mia", 0xFFB6FF3B)
    private val all = listOf(sam, alex, jo, mia).associateBy { it.id }

    private fun finder(title: String, arrows: List<ArrowState>, scan: LocatorEngine.ScanUi? = null) = paparazzi.snapshot {
        MoshTheme {
            FinderScreen(
                title = title, visible = true, arrows = arrows, friendOf = { all[it] }, scan = scan,
                onScan = {}, onCancelScan = {}, onDismissScan = {}, onBack = {},
            )
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

    @Test fun finderScanning() = finder(
        "Jo", listOf(ArrowState.DistanceOnly("jo", 9.0, Trend.STEADY, Method.BLE_RSSI)),
        LocatorEngine.ScanUi(250.0, done = false, sectors = BooleanArray(36) { it < 25 }, headingDeg = 0.0),
    )

    @Test fun finderFound() = finder("Sam", listOf(ArrowState.Pointing("sam", 10.0, 2.0, Method.UWB, false)))

    @Test fun home() = paparazzi.snapshot {
        MoshTheme {
            FriendsScreen(
                friends = listOf(alex, jo, sam, mia), visible = true, alwaysOn = false,
                phoneSummary = "This phone: UWB, Wi-Fi Aware, Bluetooth, compass, GPS",
                myName = "Josh", onMyName = {}, missingPermissions = emptyList(), onFixPermissions = {},
                onVisible = {}, onAlwaysOn = {}, onFind = {}, onShareCode = {}, onShowQr = {}, onScanQr = {},
                scanned = null, onScannedUsed = {}, onAdd = { _, _, _ -> null }, onRemove = {},
                onSetPhoto = {}, onRemovePhoto = {}, onClearGigGroup = {},
                groupName = "Foo Fighters night", onStartGroup = {}, onShowGroupQr = {},
                meetUp = "Sound desk",
                seen = mapOf(
                    "alex" to nz.waveformlabs.moshpoint.LocationBook.Seen(-41.29, 174.78, 1_000_000L - 30, 10, batteryPct = 64),
                    "jo" to nz.waveformlabs.moshpoint.LocationBook.Seen(-41.29, 174.78, 1_000_000L - 900, 10, batteryPct = 8),
                ),
                nowSec = 1_000_000L,
                pings = listOf(nz.waveformlabs.moshpoint.core.GigGroup.Ping(nz.waveformlabs.moshpoint.core.GigGroup.Ping.COMING, "Alex", 1_000_000L - 120)),
                describePing = { "is on their way" },
            )
        }
    }

    @Test fun homeHiddenNoGroup() = paparazzi.snapshot {
        MoshTheme {
            FriendsScreen(
                friends = listOf(sam), visible = false, alwaysOn = false,
                phoneSummary = "This phone: Bluetooth, compass, GPS",
                myName = "", onMyName = {}, missingPermissions = listOf("Location: GPS arrow and Bluetooth/Wi-Fi distance"),
                setupIssues = listOf(
                    SetupIssue("Bluetooth is off. Nobody can find you, and you can't find them, without it.", "Turn on") {},
                    SetupIssue("Location is off. GPS finding needs it, and many phones need it for Bluetooth finding too.", "Turn on") {},
                ),
                onFixPermissions = {}, onVisible = {}, onAlwaysOn = {}, onFind = {}, onShareCode = {}, onShowQr = {},
                onScanQr = {}, scanned = null, onScannedUsed = {}, onAdd = { _, _, _ -> null }, onRemove = {},
                onSetPhoto = {}, onRemovePhoto = {}, onClearGigGroup = {},
                groupName = null, onStartGroup = {}, onShowGroupQr = {},
                pastGigs = listOf(
                    nz.waveformlabs.moshpoint.GigArchive.Summary("a", "Iron Maiden", 1_765_000_000L, "Spark Arena, Auckland", 23, 4, listOf("You", "Bevan", "Jo"), null, 0L),
                    nz.waveformlabs.moshpoint.GigArchive.Summary("b", "Foo Fighters", 1_760_000_000L, "Eden Park", 9, 1, listOf("You", "Alex"), null, 0L),
                ),
            )
        }
    }

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
        nz.waveformlabs.moshpoint.PhotoStore.photos["sam"] = fakePhoto(0xFF1E3A8A.toInt(), 0xFF22E4FF.toInt())
        nz.waveformlabs.moshpoint.PhotoStore.photos["alex"] = fakePhoto(0xFF4C1D95.toInt(), 0xFFC86BFF.toInt())
        nz.waveformlabs.moshpoint.PhotoStore.photos["jo"] = fakePhoto(0xFF7C2D12.toInt(), 0xFFFFB020.toInt())
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
            nz.waveformlabs.moshpoint.PhotoStore.photos.clear()
        }
    }

    @Test fun welcome() = paparazzi.snapshot {
        MoshTheme { OnboardingScreen(name = "", onName = {}, onAskPermissions = {}, onDone = {}) }
    }

    private fun settings() = paparazzi.snapshot {
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
        paparazzi.unsafeUpdateConfig(deviceConfig = DeviceConfig.NEXUS_5)
        settings()
    }

    @Test fun smallPhoneOneFriend() {
        // 360dp-wide class phone: checks the arrow + photo stay on screen.
        paparazzi.unsafeUpdateConfig(deviceConfig = DeviceConfig.NEXUS_5)
        finder("Sam", listOf(ArrowState.Pointing("sam", 90.0, 12.0, Method.UWB, false)))
    }

    @Test fun mapScreen() = paparazzi.snapshot {
        MoshTheme {
            MapScreen(
                people = listOf(sam, alex, jo, mia),
                seen = mapOf(
                    "sam" to nz.waveformlabs.moshpoint.LocationBook.Seen(-41.29, 174.78, 1_000_000L - 30, 10),
                    "alex" to nz.waveformlabs.moshpoint.LocationBook.Seen(-41.30, 174.80, 1_000_000L - 1_500, 20),
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

    @Test fun homePlannedGigAsleep() = paparazzi.snapshot {
        MoshTheme {
            FriendsScreen(
                friends = listOf(alex), visible = false, alwaysOn = false, phoneSummary = "",
                myName = "King Zipper", onMyName = {}, missingPermissions = emptyList(), onFixPermissions = {},
                onVisible = {}, onAlwaysOn = {}, onFind = {}, onShareCode = {}, onShowQr = {}, onScanQr = {},
                scanned = null, onScannedUsed = {}, onAdd = { _, _, _ -> null }, onRemove = {},
                onSetPhoto = {}, onRemovePhoto = {}, onClearGigGroup = {},
                groupName = "Iron Maiden", onStartGroup = {}, onShowGroupQr = {},
                crewWhen = "Sat 14 Dec, 8:00 pm · Spark Arena, Auckland",
                crewSleeping = true,
                onOpenChat = {},
                chatUnread = 2,
                crewQrPayload = "moshpoint:group?key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&at=1800000000&name=Iron+Maiden",
            )
        }
    }

    private fun moment(key: String, from: String, t: Long, caption: String, top: Int, bottom: Int, mine: Boolean = false) =
        nz.waveformlabs.moshpoint.Moments.Item(key, from, t, -36.85, 174.77, caption, fakePhoto(top, bottom), mine)

    @Test fun crewChat() = paparazzi.snapshot {
        MoshTheme {
            val t = 1_000_000L
            CrewChatScreen(
                crewName = "Iron Maiden",
                lines = listOf(
                    nz.waveformlabs.moshpoint.CrewChat.Line("Jo", t - 900, "pinned: Sound desk after the encore", false, 12),
                    nz.waveformlabs.moshpoint.CrewChat.Line("Jo", t - 610, "Anyone want a drink?", false),
                    nz.waveformlabs.moshpoint.CrewChat.Line("Jo", t - 600, "Bar's quiet right now", false),
                    nz.waveformlabs.moshpoint.CrewChat.Line("Me", t - 540, "Yes! Cider pls 🙏", true),
                    nz.waveformlabs.moshpoint.CrewChat.Line("Alex", t - 300, "sent a flare: At the rail 🎶", false, 11),
                    nz.waveformlabs.moshpoint.CrewChat.Line("Alex", t - 240, "Left side, by the big speaker", false),
                ),
                plan = nz.waveformlabs.moshpoint.CrewChat.Plan("Sound desk after the encore", "Jo", t - 900),
                flares = listOf(nz.waveformlabs.moshpoint.CrewChat.Flare("Alex", "At the rail 🎶", t + 1560, -36.85, 174.77)),
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

    @Test fun story() = paparazzi.snapshot {
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

    @Test fun homeFollowing() = paparazzi.snapshot {
        MoshTheme {
            FriendsScreen(
                friends = listOf(alex, jo), visible = false, alwaysOn = false, phoneSummary = "",
                myName = "Mum", onMyName = {}, missingPermissions = emptyList(), onFixPermissions = {},
                onVisible = {}, onAlwaysOn = {}, onFind = {}, onShareCode = {}, onShowQr = {}, onScanQr = {},
                scanned = null, onScannedUsed = {}, onAdd = { _, _, _ -> null }, onRemove = {},
                onSetPhoto = {}, onRemovePhoto = {}, onClearGigGroup = {},
                groupName = "Iron Maiden", onStartGroup = {}, onShowGroupQr = {},
                crewWhen = "Sat 14 Dec, 8:00 pm · Spark Arena, Auckland",
                following = true,
                tileNotes = mapOf("alex" to "at the venue", "jo" to "1.2 km from the venue"),
                pings = listOf(nz.waveformlabs.moshpoint.core.GigGroup.Ping(nz.waveformlabs.moshpoint.core.GigGroup.Ping.ALL_GOOD, "Alex", 1_000_000L - 300)),
                nowSec = 1_000_000L,
                describePing = { "is all good" },
            )
        }
    }
}
