package nz.waveformlabs.moshpoint.setup

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.locate.RelayClient

/**
 * Does the phone have a network that really reaches the internet?
 *
 * Without this the app only found out by trying: every retry with no signal waited out a
 * timeout and (before the budget was fixed) spent some of the public relay's daily allowance.
 * Now nothing is attempted while Android says there's no such network, and the moment one comes
 * back the waiting messages are flushed.
 *
 * Only a network Android has **validated** counts (docs/WAVE2C_BATTERY.md): a venue Wi-Fi
 * behind a sign-in page, or one with no internet behind it, used to be tried on every lookup,
 * each one waiting out a timeout with the radio on. Messages go by Bluetooth meanwhile. A network
 * that is validated but still doesn't reach the relay is caught by the relay's back-off.
 */
object NetState {
    /** For screens (Compose state). False only when Android says there's no network; not knowing counts as online. */
    val online = mutableStateOf(true)

    /** The same, readable from any thread. */
    @Volatile var up = true
        private set

    private var registered = false
    private val main = Handler(Looper.getMainLooper())
    private val listeners = ArrayList<(Boolean) -> Unit>()

    /** [listener] runs on the main thread each time the network comes or goes. */
    fun onChange(listener: (Boolean) -> Unit) {
        listeners += listener
    }

    fun init(c: Context) {
        if (registered) return
        registered = true
        val cm = c.applicationContext.getSystemService(ConnectivityManager::class.java) ?: return
        // Needs ACCESS_NETWORK_STATE (granted at install). If any of this fails we stay
        // "online" and simply try, exactly as before.
        runCatching {
            set(cm.getNetworkCapabilities(cm.activeNetwork)?.let(::reachesInternet) == true)
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    val ok = reachesInternet(caps)
                    main.post { set(ok) }
                }

                override fun onLost(network: Network) {
                    main.post { set(false) }
                }
            })
        }
    }

    /** Claims the internet, and Android has checked that it really gets there (no sign-in page in the way). */
    private fun reachesInternet(caps: NetworkCapabilities): Boolean =
        caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)

    private fun set(v: Boolean) {
        if (up == v) return
        up = v
        online.value = v
        if (v) RelayClient.networkBack()
        listeners.toList().forEach { l -> runCatching { l(v) } }
    }
}
