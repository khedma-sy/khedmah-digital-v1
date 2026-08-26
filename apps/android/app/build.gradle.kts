plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

if (file("google-services.json").isFile) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.khedmah.digital"
    compileSdk = 35

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures { compose = true; buildConfig = true }

    defaultConfig {
        manifestPlaceholders["GOOGLE_MAPS_API_KEY"] = providers.gradleProperty("GOOGLE_MAPS_API_KEY").orNull
            ?: providers.environmentVariable("GOOGLE_MAPS_ANDROID_API_KEY").orNull
            ?: ""
        applicationId = "com.khedmah.digital"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        val apiBaseUrl = providers.gradleProperty("KHEDMAH_API_BASE_URL").orNull ?: ""
        buildConfigField("String", "KHEDMAH_API_BASE_URL", "\"${apiBaseUrl.replace("\"", "\\\"")}\"")
        val googleServerClientId = providers.gradleProperty("GOOGLE_OAUTH_SERVER_CLIENT_ID").orNull
            ?: providers.environmentVariable("GOOGLE_OAUTH_SERVER_CLIENT_ID").orNull
            ?: ""
        buildConfigField("String", "GOOGLE_OAUTH_SERVER_CLIENT_ID", "\"${googleServerClientId.replace("\"", "\\\"")}\"")
    }
}

dependencies {
    implementation(platform("com.google.firebase:firebase-bom:33.10.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-firestore")
    implementation("com.google.firebase:firebase-storage")
    implementation("com.google.firebase:firebase-analytics")
    implementation("com.google.firebase:firebase-messaging")
    implementation("androidx.credentials:credentials:1.3.0")
    implementation("androidx.credentials:credentials-play-services-auth:1.3.0")
    implementation("com.google.android.libraries.identity.googleid:googleid:1.1.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.10.2")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation(platform("androidx.compose:compose-bom:2025.04.01"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.9.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("com.google.android.gms:play-services-maps:19.2.0")
    implementation("com.google.maps.android:maps-compose:6.4.1")
    implementation("io.coil-kt:coil-compose:2.7.0")
}
