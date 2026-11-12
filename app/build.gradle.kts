plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    // Renders screens to PNGs on the JVM (no phone) so the UI can be reviewed visually.
    alias(libs.plugins.paparazzi)
    // Builds the list of every library in the app with its licence (Settings > Acknowledgements).
    alias(libs.plugins.aboutlibraries)
}

android {
    namespace = "nz.waveformlabs.moshpoint"
    compileSdk = 35

    defaultConfig {
        applicationId = "nz.waveformlabs.moshpoint"
        minSdk = 29
        targetSdk = 35
        // CI build number, so each test build installs over the last one.
        val build = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1
        versionCode = build
        versionName = "0.1.0 ($build)"

        // Real phones only (ARM): the map engine ships native code per chip type, and the x86
        // copies are only for emulators. Roughly halves the download.
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }

        // Relay server for GPS mode. Empty = GPS sharing off. Set with
        // -Pmoshpoint.server=https://your-server or in gradle.properties.

        // Log in with Facebook (name + photo). Off unless a Meta app is configured:
        // -Pmoshpoint.facebookAppId=... -Pmoshpoint.facebookClientToken=... (see docs/FACEBOOK.md).
        // A blank -P value (unset CI variable) falls back to the values in gradle.properties.
        fun prop(name: String, fallback: String) =
            (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() }
                ?: (project.findProperty(fallback) as String?).orEmpty()
        val server = prop("moshpoint.server", "moshpoint.serverUrl")
        buildConfigField("String", "MOSHPOINT_SERVER", "\"$server\"")
        val fbAppId = prop("moshpoint.facebookAppId", "moshpoint.fb.appId")
        val fbToken = prop("moshpoint.facebookClientToken", "moshpoint.fb.clientToken")
        resValue("string", "facebook_app_id", fbAppId)
        resValue("string", "facebook_client_token", fbToken)
        resValue("string", "fb_login_protocol_scheme", "fb$fbAppId")
        buildConfigField("boolean", "FACEBOOK_ENABLED", (fbAppId.isNotBlank() && fbToken.isNotBlank()).toString())
        // Gig search (Ticketmaster Discovery API, free key from developer.ticketmaster.com).
        // Empty = search off; you can still type the gig in by hand.
        buildConfigField("String", "TICKETMASTER_KEY", "\"${prop("moshpoint.ticketmasterKey", "moshpoint.tm.key")}\"")
    }

    // Release signing from CI secrets (see docs/PLAY_STORE.md). Without them, release
    // builds are unsigned, which is fine for the R8/strip check.
    val keystorePath = System.getenv("MOSHPOINT_KEYSTORE_FILE")
    signingConfigs {
        // Test builds: a fixed, deliberately public debug key (standard "android" passwords) so
        // every CI build has the same signature and installs as an update. Not used for release.
        getByName("debug") {
            storeFile = file("debug.keystore")
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
        // Test builds are scrambled too (R8: renamed classes, unused code removed), so the
        // APK testers download can't easily be read back into source. Debug features stay.
        // Test builds: scrambled like release (R8 renames and strips code) but with the debug
        // panel available. Not "debuggable": Android skips name scrambling for debuggable
        // builds. Test-only features check BuildConfig.TEST_BUILD instead of DEBUG.
        debug {
            // Test builds can switch to the pseudo-languages (Settings → Developer options →
            // Languages: "English (XA)" = long accented text, "Arabic (XB)" = right-to-left)
            // to catch clipping and mirroring bugs without a translator.
            isPseudoLocalesEnabled = true
            // With the private key set up in CI, test builds are signed with it too, so nobody
            // can make a fake "update" with the public debug key. Until then, the debug key.
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
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.core.uwb)
    implementation(libs.play.services.wearable) // the link to the watch app (wear/, docs/WATCH.md)
    implementation(libs.zxing.core)
    implementation(libs.maplibre)
    implementation(libs.camerax.core)
    implementation(libs.camerax.camera2)
    implementation(libs.camerax.lifecycle)
    implementation(libs.camerax.video)
    implementation(libs.camerax.view)
    implementation(libs.guava.android) // CameraX hands back a ListenableFuture (R8 strips the rest)
    implementation(libs.facebook.login)
    implementation(libs.zxing.android.embedded)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(kotlin("test"))
}
