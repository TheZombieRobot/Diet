package nz.waveformlabs.moshpoint.watch

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.PowerManager
import android.os.SystemClock
import nz.waveformlabs.moshpoint.core.Fix
import nz.waveformlabs.moshpoint.core.watch.WristDirections
import nz.waveformlabs.moshpoint.locate.LocatorEngine
import java.lang.ref.WeakReference

/**
 * A read-only window onto the phone's own finder ([LocatorEngine], in the finder module) for the
 * watch (docs/WATCH.md, problem 4). `MainActivity` registers the finder here as soon as it makes
 * it; nothing here can start it, stop it or change who it is looking for.
 *
 * While the phone's finder is running (its screen is open), the watch is fed from it and the
 * pocket finder stands down, so there are never two UWB sessions or two "looking" adverts.
 */
object PhoneFinderBridge {
    private var finder = WeakReference<LocatorEngine>(null)

    /** Called by `MainActivity` right after it makes the finder. Weak: the finder belongs to its screen. */
    fun attach(engine: LocatorEngine) {
        finder = WeakReference(engine)
    }

    private fun running(): LocatorEngine? = finder.get()?.takeIf { it.isRunning }

    /** The phone's own finder is doing the finding right now. */
    val phoneFinderRunning: Boolean get() = running() != null

    /** Is it looking for [friendId] (so its readings can be passed on)? */
    fun tracks(friendId: String): Boolean = running()?.tracking?.value?.contains(friendId) == true

    /** Every method's latest fix for [friendId] from the phone's finder (empty if it isn't running). */
    fun fixes(friendId: String): List<Fix> = running()?.latestFixes(friendId).orEmpty()

    /** The compass correction the phone's finder is applying. */
    val declinationDeg: Double get() = running()?.declinationDeg ?: 0.0
}

/**
 * "Is the phone being held up as a finder right now?" (docs/WATCH.md, problem 3.) Only then
 * may the phone's UWB / spin-scan / walk directions be passed to the wrist: they are measured
 * against the phone's own heading, and mean nothing from a pocket.
 *
 * Held = screen on, and gravity says the phone has been upright or flat in portrait for a
 * second. Only listens while the watch is being fed from the phone's own finder.
 */
internal class PhoneHeld(context: Context) : SensorEventListener {
    private val sensors = context.getSystemService(SensorManager::class.java)
    private val power = context.getSystemService(PowerManager::class.java)
    private var listening = false
    private var heldSinceMs = 0L
    private var lastEventMs = 0L

    val held: Boolean
        get() {
            val now = SystemClock.elapsedRealtime()
            return listening && power?.isInteractive == true && heldSinceMs != 0L &&
                now - heldSinceMs >= STEADY_FOR_MS && now - lastEventMs < 1_000
        }

    fun listen(on: Boolean) {
        if (on == listening) return
        listening = on
        heldSinceMs = 0L
        if (on) {
            val s = sensors?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
            if (s == null) listening = false else sensors.registerListener(this, s, SensorManager.SENSOR_DELAY_UI)
        } else {
            sensors?.unregisterListener(this)
        }
    }

    override fun onSensorChanged(e: SensorEvent) {
        val now = SystemClock.elapsedRealtime()
        lastEventMs = now
        if (WristDirections.phoneHeldLikeAFinder(e.values[0].toDouble(), e.values[1].toDouble(), e.values[2].toDouble())) {
            if (heldSinceMs == 0L) heldSinceMs = now
        } else {
            heldSinceMs = 0L
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit

    private companion object {
        const val STEADY_FOR_MS = 1_000L
    }
}
