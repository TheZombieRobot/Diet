package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

/**
 * Need help, check-ins and Home safe were removed on 16 November 2026 without changing any
 * message format: a mate on an older build (build 312, say) still sends them, and this build
 * must still read them, as ordinary pings with their plain words. "Heading home" came back on
 * 19 November 2026 as a plain ping, in the one kind build 312 also shows as a plain ping (below).
 *
 * Every message below was sealed by the code this branch started from (75fe2fb, before the
 * removal) with a throwaway key. This build has to open each one exactly: every field, the
 * signature, and the message id that keeps one message one message across routes.
 */
class OlderBuildsTest {
    private val group = GigGroup(ByteArray(32) { (it * 7 + 3).toByte() }, "Laneway", 0L)
    private val t = 1_794_800_000L
    private val jo = unhex(PUB)
    private val joTag = CrewKeys.tagOf(jo)

    private fun open(hex: String): GigGroup.Ping = assertNotNull(group.openPing(unhex(hex)), "opens")

    @Test fun anOlderBuildsNeedHelpOpensWithEveryField() {
        val p = open(HELP)
        assertEquals(GigGroup.Ping.NEED_HELP, p.kind)
        assertEquals(7, p.kind, "the number on the wire never changes")
        assertEquals("Jo", p.from)
        assertEquals(t, p.timeSec)
        assertEquals(-36.8485, assertNotNull(p.lat), 1e-7)
        assertEquals(174.7633, assertNotNull(p.lon), 1e-7)
        assertEquals(0, p.minutes)
        assertEquals("", p.text)
        assertEquals(joTag, p.sender, "signed: the signature checks out")
        assertContentEquals(jo, p.pub)
        assertEquals(id("849ee79cbae06d18"), p.id)
    }

    @Test fun anOlderBuildsCheckInKeepsItsMinutes() {
        val p = open(CHECK_IN)
        assertEquals(GigGroup.Ping.CHECK_IN, p.kind)
        assertEquals(8, p.kind)
        assertEquals(45, p.minutes, "shown as: Heading home, back in 45 min")
        assertEquals(t + 60, p.timeSec)
        assertEquals(joTag, p.sender)
        assertEquals(id("505dad2c7dc7fd43"), p.id)
    }

    @Test fun anOlderBuildsHomeSafeOpens() {
        val p = open(HOME_SAFE)
        assertEquals(GigGroup.Ping.HOME_SAFE, p.kind)
        assertEquals(9, p.kind)
        assertEquals(null, p.lat)
        assertEquals(joTag, p.sender)
        assertEquals(id("4844b0a99d4ad854"), p.id)
    }

    @Test fun todaysPingsAndChatFromAnOlderBuildOpenAsBefore() {
        val coming = open(COMING)
        assertEquals(GigGroup.Ping.COMING, coming.kind)
        assertEquals(id("45fb51c938497fa9"), coming.id)
        val chat = open(CHAT)
        assertEquals(GigGroup.Ping.CHAT, chat.kind)
        assertEquals("home now", chat.text)
        assertEquals(id("8e74fdbef70ed3c7"), chat.id)
    }

    /** The chat copy phones share now and then: an older build's carries its Need help and check-in lines. */
    @Test fun anOlderBuildsHistoryCopyStillOpensAndEveryLineChecksOut() {
        val h = assertNotNull(group.openHistory(unhex(HISTORY)))
        assertEquals(listOf(GigGroup.Ping.NEED_HELP, GigGroup.Ping.CHECK_IN, GigGroup.Ping.HOME_SAFE, GigGroup.Ping.CHAT), h.lines.map { it.kind })
        assertEquals(45, h.lines[1].minutes)
        assertEquals("all good", h.lines[3].text)
        h.lines.forEach { assertTrue(group.verifyLine(it), "line ${it.kind} is signed by Jo") }
        assertEquals(listOf(id("8c706b8d61b3b298"), id("44e137d941994c7a"), id("780a52fd96d07574"), id("fc3741fb59abb1f3")), h.lines.map { it.id })
    }

