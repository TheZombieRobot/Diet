package nz.waveformlabs.moshpoint.core.watch

import nz.waveformlabs.moshpoint.core.Method
import nz.waveformlabs.moshpoint.core.Trend
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

private fun hex(b: ByteArray) = b.joinToString("") { "%02x".format(it) }
private fun bytes(hex: String) = hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()

class WatchProtocolTest {
    private fun roundTrip(m: WatchMessage): WatchMessage = assertIs<Decoded.Ok>(WatchProtocol.decode(WatchProtocol.encode(m))).message

    private val pointing = WristReading(
        WristReading.Kind.POINTING, bearingTrueDeg = 123.45, distanceM = 42.5, trend = Trend.WARMER,
        method = Method.GPS_SERVER, unsure = true, directionAgeMs = 3_400, distanceAgeMs = 200, declinationDeg = 19.63,
    )

    @Test fun everyMessageSurvivesTheTrip() {
        val all = listOf(
            WatchMessage.FindStart(0x1234ABCD, "b3c1e9aa-0000-4000-8000-123456789abc", fast = true, watchClockMs = -5),
            WatchMessage.FindRenew(7, fast = false, watchClockMs = 99),
            WatchMessage.FindStop(7),
            WatchMessage.Ping(41, PingKind.NEED_HELP),
            WatchMessage.Ping(42, PingKind.ON_MY_WAY),
            WatchMessage.SyncRequest,
            WatchMessage.FindUpdate(7, 65_535, FindStatus.OK, pointing, echoWatchClockMs = 123_456, echoHeldMs = 1_200),
            WatchMessage.FindUpdate(7, 3, FindStatus.NEEDS_PHONE, WristReading.NONE),
            WatchMessage.FindEnded(7, EndReason.LEASE_EXPIRED),
            WatchMessage.PingResult(41, PingOutcome.SENT),
            WatchMessage.VersionNotice(1, 3),
        )
        for (m in all) assertEquals(m, roundTrip(m))
    }

    @Test fun readingsKeepTheirPrecision() {
        val got = assertIs<WatchMessage.FindUpdate>(roundTrip(WatchMessage.FindUpdate(1, 1, FindStatus.OK, pointing))).reading
        assertEquals(123.45, got.bearingTrueDeg!!, 0.005) // hundredths of a degree
        assertEquals(42.5, got.distanceM!!, 0.005) // centimetres (UWB is that good)
        assertEquals(19.63, got.declinationDeg, 0.005)
        assertEquals(3_400, got.directionAgeMs) // tenths of a second
        assertEquals(Trend.WARMER, got.trend)
        assertEquals(Method.GPS_SERVER, got.method)
        assertTrue(got.unsure)
    }

    @Test fun theWireFormatIsPinned() {
        // If this fails, an old watch and a new phone no longer understand each other: either
        // undo the change or add the new field AT THE END (and then extend, don't edit, this test).
        val update = WatchMessage.FindUpdate(
            sessionId = 0x01020304, seq = 0x0506, status = FindStatus.OK,
            reading = WristReading(
                WristReading.Kind.POINTING, bearingTrueDeg = 90.0, distanceM = 12.34, trend = Trend.COLDER,
                method = Method.UWB, unsure = false, directionAgeMs = 500, distanceAgeMs = 100, declinationDeg = -1.5,
            ),
            echoWatchClockMs = 0x0A0B0C0D, echoHeldMs = 258,
        )
        assertEquals(
            "4d0110" + "01020304" + "0506" + "00" + "02" + "00" + "01" + "02" + "2328" + "000004d2" + "0005" + "0001" + "ff6a" + "0a0b0c0d" + "0102",
            hex(WatchProtocol.encode(update)),
        )
        assertEquals("4d0101" + "0000002a" + "01" + "00000007" + "0003" + "73616d", hex(WatchProtocol.encode(WatchMessage.FindStart(42, "sam", true, 7))))
        assertEquals("4d0104" + "00000009" + "03", hex(WatchProtocol.encode(WatchMessage.Ping(9, PingKind.NEED_HELP))))
        assertEquals("4d017f" + "0101", hex(WatchProtocol.versionNotice()))
    }

