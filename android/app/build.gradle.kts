import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// versionCode comes from the CI run number so each build installs over the last.
val buildNumber = (project.findProperty("buildNumber") as String?)?.toIntOrNull() ?: 1

android {
    namespace = "uk.co.roboverse.tourguide"
    compileSdk = 36

    defaultConfig {
        applicationId = "uk.co.roboverse.tourguide"
        minSdk = 31
        targetSdk = 36
        versionCode = buildNumber
        versionName = "0.1.$buildNumber"
        ndk { abiFilters += listOf("arm64-v8a") }
        // The app shows the live site (updates arrive like the web app's) and adds the on-phone model.
        buildConfigField("String", "SITE_URL", "\"https://edixon.github.io/Tour-guide/\"")
        buildConfigField("String", "SITE_HOST", "\"edixon.github.io\"")
        buildConfigField("String", "MODEL_REPO", "\"litert-community/gemma-4-E2B-it-litert-lm\"")
    }

    buildFeatures { buildConfig = true }

    // A fixed key so each new build installs over the previous one. It is in the public repo, so it only
    // proves a build came from this repo's settings, not from Eliot: install APKs only from this repo's Releases.
    signingConfigs {
        create("tour") {
            storeFile = file("../keystore/tourguide.jks")
            storePassword = "tourguide"
            keyAlias = "tourguide"
            keyPassword = "tourguide"
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("tour")
        }
        debug { signingConfig = signingConfigs.getByName("tour") }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    // LiteRT's native libraries are loaded by path, so keep them extracted.
    packaging { jniLibs { useLegacyPackaging = true } }
}

kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }

dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.google.ai.edge.litertlm:litertlm-android:0.18.0")
}
