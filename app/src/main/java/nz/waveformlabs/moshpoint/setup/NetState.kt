package nz.waveformlabs.moshpoint

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.locate.RelayClient

/**
 * Does the phone have any network at all?
 *
 * Without this the app only found out by trying: every retry with no signal waited out a
 * timeout and (before the budget was fixed) spent some of the public relay's daily allowance.
 * Now nothing is attempted while Android says there's no network, and the moment one comes
 * back the waiting messages are flushed.
 *
 * "A network" is deliberately loose: any network that claims to reach the internet. A venue
 * Wi-Fi that turns out to be dead is caught by the relay's own back-off instead, so a network
 * Android can't vouch for is still tried.
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
            set(cm.getNetworkCapabilities(cm.activeNetwork)?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true)
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    val ok = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    main.post { set(ok) }
                }

                override fun onLost(network: Network) {
                    main.post { set(false) }
                }
            })
        }
    }

    private fun set(v: Boolean) {
        if (up == v) return
        up = v
        online.value = v
        if (v) RelayClient.networkBack()
        listeners.toList().forEach { l -> runCatching { l(v) } }
    }
}
