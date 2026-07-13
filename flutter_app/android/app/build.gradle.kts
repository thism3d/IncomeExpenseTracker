import java.util.regex.Pattern

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// lib/utils/constants.dart is the single source of truth for the version, because
// the admin panel's auto-update check compares the published versionCode against
// AppConstants.appBuildNumber. If the two ever drift, the phone either never sees
// an update or loops on one it already has — so read them straight from the Dart.
fun dartConstant(name: String, fallback: String): String {
    val file = file("../../lib/utils/constants.dart")
    if (!file.exists()) return fallback
    val matcher = Pattern
        .compile("$name\\s*=\\s*'?\"?([^;'\"]+)'?\"?\\s*;")
        .matcher(file.readText())
    return if (matcher.find()) matcher.group(1).trim() else fallback
}

val appVersionName = dartConstant("appVersion", "1.0.0")
val appVersionCode = dartConstant("appBuildNumber", "1").toInt()

android {
    namespace = "com.sisirbindu.tracker"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        // flutter_local_notifications needs the desugared java.time on older APIs.
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        applicationId = "com.sisirbindu.tracker"
        // local_auth (BiometricPrompt) and the granular media permissions need 23+.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = appVersionCode
        versionName = appVersionName
    }

    buildTypes {
        release {
            // TODO: replace with a real upload keystore before publishing.
            // Debug keys keep `flutter build apk --release` working for now.
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}

flutter {
    source = "../.."
}
