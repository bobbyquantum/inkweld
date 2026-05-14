plugins {
    id("com.android.application")
}

android {
    namespace = "app.inkweld"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.inkweld"
        minSdk = 21
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        manifestPlaceholders["twaHost"] = "inkweld.app"
        manifestPlaceholders["twaAppName"] = "Inkweld"

        resValue("string", "twaAppName", "Inkweld")
        resValue("string", "hostName", "inkweld.app")
    }

    signingConfigs {
        create("release") {
            storeFile = rootProject.file(
                project.findProperty("KEYSTORE_PATH") as String? ?: "inkweld-release.keystore"
            )
            storePassword = project.findProperty("KEYSTORE_PASSWORD") as String?
            keyAlias = project.findProperty("KEY_ALIAS") as String?
            keyPassword = project.findProperty("KEY_PASSWORD") as String?
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
            signingConfig = signingConfigs.getByName("release")
        }
    }

    flavorDimensions += "environment"

    productFlavors {
        create("preview") {
            dimension = "environment"
            applicationIdSuffix = ".preview"
            versionNameSuffix = "-preview"
            manifestPlaceholders["twaHost"] = "preview.inkweld.app"
            manifestPlaceholders["twaAppName"] = "Inkweld Preview"
            resValue("string", "hostName", "preview.inkweld.app")
            resValue("string", "twaAppName", "Inkweld Preview")
        }
        create("prod") {
            dimension = "environment"
            manifestPlaceholders["twaHost"] = "inkweld.app"
            manifestPlaceholders["twaAppName"] = "Inkweld"
            resValue("string", "hostName", "inkweld.app")
            resValue("string", "twaAppName", "Inkweld")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.google.androidbrowserhelper:androidbrowserhelper:2.5.0")
}
