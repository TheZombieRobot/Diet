package nz.waveformlabs.moshpoint.locate

import android.os.ParcelUuid

object Ble {
    /**
     * The finder's own advert (the rotating code every live phone sends). It must stay a legacy
     * advert, which every phone can send and hear: at most 31 bytes. Service data with a 16-bit
     * UUID takes 4 + up to 23 bytes of [nz.waveformlabs.moshpoint.core.Advert] = 27 (30 with the
     * flags some phones add); a 128-bit UUID would need 41, so it can't be one.
     *
     * 0xFFA7 is a PLACEHOLDER the Bluetooth SIG hasn't assigned to anyone. Before launch the owner
     * buys one 16-bit UUID from the SIG and it replaces this value (docs/BLUETOOTH_UUIDS.md).
     */
    val SERVICE_UUID: ParcelUuid = ParcelUuid.fromString("0000FFA7-0000-1000-8000-00805F9B34FB")
}
