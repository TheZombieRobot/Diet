package nz.waveformlabs.moshpoint

import nz.waveformlabs.moshpoint.core.HereRule
import nz.waveformlabs.moshpoint.locate.ExtraFixSource
import nz.waveformlabs.moshpoint.locate.FinderMailbox
import nz.waveformlabs.moshpoint.locate.FinderPlugins
import nz.waveformlabs.moshpoint.locate.FinderRecorder
import nz.waveformlabs.moshpoint.locate.FinderStatus
import nz.waveformlabs.moshpoint.locate.RelayClient
import nz.waveformlabs.moshpoint.locate.RelayLane
import nz.waveformlabs.moshpoint.locate.SharedLocationSink

/**
 * Plugs the gig app's own things into the finder module (finder/, docs/FINDER_MODULE.md), once,
 * from [MoshpointApp.onCreate], before any finder runs. Each one does exactly what the finder's
 * code called directly when it lived in the app.
 */
internal object FinderSetup {
    fun install() {
        // The debug panel and the field recorder (test builds only).
        FinderPlugins.status = object : FinderStatus {
            override fun set(key: String, value: String) = DebugStatus.set(key, value)
            override fun log(line: String) = DebugStatus.log(line)
        }
        FinderPlugins.recorder = object : FinderRecorder {
            override val active: Boolean get() = FieldRecorder.active
            override fun line(csv: String) = FieldRecorder.line(csv)
        }
        // The relay server: GPS lookups, and crowd-relay packets passed up (our own server only).
        FinderPlugins.mailbox = object : FinderMailbox {
            override val pollMs: Long get() = RelayClient.pollMs
            override val label: String get() = RelayClient.label
            override suspend fun lookup(ids: List<ByteArray>): List<List<ByteArray>>? = RelayClient.lookup(ids)
            override val relayUpload: Boolean get() = RelayClient.ownServer
            override suspend fun put(id: ByteArray, sealed: ByteArray): Boolean = RelayClient.put(id, sealed)
        }
        // Where each mate was last seen, for the map.
        FinderPlugins.sharedLocations = SharedLocationSink { mateId, loc -> LocationBook.update(mateId, loc) }
        // "I'm here": a mate's pinned spot is a fix from our own position (docs/IM_HERE.md).
        FinderPlugins.extraFixes = ExtraFixSource { mateId, me, myAccuracyM, nowMs ->
            HerePins.pinOf(mateId)?.let { pin -> HereRule.fix(mateId, me, myAccuracyM, pin, nowMs) }
        }
        // Crew messages without signal ride the crowd relay's adverts (docs/BLUETOOTH_BACKUP.md).
        FinderPlugins.relayLane = object : RelayLane {
            override fun onPacket(bytes: ByteArray) = OfflineMessages.onPacket(bytes)
            override fun hasPacket(): Boolean = OfflineMessages.hasPacket()
            override fun nextPacket(): ByteArray? = OfflineMessages.nextPacket()
        }
    }
}