    @Test fun numbersOnTheWireNeverChange() {
        assertEquals(listOf(1, 2, 3, 4, 0), PingKind.entries.map { it.code })
        assertEquals(listOf(0, 1, 2, 3, 4, 5, 255), FindStatus.entries.map { it.code })
        assertEquals(listOf(1, 2, 3, 4, 5, 255), EndReason.entries.map { it.code })
        assertEquals(listOf(1, 2, 3, 4, 5, 255), PingOutcome.entries.map { it.code })
        // Every method has its own number, whatever order the enum is in.
        val codes = Method.entries.map { m ->
            val r = WristReading(WristReading.Kind.DISTANCE_ONLY, distanceM = 1.0, method = m)
            WatchProtocol.encode(WatchMessage.FindUpdate(0, 0, FindStatus.OK, r))[12].toInt()
        }
        assertEquals(Method.entries.size, codes.toSet().size)
        assertFalse(0 in codes)
        assertEquals(1, codes[Method.entries.indexOf(Method.UWB)])
        assertEquals(7, codes[Method.entries.indexOf(Method.BLE_RSSI)])
    }

    @Test fun aNewerSenderMayAddFieldsAtTheEnd() {
        for (m in listOf<WatchMessage>(
            WatchMessage.FindUpdate(7, 9, FindStatus.OK, pointing, 5, 6),
            WatchMessage.FindStart(1, "sam", true, 2),
            WatchMessage.Ping(3, PingKind.ALL_GOOD),
            WatchMessage.FindEnded(4, EndReason.TIME_LIMIT),
        )) {
            val longer = WatchProtocol.encode(m) + byteArrayOf(1, 2, 3, 4, 5)
            assertEquals(roundTrip(m), assertIs<Decoded.Ok>(WatchProtocol.decode(longer)).message)
        }
    }

    @Test fun aNewerVersionIsNotGuessedAt() {
        val future = WatchProtocol.encode(WatchMessage.FindStop(1)).also { it[1] = (WatchProtocol.VERSION + 1).toByte() }
        assertEquals(Decoded.TooNew(WatchProtocol.VERSION + 1), WatchProtocol.decode(future))
        val past = WatchProtocol.encode(WatchMessage.FindStop(1)).also { it[1] = 0 }
        assertEquals(Decoded.TooOld(0), WatchProtocol.decode(past))
    }

    @Test fun aVersionNoticeIsReadableFromAnyVersion() {
        val fromTheFuture = bytes("4d097f" + "0509" + "aabbcc") // version 9 build, reads 5..9, with fields we don't know
        val notice = assertIs<WatchMessage.VersionNotice>(assertIs<Decoded.Ok>(WatchProtocol.decode(fromTheFuture)).message)
        assertEquals(5, notice.minVersion)
        assertTrue(notice.thisDeviceIsOld)
        assertFalse(notice.otherDeviceIsOld)
        // And one from a build that only reads versions before ours.
        assertTrue(WatchMessage.VersionNotice(0, WatchProtocol.MIN_VERSION - 1).otherDeviceIsOld)
        val same = WatchMessage.VersionNotice(WatchProtocol.MIN_VERSION, WatchProtocol.VERSION)
        assertFalse(same.thisDeviceIsOld || same.otherDeviceIsOld)
    }

