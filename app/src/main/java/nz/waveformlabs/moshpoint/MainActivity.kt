package nz.waveformlabs.moshpoint

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.net.wifi.WifiManager
import android.os.Bundle
import android.os.PowerManager
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.chat.ChatSync
import nz.waveformlabs.moshpoint.core.FriendRecord
import nz.waveformlabs.moshpoint.crew.Bump
import nz.waveformlabs.moshpoint.crew.FollowCheck
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.friends.FriendsRepository
import nz.waveformlabs.moshpoint.friends.Friendship
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.gigs.Memories
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import nz.waveformlabs.moshpoint.main.CameraState
import nz.waveformlabs.moshpoint.main.ChatState
import nz.waveformlabs.moshpoint.main.FinderState
import nz.waveformlabs.moshpoint.main.HomeState
import nz.waveformlabs.moshpoint.main.InviteState
import nz.waveformlabs.moshpoint.main.MainLaunchers
import nz.waveformlabs.moshpoint.main.MainScreen
import nz.waveformlabs.moshpoint.main.MapState
import nz.waveformlabs.moshpoint.main.PermissionsState
import nz.waveformlabs.moshpoint.main.StoryState
import nz.waveformlabs.moshpoint.map.LocationBook
import nz.waveformlabs.moshpoint.map.Spots
import nz.waveformlabs.moshpoint.moments.Moments
import nz.waveformlabs.moshpoint.moments.ShareQuality
import nz.waveformlabs.moshpoint.profile.AvatarSync
import nz.waveformlabs.moshpoint.profile.Identity
import nz.waveformlabs.moshpoint.profile.PhotoStore
import nz.waveformlabs.moshpoint.safety.GhostMode
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.venue.Floors
import nz.waveformlabs.moshpoint.venue.VenueMaps
import nz.waveformlabs.moshpoint.watch.PhoneFinderBridge

/**
 * The app's one screen. Its state lives in plain holders it owns, one per area (created with it
 * and gone with it, like the fields they replaced), its activity results in [MainLaunchers], and
 * what it shows in [MainScreen] (docs/CODE_STRUCTURE.md). What's left here is the lifecycle.
 */
class MainActivity : ComponentActivity() {
    internal val home = HomeState(this)
    internal val permissions = PermissionsState(this)
    internal val finder = FinderState(this)
    internal val map = MapState(this)
    internal val story = StoryState(this)
    internal val chat = ChatState(this)
    internal val invites = InviteState(this)
    internal val camera = CameraState(this)

    /** Registered while the activity is constructed, once the holders its callbacks use exist. */
    internal val launchers = MainLaunchers(this)
    internal val momentFlow get() = launchers.momentFlow

