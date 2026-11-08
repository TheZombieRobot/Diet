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
import androidx.compose.runtime.produceState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
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
import nz.waveformlabs.moshpoint.ui.OnboardingScreen
import nz.waveformlabs.moshpoint.ui.Mosh
import androidx.compose.animation.togetherWith
import nz.waveformlabs.moshpoint.ui.FriendsScreen
import nz.waveformlabs.moshpoint.ui.MyQrDialog
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions

class MainActivity : ComponentActivity() {
    private lateinit var engine: LocatorEngine
    private var visibleToMates by mutableStateOf(false)
    private var onboarded by mutableStateOf(true)

    /** Continue with Facebook: fills your name (if empty) and photo, which friends then get. */
    private val facebook = FacebookLogin(
        this,
        onProfile = { name, photo ->
            if (name != null && myName.isBlank()) {
                myName = name.substringBefore(' ')
                VisibilityPrefs.setMyName(this, myName)
            }
            if (photo != null) {
                lifecycleScope.launch {
                    if (PhotoStore.set(PhotoStore.ME, photo)) AvatarSync.publishMine(this@MainActivity, force = true)
                }
            }
        },
        onFail = { DebugStatus.log(it) },
    )
    private var calmMotion by mutableStateOf(false)

    /** Battery saver on, or animations turned off in accessibility settings. */
    private fun shouldCalm(): Boolean {
        val power = getSystemService(PowerManager::class.java)
        val scale = Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        return power?.isPowerSaveMode == true || scale == 0f
    }