    @Test fun unknownMessagesAndUnknownNumbersAreSurvivable() {
        assertEquals(Decoded.UnknownType(99), WatchProtocol.decode(bytes("4d0163" + "0011")))
        // A ping kind, status, reason and outcome invented after this build.
        assertEquals(PingKind.UNKNOWN, assertIs<WatchMessage.Ping>(assertIs<Decoded.Ok>(WatchProtocol.decode(bytes("4d0104" + "00000001" + "2a"))).message).kind)
        assertEquals(EndReason.UNKNOWN, assertIs<WatchMessage.FindEnded>(assertIs<Decoded.Ok>(WatchProtocol.decode(bytes("4d0111" + "00000001" + "2a"))).message).reason)
        assertEquals(PingOutcome.UNKNOWN, assertIs<WatchMessage.PingResult>(assertIs<Decoded.Ok>(WatchProtocol.decode(bytes("4d0112" + "00000001" + "2a"))).message).outcome)
        val odd = WatchProtocol.encode(WatchMessage.FindUpdate(1, 1, FindStatus.OK, pointing)).also { it[9] = 0x2a; it[12] = 0x63 }
        val u = assertIs<WatchMessage.FindUpdate>(assertIs<Decoded.Ok>(WatchProtocol.decode(odd)).message)
        assertEquals(FindStatus.UNKNOWN, u.status)
        assertNull(u.reading.method)
    }

    @Test fun rubbishAndCutOffFramesAreRejected() {
        assertEquals(Decoded.Garbage, WatchProtocol.decode(ByteArray(0)))
        assertEquals(Decoded.Garbage, WatchProtocol.decode(bytes("4d01")))
        assertEquals(Decoded.Garbage, WatchProtocol.decode(bytes("ff0101" + "00000001")))
        val whole = WatchProtocol.encode(WatchMessage.FindUpdate(7, 9, FindStatus.OK, pointing, 5, 6))
        for (n in 3 until whole.size) assertEquals(Decoded.Garbage, WatchProtocol.decode(whole.copyOf(n)), "cut to $n bytes")
        // A string that claims to be longer than the frame.
        assertEquals(Decoded.Garbage, WatchProtocol.decode(bytes("4d0101" + "0000002a" + "01" + "00000007" + "00ff" + "73616d")))
    }

    @Test fun missingBearingOrDistanceStaysMissing() {
        val r = WristReading(WristReading.Kind.DISTANCE_ONLY, distanceM = null, method = Method.BLE_RSSI)
        val got = assertIs<WatchMessage.FindUpdate>(roundTrip(WatchMessage.FindUpdate(1, 1, FindStatus.OK, r))).reading
        assertNull(got.bearingTrueDeg)
        assertNull(got.distanceM)
        // A bearing tucked into a distance-only reading doesn't leak through as an arrow.
        val sneaky = WristReading(WristReading.Kind.DISTANCE_ONLY, bearingTrueDeg = 10.0, distanceM = 5.0)
        assertNull(assertIs<WatchMessage.FindUpdate>(roundTrip(WatchMessage.FindUpdate(1, 1, FindStatus.OK, sneaky))).reading.bearingTrueDeg)
        // "Pointing" with no bearing is downgraded rather than drawn at zero.
        val empty = WristReading(WristReading.Kind.POINTING, bearingTrueDeg = null, distanceM = 5.0)
        assertEquals(WristReading.Kind.DISTANCE_ONLY, assertIs<WatchMessage.FindUpdate>(roundTrip(WatchMessage.FindUpdate(1, 1, FindStatus.OK, empty))).reading.kind)
    }

    @Test fun edgesOfTheNumberRanges() {
        fun send(r: WristReading) = assertIs<WatchMessage.FindUpdate>(roundTrip(WatchMessage.FindUpdate(1, 1, FindStatus.OK, r))).reading
        // 359.999 rounds up to north, not to an out-of-range 360.
        assertEquals(0.0, send(pointing.copy(bearingTrueDeg = 359.999)).bearingTrueDeg!!, 1e-9)
        assertEquals(350.0, send(pointing.copy(bearingTrueDeg = -10.0)).bearingTrueDeg!!, 1e-9)
        assertEquals(0.0, send(pointing.copy(distanceM = -3.0)).distanceM!!, 1e-9)
        assertEquals(12_345_678.9, send(pointing.copy(distanceM = 12_345_678.9)).distanceM!!, 0.01)
        // Ages saturate (about 1 h 49 min) rather than wrap round to "fresh".
        assertEquals(6_553_400, send(pointing.copy(directionAgeMs = 99_999_999)).directionAgeMs)
        assertEquals(0, send(pointing.copy(directionAgeMs = -5)).directionAgeMs)
        assertEquals(-25.5, send(pointing.copy(declinationDeg = -25.5)).declinationDeg, 1e-9)
        val u = assertIs<WatchMessage.FindUpdate>(roundTrip(WatchMessage.FindUpdate(1, 1, FindStatus.OK, pointing, 0, echoHeldMs = 999_999)))
        assertEquals(65_534, u.echoHeldMs)
    }

