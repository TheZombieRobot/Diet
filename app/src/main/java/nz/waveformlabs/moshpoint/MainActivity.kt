package nz.waveformlabs.moshpoint

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.core.QrPayload
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.service.VisibilityService
import nz.waveformlabs.moshpoint.ui.DebugPanel
import nz.waveformlabs.moshpoint.ui.FinderScreen
import nz.waveformlabs.moshpoint.ui.MoshTheme
import nz.waveformlabs.moshpoint.ui.Mosh
import androidx.compose.animation.togetherWith
import nz.waveformlabs.moshpoint.ui.FriendsScreen
import nz.waveformlabs.moshpoint.ui.MyQrDialog
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class MainActivity : ComponentActivity() {
    private lateinit var engine: LocatorEngine
    private var visibleToMates by mutableStateOf(false)
    private var photoFor: String? = null
    private val pickPhoto = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val id = photoFor
        if (uri != null && id != null) {
            lifecycleScope.launch {
                if (!PhotoStore.set(this@MainActivity, id, uri)) DebugStatus.log("Couldn't read that photo")
            }
        }
    }
    private var alwaysOn by mutableStateOf(false)
    private var finding by mutableStateOf(false)
    private var pendingStop: Job? = null
    private var askBattery by mutableStateOf(false)
    private var missing by mutableStateOf<List<String>>(emptyList())
    private var showQr by mutableStateOf(false)
    private var myName by mutableStateOf("")
    private var scanned by mutableStateOf<Pair<String, String>?>(null)

    private var showGroupQr by mutableStateOf(false)

    private val scanQr = registerForActivityResult(ScanContract()) { result ->
        val text = result.contents ?: return@registerForActivityResult
        // A gig group QR joins the group; a person's QR fills in "Add someone".
        if (GroupSync.join(this, text)) return@registerForActivityResult
        QrPayload.parse(text)?.let { scanned = it }
    }

    private val permissions = buildList {
        // Android 12+ ignores a fine-location request unless coarse is asked for too.
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
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
        missing = missingPermissions()
    }

    /** Plain-English reasons for whatever's still not allowed. */
    private fun missingPermissions(): List<String> {
        fun denied(p: String) = checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED
        val out = mutableListOf<String>()
        if (denied(Manifest.permission.ACCESS_FINE_LOCATION)) out += "Location: GPS arrow and Bluetooth/Wi-Fi distance"
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (denied(Manifest.permission.BLUETOOTH_SCAN) || denied(Manifest.permission.BLUETOOTH_ADVERTISE)) {
                out += "Nearby devices: finding mates and being found over Bluetooth"
            }
            if (engine.capabilities.uwb && denied(Manifest.permission.UWB_RANGING)) out += "UWB: the precise arrow"
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && denied(Manifest.permission.POST_NOTIFICATIONS)) {
            out += "Notifications: shows when you're visible"
        }
        return out
    }

    private fun fixPermissions() {
        // After a second "deny", Android stops showing the prompt, so go to app settings.
        val canAsk = permissions.any { shouldShowRequestPermissionRationale(it) }
        if (canAsk || missing.isEmpty()) {
            askPermissions.launch(permissions)
        } else {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", packageName, null)))
        }
    }

    override fun onResume() {
        super.onResume()
        missing = missingPermissions()
        // May have changed from the notification's Stop button or the Quick Settings tile.
        visibleToMates = VisibilityPrefs.isVisible(this)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Android may close the app while the photo picker is open: remember whose photo it was.
        photoFor = savedInstanceState?.getString("photoFor")
        FriendsRepository.init(this)
        PhotoStore.init(this)
        GroupSync.load(this)
        val mySecret = VisibilityPrefs.mySecret(this)
        engine = LocatorEngine(applicationContext, lifecycleScope, mySecret)
        visibleToMates = VisibilityPrefs.isVisible(this)
        myName = VisibilityPrefs.myName(this)
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
            MoshTheme {
                if (showGroupQr) {
                    GroupSync.group.value?.let { g ->
                        MyQrDialog(
                            GigGroup.qr(g),
                            onDismiss = { showGroupQr = false },
                            eyebrow = "YOUR CREW FOR TONIGHT",
                            title = g.name,
                            hint = "Everyone scans this once. Then you can all find each other, all night.",
                            members = FriendsRepository.friends.filter { it.gigGroupOnly },
                            onEndNight = {
                                showGroupQr = false
                                GroupSync.clear(this@MainActivity)
                            },
                        )
                    }
                }
                if (showQr) {
                    MyQrDialog(
                        QrPayload.of(myCode, myName),
                        onDismiss = { showQr = false },
                        title = if (myName.isBlank()) "Scan to add me" else "Scan to add $myName",
                    )
                }
                if (askBattery) {
                    AlertDialog(
                        onDismissRequest = { askBattery = false },
                        title = { Text("Stay visible all night") },
                        text = {
                            Text(
                                "Some phones shut down apps in the background to save battery, which would " +
                                    "make you disappear. Find Moshpoint in the next screen and set it to " +
                                    "\"Don't optimise\" / \"Unrestricted\".",
                            )
                        },
                        confirmButton = {
                            TextButton(onClick = {
                                askBattery = false
                                runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
                            }) { Text("Open settings") }
                        },
                        dismissButton = { TextButton(onClick = { askBattery = false }) { Text("Not now") } },
                    )
                }
                Box(Modifier.fillMaxSize().background(Mosh.Ground).safeDrawingPadding()) {
                    // Home <-> finder: a quick zoom-and-fade, like stepping into the crowd.
                    androidx.compose.animation.AnimatedContent(
                        targetState = finding,
                        transitionSpec = {
                            (androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(320)) +
                                androidx.compose.animation.scaleIn(androidx.compose.animation.core.tween(320), initialScale = if (targetState) 1.06f else 0.94f))
                                .togetherWith(androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(220)))
                        },
                        label = "screen",
                    ) { showFinder ->
                    if (showFinder) {
                        val arrows by engine.arrows.collectAsState()
                        val scan by engine.scan.collectAsState()
                        val tracking by engine.tracking.collectAsState()
                        val names = tracking.mapNotNull { FriendsRepository.byId(it)?.name }
                        val group = GroupSync.group.value
                        FinderScreen(
                            title = when {
                                names.size == 1 -> names[0]
                                group != null && tracking.all { FriendsRepository.byId(it)?.gigGroupOnly == true } -> group.name
                                else -> "${names.size} mates"
                            },
                            visible = visibleToMates,
                            arrows = arrows,
                            friendOf = FriendsRepository::byId,
                            scan = scan,
                            onScan = engine::startSpinScan,
                            onCancelScan = engine::cancelSpinScan,
                            onDismissScan = engine::dismissScanResult,
                            onBack = {
                                finding = false
                                stopEngineSoon()
                            },
                            debug = if (DebugStatus.enabled) {
                                { mod ->
                                    val rows by engine.debugRows.collectAsState()
                                    val methods by engine.enabledMethods.collectAsState()
                                    val tech by DebugStatus.tech.collectAsState()
                                    val log by DebugStatus.log.collectAsState()
                                    val recording by FieldRecorder.recording.collectAsState()
                                    val recordedRows by FieldRecorder.rows.collectAsState()
                                    val sim by engine.simSettings.collectAsState()
                                    DebugPanel(
                                        rows = rows,
                                        friendOf = FriendsRepository::byId,
                                        enabled = methods,
                                        onToggle = engine::setMethodEnabled,
                                        onSolo = engine::enableOnly,
                                        tech = tech,
                                        log = log,
                                        onClearLog = DebugStatus::clearLog,
                                        recording = recording,
                                        recordedRows = recordedRows,
                                        onRecord = { on -> if (on) FieldRecorder.start(this@MainActivity) else FieldRecorder.stop() },
                                        onMark = FieldRecorder::mark,
                                        onShare = ::shareRecording,
                                        sim = sim,
                                        onSim = engine::setSim,
                                        onSimRestart = engine::restartSims,
                                        modifier = mod,
                                    )
                                }
                            } else {
                                null
                            },
                        )
                    } else {
                        FriendsScreen(
                            friends = FriendsRepository.friends,
                            visible = visibleToMates,
                            alwaysOn = alwaysOn,
                            phoneSummary = phoneSummary,
                            missingPermissions = missing,
                            myName = myName,
                            onMyName = {
                                myName = it
                                VisibilityPrefs.setMyName(this@MainActivity, it)
                            },
                            onFixPermissions = ::fixPermissions,
                            onVisible = ::setVisibility,
                            onAlwaysOn = {
                                alwaysOn = it
                                VisibilityPrefs.setAlwaysOn(this@MainActivity, it)
                            },
                            onFind = { ids ->
                                pendingStop?.cancel()
                                engine.track(ids)
                                engine.start()
                                finding = true
                            },
                            onShareCode = { shareCode(myCode) },
                            onShowQr = { showQr = true },
                            onScanQr = {
                                scanQr.launch(
                                    ScanOptions()
                                        .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                                        .setPrompt("Scan your mate's Moshpoint QR")
                                        .setBeepEnabled(false)
                                        .setOrientationLocked(true),
                                )
                            },
                            scanned = scanned,
                            onScannedUsed = { scanned = null },
                            onAdd = { name, code, gig -> FriendsRepository.add(name, code, gig, mySecret) },
                            onRemove = FriendsRepository::remove,
                            onSetPhoto = { id ->
                                photoFor = id
                                pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            onRemovePhoto = PhotoStore::remove,
                            onClearGigGroup = { GroupSync.clear(this@MainActivity) },
                            groupName = GroupSync.group.value?.name,
                            onStartGroup = { name ->
                                GroupSync.startNew(this@MainActivity, name)
                                showGroupQr = true
                            },
                            onShowGroupQr = { showGroupQr = true },
                            onAddSimulated = if (DebugStatus.enabled) FriendsRepository::addSimulated else null,
                        )
                    }
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
        visibleToMates = on
        if (on) VisibilityService.start(this) else VisibilityService.stop(this)
        val power = getSystemService(PowerManager::class.java)
        if (on && power != null && !power.isIgnoringBatteryOptimizations(packageName)) askBattery = true
    }

    /** Debug builds: send the latest field recording (CSV) via any app. */
    private fun shareRecording() {
        val file = FieldRecorder.lastFile?.takeIf { it.exists() } ?: FieldRecorder.files(this).firstOrNull()
        if (file == null) {
            DebugStatus.log("No recording to share yet")
            return
        }
        val uri = androidx.core.content.FileProvider.getUriForFile(this, "$packageName.recordings", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, "Moshpoint field recording ${file.name}")
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        startActivity(Intent.createChooser(send, "Share recording"))
    }

    private fun shareCode(code: String) {
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_TEXT, "Add me on Moshpoint: $code")
        }
        startActivity(Intent.createChooser(send, "Share your Moshpoint code"))
    }

    /**
     * Finding only runs while the finder is on screen (visibility keeps going in the
     * service). Stopping is delayed: Android silently blocks more than 5 Bluetooth scan
     * starts per app in 30 s, so flicking between screens must not restart scans.
     */
    private fun stopEngineSoon() {
        pendingStop?.cancel()
        pendingStop = lifecycleScope.launch {
            delay(20_000)
            engine.stop()
        }
    }

    override fun onStop() {
        super.onStop()
        pendingGroupRelease?.cancel()
        pendingGroupRelease = lifecycleScope.launch {
            delay(20_000)
            if (holdingGroup) {
                GroupSync.release(this@MainActivity)
                holdingGroup = false
            }
        }
        stopEngineSoon()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        photoFor?.let { outState.putString("photoFor", it) }
    }

    // Gig-group radio: held while the app is open, released 20 s after it goes to the
    // background (so quick app switches don't burn Android's scan-start limit).
    private var holdingGroup = false
    private var pendingGroupRelease: Job? = null

    override fun onStart() {
        super.onStart()
        pendingGroupRelease?.cancel()
        if (!holdingGroup) {
            GroupSync.acquire(this)
            holdingGroup = true
        }
        pendingStop?.cancel()
        if (finding) engine.start()
    }

    override fun onDestroy() {
        if (holdingGroup) {
            GroupSync.release(this)
            holdingGroup = false
        }
        engine.stop()
        super.onDestroy()
    }
}