    private val powerSaveReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: android.content.Context, i: Intent) {
            calmMotion = shouldCalm()
        }
    }
    private var photoFor: String? = null
    private val pickPhoto = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        val id = photoFor
        if (uri != null && id != null) {
            lifecycleScope.launch {
                if (!PhotoStore.set(this@MainActivity, id, uri)) {
                    DebugStatus.log("Couldn't read that photo")
                } else if (id == PhotoStore.ME) {
                    AvatarSync.publishMine(this@MainActivity, force = true)
                }
            }
        }
    }

    // Selfie for your own photo: the camera app's quick preview (small, which is all we need).
    private val takeSelfie = registerForActivityResult(ActivityResultContracts.TakePicturePreview()) { bmp ->
        if (bmp != null) {
            lifecycleScope.launch {
                if (PhotoStore.set(PhotoStore.ME, bmp)) AvatarSync.publishMine(this@MainActivity, force = true)
            }
        }
    }
    private val cameraForSelfie = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (ok) runCatching { takeSelfie.launch(null) }
    }

    // Crew moments (photos pinned where they were taken): see MomentFlow.
    private val momentFlow = MomentFlow(
        activity = this,
        toast = ::toast,
        lastLocation = ::lastKnownLocation,
        openMap = ::openMap,
        findFriend = { id ->
            closeMap()
            pendingStop?.cancel()
            engine.track(setOf(id))
            engine.start()
            finding = true
        },
    )

    private fun selfie() {
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            runCatching { takeSelfie.launch(null) }
        } else {
            cameraForSelfie.launch(Manifest.permission.CAMERA)
        }
    }
    private var alwaysOn by mutableStateOf(false)
    private var finding by mutableStateOf(false)
    private var beaconOn by mutableStateOf(false)

    private fun handleFindCrew(intent: Intent?) {
        if (intent?.getBooleanExtra(EXTRA_FIND_CREW, false) != true || !::engine.isInitialized) return
        intent.removeExtra(EXTRA_FIND_CREW)
        val ids = FriendsRepository.friends.filter { it.gigGroupOnly || it.key in GroupSync.members }.map { it.id }.toSet()
        if (ids.isEmpty()) return
        closeMap()
        pendingStop?.cancel()
        engine.track(ids)
        engine.start()
        finding = true
    }

    /** Opened from "X is looking for you": find them and light up straight away. */
    private fun handleLightRequest(intent: Intent?) {
        val id = intent?.getStringExtra(EXTRA_LIGHT_FOR) ?: return
        intent.removeExtra(EXTRA_LIGHT_FOR)
        if (FriendsRepository.byId(id) == null || !::engine.isInitialized) return
        pendingStop?.cancel()
        engine.track(setOf(id))
        engine.start()
        finding = true
        setBeacon(true)
    }
    private var showMap by mutableStateOf(false)
    private var bumping by mutableStateOf(false)
    private var planGig by mutableStateOf(false)
    /** "Your night" recap shown before ending the night. */
    private var recap by mutableStateOf<NightStats.Stats?>(null)
    /** Ticks every 20 s so "x min ago" on the home screen stays current. */
    private var homeNow by mutableStateOf(System.currentTimeMillis())

    /** Best recent position from Android (for pings and pins), or null. */
    @android.annotation.SuppressLint("MissingPermission")
    private fun lastKnownLocation(): android.location.Location? {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) return null
        val lm = getSystemService(android.location.LocationManager::class.java) ?: return null
        return lm.getProviders(true).mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
            .filter { System.currentTimeMillis() - it.time < 10 * 60_000 }
            .minByOrNull { it.accuracy }
    }
    private val mapFeed by lazy { nz.waveformlabs.moshpoint.locate.MapFeed(this, lifecycleScope) }

    private fun openMap() {
        showMap = true
        mapFeed.start()
    }

    private fun closeMap() {
        showMap = false
        mapFeed.stop()
    }

    /** Message asking mates to open the app and go live. */
    private fun nudge(names: List<String>) = Sharing.send(this, Sharing.nudgeText(names), "Ask them to go live")
    private val torch = TorchStrobe(this)

    /**
     * "Light me up": full brightness, a strobing screen (drawn by the finder) and the torch
     * flashing, plus a flag in our Bluetooth advert so mates' finders say to look for it.
     */
    private fun setBeacon(on: Boolean) {
        if (beaconOn == on) return
        beaconOn = on
        if (::engine.isInitialized) engine.setBeacon(on)
        torch.set(on)
    }
    private var pendingStop: Job? = null
    private var askBattery by mutableStateOf(false)

    /** Phone switches that are off but needed (Bluetooth, Location, ...). Refreshed on resume and when they change. */
    private var setupIssues by mutableStateOf<List<nz.waveformlabs.moshpoint.ui.SetupIssue>>(emptyList())

    private fun refreshSetupIssues() {
        setupIssues = SetupChecks.issues(this, engine.capabilities.wifiAware, visibleToMates) { askBattery = true }
    }

    private val radioReceiver = object : android.content.BroadcastReceiver() {
        override fun onReceive(c: android.content.Context, i: Intent) = refreshSetupIssues()
    }
    private var missing by mutableStateOf<List<String>>(emptyList())
    private var showQr by mutableStateOf(false)
    private var myName by mutableStateOf("")
    private var scanned by mutableStateOf<Pair<String, String>?>(null)

    private var showGroupQr by mutableStateOf(false)

    private val scanQr = registerForActivityResult(ScanContract()) { result ->
        val text = result.contents ?: return@registerForActivityResult
        // A gig group QR joins the group; a person's QR fills in "Add someone".
        handleInvite(text, quietIfNone = true)
    }

    /**
     * Invites without a camera: a group or friend invite pasted, shared to Moshpoint from
     * Messenger/SMS, or scanned. Groups join straight away; a friend fills in "Add someone".
     */
    private fun handleInvite(text: String?, quietIfNone: Boolean = false): Boolean {
        when (val inv = text?.let { nz.waveformlabs.moshpoint.core.Invite.find(it) }) {
            is nz.waveformlabs.moshpoint.core.Invite.Group -> {
                if (!GroupSync.join(this, inv.qrText)) {
                    toast("That group invite has expired. Ask for a new one.")
                    return false
                }
                val g = GroupSync.group.value
                if (GroupSync.sleeping && g != null) {
                    // A planned gig: nothing runs until the day.
                    toast("You're in ${g.name}! The crew wakes up on gig day (${nz.waveformlabs.moshpoint.ui.gigWhen(g.startsAtSec)}).")
                } else {
                    // Scanning the crew QR is the choice to be found tonight: go live straight away.
                    setVisibility(true)
                    toast("You're in ${g?.name ?: "the crew"}! Everyone in it can find each other.")
                }
            }
            is nz.waveformlabs.moshpoint.core.Invite.Friend -> {
                if (inv.name.isBlank()) {
                    // No name in it (a bare code): fill in "Add someone" so they can name them.
                    scanned = inv.code to ""
                    toast("Got the code. Give them a name, then tap Add friend.")
                } else {
                    // Add straight away, then prompt to link back.
                    val err = FriendsRepository.add(inv.name, inv.code, false, VisibilityPrefs.mySecret(this))
                    toast(err ?: "✓ ${inv.name} added")
                }
            }
            null -> {
                if (!quietIfNone) toast("No Moshpoint invite found. Copy the whole message your mate sent, then tap Paste invite.")
                return false
            }
        }
        return true
    }

    /** An invite found on the clipboard when the app opens: (invite text, "Bevan's crew"). */
    private var clipInvite by mutableStateOf<Pair<String, String>?>(null)

    /**
     * Opened the app with a crew invite copied (from WhatsApp, Messenger...)? Offer to join
     * straight away: no Paste button to find. Each invite is only offered once.
     */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (!hasFocus || !onboarded || clipInvite != null) return
        val cm = getSystemService(android.content.ClipboardManager::class.java) ?: return
        if (cm.primaryClipDescription?.hasMimeType("text/*") != true) return
        val text = runCatching { cm.primaryClip?.getItemAt(0)?.coerceToText(this)?.toString() }.getOrNull() ?: return
        val inv = nz.waveformlabs.moshpoint.core.Invite.find(text) as? nz.waveformlabs.moshpoint.core.Invite.Group ?: return
        val g = GigGroup.parseQr(inv.qrText, System.currentTimeMillis()) ?: return
        if (GroupSync.group.value?.key?.contentEquals(g.key) == true) return // already in it
        val seenKey = inv.qrText.hashCode().toString()
        val p = getSharedPreferences("clip", MODE_PRIVATE)
        if (p.getString("offered", null) == seenKey) return
        p.edit().putString("offered", seenKey).apply()
        clipInvite = text to g.name
    }

    private fun pasteInvite() {
        val cm = getSystemService(android.content.ClipboardManager::class.java)
        val text = cm?.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString()
        handleInvite(text)
    }

    private fun toast(msg: String) = android.widget.Toast.makeText(this, msg, android.widget.Toast.LENGTH_LONG).show()

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleLightRequest(intent)
        momentFlow.handleShared(intent)
        handleFindCrew(intent)
        if (intent.getBooleanExtra(EXTRA_OPEN_MAP, false)) {
            intent.removeExtra(EXTRA_OPEN_MAP)
            openMap()
        }
        handleInvite(intent.getStringExtra(ShareInviteActivity.EXTRA_TEXT) ?: return)
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
        refreshSetupIssues()
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
        refreshSetupIssues()
        // May have changed from the notification's Stop button or the Quick Settings tile.
        visibleToMates = VisibilityPrefs.isVisible(this)
        // In a crew tonight? Then you're findable, without having to remember a switch,
        // unless you've chosen to hide.
        if (!visibleToMates && onboarded && GroupSync.group.value != null && !GroupSync.sleeping && !VisibilityPrefs.userHid(this) && missing.isEmpty()) {
            setVisibility(true)
        }
        calmMotion = shouldCalm()
        // Your photo out to friends, theirs in (each at most a few times a day).
        AvatarSync.publishMine(this)
        AvatarSync.fetchFriends(this)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        facebook.register()
        // Android may close the app while the photo picker is open: remember whose photo it was.
        photoFor = savedInstanceState?.getString("photoFor")
        FriendsRepository.init(this)
        PhotoStore.init(this)
        LocationBook.init(this)
        Spots.init(this)
        GhostMode.init(this)
        DebugStatus.initUi(this)
        if (savedInstanceState == null) intent?.getStringExtra(ShareInviteActivity.EXTRA_TEXT)?.let { handleInvite(it) }
        GroupSync.load(this)
        val mySecret = VisibilityPrefs.mySecret(this)
        engine = LocatorEngine(applicationContext, lifecycleScope, mySecret)
        lifecycleScope.launch {
            while (true) {
                delay(20_000)
                homeNow = System.currentTimeMillis()
            }
        }
        if (savedInstanceState == null) {
            handleLightRequest(intent)
            momentFlow.handleShared(intent)
            handleFindCrew(intent)
            if (intent?.getBooleanExtra(EXTRA_OPEN_MAP, false) == true) openMap()
        }
        visibleToMates = VisibilityPrefs.isVisible(this)
        myName = VisibilityPrefs.myName(this)
        alwaysOn = VisibilityPrefs.alwaysOn(this)
        onboarded = VisibilityPrefs.onboarded(this)
        // New users get asked during the welcome, right after hearing why.
        if (onboarded) askPermissions.launch(permissions)
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
            MoshTheme(calm = calmMotion) {
                if (showGroupQr) {
                    GroupSync.group.value?.let { g ->
                        MyQrDialog(
                            crewQr(g),
                            onDismiss = { showGroupQr = false },
                            onShare = { shareGroup(g) },
                            eyebrow = "YOUR CREW FOR TONIGHT",
                            title = g.name,
                            hint = "Everyone scans this once. Then you can all find each other, all night.",
                            members = FriendsRepository.friends.filter { it.gigGroupOnly || it.key in GroupSync.members },
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
                        onShare = { shareCode(myCode) },
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
                if (!onboarded) {
                    Box(Modifier.fillMaxSize().background(Mosh.Ground).safeDrawingPadding()) {
                        OnboardingScreen(
                            name = myName,
                            onName = {
                                myName = it
                                VisibilityPrefs.setMyName(this@MainActivity, it)
                            },
                            onAskPermissions = { askPermissions.launch(permissions) },
                            onFacebook = if (FacebookLogin.available) facebook::login else null,
                            onDone = {
                                VisibilityPrefs.setOnboarded(this@MainActivity)
                                onboarded = true
                            },
                        )
                    }
                    return@MoshTheme
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
                        val beaconing by engine.beaconing.collectAsState()
                        val names = tracking.mapNotNull { FriendsRepository.byId(it)?.name }
                        val group = GroupSync.group.value
                        FinderScreen(
                            title = when {
                                names.size == 1 -> names[0]
                                group != null && tracking.size > 1 -> group.name
                                else -> "${names.size} mates"
                            },
                            visible = visibleToMates,
                            arrows = arrows,
                            friendOf = FriendsRepository::byId,
                            scan = scan,
                            onScan = engine::startSpinScan,
                            onCancelScan = engine::cancelSpinScan,
                            onDismissScan = engine::dismissScanResult,
                            onNudge = { nudge(names) },
                            onOpenMap = { openMap() },
                            onAskLight = { engine.askLight() },
                            onFound = { NightStats.found(this@MainActivity) },
                            beaconOn = beaconOn,
                            onBeacon = ::setBeacon,
                            beaconing = beaconing.mapNotNull { id ->
                                FriendsRepository.byId(id)?.let { "${nz.waveformlabs.moshpoint.core.BeaconColour.forSecret(it.secret).name.uppercase()} (${it.name})" }
                            },
                            myBeacon = nz.waveformlabs.moshpoint.core.BeaconColour.forSecret(mySecret),
                            onBack = {
                                setBeacon(false)
                                finding = false
                                stopEngineSoon()
                            },
                            warning = setupIssues.firstOrNull { !it.text.startsWith("Battery") },
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
                            crewKeys = GroupSync.members.toSet(),
                            visible = visibleToMates,
                            alwaysOn = alwaysOn,
                            phoneSummary = phoneSummary,
                            missingPermissions = missing,
                            setupIssues = setupIssues,
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
                            onPasteInvite = ::pasteInvite,
                            onShareApp = { shareApp(myCode) },
                            onShowQr = { ensureCrew(); showGroupQr = true },
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
                            onAdd = { name, code, gig ->
                                FriendsRepository.add(name, code, gig, mySecret).also { if (it == null) toast("✓ ${name.trim()} added") }
                            },
                            onRemove = FriendsRepository::remove,
                            onSetPhoto = { id ->
                                photoFor = id
                                pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            onRemovePhoto = PhotoStore::remove,
                            onClearGigGroup = { recap = NightStats.get(this@MainActivity) },
                            groupName = GroupSync.group.value?.name,
                            onStartGroup = { name ->
                                GroupSync.startNew(this@MainActivity, name)
                                setVisibility(true)
                                showGroupQr = true
                            },
                            onKeepFriend = { id ->
                                FriendsRepository.keepAsFriend(id)
                                toast("Added to your friends")
                            },
                            onShowGroupQr = { showGroupQr = true },
                            onShowCrewQr = {
                                ensureCrew()
                                showGroupQr = true
                            },
                            seen = LocationBook.seen,
                            nowSec = homeNow / 1000,
                            pings = GroupSync.pings,
                            onPing = { kind ->
                                val loc = lastKnownLocation()
                                GroupSync.sendPing(this@MainActivity, kind, loc?.latitude, loc?.longitude)
                            },
                            describePing = GroupSync::pingText,
                            moments = Moments.items,
                            onShareMoment = momentFlow::start,
                            onCheckIn = { minutes ->
                                val loc = lastKnownLocation()
                                GroupSync.startCheckIn(this@MainActivity, minutes, loc?.latitude, loc?.longitude)
                            },
                            checkInBy = GroupSync.myCheckInBy.value.takeIf { it > 0 }?.let {
                                java.text.DateFormat.getTimeInstance(java.text.DateFormat.SHORT).format(java.util.Date(it * 1000))
                            },
                            onHomeSafe = { GroupSync.homeSafe(this@MainActivity) },
                            distances = CrewStatus.distances,
                            crewQrPayload = GroupSync.group.value?.let { crewQr(it) },
                            onQuickCrew = { ensureCrew() },
                            onPlanGig = { planGig = true },
                            crewWhen = GroupSync.group.value?.takeIf { it.startsAtSec > 0 }?.let { g ->
                                nz.waveformlabs.moshpoint.ui.gigWhen(g.startsAtSec) + if (g.venue.isNotBlank()) " · ${g.venue}" else ""
                            },
                            crewSleeping = homeNow > 0 && GroupSync.sleeping,
                            onBump = {
                                bumping = true
                                Bump.start(this@MainActivity, GroupSync.group.value?.let { crewQr(it) })
                            },
                            onOpenMoment = momentFlow::view,
                            ghost = GhostMode.on.value,
                            onAddSimulated = if (DebugStatus.enabled) FriendsRepository::addSimulated else null,
                            onSelfie = ::selfie,
                            onPickMyPhoto = {
                                photoFor = PhotoStore.ME
                                pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            onFacebook = if (FacebookLogin.available) facebook::login else null,
                            onRemoveMyPhoto = {
                                PhotoStore.remove(PhotoStore.ME)
                                AvatarSync.publishMine(this@MainActivity, force = true)
                            },
                            onOpenMap = { openMap() },
                            meetUp = GroupSync.rally.value?.name,
                        )
                    }
                    }
                    momentFlow.Dialogs()
                    if (planGig) {
                        nz.waveformlabs.moshpoint.ui.PlanGigSheet(
                            search = if (GigSearch.available) ({ q -> GigSearch.search(q) }) else null,
                            onPick = { name, at, venue ->
                                planGig = false
                                GroupSync.startNew(this@MainActivity, name, at, venue)
                                if (!GroupSync.sleeping) setVisibility(true)
                                showGroupQr = true
                            },
                            onClose = { planGig = false },
                        )
                    }
                    if (bumping) {
                        nz.waveformlabs.moshpoint.ui.BumpDialog(sharing = GroupSync.group.value != null) {
                            bumping = false
                            Bump.stop(this@MainActivity)
                        }
                    }
                    Bump.received.value?.let { text ->
                        val name = nz.waveformlabs.moshpoint.core.Invite.find(text)
                            ?.let { it as? nz.waveformlabs.moshpoint.core.Invite.Group }
                            ?.let { GigGroup.parseQr(it.qrText, System.currentTimeMillis())?.name } ?: "the crew"
                        androidx.compose.material3.AlertDialog(
                            onDismissRequest = { Bump.received.value = null },
                            containerColor = Mosh.Deep,
                            title = { androidx.compose.material3.Text("Join $name?", style = Mosh.Heading) },
                            text = { androidx.compose.material3.Text("Bumped! Join and you can all find each other tonight.", style = Mosh.Body) },
                            confirmButton = {
                                androidx.compose.material3.TextButton(onClick = {
                                    Bump.received.value = null
                                    bumping = false
                                    Bump.stop(this@MainActivity)
                                    handleInvite(text)
                                }) { androidx.compose.material3.Text("Join", style = Mosh.Label.copy(color = Mosh.Lime)) }
                            },
                            dismissButton = {
                                androidx.compose.material3.TextButton(onClick = { Bump.received.value = null }) {
                                    androidx.compose.material3.Text("No", style = Mosh.Label)
                                }
                            },
                        )
                    }
                    clipInvite?.let { (text, name) ->
                        androidx.compose.material3.AlertDialog(
                            onDismissRequest = { clipInvite = null },
                            containerColor = Mosh.Deep,
                            title = { androidx.compose.material3.Text("Join $name?", style = Mosh.Heading) },
                            text = { androidx.compose.material3.Text("You copied a Moshpoint invite. Join and you can all find each other tonight.", style = Mosh.Body) },
                            confirmButton = {
                                androidx.compose.material3.TextButton(onClick = { clipInvite = null; handleInvite(text) }) {
                                    androidx.compose.material3.Text("Join", style = Mosh.Label.copy(color = Mosh.Lime))
                                }
                            },
                            dismissButton = {
                                androidx.compose.material3.TextButton(onClick = { clipInvite = null }) {
                                    androidx.compose.material3.Text("Not now", style = Mosh.Label)
                                }
                            },
                        )
                    }
                    recap?.let { s ->
                        androidx.compose.material3.AlertDialog(
                            onDismissRequest = { recap = null },
                            containerColor = Mosh.Deep,
                            title = { androidx.compose.material3.Text("Your night", style = Mosh.Heading) },
                            text = {
                                androidx.compose.material3.Text(
                                    NightStats.summary(s, System.currentTimeMillis()) +
                                        "\n\nEnding the night leaves the crew and clears tonight's mates (friends stay).",
                                    style = Mosh.Body,
                                )
                            },
                            confirmButton = {
                                androidx.compose.material3.TextButton(onClick = {
                                    recap = null
                                    GroupSync.clear(this@MainActivity)
                                    NightStats.reset(this@MainActivity)
                                }) { androidx.compose.material3.Text("End the night", style = Mosh.Label.copy(color = Mosh.Danger)) }
                            },
                            dismissButton = {
                                androidx.compose.material3.TextButton(onClick = {
                                    Sharing.send(this@MainActivity, "My night with Moshpoint: " + NightStats.summary(s, System.currentTimeMillis()) + " 🤘", "Share your night")
                                }) { androidx.compose.material3.Text("Share", style = Mosh.Label.copy(color = Mosh.Cyan)) }
                            },
                        )
                    }
                    if (showMap) {
                        val now by produceState(System.currentTimeMillis()) {
                            while (true) {
                                kotlinx.coroutines.delay(15_000)
                                value = System.currentTimeMillis()
                            }
                        }
                        val myLoc = mapFeed.me.value
                        nz.waveformlabs.moshpoint.ui.MapScreen(
                            people = FriendsRepository.friends.filterNot { FriendsRepository.isSimulated(it.id) },
                            seen = LocationBook.seen,
                            me = myLoc?.let { nz.waveformlabs.moshpoint.core.LatLon(it.latitude, it.longitude) },
                            status = mapFeed.status.value,
                            nowMs = now,
                            onFind = { id ->
                                closeMap()
                                engine.track(setOf(id))
                                finding = true
                                pendingStop?.cancel()
                                engine.start()
                            },
                            onDirections = { lat, lon ->
                                runCatching {
                                    startActivity(
                                        Intent(
                                            Intent.ACTION_VIEW,
                                            android.net.Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lon&travelmode=walking"),
                                        ),
                                    )
                                }
                            },
                            onNudge = { f -> nudge(listOf(f.name)) },
                            onBack = { closeMap() },
                            places = listOfNotNull(
                                GroupSync.rally.value?.let { nz.waveformlabs.moshpoint.ui.MapPlace("rally", it.name, it.lat, it.lon, meetUp = true) },
                            ) + Spots.spots.map { nz.waveformlabs.moshpoint.ui.MapPlace(it.id, it.name, it.lat, it.lon, meetUp = false) },
                            inCrew = GroupSync.group.value != null,
                            onDropPin = { name, lat, lon, meetUp ->
                                if (meetUp) {
                                    GroupSync.setRally(this@MainActivity, name, lat, lon)
                                    toast("Meet-up pin sent to your crew")
                                } else {
                                    Spots.add(name, lat, lon)
                                }
                            },
                            moments = Moments.items.mapNotNull { m ->
                                val lat = m.lat ?: return@mapNotNull null
                                val lon = m.lon ?: return@mapNotNull null
                                nz.waveformlabs.moshpoint.ui.MapMoment(m.key, "${if (m.mine) "You" else m.from} · ${nz.waveformlabs.moshpoint.ui.ago(now / 1000 - m.timeSec)}", lat, lon, m.image)
                            },
                            trails = LocationBook.trails,
                            onMomentTapped = { key -> Moments.items.firstOrNull { it.key == key }?.let(momentFlow::view) },
                            onRide = { lat, lon ->
                                runCatching {
                                    startActivity(
                                        Intent(
                                            Intent.ACTION_VIEW,
                                            android.net.Uri.parse("https://m.uber.com/ul/?action=setPickup&pickup=my_location&dropoff[latitude]=$lat&dropoff[longitude]=$lon"),
                                        ),
                                    )
                                }
                            },
                            onRemovePlace = { p ->
                                if (p.meetUp) GroupSync.clearRally(this@MainActivity) else Spots.remove(p.id)
                            },
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
        visibleToMates = on
        refreshSetupIssues()
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

    private val getTheApp get() = Sharing.getTheApp(this)

    /** One message that does everything: download link + your invite. */
    private fun shareApp(code: String) {
        Sharing.send(
            this,
            "Get Moshpoint so we can find each other at gigs: tap a mate and an arrow points to them.\n\n" + getTheApp + crewQr(ensureCrew()),
            "Share Moshpoint",
        )
    }

    /** Your crew for tonight, starting one (named after you) if there isn't one. Also goes live. */
    private fun ensureCrew(): GigGroup {
        GroupSync.group.value?.let { return it }
        val name = if (myName.isNotBlank()) "${myName.trim()}'s crew" else "Tonight's crew"
        GroupSync.startNew(this, name)
        setVisibility(true)
        return GroupSync.group.value!!
    }

    private fun shareCode(@Suppress("UNUSED_PARAMETER") code: String) = shareGroup(ensureCrew())

    /** The crew QR / invite text, with us inside it so whoever joins can find us at once. */
    private fun crewQr(g: GigGroup) =
        GigGroup.qr(g, GigGroup.Intro(VisibilityPrefs.mySecret(this), myName.ifBlank { "Mate" }))

    private fun shareGroup(g: GigGroup) {
        Sharing.send(this, "Join my crew \"${g.name}\" on Moshpoint tonight!\n" + getTheApp + crewQr(g), "Send the group invite")
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
        setBeacon(false)
        mapFeed.stop()
        if (bumping) {
            bumping = false
            Bump.stop(this)
        }
        runCatching { unregisterReceiver(powerSaveReceiver) }
        runCatching { unregisterReceiver(radioReceiver) }
        pendingGroupRelease?.cancel()
        pendingGroupRelease = lifecycleScope.launch {
            delay(20_000)
            GroupSync.setAppOpen(this@MainActivity, false)
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
        androidx.core.content.ContextCompat.registerReceiver(
            this, powerSaveReceiver, android.content.IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED),
            androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        androidx.core.content.ContextCompat.registerReceiver(
            this, radioReceiver,
            android.content.IntentFilter().apply {
                addAction(android.bluetooth.BluetoothAdapter.ACTION_STATE_CHANGED)
                addAction(android.location.LocationManager.MODE_CHANGED_ACTION)
                addAction(android.net.wifi.WifiManager.WIFI_STATE_CHANGED_ACTION)
            },
            androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        pendingGroupRelease?.cancel()
        GroupSync.setAppOpen(this, true)
        if (showMap) mapFeed.start()
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

    companion object {
        /** Notification tap: "this friend asked us to light up". */
        const val EXTRA_LIGHT_FOR = "nz.waveformlabs.moshpoint.LIGHT_FOR"
        /** A photo shared from another app ("Share → Moshpoint crew"): the intent's data is the image. */
        const val EXTRA_MOMENT = "nz.waveformlabs.moshpoint.MOMENT"
        /** Notification / widget "Find crew": straight into the finder for the whole crew. */
        const val EXTRA_FIND_CREW = "nz.waveformlabs.moshpoint.FIND_CREW"
        /** Notification tap: open the map (a crew ping or help request). */
        const val EXTRA_OPEN_MAP = "nz.waveformlabs.moshpoint.OPEN_MAP"
    }
}
