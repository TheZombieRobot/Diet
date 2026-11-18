package nz.waveformlabs.moshpoint.setup

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.Looper
import android.os.Build
import androidx.compose.runtime.mutableStateOf
import nz.waveformlabs.moshpoint.core.SatelliteRule
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
 *
 * A satellite network (Android 16, docs/REMOVE_SAFETY.md, stage 4) is [satellite], and counts as
 * no network unless a Moshpoint+ member switched "Use satellite when there's no signal" on
 * ([SatelliteSwitch], core [SatelliteRule]). Even then only the relay's batch goes over it
 * ([RelayClient]); everything else that reaches the internet checks [satellite] and waits.
 */
object NetState {
    /** For screens (Compose state). False only when Android says there's no network; not knowing counts as online. */
    val online = mutableStateOf(true)

    /** The same, readable from any thread. */
    @Volatile var up = true
        private set

    /** The network in use isn't metered (Wi-Fi, usually): crew clips download in the background only then (core MomentFetch). */
    @Volatile var unmetered = false
        private set

    /**
     * The network in use is a satellite (bandwidth-constrained) one: Android only gives the app
     * one when there's no other. Nothing but the relay's batch may use it, and that only when
     * [SatelliteSwitch.allowed]; Discover, venue maps, the map's tiles and Facebook never do.
     */
    @Volatile var satellite = false
        private set

    /** A validated network of any kind, satellite included (before the satellite rule). */
    @Volatile private var reaches = true
    private var app: Context? = null

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
        app = c.applicationContext
        SatelliteSwitch.init(c)
        val cm = c.applicationContext.getSystemService(ConnectivityManager::class.java) ?: return
        // Needs ACCESS_NETWORK_STATE (granted at install). If any of this fails we stay
        // "online" and simply try, exactly as before.
        runCatching {
            val now = cm.getNetworkCapabilities(cm.activeNetwork)
            val sat = now?.let { isSatellite(it) } == true
            unmetered = now?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == true && !sat
            reaches = now?.let { reachesInternet(it) } == true
            satelliteNow(sat)
            set(usable())
            cm.registerDefaultNetworkCallback(object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    val ok = reachesInternet(caps)
                    val sat = isSatellite(caps)
                    unmetered = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) && !sat
                    main.post {
                        reaches = ok
                        satelliteNow(sat)
                        set(usable())
                    }
                }

                override fun onLost(network: Network) {
                    unmetered = false
                    main.post {
                        reaches = false
                        satelliteNow(false)
                        set(usable())
                    }
                }
            })
        }
    }

    /** The satellite switch (or Moshpoint+) changed: count the network again. */
    fun refresh() {
        main.post { set(usable()) }
    }

    /** A network to use: any but a satellite one, which only counts when the member allowed it. */
    private fun usable(): Boolean = SatelliteRule.usable(reaches, satellite, satellite && app?.let { SatelliteSwitch.allowed(it) } == true)

    private fun satelliteNow(v: Boolean) {
        if (satellite == v) return
        satellite = v
        // The map draws from what's saved while on satellite, and downloads nothing.
        MapNet.apply()
    }

    /** Android's satellite (bandwidth-constrained) networks: core [SatelliteRule.constrained]. */
    private fun isSatellite(caps: NetworkCapabilities): Boolean = SatelliteRule.constrained(
        Build.VERSION.SDK_INT,
        caps.hasTransport(SatelliteRule.TRANSPORT_SATELLITE),
        caps.hasCapability(SatelliteRule.NOT_BANDWIDTH_CONSTRAINED),
    )

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
