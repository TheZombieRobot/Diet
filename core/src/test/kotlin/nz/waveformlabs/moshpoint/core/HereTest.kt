package nz.waveformlabs.moshpoint.core

import nz.waveformlabs.moshpoint.core.watch.WristDirections
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** "I'm here" (docs/IM_HERE.md): the message, its rules, the book of pins, walking away, floors, the finder. */
class HereTest {
    private val now = 1_800_000_000L
    private val group = GigGroup.create("Laneway", now * 1000)
    private val jo = CrewKeys.generate()
    private val sam = CrewKeys.generate()

    /** The bar on level 2. */
    private val bar = LatLon(-36.84770, 174.76330)

    private fun here(t: Long = now, minutes: Int = HereRule.LIFETIME_MIN, at: LatLon = bar, pressure: Int? = 50_500, clear: Boolean = false) =
        GigGroup.Here(t, minutes, at.lat, at.lon, pressure, clear)

    private fun signed(h: GigGroup.Here, by: CrewKeys.Signer = jo): GigGroup.Here = assertNotNull(group.openHere(group.sealHere(h, by)))

    // ---- The message ----

    @Test fun aPinOpensWithWhoSentItAndEverythingInIt() {
        val blob = group.sealHere(here(), jo)
        val h = assertNotNull(group.openHere(blob))
        assertEquals(jo.tag, h.sender)
        assertNotEquals(0L, h.id)
        assertEquals(now, h.timeSec)
        assertEquals(HereRule.LIFETIME_MIN, h.minutes)
        assertEquals(bar.lat, h.lat, 1e-7)
        assertEquals(bar.lon, h.lon, 1e-7)
        assertEquals(50_500, h.pressure)
        assertFalse(h.clear)
        // One Bluetooth packet, so it can cross strangers' phones (only whole packets do).
        assertTrue(blob.size <= MessagePacket.MAX_PAYLOAD, "${blob.size}")
        assertEquals(1, MessagePacket.split(blob, 5).size)
        // The same size as any other: padded to 16-byte steps like every envelope.
        assertEquals(0, blob.size % 16)
    }

    @Test fun aClearHasNoSpotAndNoPressure() {
        val h = signed(here(clear = true, pressure = 50_500))
        assertTrue(h.clear)
        assertNull(h.spot)
        assertNull(h.pressure)
        assertEquals(0.0, h.lat)
    }

    @Test fun noPressureSensorMeansNoPressure() {
        assertNull(signed(here(pressure = null)).pressure)
    }

    @Test fun olderBuildsCantMisreadIt() {
        val blob = group.sealHere(here(), jo)
        // Builds from before the envelope try these on everything in the pin and ping mailboxes.
        assertNull(group.openPing(blob))
        assertNull(group.openRally(blob))
        assertNull(group.openIntro(blob, now * 1000))
        assertNull(group.openHistory(blob))
        // Builds with the envelope open it and find a type they don't know (they act on 1, 2 and 3 only).
        val env = assertNotNull(group.openEnvelope(blob))
        assertEquals(GigGroup.ENV_HERE, env.type)
        assertTrue(env.type !in setOf(GigGroup.ENV_HAVE, GigGroup.ENV_RECEIPT, GigGroup.ENV_RETIRED))
        // Nobody outside the crew can open it at all.
        assertNull(GigGroup.create("other", 0).openHere(blob))
        assertNull(GigGroup.create("other", 0).openEnvelope(blob))
    }

    @Test fun otherEnvelopesAreNotPins() {
        val receipt = group.sealEnvelope(GigGroup.ENV_RECEIPT, ByteArray(10), now)
        assertNull(group.openHere(receipt))
        assertNull(group.openHere(ByteArray(144)))
    }

