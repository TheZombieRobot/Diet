package nz.waveformlabs.moshpoint

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.util.Base64
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
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.service.VisibilityService
import nz.waveformlabs.moshpoint.ui.FinderScreen
import nz.waveformlabs.moshpoint.ui.FriendsScreen
import java.util.UUID

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
        engine = LocatorEngine(applicationContext, lifecycleScope)
        visible = VisibilityPrefs.isVisible(this)
        alwaysOn = VisibilityPrefs.alwaysOn(this)
        askPermissions.launch(permissions)
        val myCode = Base64.encodeToString(VisibilityPrefs.mySecret(this), Base64.NO_WRAP or Base64.URL_SAFE)

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
                            myCode = myCode,
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
                            onAdd = ::addFriend,
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

    private fun addFriend(name: String, code: String, gigGroup: Boolean) {
        val secret = runCatching { Base64.decode(code.trim(), Base64.NO_WRAP or Base64.URL_SAFE) }.getOrNull()
        if (name.isBlank() || secret == null || secret.size < 16) return // TODO: show an error
        FriendsRepository.friends += Friend(
            id = UUID.randomUUID().toString(),
            name = name.trim(),
            color = PALETTE[FriendsRepository.friends.size % PALETTE.size],
            secret = secret,
            gigGroupOnly = gigGroup,
        )
    }

    override fun onStop() {
        super.onStop()
        engine.stop() // finding only runs while the screen is open; visibility keeps going in the service
    }

    override fun onStart() {
        super.onStart()
        if (finding) engine.start()
    }

    companion object {
        private val PALETTE = intArrayOf(
            0xFF1E88E5.toInt(), 0xFF43A047.toInt(), 0xFFFDD835.toInt(),
            0xFF8E24AA.toInt(), 0xFF00ACC1.toInt(), 0xFFFB8C00.toInt(),
        )
    }
}
