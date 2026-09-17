# Firebase SDK Integration

## Production project contract

This repository is portable across Google Cloud/Firebase projects. Production identity is supplied at deployment time through the protected Production environment and Secret Manager; no Google Cloud project ID, Firebase project ID, Cloud Run numeric host, service-account email, or storage bucket is canonical in source control. The Android application ID remains `com.khedmah.digital`.

## Web

The modular Firebase SDK is centralized in `apps/frontend/lib/firebase`. `config.ts` is the only browser configuration source. `client.ts` initializes one app and connects Auth, Firestore, and Storage. Analytics is initialized only in a supported browser. Messaging is prepared lazily and never requests notification permission or retrieves a token.

Supply all `NEXT_PUBLIC_FIREBASE_*` values at the web build boundary from the selected environment. Firebase browser configuration is public by protocol, but it must still be centrally managed, restricted to approved origins, and never copied throughout application source. Server credentials and service-account keys must never use the `NEXT_PUBLIC_` prefix.

## Android

The Gradle application uses package `com.khedmah.digital`, Google Services plugin `4.4.2`, Firebase BoM `33.10.0`, and Auth, Firestore, Storage, Analytics, and Messaging libraries. The environment-specific `google-services.json` must be injected to `apps/android/app/google-services.json`; Git ignores it. CI accepts it only as the base64-encoded protected secret `FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_B64` and deletes it with the ephemeral workspace.

`KhedmahApplication` initializes Firebase only when the Google Services plugin generated `google_app_id`. Messaging has no permission request, token registration, receiver, or production notification behavior.

## Validation

- `npm run validate:firebase` validates the repository integration without requiring credentials.
- `npm run validate:firebase:production` requires every web variable, requires matching web/server project IDs, parses the protected Android file, verifies its project ID, and verifies `com.khedmah.digital`.
- `npm --workspace apps/frontend test` initializes modular Auth, Firestore, and Storage with non-production test configuration and verifies server-side Analytics/Messaging remain inert.
- `gradle -p apps/android :app:assembleDebug` validates the Android dependency graph. Production validation additionally requires the protected file.

Initialization is not a Firestore read/write, Storage upload, Analytics transmission, authentication attempt, or FCM registration. Live connectivity must be smoke-tested with approved test identities and non-sensitive test paths under the selected Firebase project rules.
