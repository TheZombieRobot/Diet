package nz.waveformlabs.moshpoint.wear

import android.content.Context
import android.os.SystemClock
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import nz.waveformlabs.moshpoint.core.Trend
import nz.waveformlabs.moshpoint.core.watch.BuzzPlanner
import nz.waveformlabs.moshpoint.core.watch.EndReason
import nz.waveformlabs.moshpoint.core.watch.FacingLatch
import nz.waveformlabs.moshpoint.core.watch.FindStatus
import nz.waveformlabs.moshpoint.core.watch.LinkClock
import nz.waveformlabs.moshpoint.core.watch.LinkHealth
import nz.waveformlabs.moshpoint.core.watch.WatchMate
import nz.waveformlabs.moshpoint.core.watch.WatchMessage
import nz.waveformlabs.moshpoint.core.watch.WatchProtocol
import nz.waveformlabs.moshpoint.core.watch.WristArrow
import nz.waveformlabs.moshpoint.core.watch.WristGate
import nz.waveformlabs.moshpoint.core.watch.WristPose
import nz.waveformlabs.moshpoint.core.watch.WristReading
import nz.waveformlabs.moshpoint.core.watch.WristView
import kotlin.random.Random

/**
 * One find, from the watch's side: asking the phone, keeping the lease alive, turning its
 * readings and this watch's compass into what the screen draws and what the motor plays.
 * All the decisions are core logic ([WristArrow], [BuzzPlanner], ...); this only wires them
 * to the sensors, the link and the clock.
 *
 * Lives in the process, not in the screen: the wrist can drop and the screen go dark while the
 * buzzes carry on ([FindSessionService] keeps the process in the foreground meanwhile).
 */
object FindSession {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val _ui = MutableStateFlow<FinderUi?>(null)

    /** What the finder screen should show; null when no find is on. */
    val ui: StateFlow<FinderUi?> = _ui

    var mate: WatchMate? = null
        private set

    /** A find is on and hasn't ended. */
    val running: Boolean get() = job != null && ended == null

    private var app: Context? = null
    private var job: Job? = null
    private var sessionId = 0
    private var startedAtMs = 0L

    // What the phone last said.
    private var reading: WristReading? = null
    private var receivedAtMs = 0L
    private var lastSeq = -1
    private var phoneStatus = FindStatus.OK
    private var everHeard = false
    private var lastReachedPhoneMs = 0L
    private val linkClock = LinkClock()

    // This wrist.
    private var compass: WristCompass? = null
    private val gate = WristGate()
    private var headingFilter = WristArrow.headingFilter()
    private var heading: Double? = null
    private var compassRough = false
    private val facing = FacingLatch()
    private val planner = BuzzPlanner()
    private var visible = false
    private var ambient = false
    private var sentFast: Boolean? = null
    private var closeSinceMs = 0L
    private var buzzOff = false
    private var buzzCheckedAtMs = 0L
    private var ambientShownAtMs = 0L

    private var ended: FinderStatus? = null

    fun start(context: Context, target: WatchMate) {
        if (job != null) stop()
        val c = context.applicationContext
        app = c
        mate = target
        sessionId = Random.nextInt()
        startedAtMs = SystemClock.elapsedRealtime()
        reading = null
        receivedAtMs = 0L
        lastSeq = -1
        phoneStatus = FindStatus.OK
        everHeard = false
        lastReachedPhoneMs = startedAtMs
        linkClock.reset()
        gate.reset()
        headingFilter = WristArrow.headingFilter()
        heading = null
        compassRough = false
        planner.reset()
        sentFast = null
        closeSinceMs = 0L
        ended = null
        compass = WristCompass(c, ::onPose)
        job = scope.launch {
            launch { PhoneLink.incoming.collect { onMessage(it) } }
            launch { askLoop(c) }
            tickLoop(c)
        }
        applySensors()
        publish(startedAtMs)
        FindSessionService.start(c)
    }

    /** The wearer left the finder: tell the phone to stop at once, and forget the find. */
    fun stop() {
        val c = app
        val id = sessionId
        if (c != null && job != null && ended == null) scope.launch { PhoneLink.send(c, WatchMessage.FindStop(id)) }
        job?.cancel()
        job = null
        compass?.stop()
        compass = null
        mate = null
        _ui.value = null
    }

    /** The same mate again, after a find that ended. */
    fun again(context: Context) {
        mate?.let { start(context, it) }
    }

    /** @param visible the finder is on screen. @param ambient the wrist is down (screen dimmed). */
    fun setScreen(visible: Boolean, ambient: Boolean) {
        this.visible = visible
        this.ambient = ambient
        applySensors()
        if (job != null) publish(SystemClock.elapsedRealtime())
    }

