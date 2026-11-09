pluginManagement {
    repositories {
        google()
        // Google's mirror of Maven Central first: Maven Central redirects some big files (the
        // Kotlin compiler) to GitHub, which times out during GitHub incidents.
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        // Google's mirror of Maven Central first: Maven Central redirects some big files (the
        // Kotlin compiler) to GitHub, which times out during GitHub incidents.
        maven("https://maven-central.storage-download.googleapis.com/maven2/")
        mavenCentral()
    }
}

rootProject.name = "moshpoint"
include(":core")
include(":app")
include(":server")
