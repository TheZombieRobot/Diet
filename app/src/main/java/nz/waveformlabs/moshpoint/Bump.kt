package nz.waveformlabs.moshpoint

import android.annotation.SuppressLint
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertisingSet
import android.bluetooth.le.AdvertisingSetCallback
import android.bluetooth.le.AdvertisingSetParameters
import android.content.Context
import android.os.ParcelUuid
import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.locate.BleHub

/**
 * Bump to join: hold two phones together and the one in a crew passes its crew invite
 * to the other, no QR needed (dark venue, cracked camera...).
 *
 * Privacy: the invite only goes out while someone has the Bump screen open (60 s max),
 * and is only accepted from a phone that's practically touching (very strong signal).
 * The joiner still confirms "Join X's crew?".
 */
object Bump {
    /** PLACEHOLDER 16-bit UUID for bump invites; register with the Bluetooth SIG before release. */
    private val UUID: ParcelUuid = ParcelUuid.fromString("0000FFAA-0000-1000-8000-00805F9B34FB")
    /** Phones back to back read about -30 to -45 dBm; a metre away is usually below -60. */
    private const val TOUCHING_DBM = -48

    /** An invite received from a touching phone (the crew QR text), waiting for "Join?". */
    val received = mutableStateOf<String?>(null)
    val active = mutableStateOf(false)

    private var advertCb: AdvertisingSetCallback? = null
    private var stopAt = 0L

    /** Start bumping: share [inviteText] if we're in a crew (else null), and listen. */
    @SuppressLint("MissingPermission")
    fun start(c: Context, inviteText: String?) {
        val app = c.applicationContext
        stop(app)
        active.value = true
        received.value = null
        stopAt = System.currentTimeMillis() + 60_000
        BleHub.subscribe(app, this, BleHub.Sub(listOf(UUID), fast = true, unfiltered = false) { r ->
            if (!active.value || System.currentTimeMillis() > stopAt) return@Sub
            if (r.rssi < TOUCHING_DBM) return@Sub
            val bytes = r.scanRecord?.getServiceData(UUID) ?: return@Sub
            val text = runCatching { String(bytes, Charsets.UTF_8) }.getOrNull() ?: return@Sub
            if (text != inviteText && nz.waveformlabs.moshpoint.core.Invite.find(text) is nz.waveformlabs.moshpoint.core.Invite.Group) {
                received.value = text
            }
        })
        val adapter = app.getSystemService(BluetoothManager::class.java)?.adapter ?: return
        val bytes = inviteText?.toByteArray(Charsets.UTF_8) ?: return
        if (!adapter.isEnabled || !adapter.isLeExtendedAdvertisingSupported || bytes.size > adapter.leMaximumAdvertisingDataLength - 8) {
            DebugStatus.log("Bump: this phone can only receive (no Bluetooth 5 adverts)")
            return
        }
        val cb = object : AdvertisingSetCallback() {
            override fun onAdvertisingSetStarted(set: AdvertisingSet?, txPower: Int, status: Int) {
                if (status != ADVERTISE_SUCCESS) DebugStatus.log("Bump advert failed: $status")
            }
        }
        runCatching {
            adapter.bluetoothLeAdvertiser?.startAdvertisingSet(
                AdvertisingSetParameters.Builder()
                    .setLegacyMode(false).setConnectable(false).setScannable(false)
                    .setInterval(AdvertisingSetParameters.INTERVAL_LOW)
                    // Low power on purpose: only a phone right next to us should hear it.
                    .setTxPowerLevel(AdvertisingSetParameters.TX_POWER_ULTRA_LOW)
                    .setPrimaryPhy(BluetoothDevice.PHY_LE_1M).setSecondaryPhy(BluetoothDevice.PHY_LE_1M)
                    .build(),
                AdvertiseData.Builder().addServiceData(UUID, bytes).build(), null, null, null, cb,
            )
            advertCb = cb
        }.onFailure { DebugStatus.log("Bump advert failed: ${it.message}") }
    }

    @SuppressLint("MissingPermission")
    fun stop(c: Context) {
        active.value = false
        BleHub.unsubscribe(c.applicationContext, this)
        advertCb?.let { cb ->
            runCatching { c.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeAdvertiser?.stopAdvertisingSet(cb) }
        }
        advertCb = null
    }
}