    /** Best recent position from Android (for pings and pins), or null. */
    @SuppressLint("MissingPermission")
    internal fun lastKnownLocation(): Location? {
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED
        ) return null
        val lm = getSystemService(LocationManager::class.java) ?: return null
        return lm.getProviders(true).mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }
            .filter { System.currentTimeMillis() - it.time < 10 * 60_000 }
            .minByOrNull { it.accuracy }
    }

    /**
     * Opened the app with a crew invite copied (from WhatsApp, Messenger...)? Offer to join
     * straight away: no Paste button to find. Each invite is only offered once.
     */
    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        invites.offerClipboardInvite(hasFocus)
    }

    internal fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        finder.handleLightRequest(intent)
        momentFlow.handleShared(intent)
        finder.handleFindCrew(intent)
        finder.handleFindMate(intent)
        if (intent.getBooleanExtra(EXTRA_OPEN_MAP, false)) {
            intent.removeExtra(EXTRA_OPEN_MAP)
            map.openMap()
        }
        if (intent.getBooleanExtra(EXTRA_OPEN_CHAT, false)) {
            intent.removeExtra(EXTRA_OPEN_CHAT)
            chat.openChat(intent.getStringExtra(EXTRA_CHAT_CREW))
        }
        chat.openPrivateFrom(intent)
        // An invite from another app is only offered: nothing happens until it's confirmed.
        intent.getStringExtra(ShareInviteActivity.EXTRA_TEXT)?.let { invites.offerSharedInvite(it) }
    }

    override fun onResume() {
        super.onResume()
        lifecycleScope.launch { GigArchive.refreshList(this@MainActivity) }
        VenueMaps.sync(this) // carries on a venue map download that was interrupted
        Friendship.load(this)
        permissions.missing = permissions.missingPermissions()
        permissions.refreshSetupIssues()
        // May have changed from the notification's Stop button or the Quick Settings tile.
        home.visibleToMates = VisibilityPrefs.isVisible(this)
        // In a crew tonight? Then you're findable, without having to remember a switch,
        // unless you've chosen to hide.
        if (!home.visibleToMates && home.onboarded && GroupSync.group.value != null && !GroupSync.sleeping && !GroupSync.following &&
            !VisibilityPrefs.userHid(this) && permissions.missing.isEmpty()
        ) {
            home.setVisibility(true)
        }
        home.calmMotion = home.shouldCalm()
        // Your photo out to friends, theirs in (each at most a few times a day).
        AvatarSync.publishMine(this)
        AvatarSync.fetchFriends(this)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        home.facebook.register()
        // Android may close the app while the photo picker is open: remember whose photo it was.
        camera.photoFor = savedInstanceState?.getString("photoFor")
        FriendsRepository.init(this)
        PhotoStore.init(this)
        LocationBook.init(this)
        Spots.init(this)
        GhostMode.init(this)
        ShareQuality.init(this)
        DebugStatus.initUi(this)
        GroupSync.load(this)
        VenueMaps.sync(this) // the venue's street map saves itself for every crew we're in
        if (GroupSync.following) FollowCheck.schedule(this)
        GroupSync.group.value?.let { runCatching { GigArchive.remember(this, it) } }
        lifecycleScope.launch {
            Moments.loadCurrent(this@MainActivity) // tonight's Story survives restarts
            GigArchive.refreshList(this@MainActivity)
            Memories.schedule(this@MainActivity, GigArchive.gigs)
        }
        home.mySecret = VisibilityPrefs.mySecret(this)
        // The finder (finder module, docs/FINDER_MODULE.md), with the gig app's parts plugged in.
        finder.engine = LocatorEngine(
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
        PhoneFinderBridge.attach(finder.engine)
        lifecycleScope.launch {
            while (true) {
                delay(20_000)
                home.homeNow = System.currentTimeMillis()
                // Every crew's chat (incl. Up next) every couple of minutes while the app is open.
                runCatching { ChatSync.pollAll(this@MainActivity, minGapMs = 110_000) }
            }
        }
        if (savedInstanceState == null) {
            finder.handleLightRequest(intent)
            momentFlow.handleShared(intent)
            finder.handleFindCrew(intent)
            finder.handleFindMate(intent)
            if (intent?.getBooleanExtra(EXTRA_OPEN_MAP, false) == true) map.openMap()
            if (intent?.getBooleanExtra(EXTRA_OPEN_CHAT, false) == true) chat.openChat(intent.getStringExtra(EXTRA_CHAT_CREW))
            chat.openPrivateFrom(intent)
            // An invite shared from another app, as in onNewIntent: after the finder engine and
            // the crews exist, and only offered (it joins once confirmed). docs/WAVE2_PLAY.md, item 4.
            intent?.getStringExtra(ShareInviteActivity.EXTRA_TEXT)?.let { invites.offerSharedInvite(it) }
        } else {
            invites.restore(savedInstanceState)
            story.restore(savedInstanceState)
        }
        home.visibleToMates = VisibilityPrefs.isVisible(this)
        home.myName = VisibilityPrefs.myName(this)
        home.alwaysOn = VisibilityPrefs.alwaysOn(this)
        home.onboarded = VisibilityPrefs.onboarded(this)
        // New users get asked during the welcome, right after hearing why.
        if (home.onboarded) permissions.askWithDisclosure()
        home.myCode = FriendRecord.shareCode(home.mySecret)
        val caps = finder.engine.capabilities
        home.phoneSummary = getString(
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
            MainScreen(this)
        }
    }

    override fun onStop() {
        super.onStop()
        finder.setBeacon(false)
        Floors.release(watching = true)
        map.mapFeed.stop()
        if (invites.bumping) {
            invites.bumping = false
            Bump.stop(this)
        }
        runCatching { unregisterReceiver(home.powerSaveReceiver) }
        runCatching { unregisterReceiver(permissions.radioReceiver) }
        pendingGroupRelease?.cancel()
        pendingGroupRelease = lifecycleScope.launch {
            delay(20_000)
            GroupSync.setAppOpen(this@MainActivity, false)
            if (holdingGroup) {
                GroupSync.release(this@MainActivity)
                holdingGroup = false
            }
        }
        finder.stopEngineSoon()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        camera.photoFor?.let { outState.putString("photoFor", it) }
        invites.save(outState)
        story.save(outState)
    }

    // Gig-group radio: held while the app is open, released 20 s after it goes to the
    // background (so quick app switches don't burn Android's scan-start limit).
    private var holdingGroup = false
    private var pendingGroupRelease: Job? = null

    override fun onStart() {
        super.onStart()
        ContextCompat.registerReceiver(
            this, home.powerSaveReceiver, IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        ContextCompat.registerReceiver(
            this, permissions.radioReceiver,
            IntentFilter().apply {
                addAction(BluetoothAdapter.ACTION_STATE_CHANGED)
                addAction(LocationManager.MODE_CHANGED_ACTION)
                addAction(WifiManager.WIFI_STATE_CHANGED_ACTION)
            },
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
        pendingGroupRelease?.cancel()
        GroupSync.setAppOpen(this, true)
        Floors.acquire(this, watching = true) // our own pressure, for upstairs/downstairs
        if (map.showMap) map.mapFeed.start()
        if (!holdingGroup) {
            GroupSync.acquire(this)
            holdingGroup = true
        }
        finder.pendingStop?.cancel()
        if (finder.finding || map.mapEngine) finder.engine.start()
    }

    override fun onDestroy() {
        if (holdingGroup) {
            GroupSync.release(this)
            holdingGroup = false
        }
        finder.engine.stop()
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
    }
}
