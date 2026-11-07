plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    // Renders screens to PNGs on the JVM (no phone) so the UI can be reviewed visually.
    alias(libs.plugins.paparazzi)
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

        // Relay server for GPS mode. Empty = GPS sharing off. Set with
        // -Pmoshpoint.server=https://your-server or in gradle.properties.
        val server = (project.findProperty("moshpoint.server") as String?) ?: ""
        buildConfigField("String", "MOSHPOINT_SERVER", "\"$server\"")

        // Log in with Facebook (name + photo). Off unless a Meta app is configured:
        // -Pmoshpoint.facebookAppId=... -Pmoshpoint.facebookClientToken=... (see docs/FACEBOOK.md).
        // A blank -P value (unset CI variable) falls back to the values in gradle.properties.
        fun prop(name: String, fallback: String) =
            (project.findProperty(name) as String?)?.takeIf { it.isNotBlank() }
                ?: (project.findProperty(fallback) as String?).orEmpty()
        val fbAppId = prop("moshpoint.facebookAppId", "moshpoint.fb.appId")
        val fbToken = prop("moshpoint.facebookClientToken", "moshpoint.fb.clientToken")
        resValue("string", "facebook_app_id", fbAppId)
        resValue("string", "facebook_client_token", fbToken)
        resValue("string", "fb_login_protocol_scheme", "fb$fbAppId")
        buildConfigField("boolean", "FACEBOOK_ENABLED", (fbAppId.isNotBlank() && fbToken.isNotBlank()).toString())
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
        release {
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
    implementation(libs.zxing.core)
    implementation(libs.facebook.login)
    implementation(libs.zxing.android.embedded)
    debugImplementation(libs.androidx.compose.ui.tooling)
    testImplementation(kotlin("test"))
}
