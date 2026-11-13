package nz.waveformlabs.moshpoint.locate

import android.os.ParcelUuid

object Ble {
    /**
     * PLACEHOLDER 16-bit service UUID used for Moshpoint advertisements.
     * A 16-bit UUID keeps the packet small enough for legacy advertising (31 bytes):
     * flags (3) + service data header (4) + 16-byte rotating ID = 23 bytes.
     * TODO: apply for an official 16-bit UUID from the Bluetooth SIG before release.
     */
    val SERVICE_UUID: ParcelUuid = ParcelUuid.fromString("0000FFA7-0000-1000-8000-00805F9B34FB")
}
