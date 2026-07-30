# Khedmah Digital Android Firebase integration

The Android application ID is `com.khedmah.digital`. Place the existing production `google-services.json` at `apps/android/app/google-services.json` through the approved Secret Manager/CI channel. The file is intentionally ignored and must never be committed. When present, Gradle applies the Google Services plugin and generates the resources used by `FirebaseApp`.

The Firebase BoM supplies compatible Auth, Firestore, Storage, Analytics, and Messaging SDKs. Messaging is linked only; no notification permission, token registration, or production notification flow is enabled.

## Build prerequisites

Install JDK 17, Android SDK 35, and Gradle 8.11.1. Set `JAVA_HOME` to JDK 17 and `ANDROID_HOME` or `ANDROID_SDK_ROOT` to the SDK, then run `npm run build:android` from the repository root. The script rejects a missing or different Gradle version so local and CI builds use the same toolchain.

This repository intentionally does not track the standard Gradle Wrapper because its required executable JAR is a binary and the repository's Create PR transport rejects binary diffs. CI installs pinned Gradle 8.11.1 using `gradle/actions/setup-gradle@v4`; local development uses the same version through the documented build script. The Android Gradle source/configuration is unchanged. A build without `google-services.json` validates the non-production source graph but deliberately leaves Firebase uninitialized at runtime.
