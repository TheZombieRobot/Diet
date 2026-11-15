package nz.waveformlabs.moshpoint.server

import java.io.File

/** A fresh, empty data directory (deleted when the JVM exits). */
fun tempDataDir(): File = kotlin.io.path.createTempDirectory("relay-test").toFile().also { d ->
    Runtime.getRuntime().addShutdownHook(Thread { d.deleteRecursively() })
}

/** The relay's settings as deployed, with a temp data directory and a fixed token secret. */
fun testConfig(
    dir: File = tempDataDir(),
    clock: () -> Long = System::currentTimeMillis,
    limits: LimitConfig = LimitConfig(),
    trust: ProxyTrust = ProxyTrust.NONE,
) = RelayConfig(dataDir = dir, clock = clock, limits = limits, proxyTrust = trust, tokenSecret = ByteArray(32) { 7 }, minFreeBytes = 0)

fun testRelay(
    dir: File = tempDataDir(),
    clock: () -> Long = System::currentTimeMillis,
    limits: LimitConfig = LimitConfig(),
    trust: ProxyTrust = ProxyTrust.NONE,
) = Relay(testConfig(dir, clock, limits, trust))