    @Test fun sequenceNumbersWrap() {
        assertTrue(WatchProtocol.isNewer(5, 4))
        assertFalse(WatchProtocol.isNewer(4, 4))
        assertFalse(WatchProtocol.isNewer(3, 4))
        assertTrue(WatchProtocol.isNewer(2, 65_534))
        assertFalse(WatchProtocol.isNewer(65_534, 2))
    }

    @Test fun longOrOddTextCannotBreakAFrame() {
        val name = "🤘".repeat(120) // 480 bytes of 4-byte characters
        val m = assertIs<WatchMessage.FindStart>(roundTrip(WatchMessage.FindStart(1, name, true, 0)))
        assertTrue(m.mateId.toByteArray(Charsets.UTF_8).size <= 200)
        assertTrue(m.mateId.all { it != '�' } && m.mateId.isNotEmpty(), "cut mid-character")
        assertEquals("🤘".repeat(50), m.mateId)
    }

    @Test fun paceMatchesTheDoc() {
        assertEquals(500, WatchProtocol.FAST_INTERVAL_MS) // two a second
        assertTrue(WatchProtocol.LEASE_MS >= 3 * WatchProtocol.RENEW_EVERY_MS - 1, "three missed renewals before the phone stops")
        assertTrue(WatchProtocol.WATCH_SESSION_MAX_MS < WatchProtocol.PHONE_SESSION_MAX_MS, "the watch's limit should be the one that's hit")
    }
}

class WatchStateTest {
    private val now = 1_800_000_000L
    private val sam = WatchMate("id-sam", "Sam", 0xFF22E4FF.toInt(), lastSeenSec = now - 20, distanceM = 40.0, faceKey = "0011223344556677")
    private val jo = WatchMate("id-jo", "Jo", 0xFFFFB020.toInt(), lastSeenSec = now - 50, distanceM = 1_234.56)
    private val mia = WatchMate("id-mia", "Mia", 0xFFB6FF3B.toInt(), lastSeenSec = now - 900)
    private val alex = WatchMate("id-alex", "Alex", 0xFFC86BFF.toInt(), lastSeenSec = now - 10)
    private val bea = WatchMate("id-bea", "Bea", 0xFF5EF2C2.toInt())
    private val state = WatchState(plus = true, crewName = "Laneway crew", sentAtSec = now, mates = listOf(sam, jo, mia, alex, bea))

    @Test fun survivesTheTrip() {
        val got = assertNotNull(WatchState.decode(state.encode()))
        assertEquals(state, got)
        assertEquals(WatchProtocol.VERSION, got.phoneMaxVersion)
    }

    @Test fun notMoshpointPlusSendsNoCrew() {
        val locked = WatchState(plus = false, sentAtSec = now)
        val got = assertNotNull(WatchState.decode(locked.encode()))
        assertFalse(got.plus)
        assertTrue(got.mates.isEmpty())
        assertEquals("", got.crewName)
    }

    @Test fun aLaterVersionMayAddFieldsToEachMateAndToTheEnd() {
        // Rebuild the frame by hand with two extra bytes inside every mate and three at the end.
        val one = state.copy(mates = listOf(sam, jo))
        val b = one.encode()
        val r = Reader(b, 3)
        r.u8(); r.u8(); r.u8(); r.u32(); r.str()
        val count = r.u8()
        val headLen = b.size - r.left
        val out = java.io.ByteArrayOutputStream()
        out.write(b, 0, headLen)
        repeat(count) {
            val len = r.u16()
            val body = ByteArray(len)
            val start = b.size - r.left
            System.arraycopy(b, start, body, 0, len)
            r.skip(len)
            out.write((len + 2) shr 8); out.write((len + 2) and 0xFF)
            out.write(body); out.write(0x7E); out.write(0x7F)
        }
        out.write(byteArrayOf(9, 9, 9))
        assertEquals(one, WatchState.decode(out.toByteArray()))
    }

