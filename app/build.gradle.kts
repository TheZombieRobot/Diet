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

    buildTypes {
        release {
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
    debugImplementation(libs.androidx.compose.ui.tooling)
}