    /** What this build does with them: exactly what it does with any quick ping (core PingPolicy). */
    @Test fun theyAreShownAsOrdinaryPings() {
        for (hex in listOf(HELP, CHECK_IN, HOME_SAFE)) {
            val p = open(hex)
            assertEquals(PingPolicy.Group.OLDER_BUILDS, PingPolicy.group(p.kind))
            val v = PingPolicy.onArrival(p.kind, p.timeSec, p.minutes, p.timeSec + 60)
            val ordinary = PingPolicy.onArrival(GigGroup.Ping.COMING, p.timeSec, p.minutes, p.timeSec + 60)
            assertTrue(v.show && v.alert && !v.late, "fresh: shown, with the ordinary crew notification")
            assertEquals(ordinary.alert, v.alert)
            val hoursLate = PingPolicy.onArrival(p.kind, p.timeSec, p.minutes, p.timeSec + 3 * 3600)
            assertTrue(hoursLate.show && !hoursLate.alert && hoursLate.late, "late: shown quietly, like any ping")
            assertFalse(PingPolicy.crowd(p.kind), "never put through strangers' phones by this build")
        }
    }

    // ---- Heading home, back as a plain ping (docs/SPOT_LINKS.md, item 2) ----

    /**
     * Build 312's own rules (the code at 75fe2fb), frozen here so the choice can't drift: the
     * kinds its PingPolicy shows as quick pings and as safety pings, and the kinds its CheckIns
     * tracker reacts to (any other kind returns at once: no timer, no overdue alarm).
     *
     * Checked by running that code (75fe2fb's core, unchanged) on pings this build sealed, on 19
     * November 2026: kind 6 opened as a QUICK ping, shown with the ordinary crew notification,
     * and its CheckIns ignored it (no deadline, nobody overdue six hours later); kind 8 opened as
     * SAFETY, its CheckIns took it and called the sender overdue after its minutes; a new number
     * (15) was UNKNOWN and not shown at all.
     */
    private object Build312 {
        /** COMING, STAY_PUT, WHERE_ARE_YOU, MEET_AT_PIN, ALL_GOOD, GOING_HOME. */
        val quick = setOf(1, 2, 3, 4, 5, 6)
        /** NEED_HELP, CHECK_IN, HOME_SAFE. */
        val safety = setOf(7, 8, 9)
        /** CheckIns.onPing: CHECK_IN starts the overdue timer, HOME_SAFE ends it. */
        val checkInTracker = setOf(8, 9)
        /** Everything else it shows: CHAT, FLARE, PLAN, JOIN. A kind outside these is ignored. */
        val shown = quick + safety + setOf(10, 11, 12, 14)
    }

    @Test fun headingHomeIsTheKindBuild312ShowsAsAPlainPing() {
        // What this build's ping row sends for Heading home…
        val kind = GigGroup.Ping.GOING_HOME
        // …is what build 312 itself sent for "Heading home" with no timer ("Just tell them").
        assertEquals(kind, open(GOING_HOME).kind)
        assertEquals(6, kind, "the number on the wire never changes")
        assertTrue(kind in Build312.quick, "build 312 shows it as a quick ping, like On my way")
        assertFalse(kind in Build312.checkInTracker, "build 312 starts no overdue timer for it")
        assertFalse(kind in Build312.safety, "and no help alarm")
        // The other candidates, and why not: Check in would start build 312's timer and its alarm,
        assertTrue(GigGroup.Ping.CHECK_IN in Build312.checkInTracker)
        // and a number build 312 doesn't know would never show there at all.
        assertFalse(15 in Build312.shown)
    }

