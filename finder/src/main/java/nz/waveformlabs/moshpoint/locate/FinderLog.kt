package nz.waveformlabs.moshpoint.locate

import nz.waveformlabs.moshpoint.finder.BuildConfig

/**
 * The finder's status lines, log and field recording, passed to whatever the app plugged in
 * ([FinderPlugins.status], [FinderPlugins.recorder]).
 *
 * Test builds only: [enabled] is the module's `BuildConfig.TEST_BUILD`, a constant, so in a
 * release build every call returns straight away and R8 strips it with its text, as it did when
 * this code called the app's `DebugStatus` directly.
 */
internal object FinderLog {
    val enabled: Boolean get() = BuildConfig.TEST_BUILD

    fun set(key: String, value: String) {
        if (!enabled) return
        FinderPlugins.status?.set(key, value)
    }

    fun log(line: String) {
        if (!enabled) return
        FinderPlugins.status?.log(line)
    }

    /** A field recording is running. */
    val recording: Boolean get() = enabled && FinderPlugins.recorder?.active == true

    /** One recording line (dropped unless a recording is running). */
    fun record(csv: String) {
        if (!enabled) return
        FinderPlugins.recorder?.line(csv)
    }
}