    @Test fun nobodyCanMoveOrReDateSomeoneElsesPin() {
        // Sealing needs only the crew key, which every member has: the signature is what stops a forgery.
        val real = group.sealHere(here(), jo)
        val env = assertNotNull(group.openEnvelope(real))
        // Same signed body, different time (a replay to make it last): the signature covers the time.
        assertNull(group.openHere(group.sealEnvelope(GigGroup.ENV_HERE, env.body, now + 600)))
        // Same signature, a different spot.
        val moved = env.body.copyOf().also { it[4] = (it[4] + 1).toByte() }
        assertNull(group.openHere(group.sealEnvelope(GigGroup.ENV_HERE, moved, now)))
        // A different crew can't reuse it either: the signature names the crew.
        val other = GigGroup(ByteArray(32) { 3 }, "other", 0L)
        assertNull(other.openHere(other.sealEnvelope(GigGroup.ENV_HERE, env.body, now)))
        // Sam's key with Jo's signature: refused.
        val swapped = env.body.copyOf().also { sam.pub.copyInto(it, 13) }
        assertNull(group.openHere(group.sealEnvelope(GigGroup.ENV_HERE, swapped, now)))
    }

    @Test fun laterVersionsMayAddFieldsUnderTheSignature() {
        // A future build appends a field before the key; this build reads what it knows.
        val longer = group.sealHere(here(), jo).let { group.openEnvelope(it)!!.body }
        val fields = longer.copyOfRange(0, 13) + byteArrayOf(7, 7)
        fields[0] = 2
        val key = group.key
        val tag = javax.crypto.Mac.getInstance("HmacSHA256").apply { init(javax.crypto.spec.SecretKeySpec(key, "HmacSHA256")) }
            .doFinal("moshpoint-group-sig".toByteArray()).copyOf(8)
        val signed = "mp-here1".toByteArray() + tag + java.nio.ByteBuffer.allocate(4).putInt(now.toInt()).array() + fields
        val body = fields + jo.pub + CrewKeys.sign(jo, signed)
        val h = assertNotNull(group.openHere(group.sealEnvelope(GigGroup.ENV_HERE, body, now)))
        assertEquals(bar.lat, h.lat, 1e-7)
        assertEquals(jo.tag, h.sender)
    }

    @Test fun oneIdForEveryCopyAndAfterARekey() {
        val a = signed(here())
        val b = signed(here()) // sealed again: new bytes
        assertEquals(a.id, b.id)
        val fresh = GigGroup(ByteArray(32) { 9 }, group.name, group.createdAtMs)
        val again = assertNotNull(fresh.openHere(fresh.sealHere(a, jo)))
        assertEquals(a.id, again.id)
        assertNotEquals(a.id, signed(here(t = now + 1)).id)
        assertNotEquals(a.id, signed(here(), sam).id)
        assertNotEquals(a.id, signed(here(clear = true)).id)
    }

    // ---- Rules ----

    @Test fun newestPerSenderWinsAndTheFarFutureIsRefused() {
        assertTrue(HereRule.accepts(now, 0, now))
        assertTrue(HereRule.accepts(now + 1, now, now))
        assertFalse(HereRule.accepts(now, now, now), "the same time again is not newer")
        assertFalse(HereRule.accepts(now - 5, now, now))
        assertTrue(HereRule.accepts(now + HereRule.FUTURE_SLACK_SEC, 0, now))
        assertFalse(HereRule.accepts(now + HereRule.FUTURE_SLACK_SEC + 1, 0, now))
        assertFalse(HereRule.accepts(now + 10 * 365 * 86_400L, 0, now))
    }

    @Test fun itRunsOutByTheSendersTimeWithinSkewLimits() {
        assertTrue(HereRule.live(now, 20, now))
        assertTrue(HereRule.live(now, 20, now + 20 * 60 - 1))
        assertFalse(HereRule.live(now, 20, now + 20 * 60))
        // A sender clock four minutes fast: it lasts four minutes more here, no longer.
        assertTrue(HereRule.live(now + 240, 20, now + 23 * 60))
        assertFalse(HereRule.live(now + 240, 20, now + 24 * 60))
        // Too far ahead: never in force.
        assertFalse(HereRule.live(now + HereRule.FUTURE_SLACK_SEC + 1, 20, now))
        // However long it says it lasts, no more than half an hour.
        assertFalse(HereRule.live(now, 255, now + HereRule.MAX_MIN * 60))
        assertEquals(now + 60, HereRule.endSec(now, 0))
        // Carried by Bluetooth for 25 minutes: it arrives already run out.
        assertFalse(HereRule.live(now - 25 * 60, 20, now))
    }

