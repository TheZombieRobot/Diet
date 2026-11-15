// Moshpoint relay server: a dumb, privacy-preserving mailbox for sealed locations.
plugins {
    alias(libs.plugins.kotlin.jvm)
    application
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}

application {
    mainClass.set("nz.waveformlabs.moshpoint.server.MainKt")
    // The heap follows the Machine's memory (60% of it), so resizing the VM needs no change here.
    // The rest is for Netty's buffers, SQLite's page cache and the JVM itself. JAVA_OPTS overrides.
    applicationDefaultJvmArgs = listOf(
        "-XX:MaxRAMPercentage=60",
        "-XX:MaxDirectMemorySize=96m",
        "-XX:+ExitOnOutOfMemoryError",
        "-Xss512k",
    )
}

dependencies {
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.netty)
    // Declared here rather than in the shared version catalogue (server-only libraries).
    implementation("io.ktor:ktor-server-status-pages:${libs.versions.ktor.get()}")
    // The mailboxes live in SQLite on the Fly volume (docs/SERVER_PRODUCTION.md).
    implementation("org.xerial:sqlite-jdbc:3.50.3.0")
    implementation(libs.logback)
    implementation(libs.orgjson)
    testImplementation(libs.ktor.server.test.host)
    testImplementation(kotlin("test"))
}

tasks.test {
    useJUnitPlatform()
    // One test starts the real server in a separate JVM with a small heap (LargeFileTest).
    maxHeapSize = "512m"
    systemProperty("relay.classpath", sourceSets.main.get().runtimeClasspath.asPath)
}