    private fun applySensors() {
        // The compass only runs while its arrow could be seen.
        if (visible && !ambient && ended == null && job != null) compass?.start() else compass?.stop()
    }

    private fun onPose(pose: WristPose, rough: Boolean) {
        val now = SystemClock.elapsedRealtime()
        gate.update(pose.tiltDeg, now)
        compassRough = rough
        pose.magneticHeadingDeg?.let { heading = headingFilter.add(it) }
        publish(now)
    }

    /** The arrow could be seen right now, so the phone should send about twice a second. */
    private fun wantsFast(now: Long): Boolean =
        visible && !ambient && compass?.available == true && (gate.flat || now - gate.changedAtMs < WRIST_DOWN_AFTER_MS)

    /** Keeps asking (which is also what keeps the phone's finder alive), until told to stop. */
    private suspend fun askLoop(c: Context) {
        while (scope.isActive) {
            val target = mate
            if (ended == null && target != null) {
                val now = SystemClock.elapsedRealtime()
                val fast = wantsFast(now)
                // Always the full request: if the phone lost the find (link drop, restart) this restarts it.
                val ok = PhoneLink.send(c, WatchMessage.FindStart(sessionId, target.id, fast, now.toInt()), nearbyOnly = true)
                if (ok) {
                    sentFast = fast
                    lastReachedPhoneMs = SystemClock.elapsedRealtime()
                }
                delay(if (ok) WatchProtocol.RENEW_EVERY_MS else RETRY_EVERY_MS)
            } else {
                delay(WatchProtocol.RENEW_EVERY_MS)
            }
        }
    }

    private suspend fun tickLoop(c: Context) {
        while (scope.isActive) {
            val now = SystemClock.elapsedRealtime()
            if (ended == null) {
                when {
                    now - startedAtMs > WatchProtocol.WATCH_SESSION_MAX_MS -> end(c, FinderStatus.TIMED_OUT, tellPhone = true)
                    now - maxOf(receivedAtMs, lastReachedPhoneMs) > GIVE_UP_AFTER_MS -> end(c, FinderStatus.PHONE_LOST, tellPhone = false)
                }
            }
            if (ended == null) {
                // Wrist up or down changed: tell the phone its new pace straight away.
                val fast = wantsFast(now)
                if (sentFast != null && fast != sentFast) {
                    sentFast = fast
                    scope.launch { PhoneLink.send(c, WatchMessage.FindRenew(sessionId, fast, now.toInt()), nearbyOnly = true) }
                }
                if (now - buzzCheckedAtMs > 2_000) {
                    buzzCheckedAtMs = now
                    buzzOff = Buzzer.silenced(c)
                }
            }
            val shown = publish(now)
            if (ended == null && shown != null) {
                val live = shown.status == FinderStatus.LIVE
                val r = reading
                var distance = if (live) r?.distanceM else null
                // "Found" needs two seconds inside three metres, not one lucky reading.
                if (distance != null && distance <= BuzzPlanner.FOUND_WITHIN_M) {
                    if (closeSinceMs == 0L) closeSinceMs = now
                    if (now - closeSinceMs < FOUND_AFTER_MS) distance = BuzzPlanner.FOUND_WITHIN_M + 0.01
                } else {
                    closeSinceMs = 0L
                }
                val buzz = planner.next(
                    now,
                    BuzzPlanner.Input(
                        active = true,
                        distanceM = distance,
                        trend = if (live) r?.trend ?: Trend.STEADY else Trend.STEADY,
                        facing = shown.facing,
                        linkLost = everHeard && shown.status == FinderStatus.PHONE_LOST,
                    ),
                )
                if (buzz != null) Buzzer.play(c, buzz)
                if (planner.found) end(c, FinderStatus.FOUND, tellPhone = true)
            }
            delay(TICK_MS)
        }
    }