    @Test fun aNewPinIsStampedAfterTheLastOneEvenWithASlowClock() {
        assertEquals(now, HereRule.stamp(now, 0))
        assertEquals(now + 31, HereRule.stamp(now, now + 30))
        // A saved time far ahead (a wrong clock) can't drag every later stamp with it.
        assertEquals(now + HereRule.FUTURE_SLACK_SEC + 1, HereRule.stamp(now, now + 86_400))
    }

    @Test fun aClearLastsAsLongAsThePinItClears() {
        val pin = here(t = now)
        assertEquals(15, HereRule.clearMinutes(pin, now + 5 * 60))
        assertEquals(1, HereRule.clearMinutes(pin, now + 19 * 60 + 50))
        assertEquals(1, HereRule.clearMinutes(pin, now + 40 * 60))
        assertEquals(1, HereRule.clearMinutes(null, now))
    }

    // ---- The book of pins ----

    @Test fun theBookKeepsTheNewestPinPerSender() {
        val book = HereBook()
        val first = signed(here(t = now))
        assertTrue(book.offer(first, now))
        assertFalse(book.offer(first, now + 5), "the same message again changes nothing")
        val samPin = signed(here(t = now - 30, at = LatLon(-36.8480, 174.7640)), sam)
        assertTrue(book.offer(samPin, now))
        assertEquals(2, book.standing(now).size)
        val moved = signed(here(t = now + 60, at = LatLon(-36.8478, 174.7634)))
        assertTrue(book.offer(moved, now + 60))
        assertEquals(moved.id, book.of(jo.tag, now + 60)?.id)
        assertEquals(samPin.id, book.of(sam.tag, now + 60)?.id)
    }

    @Test fun aClearTakesThePinDownAndAnOlderPinCantComeBack() {
        val book = HereBook()
        val pin = signed(here(t = now))
        book.offer(pin, now)
        val clear = signed(here(t = now + 120, minutes = 18, clear = true))
        assertTrue(book.offer(clear, now + 120))
        assertNull(book.of(jo.tag, now + 120))
        // The pin turns up again later, carried by a crew phone that was out of range: still gone.
        assertFalse(book.offer(pin, now + 300))
        assertNull(book.of(jo.tag, now + 300))
        // Even after a restart.
        val again = HereBook().also { it.restore(book.snapshot(), now + 400) }
        assertFalse(again.offer(pin, now + 400))
        // A newer pin from Jo shows.
        assertTrue(again.offer(signed(here(t = now + 500)), now + 500))
    }

    @Test fun aNewerMessageThatArrivesAlreadyRunOutStillReplacesTheOlderPin() {
        val book = HereBook()
        book.offer(signed(here(t = now, minutes = 30)), now)
        // A newer pin (moved), delivered so late that it has run out: Jo isn't at the old spot either.
        assertTrue(book.offer(signed(here(t = now + 60, minutes = 1)), now + 600))
        assertTrue(book.standing(now + 600).isEmpty())
    }

    @Test fun pinsRunOutOnTheirOwnEvenIfTheClearNeverArrives() {
        val book = HereBook()
        book.offer(signed(here(t = now)), now)
        assertFalse(book.expire(now + 19 * 60))
        assertEquals(1, book.standing(now + 19 * 60).size)
        assertTrue(book.standing(now + 20 * 60).isEmpty(), "gone at 20 minutes, by Jo's time")
        assertTrue(book.expire(now + 20 * 60))
        assertFalse(book.expire(now + 21 * 60))
    }

    @Test fun aFarFuturePinCantLockTheBook() {
        val book = HereBook()
        val locked = signed(here(t = now + 10 * 365 * 86_400L))
        assertFalse(book.offer(locked, now))
        assertTrue(book.offer(signed(here(t = now)), now))
        // A watermark saved by a phone with a broken clock is cut back on load.
        val bad = "${jo.tag},${now + 10 * 365 * 86_400L}|"
        val loaded = HereBook().also { it.restore(bad, now) }
        assertTrue(loaded.offer(signed(here(t = now + HereRule.FUTURE_SLACK_SEC + 2)), now + HereRule.FUTURE_SLACK_SEC + 2))
    }

