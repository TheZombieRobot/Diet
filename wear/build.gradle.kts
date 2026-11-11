// The Wear OS companion: an arrow, buzzes, a tile, a complication and pings on the wrist.
// The phone does the finding; this draws it. Design notes: docs/WATCH.md.
plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    // Renders the watch screens to PNGs on the JVM (round, small and large, every language).
    alias(libs.plugins.paparazzi)
}

android {
    namespace = "nz.waveformlabs.moshpoint.wear"
    compileSdk = 35

    defaultConfig {
        // MUST be the phone app's id, and signed with the same key (below): the Wear Data Layer
        // only connects a watch app and a phone app that share both.
        applicationId = "nz.waveformlabs.moshpoint"
        minSdk = 30 // Wear OS 3: Galaxy Watch4 and newer, Pixel Watch
        targetSdk = 34
        // Same CI build number as the phone app, offset so the two can share one Play listing
        // (every APK under a package needs its own version code).
        val build = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1
        versionCode = 1_000_000 + build
        versionName = "0.1.0 ($build)"
    }

    // The same signing set-up as app/build.gradle.kts, on purpose: see applicationId above.
    val keystorePath = System.getenv("MOSHPOINT_KEYSTORE_FILE")
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("app/debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("MOSHPOINT_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MOSHPOINT_KEY_ALIAS")
                keyPassword = System.getenv("MOSHPOINT_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        // Test builds mirror the phone's: shrunk and optimised like release (Compose is slow on
        // a watch otherwise), signed with the private key when CI has it, else the debug key.
        debug {
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
            isDebuggable = false
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
            buildConfigField("boolean", "TEST_BUILD", "true")
        }
        release {
            buildConfigField("boolean", "TEST_BUILD", "false")
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"))
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    lint {
        // Report everything, never fail the build on lint (CI prints the findings).
        abortOnError = false
        checkDependencies = false
        textReport = true
        textOutput = file("build/reports/lint.txt")
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(project(":core"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.service)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.foundation)
    implementation(libs.androidx.wear.compose.material)
    implementation(libs.androidx.wear.compose.foundation)
    implementation(libs.androidx.wear) // ambient mode
    implementation(libs.androidx.wear.ongoing)
    implementation(libs.androidx.wear.tiles)
    implementation(libs.androidx.wear.protolayout)
    implementation(libs.androidx.wear.watchface.complications)
    implementation(libs.play.services.wearable)
    implementation(libs.guava.android) // tiles hand back a ListenableFuture (R8 strips the rest)
    testImplementation(kotlin("test"))
}
