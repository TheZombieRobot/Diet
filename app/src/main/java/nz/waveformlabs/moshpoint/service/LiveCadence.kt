package nz.waveformlabs.moshpoint.service

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorManager
import android.hardware.TriggerEvent
import android.hardware.TriggerEventListener
import android.location.Location
import android.os.SystemClock
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.GpsCadence
import nz.waveformlabs.moshpoint.debug.DebugStatus
import nz.waveformlabs.moshpoint.locate.MyLocation

/**
 * This phone's own position while Live runs ([LocationUploader]) and while our "I'm here" pin is
 * watched (HerePins), at one cadence (core [GpsCadence], docs/WAVE2C_BATTERY.md): GPS every 15 s
 * while a mate is looking for us or we're walking, else Wi-Fi and cell positioning once a minute.
 * Both ask at the same rate, so Android serves the two from one request.
 *
 * Walking is noticed by Android's significant motion sensor: it wakes the phone when walking
 * starts, costs next to nothing, and fires once per request (armed again each time). The pin
 * watch's own motion detector adds its readings while it runs. A phone without that sensor keeps
 * the old cadence. Main thread only.
 */
object LiveCadence {
    private val _mode = MutableStateFlow(GpsCadence.Mode.ACTIVE)
    val mode: StateFlow<GpsCadence.Mode> = _mode.asStateFlow()

    @Volatile private var boostUntil = 0L
    @Volatile private var lastMotion: Long? = null
    @Volatile private var sensesMotion = false
    private var users = 0
    private var sm: SensorManager? = null
    private var sensor: Sensor? = null

    private fun now() = SystemClock.elapsedRealtime()

    /** A mate's "looking" advert was heard: GPS for the next few minutes. */
    fun boost() {
        boostUntil = now() + GpsCadence.BOOST_MS
        refresh()
    }

    /** A sign of walking (the significant motion sensor, or the pin watch's motion detector). */
    fun sawMotion() {
        lastMotion = now()
        refresh()
    }

    private fun refresh() {
        val m = GpsCadence.mode(now(), boostUntil, lastMotion, sensesMotion)
        if (_mode.value == m) return
        _mode.value = m
        DebugStatus.log(if (m.highAccuracy) "Own location: GPS every 15 s" else "Own location: Wi-Fi/cell every 60 s (still)")
    }

    /**
     * Our position at the cadence of the moment: asked again (the old request dropped) whenever
     * the cadence changes. Collect on the main thread.
     */
    fun positions(c: Context, minDistanceM: Float): Flow<Location> = channelFlow {
        acquire(c)
        try {
            launch {
                // The boost and the walk hold run out by themselves. Going back to the slower
                // cadence isn't urgent, so this only looks while the phone is awake anyway.
                while (true) {
                    delay(15_000)
                    refresh()
                }
            }
            mode.collectLatest { m ->
                MyLocation(c).updates(m.intervalMs, minDistanceM, highAccuracy = m.highAccuracy).collect { send(it) }
            }
        } finally {
            release()
        }
    }

    private val trigger = object : TriggerEventListener() {
        override fun onTrigger(event: TriggerEvent?) {
            sawMotion()
            arm() // it fires once per request
        }
    }

    private fun arm() {
        if (users <= 0) return
        val s = sensor ?: return
        runCatching { sm?.requestTriggerSensor(trigger, s) }
    }

    private fun acquire(c: Context) {
        if (users++ == 0) {
            val m = c.applicationContext.getSystemService(SensorManager::class.java)
            sm = m
            sensor = runCatching { m?.getDefaultSensor(Sensor.TYPE_SIGNIFICANT_MOTION) }.getOrNull()
            sensesMotion = sensor != null
            arm()
        }
        // Starting counts as a sign of walking: the first fixes are GPS ones.
        sawMotion()
    }

    private fun release() {
        if (--users > 0) return
        users = 0
        val s = sensor ?: return
        runCatching { sm?.cancelTriggerSensor(trigger, s) }
    }
}
