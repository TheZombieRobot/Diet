package nz.waveformlabs.moshpoint.core

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** UWB places: the focused mate first, then the nearest, without churning on every wobble. */
class UwbSlotsTest {
    private fun choose(ready: Map<String, Double?>, current: Set<String> = emptySet(), focused: String? = null, capacity: Int = 4) =
        UwbSlots.choose(ready, current, focused, capacity)

    @Test fun withRoomForEveryoneEveryoneIsIn() {
        val ready = mapOf("jo" to 40.0, "sam" to null, "alex" to 5.0)
        assertEquals(ready.keys, choose(ready))
        // Whoever is in now, and whoever is focused, makes no difference.
        assertEquals(ready.keys, choose(ready, current = setOf("jo"), focused = "sam"))
    }

    @Test fun theNearestGetTheFreePlaces() {
        val ready = mapOf("a" to 30.0, "b" to 4.0, "c" to 12.0, "d" to null, "e" to 8.0, "f" to 50.0)
        assertEquals(setOf("b", "e", "c", "a"), choose(ready))
        // Unknown distances come last, but still fill a place nobody else wants.
        assertTrue("d" in choose(ready.filterKeys { it != "f" } + ("g" to null), capacity = 5))
    }

    @Test fun theFocusedMateIsAlwaysIn() {
        val ready = mapOf("a" to 3.0, "b" to 4.0, "c" to 5.0, "d" to 6.0, "far" to 80.0)
        val full = setOf("a", "b", "c", "d")
        val chosen = choose(ready, current = full, focused = "far")
        assertEquals(4, chosen.size)
        assertTrue("far" in chosen)
        // The farthest member gave up its place for them.
        assertEquals(setOf("a", "b", "c", "far"), chosen)
        // Even with no distance known for them at all.
        assertTrue("x" in choose(ready + ("x" to null), current = full, focused = "x"))
    }

    @Test fun theFocusedMateIsNeverSwappedOut() {
        val ready = mapOf("far" to 90.0, "a" to 3.0, "b" to 4.0, "c" to 5.0, "near" to 1.0)
        val chosen = choose(ready, current = setOf("far", "a", "b", "c"), focused = "far")
        assertTrue("far" in chosen)
        // Someone else made room for the nearer mate instead.
        assertEquals(setOf("far", "a", "b", "near"), chosen)
    }

    @Test fun membersStayUnlessSomeoneIsClearlyNearer() {
        val current = setOf("a", "b", "c", "d")
        val members = mapOf("a" to 5.0, "b" to 6.0, "c" to 7.0, "d" to 10.0)
        // 8 m against a member at 10 m: Bluetooth wobbles more than that. Nobody moves.
        assertEquals(current, choose(members + ("e" to 8.0), current))
        // 6.9 m is under 70% of 10 m but only 3.1 m nearer: it swaps.
        assertEquals(setOf("a", "b", "c", "e"), choose(members + ("e" to 6.9), current))
        // Close up, 70% of 4 m is under 3 m nearer: no swap (2.7 m against 4 m).
        val close = mapOf("a" to 1.0, "b" to 2.0, "c" to 3.0, "d" to 4.0)
        assertEquals(setOf("a", "b", "c", "d"), choose(close + ("e" to 2.7), setOf("a", "b", "c", "d")))
        // An outsider with no distance known never pushes anyone out.
        assertEquals(current, choose(members + ("e" to null), current))
    }

    @Test fun aMemberGivingNoDistanceMakesWayForSomeoneNear() {
        val current = setOf("a", "b", "c", "silent")
        val ready = mapOf("a" to 5.0, "b" to 6.0, "c" to 7.0, "silent" to null, "e" to 9.0)
        assertEquals(setOf("a", "b", "c", "e"), choose(ready, current))
    }

    @Test fun whoeverIsNoLongerReadyLeaves() {
        val ready = mapOf("a" to 5.0, "b" to 6.0, "c" to 7.0, "d" to 8.0, "e" to 9.0)
        val chosen = choose(ready, current = setOf("gone", "a", "b", "c"))
        assertTrue("gone" !in chosen)
        assertEquals(setOf("a", "b", "c", "d"), chosen)
    }

    @Test fun neverMoreThanThePlaces() {
        val ready = (1..10).associate { "m$it" to it.toDouble() }
        assertEquals(4, choose(ready, current = ready.keys).size)
        assertEquals(setOf("m1", "m2", "m3", "m4"), choose(ready, current = ready.keys))
        assertEquals(2, choose(ready, current = setOf("m9", "m10"), capacity = 2).size)
        assertTrue(choose(ready, capacity = 0).isEmpty())
    }

    @Test fun theArbitersDistanceIsTheArrowsWithoutMovingTheArrow() {
        val a = MethodArbiter()
        val now = 1_800_000_000_000L
        assertEquals(null, a.distanceFor("jo", now))
        a.submit(Fix("jo", Method.BLE_RSSI, null, 9.0, 0.7, now))
        a.submit(Fix("jo", Method.GPS_SERVER, 90.0, 40.0, 0.6, now))
        a.submit(Fix("jo", Method.UWB, 10.0, 6.5, 0.95, now))
        val arrow = a.arrowFor("jo", 0.0, now) as ArrowState.Pointing
        assertEquals(arrow.distanceM, a.distanceFor("jo", now))
        assertEquals(6.5, a.distanceFor("jo", now))
        // Asking for the distance never changes which method the arrow follows.
        a.submit(Fix("jo", Method.GPS_SERVER, 90.0, 40.0, 1.0, now + 1_000))
        repeat(5) { a.distanceFor("jo", now + 1_000) }
        assertEquals(Method.UWB, (a.arrowFor("jo", 0.0, now + 1_000) as ArrowState.Pointing).method)
        // Gone stale: nothing.
        assertEquals(null, a.distanceFor("jo", now + 3_600_000))
    }

    @Test fun itSettles() {
        // Whatever it chooses, asked again with the same distances, it keeps.
        val ready = mapOf("a" to 12.0, "b" to 3.0, "c" to 25.0, "d" to 7.0, "e" to 40.0, "f" to 2.0)
        var current = emptySet<String>()
        repeat(3) { current = choose(ready, current, focused = "e") }
        assertEquals(current, choose(ready, current, focused = "e"))
        assertEquals(setOf("e", "f", "b", "d"), current)
    }
}
