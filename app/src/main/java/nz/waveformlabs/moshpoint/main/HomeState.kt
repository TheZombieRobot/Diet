package nz.waveformlabs.moshpoint.main

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.MainActivity
import nz.waveformlabs.moshpoint.R
import nz.waveformlabs.moshpoint.Txt
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.crew.Crews
import nz.waveformlabs.moshpoint.crew.GroupSync
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.gigs.GigArchive
import nz.waveformlabs.moshpoint.gigs.NightStats
import nz.waveformlabs.moshpoint.profile.AvatarSync
import nz.waveformlabs.moshpoint.profile.FacebookLogin
import nz.waveformlabs.moshpoint.profile.PhotoStore
import nz.waveformlabs.moshpoint.service.VisibilityPrefs
import nz.waveformlabs.moshpoint.service.VisibilityService

/**
 * The home screen and what the whole app shares: your name, Go live, calm motion, the clock the
 * home's "x min ago" runs on, and the crew's once-a-night steps (plan a gig, end the night, hand
 * the crew over). Owned by [MainActivity]: created with it and gone with it.
 */
internal class HomeState(private val a: MainActivity) {
    var visibleToMates by mutableStateOf(false)
    var onboarded by mutableStateOf(true)

    /** Continue with Facebook: fills your name (if empty) and photo, which friends then get. */
    val facebook = FacebookLogin(
        a,
        onProfile = { name, photo ->
            if (name != null && myName.isBlank()) {
                myName = name.substringBefore(' ')
                VisibilityPrefs.setMyName(a, myName)
            }
            // Your Facebook picture becomes your photo unless you've already chosen one.
            if (photo != null && PhotoStore.photos[PhotoStore.ME] == null) {
                a.lifecycleScope.launch {
                    if (PhotoStore.set(PhotoStore.ME, photo)) AvatarSync.publishMine(a, force = true)
                }
            }
        },
        onFail = { DebugStatus.log(it) },
    )
    var calmMotion by mutableStateOf(false)

    /** Battery saver on, or animations turned off in accessibility settings. */
    fun shouldCalm(): Boolean {
        val power = a.getSystemService(PowerManager::class.java)
        val scale = Settings.Global.getFloat(a.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
        return power?.isPowerSaveMode == true || scale == 0f
    }

    val powerSaveReceiver = object : BroadcastReceiver() {
        override fun onReceive(c: Context, i: Intent) {
            calmMotion = shouldCalm()
        }
    }
    var alwaysOn by mutableStateOf(false)
    var planGig by mutableStateOf(false)

    /** "Your night" recap shown before ending the night. */
    var recap by mutableStateOf<NightStats.Stats?>(null)
    /** Ticks every 20 s so "x min ago" on the home screen stays current. */
    var homeNow by mutableStateOf(System.currentTimeMillis())
    var myName by mutableStateOf("")

    /** Set once in onCreate, from this phone's secret (as when they were locals there). */
    lateinit var mySecret: ByteArray
    lateinit var myCode: String
    /** Set once in onCreate, from the finder's capabilities. */
    lateinit var phoneSummary: String

    /** The owner is leaving a crew with others still in it: who takes it over? (crew, its Up next entry if any) */
    var handover by mutableStateOf<Pair<GigGroup, Crews.Entry?>?>(null)
    /** The handover was asked from the recap's End the night: the night ends only if you really leave. */
    var handoverEndsNight by mutableStateOf(false)

    /** The night is over: its stats go, and you're told it's saved. Only once you've actually left. */
    fun nightEnded() {
        NightStats.reset(a)
        a.toast(Txt.s(R.string.main_night_ended))
    }

    /** Leave [g]: the main crew ends here, an Up next one just goes. */
    fun leaveCrew(g: GigGroup, waiting: Crews.Entry?) {
        if (waiting != null) {
            a.chat.closeChat()
            GroupSync.leave(a, Crews.find(g.key) ?: waiting)
        } else {
            GroupSync.clear(a)
            // Tonight's gig moves to Past gigs.
            a.lifecycleScope.launch { GigArchive.refreshList(a) }
        }
    }

    fun setVisibility(on: Boolean) {
        if (on && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            a.checkSelfPermission(Manifest.permission.BLUETOOTH_ADVERTISE) != PackageManager.PERMISSION_GRANTED
        ) {
            a.permissions.askWithDisclosure()
            return
        }
        visibleToMates = on
        a.permissions.refreshSetupIssues()
        if (on) VisibilityService.start(a) else VisibilityService.stop(a)
        val power = a.getSystemService(PowerManager::class.java)
        if (on && power != null && !power.isIgnoringBatteryOptimizations(a.packageName)) a.permissions.askBattery = true
    }
}
