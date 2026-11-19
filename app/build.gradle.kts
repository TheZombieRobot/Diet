import java.net.URI
import java.util.Locale

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    // Renders screens to PNGs on the JVM (no phone) so the UI can be reviewed visually.
    alias(libs.plugins.paparazzi)
    // Builds the list of every library in the app with its licence (Settings > Acknowledgements).
    alias(libs.plugins.aboutlibraries)
}

// A blank -P value (unset CI variable) falls back to the value in gradle.properties.
fun prop(name: String, fallback: String) =
    (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() }
        ?: (project.findProperty(fallback) as String?).orEmpty()

// Relay server for GPS mode. Empty = GPS sharing off. Set with
// -Pmoshpoint.server=https://your-server or in gradle.properties.
val server = prop("moshpoint.server", "moshpoint.serverUrl")

// Texted spots open in the app (docs/SPOT_LINKS.md): an App Link for https://<this host>/spot,
// only with a relay of our own built in, as a plain https address (the same test core SpotLink
// makes before it builds a link). With none, there is no link to open: the activity and its
// filter (src/spotLinks/AndroidManifest.xml) aren't in the manifest at all.
// (URI and Locale are imported above: in a build script `java.` means the project's java extension.)
val spotLinkHost: String? = runCatching { URI(server.trim().trimEnd('/')) }.getOrNull()
    ?.takeIf { "https".equals(it.scheme, ignoreCase = true) && it.rawUserInfo == null && (it.port == -1 || it.port == 443) }
    ?.host?.lowercase(Locale.ROOT)?.takeIf { it.isNotBlank() }

// The privacy policy the app links to (the welcome, the location disclosure, Settings): with a
// relay of our own built in, its page (GET /privacy, built from docs/PRIVACY.md), the same address
// Play Console lists; with none, moshpoint.privacyUrl in gradle.properties.
// -Pmoshpoint.privacyPolicyUrl wins over both. Builds never need a relay for it.
val privacyUrl: String = (project.findProperty("moshpoint.privacyPolicyUrl") as String?)?.takeIf { it.isNotBlank() }
    ?: spotLinkHost?.let { "https://$it/privacy" }
    ?: (project.findProperty("moshpoint.privacyUrl") as String?).orEmpty()

android {
    namespace = "nz.waveformlabs.moshpoint"
    // Android 16 (API 36): what Google Play requires since 31 August 2026 (docs/ANDROID_16.md).
    compileSdk = 36

    defaultConfig {
        applicationId = "nz.waveformlabs.moshpoint"
        minSdk = 29
        targetSdk = 36
        // CI build number, so each test build installs over the last one.
        val build = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1
        versionCode = build
        versionName = "0.1.0 ($build)"

        // Real phones only (ARM): the map engine ships native code per chip type, and the x86
        // copies are only for emulators. Roughly halves the download.
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }

        // Relay server for GPS mode (see `server` above). Empty = GPS sharing off.
        buildConfigField("String", "MOSHPOINT_SERVER", "\"$server\"")
        // The host texted spots' links open from (empty with no relay: then it's unused).
        manifestPlaceholders["spotLinkHost"] = spotLinkHost.orEmpty()

        // Log in with Facebook (name + photo). Off unless a Meta app is configured:
        // -Pmoshpoint.facebookAppId=... -Pmoshpoint.facebookClientToken=... (see docs/FACEBOOK.md).
        // A blank -P value (unset CI variable) falls back to the values in gradle.properties.
        val fbAppId = prop("moshpoint.facebookAppId", "moshpoint.fb.appId")
        val fbToken = prop("moshpoint.facebookClientToken", "moshpoint.fb.clientToken")
        resValue("string", "facebook_app_id", fbAppId)
        resValue("string", "facebook_client_token", fbToken)
        resValue("string", "fb_login_protocol_scheme", "fb$fbAppId")
        buildConfigField("boolean", "FACEBOOK_ENABLED", (fbAppId.isNotBlank() && fbToken.isNotBlank()).toString())
        // The privacy policy the app links to (see privacyUrl above).
        buildConfigField("String", "PRIVACY_POLICY_URL", "\"$privacyUrl\"")
        // No API keys are ever built into the app (anyone can pull them out of an APK): gig search
        // keys are the relay server's secrets (docs/SECRETS.md).
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
            // Unused resources (from the libraries, mostly) left out of the Play build.
            isShrinkResources = true
            // proguard-release.pro: no verbose, debug or info logs in release (one names a friend).
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-release.pro")
        }
    }
    androidResources {
        // The app's own 20 languages (res/values*, xml/locales_config.xml): the libraries' other
        // translations are left out. The two pseudo-locales keep test builds' layout checks
        // (debug { isPseudoLocalesEnabled }).
        localeFilters += listOf(
            "en", "ar", "de", "es", "es-rES", "fr", "hi", "in", "it", "ja", "ko", "nl", "pl", "pt", "sv", "th", "tr", "vi",
            "zh-rCN", "zh-rTW", "en-rXA", "ar-rXB",
        )
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

// The App Link for texted spots (see spotLinkHost above), in every build type, only with a relay.
androidComponents {
    onVariants { variant ->
        if (spotLinkHost != null) variant.sources.manifests.addStaticManifestFile("src/spotLinks/AndroidManifest.xml")
    }
}

dependencies {
    implementation(project(":core"))
    // Finding a person and being findable, with no gig code in it (docs/FINDER_MODULE.md).
    implementation(project(":finder"))

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
    // The real org.json for tests on the JVM (on a phone it comes with Android): VenueLogicTest.
    testImplementation(libs.orgjson)
}
