package nz.waveformlabs.moshpoint.core

import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.fail

/**
 * The app's requests to the relay's new endpoints, built by the app's own code ([BatchPlan] and
 * [RelayWire], as RelayClient uses them), must be byte for byte what
 * `server/src/test/resources/app-requests.txt` holds. The server's AppRequestsTest sends that
 * same file to the real relay and checks the answers. (The server can't depend on core: its
 * Docker build holds only `server/`.) Change the format on purpose: this test prints the new lines.
 */
class AppRequestFixtureTest {
    private fun id(tag: Int) = ByteArray(16) { (tag * 17 + it).toByte() }
    private fun rec(tag: Int, size: Int) = ByteArray(size) { (tag * 31 + it * 7).toByte() }

    /** A crew sync's batch, the way RelayClient.sync builds it. */
    private fun syncBatch(): ByteArray {
        val plan = BatchPlan()
        val location = id(1)
        val crowd = id(2)
        val roster = id(3)
        val chat = id(4)
        val ping = id(5)
        val pin = id(6)
        // A location share, a crowd-relay packet and our intro wait for the minute's batch...
        plan.add(BatchPlan.Put(location, rec(1, 45), held = false, replaceable = true), BatchPlan.Timing.MINUTE, 0L)
        plan.add(BatchPlan.Put(crowd, rec(2, 45), held = false, replaceable = true), BatchPlan.Timing.MINUTE, 1_000L)
        plan.add(BatchPlan.Put(roster, rec(3, 120), held = false, replaceable = true), BatchPlan.Timing.MINUTE, 2_000L)
        // ...a newer fix replaces the first one (each rotating id once, the newest copy)...
        plan.add(BatchPlan.Put(location, rec(4, 45), held = false, replaceable = true), BatchPlan.Timing.MINUTE, 3_000L)
        // ...and two crew messages: a chat line (the chat mailbox) and a quick ping.
        plan.add(BatchPlan.Put(chat, rec(5, 300), held = true, replaceable = false, key = 1L), BatchPlan.Timing.SOON, 4_000L)
        plan.add(BatchPlan.Put(ping, rec(6, 150), held = false, replaceable = false, key = 2L), BatchPlan.Timing.MINUTE, 5_000L)
        // The sync reads intros, the pin, pings and the crew's boxes, whole (since 0), as /v1/lookup did.
        val gets = listOf(roster, pin, ping, location, crowd).map { BatchPlan.Get(it, held = false, since = 0L) }
        return RelayWire.batch(plan.take(gets, 60_000L).ops)
    }

    /** A chat poll: one mailbox never seen (cursor 0) and one asked before. */
    private fun heldSince(): ByteArray = RelayWire.heldSince(listOf(id(4) to 0L, id(7) to 1_800_000_000_000_123L))

    @Test fun theAppsRequestsAreTheFixtureTheRelayIsTestedWith() {
        val want = mapOf("batch" to syncBatch(), "heldsince" to heldSince()).mapValues { it.value.toHex() }
        val file = fixture()
        val have = file.readLines().filter { it.isNotBlank() && !it.startsWith("#") }
            .associate { it.substringBefore(' ') to it.substringAfter(' ').trim() }
        if (have != want) {
            fail("${file.path} doesn't match the app's requests. If the change is on purpose, use:\n" +
                want.entries.joinToString("\n") { "${it.key} ${it.value}" })
        }
        assertEquals(want, have)
    }

    private fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }

    /** The shared file, from core's directory (Gradle runs tests there) or wherever this runs inside the repo. */
    private fun fixture(): File {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val f = File(dir, "server/src/test/resources/app-requests.txt")
            if (f.isFile) return f
            dir = dir.parentFile
        }
        fail("server/src/test/resources/app-requests.txt not found from ${File("").absolutePath}")
    }
}
