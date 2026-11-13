// The finder: everything that finds a person (Bluetooth ranging and adverts, UWB on both
// sides, Wi-Fi Aware, GPS bearings, compass, motion) and everything that makes this phone
// findable. It knows nothing about gigs; the app plugs its own things in. docs/FINDER_MODULE.md.
plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "nz.waveformlabs.moshpoint.finder"
    compileSdk = 35

    defaultConfig {
        minSdk = 29
    }

    buildTypes {
        // The same split as the app: test builds (debug) show the finder's status lines and can
        // record; in release builds TEST_BUILD is a constant false, so R8 strips all of that.
        debug {
            buildConfigField("boolean", "TEST_BUILD", "true")
        }
        release {
            buildConfigField("boolean", "TEST_BUILD", "false")
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
        buildConfig = true
    }
}

dependencies {
    // Fixes, arrows, adverts and every rule the finder follows (pure Kotlin, tested).
    api(project(":core"))
    // Coroutines (scopes and flows are part of the finder's API). The same artifact and
    // version the app already uses, so nothing new ends up in the app.
    api(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.uwb)
}
