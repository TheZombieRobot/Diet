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
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.locate.RelayClient
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
import nz.waveformlabs.moshpoint.venue.Floors
import nz.waveformlabs.moshpoint.venue.VenueLookup
import nz.waveformlabs.moshpoint.venue.VenueMaps
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
            // Your Facebook picture becomes your photo unless you've already chosen one.
            if (photo != null && PhotoStore.photos[PhotoStore.ME] == null) {
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

    /** Opened from "X is lighting up their screen": the finder on them, to spot the flashing screen. */
    private fun handleFindMate(intent: Intent?) {
        val id = intent?.getStringExtra(EXTRA_FIND_MATE) ?: return
        intent.removeExtra(EXTRA_FIND_MATE)
        if (FriendsRepository.byId(id) == null || !::engine.isInitialized) return
        closeMap()
        pendingStop?.cancel()
        engine.track(setOf(id))
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
    private var showStory by mutableStateOf(false)
    private var showChat by mutableStateOf(false)
    /** The crew whose invite QR is showing (null = the main crew). */
    private var qrCrew by mutableStateOf<GigGroup?>(null)
    /** A past gig open in the Story viewer. */
    private var archiveGig by mutableStateOf<GigArchive.Summary?>(null)
    private var archiveItems by mutableStateOf<List<Moments.Item>>(emptyList())

    // ---- "Add your photos from that night" (camera roll) ----

    private var rollGig by mutableStateOf<Pair<String, String>?>(null) // (gig id, name)
    private var rollFound by mutableStateOf<List<GigArchive.Found>?>(null)
    private var rollAdding by mutableStateOf(false)

    private val mediaPerms = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        if (r.values.any { it }) findOnPhone() else {
            rollGig = null
            toast(Txt.s(R.string.main_photos_permission_needed))
        }
    }

    private fun startRoll(id: String, name: String) {
        rollGig = id to name
        rollFound = null
        val perms = if (Build.VERSION.SDK_INT >= 33) {
            listOf(Manifest.permission.READ_MEDIA_IMAGES, Manifest.permission.READ_MEDIA_VIDEO) +
                (if (Build.VERSION.SDK_INT >= 34) listOf(Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED) else emptyList())
        } else {
            listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        }
        if (perms.any { checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) findOnPhone() else mediaPerms.launch(perms.toTypedArray())
    }

    private fun findOnPhone() {
        val (id, _) = rollGig ?: return
        lifecycleScope.launch { rollFound = GigArchive.findOnPhone(this@MainActivity, id) }
    }

    private fun addFromPhone(picked: List<GigArchive.Found>) {
        val (id, _) = rollGig ?: return
        rollAdding = true
        lifecycleScope.launch {
            val n = GigArchive.addFromPhone(this@MainActivity, id, picked, myName.ifBlank { Txt.s(R.string.main_you) })
            rollAdding = false
            rollGig = null
            toast(Txt.p(R.plurals.main_added_to_gig, n))
            // Show them straight away on whichever board is open.
            if (GroupSync.group.value?.let(GigArchive::idFor) == id) Moments.loadCurrent(this@MainActivity)
            archiveGig?.takeIf { it.id == id }?.let { archiveItems = GigArchive.load(this@MainActivity, id) }
        }
    }

    /** Copy photos/clips into the phone's gallery, album "Moshpoint / <gig>". */
    private fun saveToPhone(items: List<Moments.Item>, album: String) {
        if (items.isEmpty()) return
        lifecycleScope.launch {
            toast(if (items.size == 1) Txt.s(R.string.main_saving_one) else Txt.p(R.plurals.main_saving_many, items.size))
            val n = GigArchive.saveAllToPhone(this@MainActivity, items, album)
            toast(
                when {
                    n == 0 -> Txt.s(R.string.main_save_failed)
                    n == items.size -> Txt.s(R.string.main_saved_all, album)
                    else -> Txt.p(R.plurals.main_saved_some, items.size, n, items.size)
                },
            )
        }
    }
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

    /** Set while the map is open at the gig: the venue it opened on. Null = the ordinary map. */
    private var mapVenue by mutableStateOf<nz.waveformlabs.moshpoint.ui.VenueView?>(null)
    /** The finder engine is running just for the map (UWB places mates exactly). */
    private var mapEngine = false

    /** When the map was last opened (time since boot), for [mapFirstFix]. */
    private var mapOpenedAtMs = 0L

    private fun openMap() {
        mapOpenedAtMs = android.os.SystemClock.elapsedRealtime()
        // At the gig (gig day, and this phone at the venue) the map opens zoomed into the venue.
        mapVenue = venueViewFor(lastKnownLocation())
        showMap = true
        mapFeed.start()
        if (mapVenue != null) lookForCrewFromMap()
    }

    /** The venue to open the map on, if [here] says this phone is at the gig; else null. */
    private fun venueViewFor(here: android.location.Location?): nz.waveformlabs.moshpoint.ui.VenueView? {
        val venue = VenueMaps.venue(this) ?: return null
        if (!VenueMaps.atGig(this, here)) return null
        return nz.waveformlabs.moshpoint.ui.VenueView(venue, here?.let { nz.waveformlabs.moshpoint.core.LatLon(it.latitude, it.longitude) })
    }

    /**
     * The map's own first position after opening. If the phone had no fresh position when the
     * map opened (not live, say), this one can still say we're at the gig, for a few seconds.
     * After that an open map never moves by itself.
     */
    private fun mapFirstFix(here: android.location.Location) {
        if (mapVenue != null || !showMap || android.os.SystemClock.elapsedRealtime() - mapOpenedAtMs > MAP_FIRST_FIX_MS) return
        mapVenue = venueViewFor(here) ?: return
        lookForCrewFromMap()
    }

    /**
     * UWB only measures while someone is looking, so at the gig the map looks for the whole
     * crew (unless the finder is already looking for someone).
     */
    private fun lookForCrewFromMap() {
        if (!::engine.isInitialized || finding || mapEngine) return
        val ids = FriendsRepository.friends.filter { it.gigGroupOnly || it.key in GroupSync.members }.map { it.id }.toSet()
        if (ids.isEmpty()) return
        pendingStop?.cancel()
        engine.track(ids)
        engine.start()
        mapEngine = true
    }

    private fun closeMap() {
        showMap = false
        mapFeed.stop()
        if (mapEngine) {
            mapEngine = false
            if (!finding) stopEngineSoon()
        }
    }

    /** Message asking mates to open the app and go live. */
    private fun nudge(names: List<String>) = Sharing.send(this, Sharing.nudgeText(names), Txt.s(R.string.main_nudge_title))
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

    /** The owner is leaving a crew with others still in it: who takes it over? (crew, its Up next entry if any) */
    private var handover by mutableStateOf<Pair<GigGroup, Crews.Entry?>?>(null)

    /** Leave [g]: the main crew ends here, an Up next one just goes. */
    private fun leaveCrew(g: GigGroup, waiting: Crews.Entry?) {
        if (waiting != null) {
            closeChat()
            GroupSync.leave(this, Crews.find(g.key) ?: waiting)
        } else GroupSync.clear(this)
    }

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
                // Use the crew's relay server if the invite names one.
                inv.qrText.substringBefore("&name=").split('&').firstOrNull { it.startsWith("r=") }?.removePrefix("r=")
                    ?.let { runCatching { java.net.URLDecoder.decode(it, "UTF-8") }.getOrNull() }
                    ?.takeIf { it != RelayClient.shareableServer }
                    ?.let { if (RelayClient.setServer(this, it)) DebugStatus.log("Using the crew's relay server") }
                if (!GroupSync.join(this, inv.qrText)) {
                    toast(Txt.s(R.string.main_invite_expired))
                    return false
                }
                val joined = GroupSync.newest.value
                if (joined != null && GroupSync.group.value?.key?.contentEquals(joined.key) != true) {
                    toast(Txt.s(R.string.main_joined_up_next, joined.name))
                    return true
                }
                val g = GroupSync.group.value
                if (GroupSync.following && g != null) {
                    toast(Txt.s(R.string.main_joined_following, g.name))
                } else if (GroupSync.sleeping && g != null) {
                    // A planned gig: nothing runs until the day.
                    toast(Txt.s(R.string.main_joined_sleeping, g.name, nz.waveformlabs.moshpoint.ui.gigWhen(g.startsAtSec)))
                } else {
                    // Scanning the crew QR is the choice to be found tonight: go live straight away.
                    setVisibility(true)
                    toast(Txt.s(R.string.main_joined_live, g?.name ?: Txt.s(R.string.main_the_crew)))
                }
            }
            is nz.waveformlabs.moshpoint.core.Invite.Friend -> {
                if (inv.name.isBlank()) {
                    // No name in it (a bare code): fill in "Add someone" so they can name them.
                    scanned = inv.code to ""
                    toast(Txt.s(R.string.main_got_code))
                } else {
                    // Add straight away, then prompt to link back.
                    val err = FriendsRepository.add(inv.name, inv.code, false, VisibilityPrefs.mySecret(this))
                    toast(err ?: Txt.s(R.string.main_friend_added, inv.name))
                }
            }
            null -> {
                if (!quietIfNone) toast(Txt.s(R.string.main_no_invite_found))
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
        handleFindMate(intent)
        if (intent.getBooleanExtra(EXTRA_OPEN_MAP, false)) {
            intent.removeExtra(EXTRA_OPEN_MAP)
            openMap()
        }
        if (intent.getBooleanExtra(EXTRA_OPEN_CHAT, false)) {
            intent.removeExtra(EXTRA_OPEN_CHAT)
            openChat(intent.getStringExtra(EXTRA_CHAT_CREW))
        }
        openPrivateFrom(intent)
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
        if (denied(Manifest.permission.ACCESS_FINE_LOCATION)) out += getString(R.string.main_perm_location)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (denied(Manifest.permission.BLUETOOTH_SCAN) || denied(Manifest.permission.BLUETOOTH_ADVERTISE)) {
                out += getString(R.string.main_perm_nearby)
            }
            if (engine.capabilities.uwb && denied(Manifest.permission.UWB_RANGING)) out += getString(R.string.main_perm_uwb)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && denied(Manifest.permission.POST_NOTIFICATIONS)) {
            out += getString(R.string.main_perm_notifications)
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
        lifecycleScope.launch { GigArchive.refreshList(this@MainActivity) }
        VenueMaps.sync(this) // carries on a venue map download that was interrupted
        Friendship.load(this)
        missing = missingPermissions()
        refreshSetupIssues()
        // May have changed from the notification's Stop button or the Quick Settings tile.
        visibleToMates = VisibilityPrefs.isVisible(this)
        // In a crew tonight? Then you're findable, without having to remember a switch,
        // unless you've chosen to hide.
        if (!visibleToMates && onboarded && GroupSync.group.value != null && !GroupSync.sleeping && !GroupSync.following &&
            !VisibilityPrefs.userHid(this) && missing.isEmpty()
        ) {
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
        ShareQuality.init(this)
        DebugStatus.initUi(this)
        if (savedInstanceState == null) intent?.getStringExtra(ShareInviteActivity.EXTRA_TEXT)?.let { handleInvite(it) }
        GroupSync.load(this)
        VenueMaps.sync(this) // the venue's street map saves itself for every crew we're in
        if (GroupSync.following) FollowCheck.schedule(this)
        GroupSync.group.value?.let { runCatching { GigArchive.remember(this, it) } }
        lifecycleScope.launch {
            Moments.loadCurrent(this@MainActivity) // tonight's Story survives restarts
            GigArchive.refreshList(this@MainActivity)
            Memories.schedule(this@MainActivity, GigArchive.gigs)
        }
        val mySecret = VisibilityPrefs.mySecret(this)
        // The finder (finder module, docs/FINDER_MODULE.md), with the gig app's parts plugged in.
        engine = LocatorEngine(
            applicationContext, lifecycleScope,
            identity = { Identity.current(applicationContext) },
            mateById = FriendsRepository::byId,
            isSimulated = FriendsRepository::isSimulated,
            // Upstairs/downstairs: Bluetooth and UWB readings calibrate the pressure sensors.
            onBluetoothReading = { id, distance, advert -> Floors.onBluetooth(id, distance, advert.pressure) },
            onUwbReading = Floors::onUwb,
            // The crew intro advert died with Bluetooth too.
            onBluetoothToggled = { on -> GroupSync.onBluetooth(applicationContext, on) },
            cantHear = { who -> "Can't hear $who's phone at all. Scan needs them nearby (about 30 m) with Go live on, in your crew." },
        )
        // The watch reads the phone's own finder through this read-only bridge (docs/WATCH.md).
        nz.waveformlabs.moshpoint.watch.PhoneFinderBridge.attach(engine)
        lifecycleScope.launch {
            while (true) {
                delay(20_000)
                homeNow = System.currentTimeMillis()
                // Every crew's chat (incl. Up next) every couple of minutes while the app is open.
                runCatching { ChatSync.pollAll(this@MainActivity, minGapMs = 110_000) }
            }
        }
        if (savedInstanceState == null) {
            handleLightRequest(intent)
            momentFlow.handleShared(intent)
            handleFindCrew(intent)
            handleFindMate(intent)
            if (intent?.getBooleanExtra(EXTRA_OPEN_MAP, false) == true) openMap()
            if (intent?.getBooleanExtra(EXTRA_OPEN_CHAT, false) == true) openChat(intent.getStringExtra(EXTRA_CHAT_CREW))
            openPrivateFrom(intent)
        }
        visibleToMates = VisibilityPrefs.isVisible(this)
        myName = VisibilityPrefs.myName(this)
        alwaysOn = VisibilityPrefs.alwaysOn(this)
        onboarded = VisibilityPrefs.onboarded(this)
        // New users get asked during the welcome, right after hearing why.
        if (onboarded) askPermissions.launch(permissions)
        val myCode = FriendRecord.shareCode(mySecret)
        val caps = engine.capabilities
        val phoneSummary = getString(
            R.string.main_phone_summary,
            listOfNotNull(
                "UWB".takeIf { caps.uwb },
                "Wi-Fi Aware".takeIf { caps.wifiAware },
                "Bluetooth".takeIf { caps.ble },
                getString(R.string.main_cap_compass).takeIf { caps.compass },
                "GPS".takeIf { caps.gps },
            ).joinToString(", "),
        )

        setContent {
            MoshTheme(calm = calmMotion) {
                if (showGroupQr) {
                    (qrCrew ?: GroupSync.group.value)?.let { g ->
                        val waiting = Crews.find(g.key)
                        MyQrDialog(
                            crewQr(g),
                            onDismiss = { showGroupQr = false; qrCrew = null },
                            onShare = { shareGroup(g) },
                            // In a crew with an owner, only the owner resets the invite (as with removing people).
                            onResetInvite = if (CrewRekey.mayRemove(this@MainActivity, g)) {
                                {
                                    val fresh = CrewRekey.rekey(this@MainActivity, g, null, null)
                                    if (qrCrew != null) qrCrew = fresh
                                    toast(Txt.s(R.string.main_invite_reset))
                                }
                            } else null,
                            eyebrow = when {
                                waiting != null -> nz.waveformlabs.moshpoint.ui.countdown(g.startsAtSec, System.currentTimeMillis() / 1000)
                                    ?.let { stringResource(R.string.main_eyebrow_up_next_countdown, it.uppercase()) }
                                    ?: stringResource(R.string.main_eyebrow_up_next)
                                g.dormant(System.currentTimeMillis()) -> stringResource(R.string.main_eyebrow_coming_up)
                                else -> stringResource(R.string.main_eyebrow_tonight)
                            },
                            title = g.name,
                            hint = if (waiting != null || g.dormant(System.currentTimeMillis())) {
                                stringResource(R.string.main_qr_hint_planned)
                            } else stringResource(R.string.main_qr_hint_tonight),
                            members = if (waiting != null) {
                                waiting.mates.map { (secret, name) -> Friend(nz.waveformlabs.moshpoint.core.FriendRecord("next-" + secret.take(6).joinToString("") { "%02x".format(it) }, name, 0xFF9D5CFF.toInt(), secret, true, 0L)) }
                            } else FriendsRepository.friends.filter { it.gigGroupOnly || it.key in GroupSync.members },
                            onEndNight = {
                                showGroupQr = false
                                qrCrew = null
                                // The owner leaving a crew others are still in hands it over first, so
                                // someone can still remove people. Anyone else just leaves.
                                if (CrewRekey.isOwner(this@MainActivity, g) && CrewRekey.handoverCandidates(this@MainActivity, g).isNotEmpty()) {
                                    handover = g to waiting
                                } else leaveCrew(g, waiting)
                            },
                        )
                    }
                }
                handover?.let { (g, waiting) ->
                    val candidates = remember(g) { CrewRekey.handoverCandidates(this@MainActivity, g) }
                    AlertDialog(
                        onDismissRequest = { handover = null },
                        title = { Text(stringResource(R.string.crew_handover_title)) },
                        text = {
                            androidx.compose.foundation.layout.Column {
                                Text(stringResource(R.string.crew_handover_body))
                                candidates.forEach { (name, pub) ->
                                    TextButton(onClick = {
                                        handover = null
                                        val fresh = CrewRekey.handOver(this@MainActivity, g, pub, myName.ifBlank { null })
                                        leaveCrew(fresh, waiting)
                                    }) { Text(name) }
                                }
                            }
                        },
                        confirmButton = { TextButton(onClick = { handover = null; leaveCrew(g, waiting) }) { Text(stringResource(R.string.crew_handover_nobody)) } },
                        dismissButton = { TextButton(onClick = { handover = null }) { Text(stringResource(R.string.home_cancel)) } },
                    )
                }
                if (showQr) {
                    MyQrDialog(
                        QrPayload.of(myCode, myName),
                        onDismiss = { showQr = false },
                        onShare = { shareCode(myCode) },
                        title = if (myName.isBlank()) stringResource(R.string.main_scan_to_add_me) else stringResource(R.string.main_scan_to_add_name, myName),
                    )
                }
                // "Sam wants to stay friends": one at a time, until answered.
                Friendship.incoming.firstOrNull()?.let { req ->
                    AlertDialog(
                        onDismissRequest = {},
                        title = { Text(stringResource(R.string.main_wants_to_stay_friends, req.name)) },
                        text = {
                            Text(stringResource(R.string.main_stay_friends_text, req.crewName, req.name))
                        },
                        confirmButton = {
                            TextButton(onClick = {
                                Friendship.accept(this@MainActivity, req)
                                toast(Txt.s(R.string.main_friends_now, req.name))
                            }) { Text(stringResource(R.string.main_yes_stay_friends)) }
                        },
                        dismissButton = { TextButton(onClick = { Friendship.decline(this@MainActivity, req) }) { Text(stringResource(R.string.main_not_now)) } },
                    )
                }
                if (askBattery) {
                    AlertDialog(
                        onDismissRequest = { askBattery = false },
                        title = { Text(stringResource(R.string.main_battery_title)) },
                        text = {
                            Text(stringResource(R.string.main_battery_text))
                        },
                        confirmButton = {
                            TextButton(onClick = {
                                askBattery = false
                                runCatching { startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) }
                            }) { Text(stringResource(R.string.main_open_settings)) }
                        },
                        dismissButton = { TextButton(onClick = { askBattery = false }) { Text(stringResource(R.string.main_not_now)) } },
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
                        val batteryIssue = stringResource(R.string.main_setup_battery)
                        FinderScreen(
                            title = when {
                                names.size == 1 -> names[0]
                                group != null && tracking.size > 1 -> group.name
                                else -> pluralStringResource(R.plurals.main_n_mates, names.size, names.size)
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
                            // "Message Sam" for the one mate the finder is showing (docs/PRIVATE_MESSAGES.md).
                            onMessage = if (GroupSync.group.value != null && !GroupSync.following) ({ id -> messageMate(id) }) else null,
                            canMessage = ::canMessageMate,
                            messageUnread = PrivateMessages.unreadByFriend(this@MainActivity),
                            onFound = { NightStats.found(this@MainActivity) },
                            beaconOn = beaconOn,
                            onBeacon = ::setBeacon,
                            beaconing = beaconing.mapNotNull { id ->
                                FriendsRepository.byId(id)?.let { Txt.s(R.string.main_beacon_colour_name, nz.waveformlabs.moshpoint.ui.beaconColourName(nz.waveformlabs.moshpoint.core.BeaconColour.forSecret(it.secret)), it.name) }
                            },
                            myBeacon = nz.waveformlabs.moshpoint.core.BeaconColour.forSecret(Identity.current(this@MainActivity)),
                            onBack = {
                                setBeacon(false)
                                finding = false
                                stopEngineSoon()
                            },
                            warning = setupIssues.firstOrNull { it.text != batteryIssue },
                            floors = Floors.tags,
                            // Mates' "I'm here" pins: where the arrow points at one, its floor and how long ago (docs/IM_HERE.md).
                            // Tapped one mate in the crew view: their UWB place comes first.
                            onFocus = { id -> engine.focus(id) },
                            pinned = HerePins.pins.mapValues { (id, h) ->
                                nz.waveformlabs.moshpoint.ui.PinNote(nz.waveformlabs.moshpoint.core.HereRule.ageSec(h, System.currentTimeMillis() / 1000), HerePins.floors[id])
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
                                    val simPin by engine.simPin.collectAsState()
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
                                        onSimPin = { m -> if (m == null) engine.unpinSims() else if (!engine.pinSimsAhead(m)) toast("No GPS fix yet: step outside for a moment") },
                                        simPinned = simPin != null,
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
                                        .setPrompt(Txt.s(R.string.main_scan_prompt))
                                        .setBeepEnabled(false)
                                        .setOrientationLocked(true),
                                )
                            },
                            scanned = scanned,
                            onScannedUsed = { scanned = null },
                            onAdd = { name, code, gig ->
                                FriendsRepository.add(name, code, gig, mySecret).also { if (it == null) toast(Txt.s(R.string.main_friend_added, name.trim())) }
                            },
                            onRemove = { id ->
                                val f = FriendsRepository.friends.firstOrNull { it.id == id }
                                val g = GroupSync.group.value
                                if (f != null && f.gigGroupOnly && g != null && !GroupSync.following) {
                                    // Really out: the crew moves to a new key they don't get. (Only the owner, in an owned crew.)
                                    if (CrewRekey.mayRemove(this@MainActivity, g)) {
                                        CrewRekey.rekey(this@MainActivity, g, GroupSync.pubOf(f.secret), f.name)
                                        FriendsRepository.remove(id)
                                        toast(Txt.s(R.string.main_out_of_crew, f.name))
                                    }
                                } else {
                                    FriendsRepository.remove(id)
                                }
                            },
                            onSetPhoto = { id ->
                                photoFor = id
                                pickPhoto.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            onRemovePhoto = PhotoStore::remove,
                            onClearGigGroup = { recap = NightStats.get(this@MainActivity) },
                            groupName = GroupSync.group.value?.name,
                            canRemoveCrewMates = GroupSync.group.value?.let { CrewRekey.mayRemove(this@MainActivity, it) } ?: true,
                            onStartGroup = { name ->
                                qrCrew = GroupSync.startNew(this@MainActivity, name)
                                setVisibility(true)
                                showGroupQr = true
                            },
                            onKeepFriend = { id -> toast(Friendship.request(this@MainActivity, id)) },
                            // "Message Sam" in a crew mate's options, and a count on their face (docs/PRIVATE_MESSAGES.md).
                            onMessage = if (GroupSync.group.value != null && !GroupSync.following) ({ id -> messageMate(id) }) else null,
                            canMessage = ::canMessageMate,
                            privateUnread = PrivateMessages.unreadByFriend(this@MainActivity),
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
                            onOpenStory = { showStory = true },
                            onOpenChat = { openChat(null) },
                            chatUnread = CrewChat.unreadFor(this@MainActivity, GroupSync.group.value),
                            pinnedPlan = GroupSync.group.value?.let { CrewChat.planFor(this@MainActivity, it)?.text },
                            upNext = Crews.others.map { e ->
                                nz.waveformlabs.moshpoint.ui.UpNextCard(
                                    id = e.id, name = e.group.name,
                                    whenText = e.group.startsAtSec.takeIf { it > 0 }?.let { nz.waveformlabs.moshpoint.ui.gigWhen(it) },
                                    countdown = nz.waveformlabs.moshpoint.ui.countdown(e.group.startsAtSec, homeNow / 1000),
                                    venue = e.group.venue, mates = maxOf(e.mates.size, CrewChat.peopleCount(this@MainActivity, e.group)),
                                    unread = CrewChat.unreadFor(this@MainActivity, e.group),
                                    plan = CrewChat.planFor(this@MainActivity, e.group)?.text,
                                    following = e.following,
                                )
                            },
                            onOpenUpNext = { id -> openChat(id) },
                            flareNotes = CrewChat.flares.values.filter { it.untilSec > homeNow / 1000 }.mapNotNull { fl ->
                                FriendsRepository.friends.firstOrNull { it.name.equals(fl.from, true) }?.let { it.id to "🔥 ${fl.vibe}" }
                            }.toMap(),
                            following = GroupSync.following,
                            tileNotes = CrewStatus.venueNotes,
                            followers = GroupSync.followers,
                            pastGigs = GigArchive.gigs,
                            currentGigId = GroupSync.group.value?.let(GigArchive::idFor),
                            onOpenGig = { g ->
                                archiveGig = g
                                archiveItems = emptyList()
                                lifecycleScope.launch { archiveItems = GigArchive.load(this@MainActivity, g.id) }
                            },
                            onLetFamilyFollow = {
                                GroupSync.group.value?.let { g ->
                                    Sharing.send(
                                        this@MainActivity,
                                        Txt.s(R.string.main_follow_share_text, g.name, getTheApp + withRelay(GigGroup.qr(g, null, follower = true))),
                                        Txt.s(R.string.main_follow_share_title),
                                    )
                                }
                            },
                            crewWhen = GroupSync.group.value?.takeIf { it.startsAtSec > 0 }?.let { g ->
                                nz.waveformlabs.moshpoint.ui.gigWhen(g.startsAtSec).let { w -> if (g.venue.isNotBlank()) Txt.s(R.string.main_when_venue, w, g.venue) else w }
                            },
                            crewSleeping = homeNow > 0 && GroupSync.sleeping,
                            onBump = {
                                bumping = true
                                Bump.start(this@MainActivity, GroupSync.group.value?.let { crewQr(it) })
                            },
                            onOpenMoment = momentFlow::view,
                            ghost = GhostMode.on.value,
                            onAddSimulated = if (DebugStatus.enabled) ({ FriendsRepository.addSimulated() }) else null,
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
                            venueMap = VenueMaps.status.value,
                        )
                    }
                    }
                    momentFlow.Dialogs()
                    if (planGig) {
                        nz.waveformlabs.moshpoint.ui.PlanGigSheet(
                            search = if (GigSearch.available) ({ q -> GigSearch.search(q) }) else null,
                            onPick = { name, at, venue, lat, lon ->
                                if (at < System.currentTimeMillis() / 1000 - 3600) {
                                    toast(Txt.s(R.string.main_time_passed))
                                    return@PlanGigSheet
                                }
                                planGig = false
                                val made = GroupSync.startNew(this@MainActivity, name, at, venue, lat, lon)
                                val isMain = GroupSync.group.value?.key?.contentEquals(made.key) == true
                                if (isMain && !GroupSync.sleeping) setVisibility(true)
                                if (!isMain) toast(Txt.s(R.string.main_added_up_next, made.name))
                                qrCrew = made
                                showGroupQr = true
                            },
                            onClose = { planGig = false },
                            lookupVenue = { text ->
                                val near = lastKnownLocation()?.let { nz.waveformlabs.moshpoint.core.LatLon(it.latitude, it.longitude) }
                                (VenueLookup.find(this@MainActivity, text, near) as? VenueLookup.Result.Found)?.at?.let { it.lat to it.lon }
                            },
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
                            ?.let { GigGroup.parseQr(it.qrText, System.currentTimeMillis())?.name } ?: stringResource(R.string.main_the_crew)
                        androidx.compose.material3.AlertDialog(
                            onDismissRequest = { Bump.received.value = null },
                            containerColor = Mosh.Deep,
                            title = { androidx.compose.material3.Text(stringResource(R.string.main_join_name, name), style = Mosh.Heading) },
                            text = { androidx.compose.material3.Text(stringResource(R.string.main_bumped_text), style = Mosh.Body) },
                            confirmButton = {
                                androidx.compose.material3.TextButton(onClick = {
                                    Bump.received.value = null
                                    bumping = false
                                    Bump.stop(this@MainActivity)
                                    handleInvite(text)
                                }) { androidx.compose.material3.Text(stringResource(R.string.main_join), style = Mosh.Label.copy(color = Mosh.Lime)) }
                            },
                            dismissButton = {
                                androidx.compose.material3.TextButton(onClick = { Bump.received.value = null }) {
                                    androidx.compose.material3.Text(stringResource(R.string.main_no), style = Mosh.Label)
                                }
                            },
                        )
                    }
                    clipInvite?.let { (text, name) ->
                        val follow = GigGroup.isFollowInvite(text)
                        androidx.compose.material3.AlertDialog(
                            onDismissRequest = { clipInvite = null },
                            containerColor = Mosh.Deep,
                            title = { androidx.compose.material3.Text(if (follow) stringResource(R.string.main_follow_name, name) else stringResource(R.string.main_join_name, name), style = Mosh.Heading) },
                            text = {
                                androidx.compose.material3.Text(
                                    if (follow) stringResource(R.string.main_clip_follow_text)
                                    else stringResource(R.string.main_clip_join_text),
                                    style = Mosh.Body,
                                )
                            },
                            confirmButton = {
                                androidx.compose.material3.TextButton(onClick = { clipInvite = null; handleInvite(text) }) {
                                    androidx.compose.material3.Text(stringResource(R.string.main_join), style = Mosh.Label.copy(color = Mosh.Lime))
                                }
                            },
                            dismissButton = {
                                androidx.compose.material3.TextButton(onClick = { clipInvite = null }) {
                                    androidx.compose.material3.Text(stringResource(R.string.main_not_now), style = Mosh.Label)
                                }
                            },
                        )
                    }
                    recap?.let { s ->
                        androidx.compose.material3.AlertDialog(
                            onDismissRequest = { recap = null },
                            containerColor = Mosh.Deep,
                            title = { androidx.compose.material3.Text(stringResource(R.string.main_your_night), style = Mosh.Heading) },
                            text = {
                                androidx.compose.material3.Text(
                                    stringResource(R.string.main_recap_text, NightStats.summary(s, System.currentTimeMillis())),
                                    style = Mosh.Body,
                                )
                            },
                            confirmButton = {
                                androidx.compose.material3.TextButton(onClick = {
                                    recap = null
                                    GroupSync.clear(this@MainActivity)
                                    NightStats.reset(this@MainActivity)
                                    lifecycleScope.launch { GigArchive.refreshList(this@MainActivity) }
                                    toast(Txt.s(R.string.main_night_ended))
                                }) { androidx.compose.material3.Text(stringResource(R.string.main_end_the_night), style = Mosh.Label.copy(color = Mosh.Danger)) }
                            },
                            dismissButton = {
                                androidx.compose.material3.TextButton(onClick = {
                                    Sharing.send(this@MainActivity, Txt.s(R.string.main_share_night_text, NightStats.summary(s, System.currentTimeMillis())), Txt.s(R.string.main_share_night_title))
                                }) { androidx.compose.material3.Text(stringResource(R.string.main_share), style = Mosh.Label.copy(color = Mosh.Cyan)) }
                            },
                        )
                    }
                    val chatCrew = CrewChat.viewing.value
                    // Chat slides in from the side (and back out), like opening a conversation.
                    androidx.compose.animation.AnimatedVisibility(
                        visible = showChat && chatCrew != null,
                        enter = androidx.compose.animation.slideInHorizontally(androidx.compose.animation.core.tween(320)) { it / 3 } +
                            androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(240)),
                        exit = androidx.compose.animation.slideOutHorizontally(androidx.compose.animation.core.tween(240)) { it / 3 } +
                            androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(200)),
                    ) {
                        @Suppress("NAME_SHADOWING")
                        val chatCrew = chatCrew ?: return@AnimatedVisibility
                        val isMain = GroupSync.group.value?.key?.contentEquals(chatCrew.key) == true
                        val waiting = if (isMain) null else Crews.find(chatCrew.key)
                        androidx.compose.runtime.DisposableEffect(Unit) {
                            CrewChat.open = true
                            onDispose { CrewChat.open = false }
                        }
                        androidx.compose.runtime.LaunchedEffect(Unit) {
                            // Fresh messages while you're looking (and for crews asleep until gig day).
                            while (true) {
                                runCatching { GroupSync.pollPingsNow(this@MainActivity) }
                                kotlinx.coroutines.delay(if (nz.waveformlabs.moshpoint.locate.RelayClient.ownServer) 8_000 else 20_000)
                            }
                        }
                        nz.waveformlabs.moshpoint.ui.CrewChatScreen(
                            crewName = chatCrew.name,
                            lines = CrewChat.lines,
                            plan = CrewChat.plan.value,
                            flares = CrewChat.flares.values.filter { it.untilSec > homeNow / 1000 }.sortedBy { it.untilSec },
                            myName = VisibilityPrefs.myName(this@MainActivity).ifBlank { "Mate" },
                            nowSec = homeNow / 1000,
                            meetUp = if (isMain) GroupSync.rally.value?.name else null,
                            readOnly = if (isMain) GroupSync.following else waiting?.following == true,
                            nightTools = isMain && !GroupSync.sleeping && !GroupSync.following,
                            subtitle = if (chatCrew.startsAtSec > 0) {
                                listOfNotNull(
                                    nz.waveformlabs.moshpoint.ui.gigWhen(chatCrew.startsAtSec),
                                    nz.waveformlabs.moshpoint.ui.countdown(chatCrew.startsAtSec, homeNow / 1000),
                                ).joinToString(" · ")
                            } else null,
                            onInvite = { qrCrew = chatCrew; showGroupQr = true },
                            onRetry = { CrewChat.retry(this@MainActivity, it) },
                            offlineHint = OfflineMessages.chatHint(this@MainActivity, chatCrew),
                            onMakeMain = if (waiting != null && !chatCrew.dormant(homeNow) && !waiting.following) ({
                                GroupSync.makeMain(this@MainActivity, waiting)
                                CrewChat.show(this@MainActivity, GroupSync.group.value)
                                setVisibility(true)
                                toast(Txt.s(R.string.main_now_main_crew, waiting.group.name))
                            }) else null,
                            onSend = { CrewChat.send(this@MainActivity, it) },
                            onSetPlan = { CrewChat.setPlan(this@MainActivity, it) },
                            onFlare = { vibe ->
                                val loc = lastKnownLocation()
                                CrewChat.flare(this@MainActivity, vibe, loc?.latitude, loc?.longitude)
                            },
                            onEndFlare = { CrewChat.endFlare(this@MainActivity) },
                            onPing = { kind ->
                                val loc = lastKnownLocation()
                                GroupSync.sendPing(this@MainActivity, kind, loc?.latitude, loc?.longitude)
                            },
                            onCheckIn = { minutes ->
                                val loc = lastKnownLocation()
                                GroupSync.startCheckIn(this@MainActivity, minutes, loc?.latitude, loc?.longitude)
                            },
                            onSharePlan = { sharePlanCard() },
                            onOpenMap = { closeChat(); openMap() },
                            onBack = { closeChat() },
                            photoOf = { name, mine ->
                                if (mine) PhotoStore.photos[PhotoStore.ME]
                                else FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.let { PhotoStore.photos[it.id] }
                            },
                            colourOf = { name -> FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.color },
                        )
                    }
                    // A private thread slides in like the crew chat, over whatever was open (docs/PRIVATE_MESSAGES.md).
                    val pm = PrivateMessages.open.value
                    androidx.compose.animation.AnimatedVisibility(
                        visible = pm != null,
                        enter = androidx.compose.animation.slideInHorizontally(androidx.compose.animation.core.tween(320)) { it / 3 } +
                            androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(240)),
                        exit = androidx.compose.animation.slideOutHorizontally(androidx.compose.animation.core.tween(240)) { it / 3 } +
                            androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(200)),
                    ) {
                        @Suppress("NAME_SHADOWING")
                        val pm = pm ?: return@AnimatedVisibility
                        androidx.compose.runtime.DisposableEffect(Unit) {
                            PrivateMessages.onScreen = true
                            onDispose { PrivateMessages.onScreen = false }
                        }
                        androidx.compose.runtime.LaunchedEffect(Unit) {
                            // Fresh messages while you're looking: the private mailbox rides with the chat's.
                            while (true) {
                                runCatching { GroupSync.pollPingsNow(this@MainActivity) }
                                kotlinx.coroutines.delay(if (nz.waveformlabs.moshpoint.locate.RelayClient.ownServer) 8_000 else 20_000)
                            }
                        }
                        val pmCrew = PrivateMessages.crewOf(this@MainActivity, pm.crewId)
                        val mate = pm.friendId?.let { FriendsRepository.byId(it) }
                        nz.waveformlabs.moshpoint.ui.PrivateChatScreen(
                            name = pm.name,
                            lines = PrivateMessages.lines,
                            nowSec = homeNow / 1000,
                            myName = VisibilityPrefs.myName(this@MainActivity).ifBlank { Txt.s(R.string.crew_default_name) },
                            muted = PrivateMessages.muted.value,
                            onSend = { PrivateMessages.send(this@MainActivity, it) },
                            onBack = { PrivateMessages.close() },
                            onMute = { PrivateMessages.setMuted(this@MainActivity, it) },
                            onRetry = { PrivateMessages.retry(this@MainActivity, it) },
                            offlineHint = pmCrew?.let { OfflineMessages.chatHint(this@MainActivity, it) },
                            face = mate?.let { PhotoStore.photos[it.id] },
                            myFace = PhotoStore.photos[PhotoStore.ME],
                            colour = mate?.color,
                        )
                    }
                    // The Story rises up from the bottom, like a card stack.
                    androidx.compose.animation.AnimatedVisibility(
                        visible = showStory,
                        enter = androidx.compose.animation.slideInVertically(androidx.compose.animation.core.tween(340)) { it / 4 } +
                            androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(260)),
                        exit = androidx.compose.animation.slideOutVertically(androidx.compose.animation.core.tween(240)) { it / 4 } +
                            androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(200)),
                    ) {
                        nz.waveformlabs.moshpoint.ui.StoryScreen(
                            items = Moments.items,
                            nowSec = homeNow / 1000,
                            colourOf = { name -> FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.color },
                            onShare = if (GroupSync.following) null else momentFlow::start,
                            onMap = { showStory = false; openMap() },
                            onBack = { showStory = false },
                            following = GroupSync.following,
                            photoOf = { name, mine ->
                                if (mine) PhotoStore.photos[PhotoStore.ME]
                                else FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.let { PhotoStore.photos[it.id] }
                            },
                            myName = myName,
                            onRefresh = { GroupSync.group.value?.let { g -> Moments.refreshNow(this@MainActivity, g) } },
                            onSaveOne = { m -> saveToPhone(listOf(m), GroupSync.group.value?.name ?: Txt.s(R.string.main_gig_fallback)) },
                            onSaveAll = { saveToPhone(Moments.items.toList(), GroupSync.group.value?.name ?: Txt.s(R.string.main_gig_fallback)) },
                            onAddFromPhone = GroupSync.group.value?.let { g -> { startRoll(GigArchive.idFor(g), g.name) } },
                            live = GroupSync.group.value != null && !GroupSync.sleeping,
                        )
                    }
                    archiveGig?.let { g ->
                        nz.waveformlabs.moshpoint.ui.StoryScreen(
                            items = archiveItems,
                            nowSec = homeNow / 1000,
                            colourOf = { name -> FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.color },
                            onShare = null,
                            onMap = { archiveGig = null; openMap() },
                            onBack = { archiveGig = null },
                            photoOf = { name, mine ->
                                if (mine) PhotoStore.photos[PhotoStore.ME]
                                else FriendsRepository.friends.firstOrNull { it.name.equals(name, true) }?.let { PhotoStore.photos[it.id] }
                            },
                            myName = myName,
                            live = false,
                            title = g.name,
                            onSaveOne = { m -> saveToPhone(listOf(m), g.name) },
                            onSaveAll = { saveToPhone(archiveItems, g.name) },
                            onAddFromPhone = { startRoll(g.id, g.name) },
                            onDelete = {
                                archiveGig = null
                                lifecycleScope.launch {
                                    GigArchive.delete(this@MainActivity, g.id)
                                    toast(Txt.s(R.string.main_deleted_gig, g.name))
                                }
                            },
                        )
                    }
                    // The map zooms in from the button, and out again.
                    androidx.compose.animation.AnimatedVisibility(
                        visible = showMap,
                        enter = androidx.compose.animation.scaleIn(androidx.compose.animation.core.tween(320), initialScale = 0.94f) +
                            androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(260)),
                        exit = androidx.compose.animation.scaleOut(androidx.compose.animation.core.tween(220), targetScale = 0.96f) +
                            androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(200)),
                    ) {
                        val now by produceState(System.currentTimeMillis()) {
                            while (true) {
                                kotlinx.coroutines.delay(15_000)
                                value = System.currentTimeMillis()
                            }
                        }
                        val myLoc = mapFeed.me.value
                        androidx.compose.runtime.LaunchedEffect(myLoc) { myLoc?.let { mapFirstFix(it) } }
                        val mapUwb by engine.uwbSpots.collectAsState()
                        val mapArrows by engine.arrows.collectAsState()
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
                                    toast(Txt.s(R.string.main_meetup_sent))
                                } else {
                                    Spots.add(name, lat, lon)
                                }
                            },
                            moments = Moments.items.mapNotNull { m ->
                                val lat = m.lat ?: return@mapNotNull null
                                val lon = m.lon ?: return@mapNotNull null
                                nz.waveformlabs.moshpoint.ui.MapMoment(m.key, Txt.s(R.string.main_moment_label, if (m.mine) Txt.s(R.string.main_you) else m.from, nz.waveformlabs.moshpoint.ui.ago(now / 1000 - m.timeSec)), lat, lon, m.image)
                            },
                            trails = LocationBook.trails,
                            // The venue map saved on the phone: at the gig, or when there's no internet.
                            savedStyle = { look ->
                                VenueMaps.savedChanges.intValue // look again when a saved map appears or goes
                                if (mapVenue == null && VenueMaps.online(this@MainActivity)) null
                                else VenueMaps.saved(this@MainActivity, look)?.let { nz.waveformlabs.moshpoint.ui.MapStyle(it.key, json = it.json) }
                            },
                            venueView = mapVenue,
                            floors = Floors.tags,
                            heights = Floors.heights,
                            // "I'm here" (docs/IM_HERE.md): mates' faces on the spots they pinned, ours with ✕.
                            pinned = HerePins.pins,
                            pinnedFloors = HerePins.floors,
                            myPin = HerePins.mine.value,
                            onImHere = { lat: Double, lon: Double ->
                                if (HerePins.setHere(this@MainActivity, lat, lon)) toast(Txt.s(R.string.here_sent))
                            }.takeIf { HerePins.canSend() },
                            onClearMyPin = { HerePins.clearHere(this@MainActivity) },
                            uwb = mapUwb,
                            // Only while something is looking: old readings say nothing about now.
                            near = if (mapVenue == null && !finding) emptyMap()
                            else mapArrows.filterIsInstance<nz.waveformlabs.moshpoint.core.ArrowState.DistanceOnly>().associate { it.friendId to it.distanceM },
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
                    momentFlow.CameraOverlay()
                    rollGig?.let { (_, name) ->
                        nz.waveformlabs.moshpoint.ui.CameraRollPicker(name, rollFound, rollAdding, onAdd = ::addFromPhone, onClose = { rollGig = null })
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
            getString(R.string.main_share_app_text, getTheApp + crewQr(ensureCrew())),
            getString(R.string.main_share_app_title),
        )
    }

    /** Your crew for tonight, starting one (named after you) if there isn't one. Also goes live. */
    private fun ensureCrew(): GigGroup {
        GroupSync.group.value?.let { return it }
        val name = if (myName.isNotBlank()) getString(R.string.main_named_crew, myName.trim()) else getString(R.string.main_tonights_crew)
        GroupSync.startNew(this, name)
        setVisibility(true)
        return GroupSync.group.value!!
    }

    private fun shareCode(@Suppress("UNUSED_PARAMETER") code: String) = shareGroup(ensureCrew())

    /** The crew QR / invite text, with us inside it so whoever joins can find us at once. */
    /** Open the chat of crew [crewId] (null = the main crew). */
    private fun openChat(crewId: String?) {
        Crews.load(this)
        val g = crewId?.let { id -> Crews.others.firstOrNull { it.id == id }?.group } ?: GroupSync.group.value ?: return
        CrewChat.show(this, g)
        showChat = true
    }

    /** A private message's notification was tapped: open that thread ("crew id:mate tag", docs/PRIVATE_MESSAGES.md). */
    private fun openPrivateFrom(intent: Intent?) {
        val thread = intent?.getStringExtra(EXTRA_OPEN_PRIVATE) ?: return
        intent.removeExtra(EXTRA_OPEN_PRIVATE)
        val tag = thread.substringAfterLast(':').toLongOrNull() ?: return
        PrivateMessages.showByTag(this, thread.substringBeforeLast(':'), tag)
    }

    /** "Message Sam": open the private thread with crew mate [friendId]. */
    private fun messageMate(friendId: String) {
        val f = FriendsRepository.byId(friendId) ?: return
        if (!PrivateMessages.showFriend(this, f)) toast(Txt.s(R.string.crew_friend_unreachable, f.name))
    }

    /**
     * "Message Sam" is offered only once a private message can reach them: their phone has
     * checked in tonight, so we have its key. Never a simulated mate (no phone to check in);
     * before, tapping it only brought up a "can't reach them" toast.
     */
    private fun canMessageMate(friendId: String): Boolean =
        FriendsRepository.byId(friendId)?.let { f -> !FriendsRepository.isSimulated(f.id) && PrivateMessages.mateFor(this, f) != null } == true

    private fun closeChat() {
        showChat = false
        // After the slide-out, so the closing chat doesn't swap to another crew's messages mid-animation.
        lifecycleScope.launch {
            kotlinx.coroutines.delay(300)
            if (!showChat) CrewChat.show(this@MainActivity, GroupSync.group.value)
        }
    }

    /** The night's plan as a picture for the group chat that isn't on Moshpoint yet. */
    private fun sharePlanCard() {
        val g = CrewChat.viewing.value ?: GroupSync.group.value ?: return
        val isMain = GroupSync.group.value?.key?.contentEquals(g.key) == true
        val crew = listOf(VisibilityPrefs.myName(this).ifBlank { getString(R.string.main_me) }) + if (isMain) {
            FriendsRepository.friends.filter { (it.gigGroupOnly || it.key in GroupSync.members) && !FriendsRepository.isSimulated(it.id) }.map { it.name }
        } else Crews.find(g.key)?.mates?.map { it.second }.orEmpty()
        val whenWhere = listOfNotNull(
            g.startsAtSec.takeIf { it > 0 }?.let { nz.waveformlabs.moshpoint.ui.gigWhen(it) },
            g.venue.takeIf { it.isNotBlank() },
        ).joinToString(" · ").ifBlank { null }
        PlanCardImage.share(this, PlanCardImage.Card(g.name, whenWhere, CrewChat.planFor(this, g)?.text, if (isMain) GroupSync.rally.value?.name else null, crew.distinct()))
    }

    private fun crewQr(g: GigGroup) =
        // Our pass in this crew (never our permanent identity) and signing key ride in the invite.
        withRelay(GigGroup.qr(g, Identity.intro(this, g, myName.ifBlank { "Mate" })))

    /** The crew's relay server travels in the invite, so everyone who joins uses the same one. */
    private fun withRelay(qr: String): String {
        val r = RelayClient.shareableServer.takeIf { it.isNotBlank() } ?: return qr
        return qr.replaceFirst("&name=", "&r=${java.net.URLEncoder.encode(r, "UTF-8")}&name=")
    }

    private fun shareGroup(g: GigGroup) {
        Sharing.send(this, getString(R.string.main_group_invite_text, g.name, getTheApp + crewQr(g)), getString(R.string.main_group_invite_title))
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
        Floors.release(watching = true)
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
        Floors.acquire(this, watching = true) // our own pressure, for upstairs/downstairs
        if (showMap) mapFeed.start()
        if (!holdingGroup) {
            GroupSync.acquire(this)
            holdingGroup = true
        }
        pendingStop?.cancel()
        if (finding || mapEngine) engine.start()
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
        /** Notification tap: "this mate is lighting up their screen": the finder on them. */
        const val EXTRA_FIND_MATE = "nz.waveformlabs.moshpoint.FIND_MATE"
        /** Notification tap: open the map (a crew ping or help request). */
        const val EXTRA_OPEN_MAP = "nz.waveformlabs.moshpoint.OPEN_MAP"
        const val EXTRA_OPEN_CHAT = "nz.waveformlabs.moshpoint.OPEN_CHAT"
        const val EXTRA_CHAT_CREW = "nz.waveformlabs.moshpoint.CHAT_CREW"
        /** Notification tap: open a private thread, "crew id:mate tag" (see PrivateMessages). */
        const val EXTRA_OPEN_PRIVATE = "nz.waveformlabs.moshpoint.OPEN_PRIVATE"

        /** How long after the map opens its first position may still open the venue view. */
        private const val MAP_FIRST_FIX_MS = 15_000L
    }
}