    @Test fun unsignedOrUnreadableNothing() {
        val book = HereBook()
        assertFalse(book.offer(here(), now)) // sender 0: not opened, not signed
        book.restore("garbage|1,2,3", now)
        assertTrue(book.standing(now).isEmpty())
        book.restore(null, now)
        assertTrue(book.standing(now).isEmpty())
    }

    @Test fun theBookSurvivesARestart() {
        val book = HereBook()
        val pin = signed(here(t = now, pressure = null))
        book.offer(pin, now)
        book.offer(signed(here(t = now + 5), sam), now + 5)
        val loaded = HereBook().also { it.restore(book.snapshot(), now + 60) }
        assertEquals(pin, loaded.of(jo.tag, now + 60))
        assertEquals(2, loaded.standing(now + 60).size)
        assertEquals(now + 5, loaded.newestFrom(sam.tag))
        // Run out while the app was closed: not brought back.
        assertTrue(HereBook().also { it.restore(book.snapshot(), now + 21 * 60) }.standing(now + 21 * 60).isEmpty())
    }

    // ---- Walking away ----

    private fun north(from: LatLon, m: Double) = VenuePlacement.offset(from, 0.0, m)

    @Test fun standingAtTheBarWhileGpsDriftsKeepsThePin() {
        val w = HereWatch(here())
        var t = now * 1000
        // Indoors: GPS wanders up to 60 m with poor accuracy, and nobody walks anywhere.
        listOf(5.0 to 10.0, 35.0 to 30.0, 60.0 to 45.0, 48.0 to 25.0).forEach { (m, acc) ->
            w.onMotion(false, t)
            assertNull(w.onLocation(north(bar, m), acc))
            t += 15_000
        }
        // Dancing on the spot: bursts, never 10 s of walking in total.
        repeat(8) { w.onMotion(it % 2 == 0, t); t += 1_000 }
        assertNull(w.onLocation(north(bar, 45.0), 10.0), "45 m with ±10 m but no walking: GPS drift")
    }

    @Test fun walkingAwayClearsIt() {
        val w = HereWatch(here())
        var t = now * 1000
        assertNull(w.onLocation(north(bar, 3.0), 8.0))
        repeat(30) { w.onMotion(true, t); t += 1_000 }
        assertTrue(w.walkedSoFarMs >= 10_000)
        assertNull(w.onLocation(north(bar, 25.0), 8.0), "still close")
        assertEquals(HereWatch.Left.WALKED_AWAY, w.onLocation(north(bar, 45.0), 8.0))
    }

    @Test fun vagueFixesNeverClearIt() {
        val w = HereWatch(here())
        var t = now * 1000
        repeat(30) { w.onMotion(true, t); t += 1_000 }
        assertNull(w.onLocation(north(bar, 150.0), 120.0), "±120 m says nothing")
        assertNull(w.onLocation(north(bar, 80.0), 60.0), "80 m with ±60 m: could still be there")
        assertEquals(HereWatch.Left.WALKED_AWAY, w.onLocation(north(bar, 150.0), 60.0))
    }

    @Test fun pinnedFromAcrossTheRoomThenWalkingOverDoesntClearIt() {
        val w = HereWatch(here())
        var t = now * 1000
        repeat(30) { w.onMotion(true, t); t += 1_000 }
        // Tapped the bar from 70 m away, then walked to it.
        assertNull(w.onLocation(north(bar, 70.0), 8.0))
        assertNull(w.onLocation(north(bar, 40.0), 8.0))
        assertNull(w.onLocation(north(bar, 5.0), 8.0))
        // Then walking off again does.
        assertEquals(HereWatch.Left.WALKED_AWAY, w.onLocation(north(bar, 50.0), 8.0))
    }

    @Test fun withoutAMotionSensorItTakesTwiceTheDistance() {
        val w = HereWatch(here())
        assertNull(w.onLocation(north(bar, 2.0), 5.0, hasMotionSensor = false))
        assertNull(w.onLocation(north(bar, 50.0), 5.0, hasMotionSensor = false))
        assertEquals(HereWatch.Left.WALKED_AWAY, w.onLocation(north(bar, 75.0), 5.0, hasMotionSensor = false))
    }

