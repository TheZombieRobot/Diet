package nz.waveformlabs.moshpoint

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.lifecycleScope
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.service.VisibilityService
import nz.waveformlabs.moshpoint.ui.FinderScreen
import nz.waveformlabs.moshpoint.ui.FriendsScreen

class MainActivity : ComponentActivity() {
    private lateinit var engine: LocatorEngine
    private var visible by mutableStateOf(false)
    private var alwaysOn by mutableStateOf(false)
    private var finding by mutableStateOf(false)

    private val permissions = buildList {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            add(Manifest.permission.BLUETOOTH_SCAN)
            add(Manifest.permission.BLUETOOTH_ADVERTISE)
            add(Manifest.permission.BLUETOOTH_CONNECT)
            add(Manifest.permission.UWB_RANGING)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            add(Manifest.permission.POST_NOTIFICATIONS)
            add(Manifest.permission.NEARBY_WIFI_DEVICES)
        }
    }.toTypedArray()

    private val askPermissions = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        // TODO: explain what each permission is for and handle "denied" gracefully.
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        FriendsRepository.init(this)
        val mySecret = VisibilityPrefs.mySecret(this)
        engine = LocatorEngine(applicationContext, lifecycleScope, mySecret)
        visible = VisibilityPrefs.isVisible(this)
        alwaysOn = VisibilityPrefs.alwaysOn(this)
        askPermissions.launch(permissions)
        val myCode = FriendRecord.shareCode(mySecret)
        val caps = engine.capabilities
        val phoneSummary = "This phone: " + listOfNotNull(
            "UWB".takeIf { caps.uwb },
            "Wi-Fi Aware".takeIf { caps.wifiAware },
            "Bluetooth".takeIf { caps.ble },
            "compass".takeIf { caps.compass },
            "GPS".takeIf { caps.gps },
        ).joinToString(", ")

        setContent {
            MaterialTheme(colorScheme = darkColorScheme()) {
                Box(Modifier.fillMaxSize().background(Color.Black).safeDrawingPadding()) {
                    if (finding) {
                        val arrows by engine.arrows.collectAsState()
                        val scan by engine.scan.collectAsState()
                        FinderScreen(
                            arrows = arrows,
                            friendOf = FriendsRepository::byId,
                            scan = scan,
                            onScan = engine::startSpinScan,
                            onCancelScan = engine::cancelSpinScan,
                            onBack = {
                                finding = false
                                engine.stop()
                            },
                        )
                    } else {
                        FriendsScreen(
                            friends = FriendsRepository.friends,
                            visible = visible,
                            alwaysOn = alwaysOn,
                            phoneSummary = phoneSummary,
                            onVisible = ::setVisibility,
                            onAlwaysOn = {
                                alwaysOn = it
                                VisibilityPrefs.setAlwaysOn(this@MainActivity, it)
                            },
                            onFind = { ids ->
                                engine.track(ids)
                                engine.start()
                                finding = true
                            },
                            onShareCode = { shareCode(myCode) },
                            onAdd = { name, code, gig -> FriendsRepository.add(name, code, gig, mySecret) },
                            onRemove = FriendsRepository::remove,
                            onClearGigGroup = FriendsRepository::clearGigGroup,
                        )
                    }
                }
            }
        }
    }

    private fun setVisibility(on: Boolean) {
        if (on && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED
        ) {
            askPermissions.launch(permissions)
            return
        }
        visible = on
        if (on) VisibilityService.start(this) else VisibilityService.stop(this)
    }

    private fun shareCode(code: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "Add me on Moshpoint: $code")
        }
        startActivity(Intent.createChooser(send, "Share your Moshpoint code"))
    }

    override fun onStop() {
        super.onStop()
        engine.stop() // finding only runs while the screen is open; visibility keeps going in the service
    }

    override fun onStart() {
        super.onStart()
        if (finding) engine.start()
    }
}
