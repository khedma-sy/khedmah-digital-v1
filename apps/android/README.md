# Khedmah Digital Android Firebase integration

The Android application ID is `com.khedmah.digital`. Place the existing production `google-services.json` at `apps/android/app/google-services.json` through the approved Secret Manager/CI channel. The file is intentionally ignored and must never be committed. When present, Gradle applies the Google Services plugin and generates the resources used by `FirebaseApp`.

The Firebase BoM supplies compatible Auth, Firestore, Storage, Analytics, and Messaging SDKs. Messaging is linked only; no notification permission, token registration, or production notification flow is enabled.

## Build prerequisites

Install JDK 17 and Android SDK 35. Set `JAVA_HOME` to JDK 17 and `ANDROID_HOME` or `ANDROID_SDK_ROOT` to the SDK, then run `npm run build:android` from the repository root.

The repository tracks the complete Gradle Wrapper and pins Gradle 8.11.1 with the official distribution checksum. Do not install or invoke a system Gradle version. Both local and CI builds run `apps/android/gradlew`; the CI setup action only prepares caching and build metadata. A build without `google-services.json` validates the non-production source graph but deliberately leaves Firebase uninitialized at runtime.
