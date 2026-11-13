package nz.waveformlabs.moshpoint.locate

import android.annotation.SuppressLint
import android.bluetooth.BluetoothManager
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.ParcelUuid
import android.os.SystemClock
import android.util.Log
import nz.waveformlabs.moshpoint.core.ScanStarts

/**
 * The app's ONE Bluetooth scan, shared by everything that listens (finder, visibility,
 * gig-group intros, crowd relay).
 *
 * Why: Android silently stops delivering results to an app that starts more than 5 scans
 * in 30 seconds, and many phones only have a handful of hardware filter slots. Four
 * separate scans each restarting on their own (and the spin scan refreshing on top) hit
 * that limit easily, which looked like "scan froze" / "only works once". Here every start
 * is counted and spaced so we never cross it.
 *
 * While someone needs a fast foreground scan ([Sub.unfiltered]) we scan with no hardware
 * filter: many Bluetooth chips report a filtered advert only once and then drop repeats,
 * which starves the distance and direction readings. Unfiltered scans only run with the
 * screen on, which is exactly when the finder is open.
 */
object BleHub {
    class Sub(
        val uuids: List<ParcelUuid>,
        /** Wants a fast scan (finder open, or a friend is looking). */
        val fast: Boolean,
        /** Wants every repeat of every advert (finder on screen). */
        val unfiltered: Boolean,
        val onResult: (ScanResult) -> Unit,
    )

    private const val TAG = "BleHub"
    private const val K = "BT scan (shared)"

    private val main = Handler(Looper.getMainLooper())
    private val subs = LinkedHashMap<Any, Sub>()
    /** Android allows 5 starts per 30 s; at most 4 here (core ScanStarts). */
    private val starts = ScanStarts()
    private var app: Context? = null
    private var running: Config? = null
    private var pending = false
    private var results = 0L

    /** When any result last came in (elapsedRealtime ms). */
    @Volatile var lastResultAt = 0L
        private set

    private data class Config(val uuids: Set<ParcelUuid>, val fast: Boolean, val unfiltered: Boolean)

    private val callback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) = dispatch(result)
        override fun onBatchScanResults(list: MutableList<ScanResult>) = list.forEach(::dispatch)
        override fun onScanFailed(errorCode: Int) {
            Log.w(TAG, "scan failed: $errorCode")
            if (errorCode == SCAN_FAILED_ALREADY_STARTED) return // it's running: nothing to fix
            FinderLog.set(K, "FAILED code $errorCode (retrying)")
            running = null
            // Code 1 = already started (harmless), 2 = registration failed (often the 5-in-30s
            // limit), 6 = scanning too frequently. Try again once the window has room.
            schedule(starts.delayToNext(SystemClock.elapsedRealtime()).coerceAtLeast(3_000))
        }
    }

    private fun dispatch(r: ScanResult) {
        results++
        lastResultAt = SystemClock.elapsedRealtime()
        // Copy: a sub can unsubscribe from inside its callback.
        for (s in subs.values.toList()) {
            try {
                s.onResult(r)
            } catch (e: Exception) {
                Log.w(TAG, "listener failed", e)
            }
        }
    }

    @Synchronized
    fun subscribe(context: Context, key: Any, sub: Sub) {
        app = context.applicationContext
        subs[key] = sub
        schedule(150)
    }

    @Synchronized
    fun unsubscribe(context: Context, key: Any) {
        app = context.applicationContext
        if (subs.remove(key) != null) schedule(150)
    }

    /**
     * Restart the scan so chips that drop repeats report everyone afresh. Skipped if the
     * last start was under [minGapMs] ago or the 5-per-30 s budget has no room.
     * Returns true if a restart happened.
     */
    @Synchronized
    fun refresh(minGapMs: Long = 6_000): Boolean {
        val now = SystemClock.elapsedRealtime()
        starts.prune(now)
        if (running == null || !starts.mayRestart(now, minGapMs)) return false
        stopScan()
        startScan(now)
        FinderLog.log("BT scan refreshed (fresh readings)")
        return true
    }

    /** Bluetooth was switched off or on: the old scan died with it. */
    @Synchronized
    fun onBluetooth(on: Boolean) {
        running = null
        if (on) schedule(500)
    }

    private fun schedule(delayMs: Long) {
        if (pending) return
        pending = true
        main.postDelayed({
            synchronized(this) {
                pending = false
                apply()
            }
        }, delayMs)
    }

    private fun wanted(): Config? {
        if (subs.isEmpty()) return null
        return Config(
            uuids = subs.values.flatMap { it.uuids }.toSet(),
            fast = subs.values.any { it.fast },
            unfiltered = subs.values.any { it.unfiltered },
        )
    }

    private fun apply() {
        val want = wanted()
        if (want == running) return
        if (want == null) {
            stopScan()
            FinderLog.set(K, "off")
            return
        }
        val now = SystemClock.elapsedRealtime()
        if (starts.full(now)) {
            // No room: keep the current scan (if any) and try again when there is.
            FinderLog.set(K, "waiting ${starts.delayToNext(SystemClock.elapsedRealtime()) / 1000}s (Android scan limit)")
            schedule(starts.delayToNext(SystemClock.elapsedRealtime()))
            return
        }
        stopScan()
        running = want
        startScan(now)
    }

    @SuppressLint("MissingPermission")
    private fun startScan(now: Long) {
        val cfg = running ?: wanted() ?: return
        val adapter = app?.getSystemService(BluetoothManager::class.java)?.adapter
        val scanner = adapter?.takeIf { it.isEnabled }?.bluetoothLeScanner
        if (scanner == null) {
            running = null
            FinderLog.set(K, "waiting for Bluetooth")
            return
        }
        val settings = ScanSettings.Builder()
            .setScanMode(if (cfg.fast) ScanSettings.SCAN_MODE_LOW_LATENCY else ScanSettings.SCAN_MODE_LOW_POWER)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .setReportDelay(0)
            .apply {
                // Hear both classic adverts (finding) and Bluetooth 5 extended ones (group
                // intros, crowd relay) in the same scan.
                if (adapter?.isLeExtendedAdvertisingSupported == true) {
                    setLegacy(false)
                    setPhy(ScanSettings.PHY_LE_ALL_SUPPORTED)
                }
            }
            .build()
        val filters = if (cfg.unfiltered) null else cfg.uuids.map { ScanFilter.Builder().setServiceData(it, ByteArray(0)).build() }
        try {
            scanner.startScan(filters, settings, callback)
            running = cfg
            starts.started(now)
            FinderLog.set(K, "on (${if (cfg.fast) "fast" else "low power"}${if (cfg.unfiltered) ", every repeat" else ""}), ${subs.size} users, ${starts.count}/5 starts in 30s")
        } catch (e: SecurityException) {
            running = null
            Log.w(TAG, "no scan permission", e)
            FinderLog.set(K, "NO PERMISSION")
        } catch (e: IllegalStateException) {
            running = null
            Log.w(TAG, "Bluetooth not ready", e)
        }
    }

    @SuppressLint("MissingPermission")
    private fun stopScan() {
        // Always ask, even if we think it's stopped: after a failure (e.g. "already started")
        // the stack may still hold our callback, and stopping an unknown one is harmless.
        try {
            app?.getSystemService(BluetoothManager::class.java)?.adapter?.bluetoothLeScanner?.stopScan(callback)
        } catch (_: Exception) {
        }
        running = null
    }
}