    @Test fun goingDownstairsClearsItButTheWeatherDoesnt() {
        val pinHpa = 1012.40
        val w = HereWatch(here(pressure = Baro.toUnits(pinHpa)))
        var t = now * 1000
        // An hour of a fast-falling barometer (1.5 hPa an hour) while standing at the bar: no clear.
        var p = pinHpa
        repeat(60) {
            assertNull(w.onPressure(p, t), "minute $it")
            p -= 0.025
            t += 60_000
        }
        // Down one floor (4 m, about 0.47 hPa more) in 30 seconds.
        repeat(6) { i ->
            val r = w.onPressure(p + 0.47 * (i + 1) / 6, t)
            if (i < 3) assertNull(r) else if (r != null) { assertEquals(HereWatch.Left.OTHER_FLOOR, r); return }
            t += 5_000
        }
        error("going down a floor wasn't noticed")
    }

    @Test fun noPressureInThePinNoFloorRule() {
        val w = HereWatch(here(pressure = null))
        assertNull(w.onPressure(900.0, now * 1000))
    }

    // ---- The pinned spot's floor ----

    private fun tracker(offsetHpa: Double = 0.4, atMs: Long = now * 1000 - 30 * 60_000L) =
        FloorTracker().also { it.calibration = FloorTracker.Calibration(offsetHpa, atMs, byUwb = true) }

    /** What their sensor reads at a spot [heightM] above where ours reads [myHpa] (their sensor reads [offset] low). */
    private fun theirs(myHpa: Double, heightM: Double, offset: Double = 0.4) = myHpa / kotlin.math.exp(heightM / Baro.SCALE_HEIGHT_M) - offset

    @Test fun theSpotsFloorComesFromThePinNotFromWhereTheyAreNow() {
        val t = tracker()
        val my = 1012.0
        val pin = theirs(my, 4.5) // the bar is a floor up
        val atMs = now * 1000
        // Just pinned, and 10 and 19 minutes on in ordinary weather: "↑ Upstairs" all along.
        listOf(0L, 10L, 19L).forEach { min ->
            val e = assertNotNull(t.pinned(my, pin, atMs, atMs + min * 60_000L, null))
            assertEquals(Floor.UP, e.floor, "after $min min: $e")
        }
        // Same floor: no tag.
        assertNull(t.pinned(my, theirs(my, 0.3), atMs, atMs + 60_000L, null)?.floor)
        // Downstairs.
        assertEquals(Floor.DOWN, t.pinned(my, theirs(my, -5.0), atMs, atMs + 60_000L, null)?.floor)
    }

    @Test fun walkingUpToTheSpotsFloorTakesTheTagAway() {
        val t = tracker()
        val ground = 1012.0
        val pin = theirs(ground, 4.5)
        val atMs = now * 1000
        assertEquals(Floor.UP, t.pinned(ground, pin, atMs, atMs + 60_000L, null)?.floor)
        // We climb the stairs: our pressure now is the spot's.
        val upstairs = ground / kotlin.math.exp(4.5 / Baro.SCALE_HEIGHT_M)
        assertNull(t.pinned(upstairs, pin, atMs, atMs + 120_000L, Floor.UP)?.floor)
    }

    @Test fun weatherCantMakeAFloorOutOfNothing() {
        // A front passing (1 hPa an hour) while the pin stands: the same floor never gets a tag.
        val t = tracker()
        val my0 = 1012.0
        val pin = theirs(my0, 0.0)
        val atMs = now * 1000
        for (min in 0..20) {
            val my = my0 - 1.0 * min / 60
            assertNull(t.pinned(my, pin, atMs, atMs + min * 60_000L, null)?.floor, "minute $min")
        }
    }