    @Test fun rubbishIsNull() {
        assertNull(WatchState.decode(ByteArray(0)))
        assertNull(WatchState.decode(byteArrayOf(1, 2, 3, 4)))
        val b = state.encode()
        assertNull(WatchState.decode(b.copyOf(b.size - 3)))
        assertNull(WatchState.decode(b.copyOf().also { it[1] = 9 })) // a version we can't read
        assertNull(WatchState.decode(WatchProtocol.encode(WatchMessage.FindStop(1)))) // a message, not a state
    }

    @Test fun bigCrewsAreCappedAndLongNamesCut() {
        val many = WatchState(true, "x".repeat(500), now, List(60) { WatchMate("id$it", "Mate $it", it) })
        val got = assertNotNull(WatchState.decode(many.encode()))
        assertEquals(WatchState.MAX_MATES, got.mates.size)
        assertEquals(200, got.crewName.length)
        assertTrue(many.encode().size < 4_000, "crew status should stay small: ${many.encode().size}")
    }

    @Test fun liveMeansSeenInTheLastTwoMinutes() {
        assertTrue(sam.live(now))
        assertFalse(mia.live(now))
        assertFalse(bea.live(now)) // never seen
        assertFalse(sam.live(now + 120))
        assertEquals(3, state.liveCount(now))
    }

    @Test fun liveMatesFirstNearestFirst() {
        val ordered = WatchState.order(listOf(bea, mia, alex, jo, sam), now).map { it.name }
        assertEquals(listOf("Sam", "Jo", "Alex", "Mia", "Bea"), ordered)
    }

    @Test fun theGlanceIsTheNearestMate() {
        assertEquals(CrewGlance.Nearest("Sam", 40.0, live = 3, total = 5), CrewGlance.of(state, now))
    }

    @Test fun orFourOfFiveLiveWhenNoDistanceIsKnown() {
        val noDistances = state.copy(mates = listOf(sam, jo, alex, mia.copy(lastSeenSec = now - 5), bea).map { it.copy(distanceM = null) })
        assertEquals(CrewGlance.LiveCount(live = 4, total = 5), CrewGlance.of(noDistances, now))
    }

    @Test fun aMateWhoHasGoneQuietIsNotTheNearest() {
        // Mia was 5 m away, 15 minutes ago. That's not "nearest: Mia" any more.
        val s = state.copy(mates = listOf(mia.copy(distanceM = 5.0), jo))
        assertEquals(CrewGlance.Nearest("Jo", 1_234.56, live = 1, total = 2), CrewGlance.of(s, now))
    }

    @Test fun anOldStatusMakesNoLiveClaims() {
        assertEquals(CrewGlance.Stale(5), CrewGlance.of(state, now + WatchState.FRESH_FOR_SEC))
        assertIs<CrewGlance.Nearest>(CrewGlance.of(state, now + 60))
        // Still inside the three minutes, but by now nobody has been seen for two: no "nearest".
        assertEquals(CrewGlance.LiveCount(0, 5), CrewGlance.of(state, now + WatchState.FRESH_FOR_SEC - 10))
    }

    @Test fun lockedEmptyAndNeverSynced() {
        assertEquals(CrewGlance.NoPhone, CrewGlance.of(null, now))
        assertEquals(CrewGlance.Locked, CrewGlance.of(WatchState(plus = false, sentAtSec = now), now))
        assertEquals(CrewGlance.NoCrew, CrewGlance.of(WatchState(plus = true, sentAtSec = now), now))
    }
}