    @Test fun anOlderBuildsHeadingHomeOpensWithEveryField() {
        val p = open(GOING_HOME)
        assertEquals(GigGroup.Ping.GOING_HOME, p.kind)
        assertEquals("Jo", p.from)
        assertEquals(t + 180, p.timeSec)
        assertEquals(-36.8485, assertNotNull(p.lat), 1e-7)
        assertEquals(174.7633, assertNotNull(p.lon), 1e-7)
        assertEquals(0, p.minutes, "no minutes: nothing to wait for")
        assertEquals("", p.text)
        assertEquals(CrewKeys.tagOf(unhex(PUB_2)), p.sender, "signed: the signature checks out")
        assertEquals(id("9cc452dd46f7d038"), p.id)
    }

    /** This build treats it exactly as On my way: shown, the ordinary notification while fresh, carried like any ping. */
    @Test fun headingHomeIsAPlainPingHereToo() {
        assertEquals(PingPolicy.Group.QUICK, PingPolicy.group(GigGroup.Ping.GOING_HOME))
        for (age in listOf(60L, 3 * 3600L)) {
            val home = PingPolicy.onArrival(GigGroup.Ping.GOING_HOME, t, 0, t + age)
            val coming = PingPolicy.onArrival(GigGroup.Ping.COMING, t, 0, t + age)
            assertEquals(listOf(coming.show, coming.alert, coming.late), listOf(home.show, home.alert, home.late), "after $age s")
        }
        assertEquals(PingPolicy.carrySec(GigGroup.Ping.COMING), PingPolicy.carrySec(GigGroup.Ping.GOING_HOME))
        assertEquals(PingPolicy.crowd(GigGroup.Ping.COMING), PingPolicy.crowd(GigGroup.Ping.GOING_HOME))
    }

    /** Ours is build 312's own message, field for field and the same size, so build 312 reads it as its own. */
    @Test fun thisBuildSealsHeadingHomeInBuild312sLayout() {
        val me = CrewKeys.generate()
        val ours = group.sealPing(GigGroup.Ping(GigGroup.Ping.GOING_HOME, "Jo", t + 180, -36.8485, 174.7633), me)
        val theirs = open(GOING_HOME)
        assertEquals(unhex(GOING_HOME).size, ours.size)
        val back = assertNotNull(group.openPing(ours))
        assertEquals(theirs, back.copy(sender = theirs.sender), "every field but who signed it")
        assertEquals(CrewKeys.tagOf(me.pub), back.sender)
    }

    /** A ping this build seals comes out the same size as the older build's, field for field. */
    @Test fun thisBuildSealsPingsInTheSameLayout() {
        val me = CrewKeys.generate()
        val again = group.sealPing(GigGroup.Ping(GigGroup.Ping.COMING, "Jo", t + 1900), me)
        assertEquals(unhex(COMING).size, again.size)
        val back = assertNotNull(group.openPing(again))
        assertEquals(GigGroup.Ping.COMING, back.kind)
        assertEquals(CrewKeys.tagOf(me.pub), back.sender)
    }