    @Test fun noCalibrationOrNoSensorNoTag() {
        assertNull(FloorTracker().pinned(1012.0, 1011.0, now * 1000, now * 1000, null))
        assertNull(tracker().pinned(null, 1011.0, now * 1000, now * 1000, null))
        assertNull(tracker().pinned(1012.0, null, now * 1000, now * 1000, null))
        // A calibration so old (and a pin so old) that we can't honestly say.
        val old = tracker(atMs = now * 1000 - 7 * 3600_000L)
        assertNull(old.pinned(1012.0, theirs(1012.0, 6.0), now * 1000, now * 1000 + 20 * 60_000L, null))
    }

    @Test fun theTagDoesntFlickerAtTheEdge() {
        val t = tracker()
        val my = 1012.0
        val atMs = now * 1000
        // 2.0 m: not enough to start a tag (2.5 m), enough to keep one already showing (60%).
        assertNull(t.pinned(my, theirs(my, 2.0), atMs, atMs, null)?.floor)
        assertEquals(Floor.UP, t.pinned(my, theirs(my, 2.0), atMs, atMs, Floor.UP)?.floor)
    }

    // ---- The finder ----

    private fun fixFor(h: GigGroup.Here, me: LatLon, accuracy: Double, atMs: Long) = assertNotNull(HereRule.fix("jo", me, accuracy, h, atMs))

    @Test fun aPinPointsFromOurGpsToTheSpot() {
        val me = north(bar, -120.0) // 120 m south of the bar
        val f = fixFor(signed(here()), me, 8.0, now * 1000)
        assertEquals(Method.HERE_PIN, f.method)
        assertEquals(0.0, f.bearingDeg!!, 0.5)
        assertEquals(120.0, f.distanceM!!, 0.5)
        assertTrue(f.confidence > 0.85, "${f.confidence}")
        assertNull(HereRule.fix("jo", me, 8.0, signed(here(clear = true)), now * 1000), "a clear points nowhere")
        assertNull(HereRule.fix("jo", me, 8.0, signed(here()), (now + 20 * 60) * 1000), "run out")
    }

    @Test fun aPinsConfidenceFallsGentlyAsItAges() {
        val me = north(bar, -100.0)
        val pin = signed(here())
        // Minute 0 to 19 (at 20 it has run out: no fix at all, see aPinPointsFromOurGpsToTheSpot).
        val conf = (0..19).map { min -> fixFor(pin, me, 8.0, (now + min * 60) * 1000).confidence }
        assertTrue(conf.zipWithNext().all { (a, b) -> b <= a }, "never rises: $conf")
        assertTrue(conf.last() < conf.first(), "falls: $conf")
        assertEquals(HereRule.END_CONFIDENCE, conf.last() / conf.first(), 0.01)
        // Our GPS as vague as the gap: barely trusted, whatever its age.
        assertEquals(0.1, fixFor(pin, north(bar, -10.0), 30.0, now * 1000).confidence, 1e-9)
    }

    @Test fun aFreshPinBeatsTheirLiveGpsAndKeepsBeatingItAsItAges() {
        val me = north(bar, -150.0)
        val pin = signed(here())
        for (min in listOf(0L, 10L, 19L)) {
            val a = MethodArbiter()
            val t = (now + min * 60) * 1000
            // Their own GPS says they're 60 m off to the east of the bar, fresh and confident.
            a.submit(Fix("jo", Method.GPS_SERVER, 70.0, 160.0, 0.9, t))
            a.submit(fixFor(pin, me, 8.0, t))
            val arrow = assertIs<ArrowState.Pointing>(a.arrowFor("jo", 0.0, t))
            assertEquals(Method.HERE_PIN, arrow.method, "after $min min")
            assertEquals(0.0, arrow.relativeDeg, 1.0)
            assertFalse(arrow.unsure)
        }
    }

    @Test fun uwbUpCloseStillWins() {
        val me = north(bar, -12.0)
        val t = now * 1000
        val a = MethodArbiter()
        a.submit(fixFor(signed(here()), me, 5.0, t))
        a.submit(Fix("jo", Method.UWB, 30.0, 11.0, 0.95, t))
        val arrow = assertIs<ArrowState.Pointing>(a.arrowFor("jo", 0.0, t))
        assertEquals(Method.UWB, arrow.method)
        assertEquals(11.0, arrow.distanceM)
    }