class WatchGateTest {
    @Test fun needHelpIsNeverBehindThePaywall() {
        assertTrue(WatchGate.allows(WatchFeature.NEED_HELP, plus = false))
        assertTrue(WatchGate.allows(WatchFeature.SOS_ALL_CLEAR, plus = false))
        assertTrue(WatchGate.allows(PingKind.NEED_HELP, plus = false))
        assertTrue(WatchGate.allows(PingKind.SOS_ALL_CLEAR, plus = false))
    }

    @Test fun everythingElseIsMoshpointPlus() {
        val free = WatchFeature.entries.filter { WatchGate.allows(it, plus = false) }.toSet()
        assertEquals(setOf(WatchFeature.NEED_HELP, WatchFeature.SOS_ALL_CLEAR), free)
        assertTrue(WatchFeature.entries.all { WatchGate.allows(it, plus = true) })
        assertFalse(WatchGate.allows(PingKind.ON_MY_WAY, plus = false))
        assertFalse(WatchGate.allows(PingKind.ALL_GOOD, plus = false))
        assertTrue(WatchGate.allows(PingKind.ON_MY_WAY, plus = true))
    }

    @Test fun aPingThisBuildDoesNotKnowNeverGoes() {
        assertFalse(WatchGate.allows(PingKind.UNKNOWN, plus = true))
        // Every real kind maps to a feature.
        assertTrue(PingKind.entries.filter { it != PingKind.UNKNOWN }.all { WatchGate.featureOf(it) != null })
    }
}

class FindLeaseTest {
    @Test fun runsOnlyWhileTheWatchKeepsAsking() {
        val l = FindLease()
        assertEquals(FindLease.State.Idle, l.state(0))
        l.start(1, "sam", fast = true, watchClockMs = 10, nowMs = 0)
        assertEquals(FindLease.State.Active(1, "sam", true), l.state(14_999))
        assertTrue(l.renew(1, fast = true, watchClockMs = 20, nowMs = 5_000))
        assertIs<FindLease.State.Active>(l.state(19_999))
        // Watch gone: 15 s after the last renewal the phone stops, says why once, and is idle.
        assertEquals(FindLease.State.Ended(1, EndReason.LEASE_EXPIRED), l.state(20_001))
        assertEquals(FindLease.State.Idle, l.state(20_002))
    }

    @Test fun stopStopsAtOnce() {
        val l = FindLease()
        l.start(1, "sam", true, 0, 0)
        assertFalse(l.stop(2)) // some other find's stop, arriving late
        assertIs<FindLease.State.Active>(l.state(100))
        assertTrue(l.stop(1))
        assertEquals(FindLease.State.Idle, l.state(101))
    }

    @Test fun renewalsForAnotherFindDoNotKeepThisOneAlive() {
        val l = FindLease()
        l.start(1, "sam", true, 0, 0)
        assertFalse(l.renew(9, true, 0, 10_000))
        assertIs<FindLease.State.Ended>(l.state(15_001))
        assertFalse(l.renew(1, true, 0, 16_000)) // it's gone: the watch must start again
    }

    @Test fun paceFollowsTheWrist() {
        val l = FindLease()
        l.start(1, "sam", fast = true, watchClockMs = 0, nowMs = 0)
        assertEquals(500, assertIs<FindLease.State.Active>(l.state(1)).intervalMs)
        l.renew(1, fast = false, watchClockMs = 0, nowMs = 2)
        assertEquals(2_000, assertIs<FindLease.State.Active>(l.state(3)).intervalMs)
    }

    @Test fun evenAWatchThatNeverLetsGoIsCutOff() {
        val l = FindLease()
        l.start(1, "sam", true, 0, 0)
        var t = 0L
        var state: FindLease.State = l.state(0)
        while (state is FindLease.State.Active && t < 60 * 60_000) {
            t += 5_000
            l.renew(1, true, 0, t)
            // The link dropped and came back: asking again for the same find doesn't reset the clock.
            if (t % 60_000 == 0L) l.start(1, "sam", true, 0, t)
            state = l.state(t)
        }
        assertEquals(FindLease.State.Ended(1, EndReason.TIME_LIMIT), state)
        assertTrue(t in WatchProtocol.PHONE_SESSION_MAX_MS..WatchProtocol.PHONE_SESSION_MAX_MS + 5_000, "ended at $t")
    }

