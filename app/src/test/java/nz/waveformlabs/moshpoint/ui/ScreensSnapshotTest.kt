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
            )
        }
    }

    @Test fun homeHiddenNoGroup() = paparazzi.snapshot {
        MoshTheme {
            FriendsScreen(
                friends = listOf(sam), visible = false, alwaysOn = false,
                phoneSummary = "This phone: Bluetooth, compass, GPS",
                myName = "", onMyName = {}, missingPermissions = listOf("Location: GPS arrow and Bluetooth/Wi-Fi distance"),
                onFixPermissions = {}, onVisible = {}, onAlwaysOn = {}, onFind = {}, onShareCode = {}, onShowQr = {},
                onScanQr = {}, scanned = null, onScannedUsed = {}, onAdd = { _, _, _ -> null }, onRemove = {},
                onSetPhoto = {}, onRemovePhoto = {}, onClearGigGroup = {},
                groupName = null, onStartGroup = {}, onShowGroupQr = {},
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
}
