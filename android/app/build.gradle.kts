plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android) // Added Kotlin Android plugin
}

android {
    namespace = "observer.quantum.inkweld"
    compileSdk = 35

    defaultConfig {
        applicationId = "observer.quantum.inkweld"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    // Add Kotlin options if needed, e.g.:
    // kotlinOptions {
    //     jvmTarget = "11"
    // }
}

dependencies {

    implementation(libs.appcompat)
    implementation(libs.material)
    implementation(libs.kotlin.stdlib) // Added Kotlin standard library
    testImplementation(libs.junit)
    androidTestImplementation(libs.ext.junit)
    androidTestImplementation(libs.espresso.core)
}
