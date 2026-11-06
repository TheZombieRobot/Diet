package nz.waveformlabs.moshpoint

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertisingSet
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import android.util.Base64
import android.util.Log
import androidx.compose.runtime.mutableStateOf
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.EphemeralId
import nz.waveformlabs.moshpoint.core.GigGroup
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.service.VisibilityPrefs

/**
 * One-QR gig groups on the phone (the crypto is in core `GigGroup`).
 *
 * While a group is active and the app is open or you're visible:
 *  - broadcast our encrypted intro (finding secret + name) over Bluetooth 5 extended adverts,
 *  - listen for other members' intros and add them to the gig group,
 *  - with signal, also post our intro to the relay server and fetch everyone else's, so
 *    members whose phones can't do extended adverts still get the list.
 */
object GroupSync {
    /** PLACEHOLDER 16-bit UUID for group intros; register with the Bluetooth SIG before release. */
    private val INTRO_UUID: ParcelUuid = ParcelUuid.fromString("0000FFA9-0000-1000-8000-00805F9B34FB")
    private const val TAG = "GroupSync"
    private const val GROUP_TTL_MS = 18L * 60 * 60 * 1000

    /** The active group, if any (Compose state for the friends screen). */
    val group = mutableStateOf<GigGroup?>(null)

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var users = 0
    private var job: Job? = null
    private var scanCallback: ScanCallback? = null
    private var advertCallback: AdvertisingSetCallback? = null
    private var advertSet: AdvertisingSet? = null

    // ---- Persistence ----

    private fun prefs(c: Context) = c.getSharedPreferences("group", Context.MODE_PRIVATE)

    fun load(c: Context) {
        val p = prefs(c)
        val key = p.getString("key", null) ?: return
        val created = p.getLong("created", 0)
        if (System.currentTimeMillis() - created > GROUP_TTL_MS) {
            clear(c)
            return
        }
        group.value = GigGroup(Base64.decode(key, Base64.NO_WRAP), p.getString("name", "Gig group") ?: "Gig group", created)
    }

    fun startNew(c: Context, name: String) = set(c.applicationContext, GigGroup.create(name, System.currentTimeMillis()))

    /** Returns false if [qrText] isn't a group QR. */
    fun join(c: Context, qrText: String): Boolean {
        val g = GigGroup.parseQr(qrText, System.currentTimeMillis()) ?: return false
        set(c.applicationContext, g)
        return true
    }

    private fun set(c: Context, g: GigGroup) {
        prefs(c).edit()
            .putString("key", Base64.encodeToString(g.key, Base64.NO_WRAP))
            .putString("name", g.name)
            .putLong("created", g.createdAtMs)
            .apply()
        group.value = g
        DebugStatus.log("Gig group: ${g.name}")
        if (users > 0) restart(c)
    }

    /** "End night": leave the group and drop its members. */
    fun clear(c: Context) {
        val app = c.applicationContext
        prefs(app).edit().clear().apply()
        group.value = null
        FriendsRepository.clearGigGroup()
        stopRadio(app)
    }

    /** Bluetooth toggled: the scan and advert died with it, so start them again. */
    @Synchronized
    fun onBluetooth(c: Context, on: Boolean) {
        advertSet = null
        advertCallback = null
        scanCallback = null
        if (on && users > 0) restart(c.applicationContext)
    }

    // ---- Running ----

    /** Ref-counted: the activity (while open) and the visibility service both call this. */
    @Synchronized
    fun acquire(c: Context) {
        users++
        if (users == 1) restart(c.applicationContext)
    }

    @Synchronized
    fun release(c: Context) {
        users = (users - 1).coerceAtLeast(0)
        if (users == 0) stopRadio(c.applicationContext)
    }

    private fun restart(c: Context) {
        stopRadio(c)
        val g = group.value ?: return
        val mySecret = VisibilityPrefs.mySecret(c)
        val myName = VisibilityPrefs.myName(c).ifBlank { "Mate" }
        startListening(c, g)
        job = scope.launch {
            var lastServer = 0L
            var sealedEpoch = Long.MIN_VALUE
            var intro = ByteArray(0)
            while (true) {
                val now = System.currentTimeMillis()
                // Seal once per epoch and reuse the bytes: the server de-duplicates identical
                // posts, so each member keeps exactly one slot in the roster box.
                val epoch = Math.floorDiv(now, EphemeralId.DEFAULT_ROTATION_MS)
                if (epoch != sealedEpoch) {
                    intro = g.sealIntro(GigGroup.Intro(mySecret, myName), now)
                    sealedEpoch = epoch
                }
                advertise(c, intro)
                if (RelayClient.enabled && now - lastServer > 30_000) {
                    lastServer = now
                    syncServer(c, g, intro, now)
                }
                // Re-seal each rotation so the tag keeps changing.
                delay(minOf(30_000L, (Math.floorDiv(now, EphemeralId.DEFAULT_ROTATION_MS) + 1) * EphemeralId.DEFAULT_ROTATION_MS - now + 50))
            }
        }
    }