    private fun onMessage(m: WatchMessage) {
        val c = app ?: return
        val now = SystemClock.elapsedRealtime()
        when (m) {
            is WatchMessage.FindUpdate -> {
                if (m.sessionId != sessionId || ended != null) return
                if (lastSeq >= 0 && !WatchProtocol.isNewer(m.seq, lastSeq)) return // late or repeated
                lastSeq = m.seq
                reading = m.reading
                phoneStatus = m.status
                receivedAtMs = now
                everHeard = true
                linkClock.onEcho(now.toInt(), m.echoWatchClockMs, m.echoHeldMs)
                when (m.status) {
                    FindStatus.NOT_ENTITLED -> end(c, FinderStatus.LOCKED, tellPhone = false)
                    FindStatus.NO_SUCH_MATE -> end(c, FinderStatus.MATE_GONE, tellPhone = false)
                    else -> publish(now)
                }
            }
            is WatchMessage.FindEnded -> {
                if (m.sessionId != sessionId || ended != null) return
                when (m.reason) {
                    EndReason.STOPPED_ON_PHONE -> end(c, FinderStatus.STOPPED_ON_PHONE, tellPhone = false)
                    EndReason.TIME_LIMIT -> end(c, FinderStatus.TIMED_OUT, tellPhone = false)
                    EndReason.NOT_ENTITLED -> end(c, FinderStatus.LOCKED, tellPhone = false)
                    EndReason.MATE_GONE -> end(c, FinderStatus.MATE_GONE, tellPhone = false)
                    // The lease ran out while the link was down: the next ask starts it again.
                    EndReason.LEASE_EXPIRED, EndReason.UNKNOWN -> Unit
                }
            }
            is WatchMessage.VersionNotice -> if (ended == null && job != null) {
                if (m.thisDeviceIsOld) end(c, FinderStatus.UPDATE_WATCH, tellPhone = false)
                else if (m.otherDeviceIsOld) end(c, FinderStatus.UPDATE_PHONE, tellPhone = false)
            }
            else -> Unit
        }
    }

    private fun end(c: Context, status: FinderStatus, tellPhone: Boolean) {
        if (ended != null) return
        ended = status
        val id = sessionId
        if (tellPhone) scope.launch { PhoneLink.send(c, WatchMessage.FindStop(id)) }
        compass?.stop()
        publish(SystemClock.elapsedRealtime())
    }

    private fun publish(now: Long): FinderUi? {
        val target = mate ?: return null
        val sinceUpdate = now - receivedAtMs
        val health = when {
            everHeard -> LinkHealth.of(sinceUpdate, fast = sentFast != false)
            now - startedAtMs > CONNECT_PATIENCE_MS -> LinkHealth.LOST
            else -> LinkHealth.FRESH
        }
        val status = ended ?: when {
            health == LinkHealth.LOST -> FinderStatus.PHONE_LOST
            !everHeard -> FinderStatus.CONNECTING
            health == LinkHealth.STALE && sinceUpdate > RECONNECTING_AFTER_MS -> FinderStatus.RECONNECTING
            phoneStatus == FindStatus.NEEDS_PHONE -> FinderStatus.NEEDS_PHONE
            phoneStatus == FindStatus.BLUETOOTH_OFF -> FinderStatus.BLUETOOTH_OFF
            phoneStatus == FindStatus.NO_PERMISSION -> FinderStatus.NO_PERMISSION
            else -> FinderStatus.LIVE
        }
        val view = WristArrow.view(
            reading = reading,
            sinceReceivedMs = sinceUpdate,
            transitMs = linkClock.transitMs ?: 0L,
            magneticHeadingDeg = if (compass?.available == true) heading else null,
            // With no compass at all there is nothing to hold flat for.
            flat = gate.flat || compass?.available != true,
            compassRough = compassRough,
            linkStale = health != LinkHealth.FRESH,
        )
        val arrow = (view as? WristView.Arrow)?.takeIf { status == FinderStatus.LIVE && !ambient }
        val isFacing = facing.update(arrow?.takeIf { !it.rough }?.angleDeg)
        // Wrist down: the screen should change about once a minute, not ten times a second.
        val before = _ui.value
        if (ambient && before != null && before.ambient && before.status == status && now - ambientShownAtMs < AMBIENT_REDRAW_MS) return before
        if (ambient) ambientShownAtMs = now
        return FinderUi(
            mateName = target.name,
            mateColour = target.colour,
            status = status,
            view = view,
            facing = isFacing,
            compassRough = compassRough && arrow != null,
            buzzOff = buzzOff,
            ambient = ambient,
            canRestart = ended.let { it == FinderStatus.FOUND || it == FinderStatus.TIMED_OUT || it == FinderStatus.STOPPED_ON_PHONE || it == FinderStatus.PHONE_LOST },
        ).also { _ui.value = it }
    }

    private const val TICK_MS = 100L
    private const val RETRY_EVERY_MS = 2_000L

    /** No answer at all for this long after asking: say the phone is out of reach (and keep trying). */
    private const val CONNECT_PATIENCE_MS = 6_000L
    private const val RECONNECTING_AFTER_MS = 5_000L

    /** A minute without the phone ends the find. */
    private const val GIVE_UP_AFTER_MS = 60_000L

    /** Arm hanging for this long counts as wrist down: the fast updates stop. */
    private const val WRIST_DOWN_AFTER_MS = 3_000L
    private const val FOUND_AFTER_MS = 2_000L
    private const val AMBIENT_REDRAW_MS = 60_000L
}