    private companion object {
        fun unhex(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

        /** A message id as hex, as the debug trace prints it. */
        fun id(hex: String) = java.lang.Long.parseUnsignedLong(hex, 16)

        const val PUB = "02f3768e6e485a5f01647a48a0e3bc1bbc5407d4a982e629f329edda37f6120b9c"

        /**
         * "Heading home" (kind 6, no minutes), sealed by the code at 75fe2fb on 19 November 2026
         * with a second throwaway key (this one's public half): what build 312 sent for Heading
         * home with no timer, and what this build sends again (docs/SPOT_LINKS.md, item 2).
         */
        const val PUB_2 = "020b197cd2c874b4899385745df260bd9d14b9ee7975f3d24cd799ddcfd9985236"
        const val GOING_HOME = "6afa7a3409e1af82195e2ab99a05ea06a6dc9a5012c3ff0456dbc09d0e1991fcf670929d7b9b96ef11c7a9bfa05aa476" +
            "f8155b4c2a253bf714b9e7cee84aa7e6ae87a554a0f3dde0aacd70451fb80140c893ccc1a65929fcc130412b83ec4b82" +
            "d8abb9ae26cce918cec39921ed278fb373c7c0407d13147e7ea3b3ba9f30c8900f0f36fa8d5998fd"
        const val HELP = "6afa7980e9787d0daa834ff072929624eea868ebd4ee0b8a1445b4ece9b7559bca316ae2d087d2896c78b2c07165c0ce" +
            "4dbacba219c279ee53e040a8892c49f9bcc16b3dc1df7c1ff2a7f8f3ee67eefbf070d4803d28c5d41b8e82fb13a0eecb" +
            "e772b0a6f1d8abb1eea3fe1cb18b4bb98c36f8ba4cdd32ba31ebbf0cdbf9b1f7738ddf2ce3a4d8c9"
        const val CHECK_IN = "6afa79bce023534344354ea00b1e9fa8fa610adbfffb1aefffa315a5246ebdac07548d93050d66b9f0bf8e36945c9516" +
            "7104fe798cf28f08b5080ad58b5feb7487780c4c1c21a529690c2debc606d3ccb222e495bcac80653d0df9efc8fa6d72" +
            "6f3e5fa6d59a542c17efe2b83aec0d0663190bb64739e2a1ac6964d37aefdc83a1a586b1518250b1"
        const val HOME_SAFE = "6afa80884f8bc26206a4191ef4965729c3c5a352b8c20b294742fd94052d3624a3a23003ae511918cbe2a1089abb7f23" +
            "7fb1a3d143f3b2adf9462be69b71a56b9734aab0d68980373efbb7e0aaa8893584f404db6df64aa7fbb701f3b756336f" +
            "a1d53d7d0ea48c6f61f264a8b79ddccd5522330314e305dbaee7f2503dda0d1c65aa8c8e7899850b"
        const val COMING = "6afa80ec8a8711b67204ea9ebd2d1ea8218fb06778d0ccecde2d62cd70c85123ccebf1f434162a64a105b87bedfd9f44" +
            "c0969a3f20b8ad1e3407f9cb2e22389591fbed354f42ee11a8b6d24c34241bec3a031e92bd6e9914d656f161518630fa" +
            "61450e92df93f5e483a72e8f7ef5217f9774f48a11b8178f11d888a410bd9c4dba502ac6202c4f46"
        const val CHAT = "6afa811e259f2cadd1c6fc13a6c8d1e57d6742d2181631e667a89730d8e05a5ce004af0396f0c645a4fc8764043b7d0c" +
            "125d4a2359f6f0825d79f02830341ab82e53d0b57609d5218547e7d4378439ee08d533b530abfdf32a90b279171f554b" +
            "77f55a843a97b0a9320dab927e3de098b6e7ab31ef25b6097246d0b0bc1934017f73ea20eb75961b1a81f83903f8d7cc"
        const val HISTORY = "6afa81509fab551206ae803cf0ae678460945d4a798bd6f27a374ce73e2023efbedd79cc6fa04310a5cc68f061ce020c" +
            "c247d3c5a4539c3e78e0901990366049a41aac4aabaa735978dff67401e94dcd1e673942c90fd7f8921e29ffb9723075" +
            "c331c085651b100386a02e19a440d662ed203f921f7889fe0e950607a3352dc054591b71a02996c2ee9b53fe210bcbb6" +
            "28f845ffb74fffccceb0bc4550992790948d65971a8778540babd6e67405f40a869afc21dbea4016b0ea243fe7eedffb" +
            "52fc536f97d4c3b429cac6eec15a137d2c06ba28fd2a1900681fb39611dab8302e3a7fee021366744250d0a05e5d9aaf" +
            "5bfaafd5b4a4b0e14e712722714944b8d59e4cf4a0ea94d41ec27e10dc88b78e083962ac5c74d74010a58aa8dc1756ed" +
            "72222caf5cbaca79fa5169d0bcff0d22e6c5d057cca1c87fb7c095facd016f0f3ac966608cd8f30a63c066577e22bf09" +
            "df2fa12cc805a755cd0ca8f4e236ba9bddfb6ec1751f04b115a448e49b7809af06f08867d1943bedbbd55ab062bc10f1" +
            "f2a5"
    }
}