    private suspend fun syncServer(c: Context, g: GigGroup, intro: ByteArray, now: Long) {
        val epoch = Math.floorDiv(now, EphemeralId.DEFAULT_ROTATION_MS)
        RelayClient.put(g.rosterIdForEpoch(epoch), intro)
        val ids = listOf(g.rosterIdForEpoch(epoch), g.rosterIdForEpoch(epoch - 1))
        RelayClient.lookup(ids)?.flatten()?.forEach { received(c, g, it) }
    }

    private fun received(c: Context, g: GigGroup, blob: ByteArray) {
        val intro = g.openIntro(blob, System.currentTimeMillis()) ?: return
        if (intro.secret.contentEquals(VisibilityPrefs.mySecret(c))) return // our own
        if (FriendsRepository.addFromIntro(intro.secret, intro.name)) {
            DebugStatus.log("Gig group: ${intro.name} joined")
        }
    }

    @SuppressLint("MissingPermission")
    private fun startListening(c: Context, g: GigGroup) {
        val adapter = c.getSystemService(BluetoothManager::class.java)?.adapter ?: return
        if (!adapter.isEnabled || !adapter.isLeExtendedAdvertisingSupported) {
            DebugStatus.set("Gig group", "Bluetooth intros unavailable (server only)")
            return
        }
        val cb = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                result.scanRecord?.getServiceData(INTRO_UUID)?.let { received(c, g, it) }
            }
        }
        try {
            adapter.bluetoothLeScanner?.startScan(
                listOf(ScanFilter.Builder().setServiceData(INTRO_UUID, ByteArray(0)).build()),
                ScanSettings.Builder().setLegacy(false).setPhy(ScanSettings.PHY_LE_ALL_SUPPORTED)
                    .setScanMode(ScanSettings.SCAN_MODE_LOW_POWER).build(),
                cb,
            )
            scanCallback = cb
            DebugStatus.set("Gig group", "${g.name}: listening for members")
        } catch (e: Exception) {
            Log.w(TAG, "group scan failed", e)
        }
    }

    @SuppressLint("MissingPermission")
    private fun advertise(c: Context, intro: ByteArray) {
        val adapter = c.getSystemService(BluetoothManager::class.java)?.adapter ?: return
        if (!adapter.isEnabled || !adapter.isLeExtendedAdvertisingSupported) return
        val data = AdvertiseData.Builder().addServiceData(INTRO_UUID, intro).build()
        try {
            val set = advertSet
            if (set != null) {
                set.setAdvertisingData(data)
                return
            }
            if (advertCallback != null) return // start pending
            val cb = object : AdvertisingSetCallback() {
                // Only the current set may change state: callbacks from a set we already
                // stopped can arrive late.
                override fun onAdvertisingSetStarted(s: AdvertisingSet?, txPower: Int, status: Int) {
                    if (advertCallback !== this) return
                    if (status == AdvertisingSetCallback.ADVERTISE_SUCCESS) advertSet = s else advertCallback = null
                }

                override fun onAdvertisingSetStopped(s: AdvertisingSet?) {
                    if (advertCallback !== this) return
                    advertSet = null
                    advertCallback = null
                }
            }
            advertCallback = cb
            adapter.bluetoothLeAdvertiser?.startAdvertisingSet(
                AdvertisingSetParameters.Builder()
                    .setLegacyMode(false).setConnectable(false).setScannable(false)
                    .setInterval(AdvertisingSetParameters.INTERVAL_HIGH) // ~1 s: intros aren't urgent
                    .setTxPowerLevel(AdvertisingSetParameters.TX_POWER_MEDIUM)
                    .setPrimaryPhy(BluetoothDevice.PHY_LE_1M).setSecondaryPhy(BluetoothDevice.PHY_LE_1M)
                    .build(),
                data, null, null, null, cb,
            )
        } catch (e: Exception) {
            Log.w(TAG, "group advert failed", e)
            advertCallback = null
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopRadio(c: Context) {
        job?.cancel()
        job = null
        val adapter = c.getSystemService(BluetoothManager::class.java)?.adapter
        try {
            scanCallback?.let { adapter?.bluetoothLeScanner?.stopScan(it) }
            advertCallback?.let { adapter?.bluetoothLeAdvertiser?.stopAdvertisingSet(it) }
        } catch (_: Exception) {
        }
        scanCallback = null
        advertCallback = null
        advertSet = null
    }
}