    @Test fun aPinsArrowIsIgnoredWhenBluetoothSaysTheyreVeryClose() {
        // Our GPS is 10 m out: from 15 m away the arrow to the pin could point anywhere.
        val me = north(bar, -15.0)
        val t = now * 1000
        val a = MethodArbiter()
        a.submit(fixFor(signed(here()), me, 10.0, t))
        a.submit(Fix("jo", Method.BLE_RSSI, null, 6.0, 0.7, t))
        assertIs<ArrowState.DistanceOnly>(a.arrowFor("jo", 0.0, t))
        // Further than 20 m by Bluetooth, the pin's arrow is used.
        val b = MethodArbiter()
        val far = north(bar, -60.0)
        b.submit(fixFor(signed(here()), far, 10.0, t))
        b.submit(Fix("jo", Method.BLE_RSSI, null, 25.0, 0.7, t))
        assertEquals(Method.HERE_PIN, assertIs<ArrowState.Pointing>(b.arrowFor("jo", 0.0, t)).method)
    }

    @Test fun aPinBeatsSpinScanAndWalkButWifiAwareGivesTheDistanceUpClose() {
        val me = north(bar, -40.0)
        val t = now * 1000
        val a = MethodArbiter()
        a.submit(fixFor(signed(here()), me, 6.0, t))
        a.submit(Fix("jo", Method.SPIN_SCAN, 200.0, null, 0.9, t))
        a.submit(Fix("jo", Method.WALK, 220.0, null, 0.9, t))
        a.submit(Fix("jo", Method.WIFI_AWARE, null, 38.5, 0.85, t))
        val arrow = assertIs<ArrowState.Pointing>(a.arrowFor("jo", 0.0, t))
        assertEquals(Method.HERE_PIN, arrow.method)
        assertEquals(38.5, arrow.distanceM)
    }

    @Test fun whenThePinGoesTheArrowFallsBackToTheirGps() {
        val me = north(bar, -150.0)
        val pin = signed(here())
        val a = MethodArbiter()
        val t0 = (now + 19 * 60) * 1000
        a.submit(fixFor(pin, me, 8.0, t0))
        a.submit(Fix("jo", Method.GPS_SERVER, 70.0, 160.0, 0.9, t0))
        assertEquals(Method.HERE_PIN, (a.arrowFor("jo", 0.0, t0) as ArrowState.Pointing).method)
        // It runs out: no more pin fixes are made, and the last one goes stale.
        val t1 = t0 + 75_000
        assertNull(HereRule.fix("jo", me, 8.0, pin, t1))
        a.submit(Fix("jo", Method.GPS_SERVER, 70.0, 160.0, 0.9, t1))
        assertEquals(Method.GPS_SERVER, (a.arrowFor("jo", 0.0, t1) as ArrowState.Pointing).method)
    }

    // ---- The map ----

    @Test fun onTheMapUwbBeatsThePinWhichBeatsTheirGps() {
        val me = north(bar, -30.0)
        val gps = north(bar, 40.0)
        val t = now * 1000
        val uwb = VenuePlacement.UwbReading(0.0, 29.0, t)
        assertIs<VenuePlacement.Spot.Exact>(VenuePlacement.spot(me, uwb, bar, gps, null, t))
        assertEquals(VenuePlacement.Spot.Pinned(bar), VenuePlacement.spot(me, null, bar, gps, null, t))
        // UWB gone quiet: the pin again, never their GPS while it stands.
        assertEquals(VenuePlacement.Spot.Pinned(bar), VenuePlacement.spot(me, uwb, bar, gps, null, t + 11_000))
        assertEquals(VenuePlacement.Spot.Gps(gps), VenuePlacement.spot(me, null, null, gps, null, t))
        assertEquals(VenuePlacement.Spot.Pinned(bar), VenuePlacement.spot(null, null, bar, null, null, t))
    }

    @Test fun theWatchCanUseAPinsDirectionFromAPocket() {
        assertTrue(WristDirections.bearingValid(Method.HERE_PIN, phoneHeld = false))
        val f = fixFor(signed(here()), north(bar, -80.0), 8.0, now * 1000)
        assertNotNull(WristDirections.forWrist(f, phoneHeld = false).bearingDeg)
    }
}
