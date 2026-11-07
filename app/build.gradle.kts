plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

android {
    namespace = "nz.waveformlabs.moshpoint"
    compileSdk = 35

    defaultConfig {
        applicationId = "nz.waveformlabs.moshpoint"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // Relay server for GPS mode. Empty = GPS sharing off. Set with
        // -Pmoshpoint.server=https://your-server or in gradle.properties.
        val server = (project.findProperty("moshpoint.server") as String?) ?: ""
        buildConfigField("String", "MOSHPOINT_SERVER", "\"$server\"")
    }

    // Release signing from CI secrets (see docs/PLAY_STORE.md). Without them, release
    // builds are unsigned, which is fine for the R8/strip check.
    val keystorePath = System.getenv("MOSHPOINT_KEYSTORE_FILE")
    signingConfigs {
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
    implementation(libs.zxing.android.embedded)
    debugImplementation(libs.androidx.compose.ui.tooling)
}