    @Test fun aDifferentMateIsANewFind() {
        val l = FindLease()
        l.start(1, "sam", true, 0, 0)
        l.start(2, "jo", true, 0, 19 * 60_000)
        assertEquals(FindLease.State.Active(2, "jo", true), l.state(19 * 60_000 + 1))
        // Sam's twenty minutes don't count against Jo.
        assertTrue(l.renew(2, true, 0, 20 * 60_000 - 1_000))
        assertIs<FindLease.State.Active>(l.state(20 * 60_000 + 1))
    }

    @Test fun echoesTheWatchClockWithHowLongItWasHeld() {
        val l = FindLease()
        assertEquals(-1, l.echoHeldMs(5))
        l.start(1, "sam", true, watchClockMs = 777, nowMs = 1_000)
        assertEquals(777, l.lastWatchClockMs)
        assertEquals(1_200, l.echoHeldMs(2_200))
        l.renew(1, true, watchClockMs = 5_777, nowMs = 6_000)
        assertEquals(5_777, l.lastWatchClockMs)
        assertEquals(0, l.echoHeldMs(6_000))
    }

    @Test fun thePhoneCanEndIt() {
        val l = FindLease()
        assertNull(l.end())
        l.start(3, "sam", true, 0, 0)
        assertEquals(FindLease.State.Active(3, "sam", true), l.end())
        assertEquals(FindLease.State.Idle, l.state(1))
    }
}

class WristDistanceTest {
    private fun m(metres: Double) = WristDistance.parts(metres, "NZ")

    @Test fun metricMatchesThePhoneFinder() {
        assertEquals(WristDistance.Parts(1.0, 0, WristDistance.Unit.M, lessThan = true), m(0.4))
        assertEquals(WristDistance.Parts(4.5, 1, WristDistance.Unit.M), m(4.52))
        assertEquals(WristDistance.Parts(4.0, 0, WristDistance.Unit.M), m(4.02))
        assertEquals(WristDistance.Parts(35.0, 0, WristDistance.Unit.M), m(37.0))
        assertEquals(WristDistance.Parts(995.0, 0, WristDistance.Unit.M), m(996.0))
        assertEquals(WristDistance.Unit.KM, m(1_234.0).unit)
        assertEquals(1.234, m(1_234.0).value, 1e-9)
        assertEquals(1, m(1_234.0).decimals)
    }

    @Test fun feetAndMilesInTheStates() {
        fun us(metres: Double) = WristDistance.parts(metres, "US")
        assertEquals(WristDistance.Parts(3.0, 0, WristDistance.Unit.FT, lessThan = true), us(0.5))
        assertEquals(WristDistance.Parts(7.0, 0, WristDistance.Unit.FT), us(2.0))
        assertEquals(WristDistance.Parts(330.0, 0, WristDistance.Unit.FT), us(100.0))
        assertEquals(WristDistance.Unit.MI, us(2_000.0).unit)
        assertEquals(1.2427, us(2_000.0).value, 1e-3)
    }

    @Test fun britainWalksInMetresAndDrivesInMiles() {
        assertEquals(WristDistance.Parts(500.0, 0, WristDistance.Unit.M), WristDistance.parts(500.0, "GB"))
        assertEquals(WristDistance.Unit.MI, WristDistance.parts(2_000.0, "GB").unit)
        assertFalse(WristDistance.usesFeet("gb"))
        assertTrue(WristDistance.usesMiles("gb"))
        assertTrue(WristDistance.usesFeet("us"))
        assertFalse(WristDistance.usesMiles("DE"))
    }

    @Test fun neverNegative() {
        assertEquals(WristDistance.Parts(1.0, 0, WristDistance.Unit.M, lessThan = true), m(-4.0))
    }
}
